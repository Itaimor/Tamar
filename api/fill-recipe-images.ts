import { createClient } from "@supabase/supabase-js";

const MAX_RECIPES_PER_REQUEST = 12;

const searchPexelsImage = async (query: string, apiKey: string) => {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(`${query} recipe food`)}&per_page=1&orientation=landscape`,
    {
      headers: {
        Authorization: apiKey,
      },
    },
  );

  if (!response.ok) return null;

  const body = await response.json();
  return body.photos?.[0]?.src?.large2x || body.photos?.[0]?.src?.large || body.photos?.[0]?.src?.medium || null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pexelsApiKey = process.env.PEXELS_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Supabase server credentials are not configured." });
  }

  if (!pexelsApiKey) {
    return res.status(202).json({ ok: false, skipped: true, reason: "PEXELS_API_KEY is not configured." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  const recipeIds = Array.isArray(req.body?.recipe_ids)
    ? [...new Set(req.body.recipe_ids.map((id: string | number) => Number(id)).filter(Number.isFinite))]
      .slice(0, MAX_RECIPES_PER_REQUEST)
    : [];

  if (recipeIds.length === 0) {
    return res.status(400).json({ error: "recipe_ids must contain at least one recipe id." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return res.status(401).json({ error: "Invalid authorization token." });
  }

  const { data: existingImages, error: existingError } = await supabase
    .from("recipe_images")
    .select("recipe_id")
    .in("recipe_id", recipeIds);

  if (existingError) {
    return res.status(500).json({ error: existingError.message });
  }

  const existingIds = new Set((existingImages || []).map((item: any) => Number(item.recipe_id)));
  const missingIds = recipeIds.filter((id) => !existingIds.has(id));

  if (missingIds.length === 0) {
    return res.status(200).json({ ok: true, inserted: 0, skipped: recipeIds.length });
  }

  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("id,name")
    .in("id", missingIds);

  if (recipesError) {
    return res.status(500).json({ error: recipesError.message });
  }

  const rows = [];
  for (const recipe of recipes || []) {
    const imageUrl = await searchPexelsImage(recipe.name, pexelsApiKey);
    if (imageUrl) {
      rows.push({
        recipe_id: Number(recipe.id),
        image_url: imageUrl,
        source_tier: "pexels-auto",
      });
    }
  }

  if (rows.length === 0) {
    return res.status(200).json({ ok: true, inserted: 0, searched: recipes?.length || 0 });
  }

  const { error: insertError } = await supabase
    .from("recipe_images")
    .upsert(rows, { onConflict: "recipe_id" });

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({ ok: true, inserted: rows.length, searched: recipes?.length || 0 });
}
