import { supabase } from "./supabase";

export interface RecipeItem {
  id: number;
  title: string;
  image: string;
  match?: string;
  time?: string;
  ingredients?: string[];
  steps?: string[];
  description?: string;
  is_ibs_friendly?: boolean;
}

export interface RecipeSection {
  title: string;
  items: RecipeItem[];
}

const mapRecipeRow = (item: any): RecipeItem => ({
  id: Number(item.id),
  title: item.name || String(item.id),
  image: item.image_url || "/images/empty_plate.png",
  time: item.minutes ? `${item.minutes}m` : "15m",
  ingredients: item.ingredients,
  steps: item.steps,
  description: item.description,
  is_ibs_friendly: item.is_ibs_friendly,
});

// Mock recipes removed. This structure defines the homepage sections.
export const recipeSections: RecipeSection[] = [
  {
    title: "Curated for You",
    items: []
  },
  {
    title: "Trending in Your Area",
    items: []
  },
  {
    title: "Bursting with Flavor",
    items: []
  },
  {
    title: "Healthy & Mindful",
    items: []
  },
  {
    title: "Quick & Satisfying",
    items: []
  }
];

export const getRecipeById = (recipeId: string | number): RecipeItem => {
  const numericId = typeof recipeId === "number" ? recipeId : Number(recipeId);
  for (const section of recipeSections) {
    const item = section.items.find((r) => r.id === numericId);
    if (item) return item;
  }
  
  // Fallback if recipe not found: title is the recipe id number, image is the funny empty plate
  return {
    id: numericId,
    title: String(numericId),
    image: "/images/empty_plate.png",
    match: "95%",
    time: "15m"
  };
};

export const fetchRecipeById = async (recipeId: string | number): Promise<RecipeItem> => {
  const numericId = typeof recipeId === "number" ? recipeId : Number(recipeId);
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", numericId)
        .maybeSingle();

      if (data && !error) {
        return mapRecipeRow(data);
      }

      if (numericId >= 1 && numericId <= 30) {
        const fallback = await fetchDefaultRecipes(30);
        const mappedRecipe = fallback[(numericId - 1) % fallback.length];
        if (mappedRecipe) return mappedRecipe;
      }
    } catch (err) {
      console.error("Failed to fetch recipe from Supabase:", err);
    }
  }

  // Fallback to local hardcoded recipes (which falls back to recipe ID and empty plate)
  return getRecipeById(numericId);
};

export const fetchRecipesByIds = async (recipeIds: (string | number)[]): Promise<RecipeItem[]> => {
  const numericIds = recipeIds.map(id => typeof id === "number" ? id : Number(id));
  
  if (supabase && numericIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .in("id", numericIds);

      if (data && !error) {
        const mapped = data.map(mapRecipeRow);
        const fallbackRecipes =
          mapped.length < numericIds.length ? await fetchDefaultRecipes(Math.max(30, numericIds.length)) : [];
        
        // Sort according to input recipeIds order and supply fallback if missing
        return numericIds.map((id) => {
          const found = mapped.find(m => m.id === id);
          if (found) return found;
          if (id >= 1 && id <= 30 && fallbackRecipes.length > 0) {
            const mappedRecipe = fallbackRecipes[(id - 1) % fallbackRecipes.length];
            if (mappedRecipe) return mappedRecipe;
          }
          return getRecipeById(id);
        });
      }
    } catch (err) {
      console.error("Failed to fetch recipes from Supabase:", err);
    }
  }

  // Fallback
  return numericIds.map(id => getRecipeById(id));
};

export const fetchDefaultRecipes = async (limit: number = 12): Promise<RecipeItem[]> => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .limit(limit);

      if (data && !error) {
        return data.map(mapRecipeRow);
      }
    } catch (err) {
      console.error("Failed to fetch default recipes from Supabase:", err);
    }
  }

  // Fallback to all local recipes
  const allLocal = recipeSections.flatMap(sec => sec.items);
  return allLocal.slice(0, limit);
};
