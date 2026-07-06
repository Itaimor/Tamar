import { supabase } from "@/lib/supabase";

export type FoodImageAnalysisContext = "meal_log" | "personal_recipe";

export type FoodImageAnalysis = {
  is_food: boolean;
  food_name: string;
  visible_ingredients: string[];
  possible_hidden_ingredients: string[];
  portion_guess: string;
  confidence: number;
  questions: string[];
  notes: string;
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

export const analyzeFoodImage = async ({
  imageUrl,
  context = "meal_log",
}: {
  imageUrl: string;
  context?: FoodImageAnalysisContext;
}): Promise<FoodImageAnalysis> => {
  const headers = await authHeaders();
  if (!headers) throw new Error("Please sign in before analyzing a food photo.");

  const response = await fetch("/api/analyze-food-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      image_url: imageUrl,
      context,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const body = await response.json();
  return body.analysis as FoodImageAnalysis;
};

export const buildFoodImageSuggestionNotes = (analysis: FoodImageAnalysis) => {
  const parts = [
    analysis.visible_ingredients.length ? `Visible: ${analysis.visible_ingredients.join(", ")}` : null,
    analysis.possible_hidden_ingredients.length ? `Possible hidden: ${analysis.possible_hidden_ingredients.join(", ")}` : null,
    analysis.portion_guess ? `Portion: ${analysis.portion_guess}` : null,
    analysis.questions.length ? `Confirm: ${analysis.questions.join(" ")}` : null,
  ].filter(Boolean);

  return parts.length ? `Photo-assisted log. ${parts.join(". ")}` : "Photo-assisted log.";
};
