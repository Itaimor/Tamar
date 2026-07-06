import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | undefined>;
  body?: Record<string, unknown> | string;
};

type ApiResponse = {
  status: (code: number) => {
    json: (body: Record<string, unknown>) => void;
  };
};

type JsonResult = {
  status: number;
  body: Record<string, unknown>;
};

type EstimateRequestInput = {
  method?: string;
  authorization?: string;
  body?: Record<string, unknown> | string;
  env?: Record<string, string | undefined>;
};

export type MealNutritionEstimate = {
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  source: "catalog_recipe" | "gemini_estimate";
  confidence: number;
  notes: string;
  questions: string[];
};

const parseBody = (body: Record<string, unknown> | string | undefined): Record<string, unknown> => {
  if (!body) return {};
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const parseJsonObject = (text: string) => {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace >= firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;

  return JSON.parse(jsonText);
};

const cleanString = (value: unknown, maxLength = 180) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanStringOrNumber = (value: unknown, maxLength = 180) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, maxLength);
  return cleanString(value, maxLength);
};

const cleanStringList = (value: unknown, maxItems: number) =>
  (Array.isArray(value) ? value : [])
    .map((item) => cleanString(item, 90))
    .filter(Boolean)
    .slice(0, maxItems);

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const roundMacro = (value: unknown) => {
  const numeric = optionalNumber(value);
  return numeric === null ? null : Math.round(numeric * 10) / 10;
};

const confidence = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0.35;
};

const numericRecipeId = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const extractBearerToken = (authorization = "") => {
  const header = String(authorization || "");
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
};

const estimateFromRecipeNutrition = (recipe: { name?: string | null; nutrition?: unknown } | null): MealNutritionEstimate | null => {
  const values = Array.isArray(recipe?.nutrition) ? recipe.nutrition : [];
  const calories = roundMacro(values[0]);
  const fat = roundMacro(values[1]);
  const protein = roundMacro(values[4]);
  if (calories === null && protein === null && fat === null) return null;

  return {
    calories,
    protein_g: protein,
    fat_g: fat,
    source: "catalog_recipe",
    confidence: 0.9,
    notes: recipe?.name ? `Catalog nutrition for ${recipe.name}.` : "Catalog recipe nutrition.",
    questions: [],
  };
};

const normalizeGeminiEstimate = (raw: any): MealNutritionEstimate => ({
  calories: roundMacro(raw?.calories),
  protein_g: roundMacro(raw?.protein_g),
  fat_g: roundMacro(raw?.fat_g),
  source: "gemini_estimate",
  confidence: confidence(raw?.confidence),
  notes: cleanString(raw?.notes, 220),
  questions: cleanStringList(raw?.questions, 3),
});

const buildNutritionPrompt = ({
  foodName,
  portion,
  notes,
  visibleIngredients,
  possibleHiddenIngredients,
}: {
  foodName: string;
  portion: string;
  notes: string;
  visibleIngredients: string[];
  possibleHiddenIngredients: string[];
}) => `
You estimate nutrition for a private food diary entry.

Return JSON only. No markdown. No extra prose.

Required shape:
{
  "calories": 0,
  "protein_g": 0,
  "fat_g": 0,
  "confidence": 0.0,
  "questions": ["short question if one detail would materially improve the estimate"],
  "notes": "short reason for uncertainty"
}

Rules:
- Estimate one consumed meal or food item, not a recipe for multiple servings.
- Use kcal for calories and grams for protein_g and fat_g.
- If portion is vague, estimate a common single serving for the named food and lower confidence.
- Do not give medical, weight-loss, or IBS safety advice.
- Do not mention exactness. This is an editable tracking estimate.
- Use null for any value you cannot reasonably estimate.
- Keep notes short and factual.

Food name: ${foodName || "(not provided)"}
Portion: ${portion || "(not provided)"}
Visible ingredients: ${visibleIngredients.length ? visibleIngredients.join(", ") : "(not provided)"}
Possible hidden ingredients: ${possibleHiddenIngredients.length ? possibleHiddenIngredients.join(", ") : "(not provided)"}
Notes: ${notes || "(not provided)"}
`;

const estimateWithGemini = async ({
  apiKey,
  modelName,
  foodName,
  portion,
  notes,
  visibleIngredients,
  possibleHiddenIngredients,
}: {
  apiKey: string;
  modelName: string;
  foodName: string;
  portion: string;
  notes: string;
  visibleIngredients: string[];
  possibleHiddenIngredients: string[];
}): Promise<MealNutritionEstimate> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.15,
    },
  });

  const result = await model.generateContent(buildNutritionPrompt({
    foodName,
    portion,
    notes,
    visibleIngredients,
    possibleHiddenIngredients,
  }));

  return normalizeGeminiEstimate(parseJsonObject(result.response.text()));
};

export const handleEstimateMealNutritionRequest = async ({
  method,
  authorization,
  body,
  env = process.env,
}: EstimateRequestInput): Promise<JsonResult> => {
  if (method !== "POST") {
    return { status: 405, body: { error: "Method Not Allowed" } };
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 500, body: { error: "Supabase server credentials are not configured." } };
  }

  const token = extractBearerToken(authorization);
  if (!token) {
    return { status: 401, body: { error: "Missing authorization token." } };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { status: 401, body: { error: "Invalid authorization token." } };
  }

  const parsedBody = parseBody(body);
  const foodName = cleanString(parsedBody.food_name, 140);
  const recipeId = numericRecipeId(parsedBody.recipe_id);
  const portion = [parsedBody.portion_size, parsedBody.portion_unit].map((part) => cleanStringOrNumber(part, 40)).filter(Boolean).join(" ");
  const notes = cleanString(parsedBody.notes, 500);
  const visibleIngredients = cleanStringList(parsedBody.visible_ingredients, 12);
  const possibleHiddenIngredients = cleanStringList(parsedBody.possible_hidden_ingredients, 10);

  if (!foodName && !recipeId) {
    return { status: 400, body: { error: "Food name or recipe id is required." } };
  }

  if (recipeId) {
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("name,nutrition")
      .eq("id", recipeId)
      .maybeSingle();

    if (recipeError) {
      return { status: 500, body: { error: recipeError.message } };
    }

    const recipeEstimate = estimateFromRecipeNutrition(recipe);
    if (recipeEstimate) {
      return { status: 200, body: { estimate: recipeEstimate } };
    }
  }

  const apiKey = env.GEMINI_TAMAR_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: "GEMINI API is not defined." } };
  }

  try {
    const estimate = await estimateWithGemini({
      apiKey,
      modelName: env.GEMINI_NUTRITION_MODEL || env.GEMINI_FOOD_IMAGE_MODEL || "gemini-3.1-flash-lite",
      foodName,
      portion,
      notes,
      visibleIngredients,
      possibleHiddenIngredients,
    });
    return { status: 200, body: { estimate } };
  } catch (error: any) {
    console.error("Meal nutrition estimate error:", error);
    return { status: 500, body: { error: error.message || "Failed to estimate nutrition." } };
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const result = await handleEstimateMealNutritionRequest({
    method: req.method,
    authorization: req.headers.authorization,
    body: req.body,
  });

  return res.status(result.status).json(result.body);
}
