import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

type ApiResponse = {
  status: (code: number) => {
    json: (body: Record<string, unknown>) => void;
  };
};

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const optionalConfidence = (value: unknown) => {
  const numeric = optionalNumber(value);
  if (numeric === null) return null;
  return Math.max(0, Math.min(1, numeric));
};

const nutritionSource = (value: unknown) => {
  const source = typeof value === "string" ? value.trim() : "";
  return ["manual", "catalog_recipe", "gemini_estimate"].includes(source) ? source : null;
};

const numericRecipeId = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const nutritionFromRecipe = (recipe: { nutrition?: unknown } | null) => {
  const values = Array.isArray(recipe?.nutrition) ? recipe.nutrition : [];
  const calories = optionalNumber(values[0]);
  const fat = optionalNumber(values[1]);
  const protein = optionalNumber(values[4]);
  if (calories === null && fat === null && protein === null) return null;

  return {
    calories,
    protein_g: protein,
    fat_g: fat,
    nutrition_source: "catalog_recipe",
    nutrition_confidence: 0.9,
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recommenderUrl = process.env.RECOMMENDER_SERVICE_URL;
  const recommenderSecret = process.env.RECOMMENDER_SERVICE_SECRET;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Supabase server credentials are not configured." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid authorization token." });
  }

  const body = req.body || {};
  const foodName = String(body.food_name || "").trim();
  if (!foodName) {
    return res.status(400).json({ error: "Food name is required." });
  }

  const recipeId = numericRecipeId(body.recipe_id);
  const payload = {
    user_id: data.user.id,
    food_name: foodName,
    recipe_id: recipeId,
    logged_at: body.logged_at || new Date().toISOString(),
    portion_size: optionalNumber(body.portion_size),
    portion_unit: body.portion_unit || null,
    image_url: typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null,
    notes: body.notes || null,
    calories: optionalNumber(body.calories),
    protein_g: optionalNumber(body.protein_g),
    fat_g: optionalNumber(body.fat_g),
    nutrition_source: nutritionSource(body.nutrition_source),
    nutrition_confidence: optionalConfidence(body.nutrition_confidence),
  };

  if (
    recipeId &&
    payload.calories === null &&
    payload.protein_g === null &&
    payload.fat_g === null
  ) {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("nutrition")
      .eq("id", recipeId)
      .maybeSingle();
    Object.assign(payload, nutritionFromRecipe(recipe));
  }

  if (recommenderUrl) {
    try {
      const response = await fetch(`${recommenderUrl.replace(/\/$/, "")}/meal-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(recommenderSecret ? { "x-recommender-secret": recommenderSecret } : {}),
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(responseBody);
      }
      return res.status(200).json(responseBody);
    } catch (error) {
      console.warn("Recommender meal-log endpoint unavailable; storing meal only.", error);
    }
  }

  const { data: mealLog, error: insertError } = await supabase
    .from("meal_logs")
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({ ok: true, meal_log: mealLog, exposure_count: 0, fallback: true });
}
