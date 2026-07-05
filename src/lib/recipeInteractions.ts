import { supabase } from "@/lib/supabase";

export type RecipeInteractionType = "viewed" | "started" | "saved" | "completed" | "liked" | "dismissed";
export type Cooklist = {
  id: number;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

export type CooklistMembership = {
  id: number;
  cooklist_id: number;
  user_id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_source?: "catalog" | "personal";
  image_url?: string | null;
  description?: string | null;
  ingredients?: string | null;
  instructions?: string | null;
  created_at: string;
};

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

export const fetchCooklists = async (userId: string): Promise<Cooklist[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("cooklists")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching cooklists:", error);
    throw error;
  }

  return data || [];
};

export const ensureDefaultCooklist = async (userId: string): Promise<Cooklist | null> => {
  if (!supabase) return null;

  const { data: existing, error: fetchError } = await supabase
    .from("cooklists")
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching default cooklist:", fetchError);
    throw fetchError;
  }

  if (existing) return existing;

  const { data, error } = await supabase
    .from("cooklists")
    .insert({
      user_id: userId,
      name: "Liked",
      is_default: true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating default cooklist:", error);
    throw error;
  }

  return data;
};

export const createCooklist = async (userId: string, name: string): Promise<Cooklist | null> => {
  if (!supabase) return null;

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Cooklist name is required.");

  const { data, error } = await supabase
    .from("cooklists")
    .insert({
      user_id: userId,
      name: trimmedName,
      is_default: false,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existingLists = await fetchCooklists(userId);
      const existing = existingLists.find((cooklist) => cooklist.name.toLowerCase() === trimmedName.toLowerCase());
      if (existing) return existing;
    }
    console.error("Error creating cooklist:", error);
    throw error;
  }

  return data;
};

export const findOrCreateCooklist = async (userId: string, name?: string | null): Promise<Cooklist | null> => {
  if (!name?.trim()) return ensureDefaultCooklist(userId);

  const trimmedName = name.trim();
  const lists = await fetchCooklists(userId);
  const existing = lists.find((cooklist) => cooklist.name.toLowerCase() === trimmedName.toLowerCase());
  if (existing) return existing;
  return createCooklist(userId, trimmedName);
};

export const renameCooklist = async ({
  userId,
  cooklistId,
  name,
}: {
  userId: string;
  cooklistId: number;
  name: string;
}): Promise<Cooklist | null> => {
  if (!supabase) return null;

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Cooklist name is required.");

  const { data, error } = await supabase
    .from("cooklists")
    .update({
      name: trimmedName,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", cooklistId)
    .eq("is_default", false)
    .select("*")
    .single();

  if (error) {
    console.error("Error renaming cooklist:", error);
    throw error;
  }

  return data;
};

export const deleteCooklist = async ({
  userId,
  cooklistId,
  unsavedRecipeIds = [],
}: {
  userId: string;
  cooklistId: number;
  unsavedRecipeIds?: string[];
}) => {
  if (!supabase) return;

  const { error } = await supabase
    .from("cooklists")
    .delete()
    .eq("user_id", userId)
    .eq("id", cooklistId)
    .eq("is_default", false);

  if (error) {
    console.error("Error deleting cooklist:", error);
    throw error;
  }

  const uniqueUnsavedRecipeIds = [...new Set(unsavedRecipeIds.map(String))];
  if (uniqueUnsavedRecipeIds.length > 0) {
    const { error: interactionError } = await supabase
      .from("recipe_interactions")
      .delete()
      .eq("user_id", userId)
      .in("recipe_id", uniqueUnsavedRecipeIds)
      .in("interaction_type", ["saved", "save"]);

    if (interactionError) {
      console.error("Error clearing deleted cooklist saved interactions:", interactionError);
      throw interactionError;
    }
  }
};

export const addPersonalRecipeToCooklist = async ({
  userId,
  cooklistId,
  title,
  imageUrl,
  description,
  ingredients,
  instructions,
}: {
  userId: string;
  cooklistId: number;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  ingredients?: string | null;
  instructions?: string | null;
}): Promise<CooklistMembership | null> => {
  if (!supabase) return null;

  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Recipe title is required.");

  const { data, error } = await supabase
    .from("cooklist_recipes")
    .insert({
      cooklist_id: cooklistId,
      user_id: userId,
      recipe_id: `personal-${crypto.randomUUID()}`,
      recipe_title: trimmedTitle,
      recipe_source: "personal",
      image_url: imageUrl?.trim() || null,
      description: description?.trim() || null,
      ingredients: ingredients?.trim() || null,
      instructions: instructions?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error adding personal recipe:", error);
    throw error;
  }

  return data;
};

export const fetchCooklistMemberships = async (userId: string, cooklistId: number): Promise<CooklistMembership[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("cooklist_recipes")
    .select("*")
    .eq("user_id", userId)
    .eq("cooklist_id", cooklistId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching cooklist recipes:", error);
    throw error;
  }

  return data || [];
};

export const fetchRecipeCooklistIds = async (userId: string, recipeId: string | number): Promise<number[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("cooklist_recipes")
    .select("cooklist_id")
    .eq("user_id", userId)
    .eq("recipe_id", String(recipeId));

  if (error) {
    console.error("Error fetching recipe cooklists:", error);
    throw error;
  }

  return (data || []).map((row) => Number(row.cooklist_id));
};

export const fetchCookbookRecipeTitleExists = async (userId: string, recipeTitle: string): Promise<boolean> => {
  if (!supabase) return false;

  const normalizedTitle = recipeTitle.trim().toLowerCase();
  if (!normalizedTitle) return false;

  const { data, error } = await supabase
    .from("cooklist_recipes")
    .select("id,recipe_title")
    .eq("user_id", userId)
    .limit(200);

  if (error) {
    console.error("Error checking cookbook recipe title:", error);
    throw error;
  }

  return (data || []).some((row) => String(row.recipe_title || "").trim().toLowerCase() === normalizedTitle);
};

export const moveCooklistRecipeMembership = async ({
  userId,
  membershipId,
  targetCooklistId,
}: {
  userId: string;
  membershipId: number;
  targetCooklistId: number;
}): Promise<CooklistMembership | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("cooklist_recipes")
    .update({ cooklist_id: targetCooklistId })
    .eq("user_id", userId)
    .eq("id", membershipId)
    .select("*")
    .single();

  if (error) {
    console.error("Error moving cooklist recipe:", error);
    throw error;
  }

  return data;
};

export const setRecipeCooklists = async ({
  userId,
  recipeId,
  recipeTitle,
  cooklistIds,
}: {
  userId: string;
  recipeId: string | number;
  recipeTitle: string;
  cooklistIds: number[];
}) => {
  if (!supabase) return;

  const stringRecipeId = String(recipeId);
  const uniqueCooklistIds = [...new Set(cooklistIds)];

  const { error: deleteError } = await supabase
    .from("cooklist_recipes")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", stringRecipeId);

  if (deleteError) {
    console.error("Error clearing recipe cooklists:", deleteError);
    throw deleteError;
  }

  if (uniqueCooklistIds.length === 0) {
    await supabase
      .from("recipe_interactions")
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", stringRecipeId)
      .in("interaction_type", ["saved", "save"]);
    return;
  }

  const { error: insertError } = await supabase.from("cooklist_recipes").insert(
    uniqueCooklistIds.map((cooklistId) => ({
      cooklist_id: cooklistId,
      user_id: userId,
      recipe_id: stringRecipeId,
      recipe_title: recipeTitle,
    }))
  );

  if (insertError) {
    console.error("Error setting recipe cooklists:", insertError);
    throw insertError;
  }

  await supabase
    .from("recipe_interactions")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", stringRecipeId)
    .in("interaction_type", ["saved", "save"]);

  const { error: saveError } = await supabase.from("recipe_interactions").insert({
    user_id: userId,
    recipe_id: stringRecipeId,
    recipe_title: recipeTitle,
    interaction_type: "saved",
  });

  if (saveError) {
    console.error("Error refreshing saved interaction:", saveError);
    throw saveError;
  }
};

export const addRecipeToDefaultCooklist = async ({
  userId,
  recipeId,
  recipeTitle,
}: {
  userId: string;
  recipeId: string | number;
  recipeTitle: string;
}) => {
  const defaultCooklist = await ensureDefaultCooklist(userId);
  if (!defaultCooklist) return false;

  await setRecipeCooklists({
    userId,
    recipeId,
    recipeTitle,
    cooklistIds: [defaultCooklist.id],
  });

  return true;
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
    await addRecipeToDefaultCooklist({ userId, recipeId: stringRecipeId, recipeTitle });
    return true; // Successfully saved
  }
};
