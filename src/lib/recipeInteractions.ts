import { supabase } from "@/lib/supabase";

export type RecipeInteractionType = "viewed" | "started" | "saved" | "completed" | "dismissed";

type RecipeInteraction = {
  userId: string;
  recipeId: string | number;
  recipeTitle: string;
  interactionType: RecipeInteractionType;
};

export const recordRecipeInteraction = async ({
  userId,
  recipeId,
  recipeTitle,
  interactionType,
}: RecipeInteraction) => {
  if (!supabase) return;

  await supabase.from("recipe_interactions").insert({
    user_id: userId,
    recipe_id: String(recipeId),
    recipe_title: recipeTitle,
    interaction_type: interactionType,
  });
};

