import { createClient } from "@supabase/supabase-js";

const MAX_RECIPES_PER_REQUEST = 12;
const PEXELS_CANDIDATES_PER_RECIPE = 8;

const searchPexelsImages = async (query: string, apiKey: string) => {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(`${query} recipe food`)}&per_page=${PEXELS_CANDIDATES_PER_RECIPE}&orientation=landscape`,
    {
      headers: {
        Authorization: apiKey,
      },
    },
  );

  if (!response.ok) return null;

  const body = await response.json();
  return (body.photos || [])
    .map((photo: any) => photo.src?.large2x || photo.src?.large || photo.src?.medium)
    .filter(Boolean);
};

const chooseDistinctImage = (recipeId: number, imageUrls: string[], usedImageUrls: Set<string>) => {
  if (imageUrls.length === 0) return null;

  const startIndex = Math.abs(recipeId) % imageUrls.length;
  for (let offset = 0; offset < imageUrls.length; offset += 1) {
    const imageUrl = imageUrls[(startIndex + offset) % imageUrls.length];
    if (!usedImageUrls.has(imageUrl)) {
      usedImageUrls.add(imageUrl);
      return imageUrl;
    }
  }

  const fallbackUrl = imageUrls[startIndex];
  usedImageUrls.add(fallbackUrl);
  return fallbackUrl;
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
    .select("recipe_id,image_url,source_tier")
    .in("recipe_id", recipeIds);

  if (existingError) {
    return res.status(500).json({ error: existingError.message });
  }

  const existingById = new Map((existingImages || []).map((item: any) => [Number(item.recipe_id), item]));
  const autoImageCounts = new Map<string, number>();
  for (const item of existingImages || []) {
    if (item.source_tier === "pexels-auto" && item.image_url) {
      autoImageCounts.set(item.image_url, (autoImageCounts.get(item.image_url) || 0) + 1);
    }
  }

  const refreshIds = recipeIds.filter((id) => {
    const existing = existingById.get(id);
    if (!existing) return true;
    return existing.source_tier === "pexels-auto" && existing.image_url && (autoImageCounts.get(existing.image_url) || 0) > 1;
  });

  if (refreshIds.length === 0) {
    return res.status(200).json({ ok: true, inserted: 0, refreshed: 0, skipped: recipeIds.length });
  }

  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("id,name")
    .in("id", refreshIds);

  if (recipesError) {
    return res.status(500).json({ error: recipesError.message });
  }

  const usedImageUrls = new Set(
    (existingImages || [])
      .filter((item: any) => !refreshIds.includes(Number(item.recipe_id)))
      .map((item: any) => item.image_url)
      .filter(Boolean),
  );

  const recipesById = new Map((recipes || []).map((recipe: any) => [Number(recipe.id), recipe]));
  const rows = [];
  for (const recipeId of refreshIds) {
    const recipe = recipesById.get(recipeId);
    if (!recipe) continue;

    const imageUrls = await searchPexelsImages(recipe.name, pexelsApiKey);
    const imageUrl = imageUrls ? chooseDistinctImage(recipeId, imageUrls, usedImageUrls) : null;
    if (imageUrl) {
      rows.push({
        recipe_id: recipeId,
        image_url: imageUrl,
        source_tier: "pexels-auto",
      });
    }
  }

  if (rows.length === 0) {
    return res.status(200).json({ ok: true, inserted: 0, refreshed: 0, searched: recipes?.length || 0 });
  }

  const { error: insertError } = await supabase
    .from("recipe_images")
    .upsert(rows, { onConflict: "recipe_id" });

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  const refreshed = rows.filter((row) => existingById.has(row.recipe_id)).length;
  return res.status(200).json({
    ok: true,
    inserted: rows.length - refreshed,
    refreshed,
    searched: recipes?.length || 0,
  });
}
