import { supabase } from "@/lib/supabase";

export type RecipeInteractionType = "viewed" | "started" | "saved" | "completed" | "liked" | "dismissed";

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

export const fetchSavedRecipes = async (userId: string) => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("recipe_interactions")
    .select("*")
    .eq("user_id", userId)
    .in("interaction_type", ["saved", "save"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching saved recipes:", error);
    throw error;
  }

  return data || [];
};

export const fetchUserInteractionCount = async (userId: string) => {
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("recipe_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error("Error counting recipe interactions:", error);
    throw error;
  }

  return count || 0;
};

export const fetchTasteFeedbackCount = async (userId: string) => {
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("recipe_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("interaction_type", ["liked", "dismissed"]);

  if (error) {
    console.error("Error counting taste feedback interactions:", error);
    throw error;
  }

  return count || 0;
};

export const toggleSaveRecipe = async ({
  userId,
  recipeId,
  recipeTitle,
  isCurrentlySaved,
}: {
  userId: string;
  recipeId: string | number;
  recipeTitle: string;
  isCurrentlySaved: boolean;
}) => {
  if (!supabase) return false;

  const stringRecipeId = String(recipeId);

  if (isCurrentlySaved) {
    // Unsave: standard DELETE block targeting recipe_interactions
    const { error } = await supabase
      .from("recipe_interactions")
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", stringRecipeId)
      .in("interaction_type", ["saved", "save"]);

    if (error) {
      console.error("Error unsaving recipe:", error);
      throw error;
    }
    return false; // Successfully unsaved
  } else {
    // Save: standard INSERT block targeting recipe_interactions
    // To ensure idempotency and prevent duplicates even if the unique constraint is pending,
    // we run a quick standard DELETE first, then execute a standard INSERT.
    await supabase
      .from("recipe_interactions")
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", stringRecipeId)
      .in("interaction_type", ["saved", "save"]);

    const { error } = await supabase.from("recipe_interactions").insert({
      user_id: userId,
      recipe_id: stringRecipeId,
      recipe_title: recipeTitle,
      interaction_type: "saved",
    });

    if (error) {
      console.error("Error saving recipe:", error);
      throw error;
    }
    return true; // Successfully saved
  }
};
