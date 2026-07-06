import { supabase } from "@/lib/supabase";

export type MealNutritionSource = "manual" | "catalog_recipe" | "gemini_estimate";

export type MealNutritionInput = {
  foodName: string;
  recipeId?: number | null;
  portionSize?: number | string | null;
  portionUnit?: string | null;
  notes?: string | null;
  visibleIngredients?: string[];
  possibleHiddenIngredients?: string[];
};

export type MealNutritionEstimate = {
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  source: Exclude<MealNutritionSource, "manual">;
  confidence: number;
  notes: string;
  questions: string[];
};

const authHeaders = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
};

const parseApiError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return body?.error || `Request failed with ${response.status}`;
};

export const estimateMealNutrition = async ({
  foodName,
  recipeId,
  portionSize,
  portionUnit,
  notes,
  visibleIngredients = [],
  possibleHiddenIngredients = [],
}: MealNutritionInput): Promise<MealNutritionEstimate> => {
  const headers = await authHeaders();
  if (!headers) throw new Error("Please sign in before estimating nutrition.");

  const response = await fetch("/api/estimate-meal-nutrition", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      food_name: foodName,
      recipe_id: recipeId || null,
      portion_size: portionSize || null,
      portion_unit: portionUnit || null,
      notes: notes || null,
      visible_ingredients: visibleIngredients,
      possible_hidden_ingredients: possibleHiddenIngredients,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const body = await response.json();
  return body.estimate as MealNutritionEstimate;
};
