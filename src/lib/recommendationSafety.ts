import { supabase } from "@/lib/supabase";

export type HardRestriction = {
  ingredient_name?: string | null;
  normalized_name?: string | null;
  restriction_type?: string | null;
  severity?: string | null;
  is_strict?: boolean | string | null;
};

export type RecipeWithIngredients = {
  ingredients?: readonly string[] | string | null;
};

const STRICT_RESTRICTION_TYPES = new Set([
  "allergy",
  "strict_sensitivity",
  "forbidden_ingredient",
  "diet_violation",
]);

const HARD_RESTRICTION_ALIASES: Record<string, readonly string[]> = {
  dairy: ["milk", "cream", "yogurt", "cheese", "butter", "whey", "casein"],
  egg: ["egg", "albumen", "meringue"],
  gluten: ["wheat", "barley", "rye", "spelt", "semolina", "bulgur", "seitan"],
  peanut: ["peanut", "groundnut"],
  soy: ["soy", "soya", "soybean", "tofu", "tempeh", "edamame"],
  "tree nut": [
    "almond",
    "brazil nut",
    "cashew",
    "hazelnut",
    "macadamia",
    "pecan",
    "pistachio",
    "walnut",
  ],
  nut: [
    "peanut",
    "almond",
    "brazil nut",
    "cashew",
    "hazelnut",
    "macadamia",
    "pecan",
    "pistachio",
    "walnut",
  ],
  shellfish: [
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "crayfish",
    "mussel",
    "clam",
    "oyster",
    "scallop",
  ],
};

const NON_DAIRY_RESTRICTION_MARKERS = [
  "almond milk",
  "cashew milk",
  "coconut cream",
  "coconut milk",
  "cream of tartar",
  "hemp milk",
  "oat milk",
  "plant milk",
  "rice milk",
  "soy milk",
] as const;

const singularizeIngredientToken = (token: string): string => {
  if (
    token.length <= 3 ||
    token.endsWith("ss") ||
    token.endsWith("us") ||
    token.endsWith("is") ||
    token === "gas" ||
    token === "molasses"
  ) {
    return token;
  }

  const irregular: Record<string, string> = {
    leaves: "leaf",
    loaves: "loaf",
    potatoes: "potato",
    tomatoes: "tomato",
  };
  if (irregular[token]) return irregular[token];
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (
    token.endsWith("ches") ||
    token.endsWith("shes") ||
    token.endsWith("xes") ||
    token.endsWith("zes")
  ) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
};

export const normalizeIngredientName = (value: unknown): string =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(singularizeIngredientToken)
    .filter(Boolean)
    .join(" ");

const containsPhrase = (text: string, phrase: string): boolean =>
  text === phrase || ` ${text} `.includes(` ${phrase} `);

const removeBoundedIngredientPhrases = (
  ingredient: string,
  phrases: readonly string[],
): string => {
  let padded = ` ${normalizeIngredientName(ingredient)} `;
  phrases.forEach((phrase) => {
    const normalizedPhrase = normalizeIngredientName(phrase);
    if (normalizedPhrase) {
      padded = padded.replaceAll(` ${normalizedPhrase} `, " ");
    }
  });
  return padded.replace(/\s+/g, " ").trim();
};

export const restrictionMatchesIngredient = (
  restrictedName: unknown,
  ingredientText: unknown,
): boolean => {
  const restricted = normalizeIngredientName(restrictedName);
  let ingredient = normalizeIngredientName(ingredientText);
  if (!restricted || !ingredient) return false;

  if (restricted === "dairy" || restricted === "milk" || restricted === "cream") {
    ingredient = removeBoundedIngredientPhrases(
      ingredient,
      NON_DAIRY_RESTRICTION_MARKERS,
    );
    if (!ingredient) return false;
  }

  const candidates = [restricted, ...(HARD_RESTRICTION_ALIASES[restricted] || [])];
  return candidates.some((candidate) => containsPhrase(ingredient, candidate));
};

const parseStrictFlag = (value: HardRestriction["is_strict"]): boolean => {
  if (typeof value === "string") {
    return ["1", "true", "yes", "strict"].includes(value.trim().toLowerCase());
  }
  return value === undefined ? true : Boolean(value);
};

export const selectActiveHardRestrictions = (
  restrictions: readonly HardRestriction[],
): HardRestriction[] =>
  restrictions.filter((restriction) => {
    const restrictionType = String(restriction.restriction_type || "")
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "_");
    return STRICT_RESTRICTION_TYPES.has(restrictionType) || parseStrictFlag(restriction.is_strict);
  });

const recipeIngredientTexts = (
  recipe: RecipeWithIngredients | null | undefined,
): string[] => {
  const ingredients = recipe?.ingredients;
  if (Array.isArray(ingredients)) {
    return ingredients.map((ingredient) => String(ingredient).trim()).filter(Boolean);
  }
  if (typeof ingredients === "string") {
    return ingredients
      .split(/\r?\n|,/)
      .map((ingredient) => ingredient.trim())
      .filter(Boolean);
  }
  return [];
};

export const isRecipeAllowedByHardRestrictions = (
  recipe: RecipeWithIngredients | null | undefined,
  restrictions: readonly HardRestriction[],
): boolean => {
  const activeRestrictions = selectActiveHardRestrictions(restrictions);
  if (activeRestrictions.length === 0) return true;

  const ingredients = recipeIngredientTexts(recipe);
  if (ingredients.length === 0) {
    // With an active hard restriction, absent metadata cannot prove a recipe safe.
    return false;
  }

  for (const restriction of activeRestrictions) {
    const restrictedName = normalizeIngredientName(
      restriction.normalized_name || restriction.ingredient_name,
    );
    if (!restrictedName) return false;
    if (
      ingredients.some((ingredient) =>
        restrictionMatchesIngredient(restrictedName, ingredient),
      )
    ) {
      return false;
    }
  }

  return true;
};

export const filterRecipesForHardRestrictions = <T extends RecipeWithIngredients>(
  recipes: readonly T[],
  restrictions: readonly HardRestriction[],
): T[] =>
  recipes.filter((recipe) => isRecipeAllowedByHardRestrictions(recipe, restrictions));

export const fetchActiveHardRestrictions = async (
  userId: string,
): Promise<HardRestriction[]> => {
  if (!supabase) {
    throw new Error("Hard-restriction data is unavailable.");
  }

  const { data, error } = await supabase
    .from("user_restrictions")
    .select("ingredient_name,normalized_name,restriction_type,severity,is_strict")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Hard-restriction data could not be loaded: ${error.message || "unknown query error"}`,
    );
  }

  return selectActiveHardRestrictions((data || []) as HardRestriction[]);
};
