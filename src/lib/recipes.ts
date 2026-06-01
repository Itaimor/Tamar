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

const RECIPE_SELECT = "*, recipe_images(image_url)";

const CATEGORY_IMAGES: Record<string, string> = {
  coffee_tea: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=1200&auto=format&fit=crop",
  smoothie_juice: "https://images.unsplash.com/photo-1502741224143-90386d7f8c82?q=80&w=1200&auto=format&fit=crop",
  cocktail_drink: "https://images.unsplash.com/photo-1536935338788-846bb9981813?q=80&w=1200&auto=format&fit=crop",
  cake: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?q=80&w=1200&auto=format&fit=crop",
  cookies_bars: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?q=80&w=1200&auto=format&fit=crop",
  pie_tart: "https://images.unsplash.com/photo-1621743478914-cc8a86d7e7b5?q=80&w=1200&auto=format&fit=crop",
  pudding_custard: "https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=1200&auto=format&fit=crop",
  ice_cream_frozen: "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?q=80&w=1200&auto=format&fit=crop",
  candy_chocolate: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=1200&auto=format&fit=crop",
  bread_rolls: "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=1200&auto=format&fit=crop",
  muffins_scones: "https://images.unsplash.com/photo-1607958996333-41aef7caefaa?q=80&w=1200&auto=format&fit=crop",
  pancakes_waffles: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?q=80&w=1200&auto=format&fit=crop",
  eggs_breakfast: "https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=1200&auto=format&fit=crop",
  oatmeal_cereal: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?q=80&w=1200&auto=format&fit=crop",
  chicken: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?q=80&w=1200&auto=format&fit=crop",
  beef_steak: "https://images.unsplash.com/photo-1558030006-450675393462?q=80&w=1200&auto=format&fit=crop",
  pork_bacon_ham: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?q=80&w=1200&auto=format&fit=crop",
  lamb: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?q=80&w=1200&auto=format&fit=crop",
  fish_seafood: "https://images.unsplash.com/photo-1559737558-2f5a35f4523b?q=80&w=1200&auto=format&fit=crop",
  pasta_noodles: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?q=80&w=1200&auto=format&fit=crop",
  rice_grains: "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=1200&auto=format&fit=crop",
  potato: "https://images.unsplash.com/photo-1518013431117-eb1465fa5752?q=80&w=1200&auto=format&fit=crop",
  beans_lentils: "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?q=80&w=1200&auto=format&fit=crop",
  tofu_vegetarian: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1200&auto=format&fit=crop",
  salad: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1200&auto=format&fit=crop",
  soup_stew_chili: "https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=1200&auto=format&fit=crop",
  sandwich_wrap: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?q=80&w=1200&auto=format&fit=crop",
  pizza_flatbread: "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=1200&auto=format&fit=crop",
  tacos_mexican: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=1200&auto=format&fit=crop",
  curry_indian: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?q=80&w=1200&auto=format&fit=crop",
  asian_stir_fry: "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=1200&auto=format&fit=crop",
  mediterranean: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=1200&auto=format&fit=crop",
  vegetable_mixed: "https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=1200&auto=format&fit=crop",
  cauliflower_broccoli: "https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?q=80&w=1200&auto=format&fit=crop",
  carrot_squash_pumpkin: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=1200&auto=format&fit=crop",
  mushroom: "https://images.unsplash.com/photo-1504545102780-26774c1bb073?q=80&w=1200&auto=format&fit=crop",
  corn: "https://images.unsplash.com/photo-1551754655-cd27e38d2076?q=80&w=1200&auto=format&fit=crop",
  tomato: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?q=80&w=1200&auto=format&fit=crop",
  cheese_dairy: "https://images.unsplash.com/photo-1452195100486-9cc805987862?q=80&w=1200&auto=format&fit=crop",
  sauce_dressing: "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?q=80&w=1200&auto=format&fit=crop",
  snack_appetizer: "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?q=80&w=1200&auto=format&fit=crop",
  fruit: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?q=80&w=1200&auto=format&fit=crop",
  jam_preserve: "https://images.unsplash.com/photo-1608219992759-8d74ed8d76eb?q=80&w=1200&auto=format&fit=crop",
  holiday: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?q=80&w=1200&auto=format&fit=crop",
  general_food: "https://images.unsplash.com/photo-1543352634-a1c51d9f1fa7?q=80&w=1200&auto=format&fit=crop",
};

const CATEGORY_RULES: Array<[string, string[]]> = [
  ["coffee_tea", ["coffee", "espresso", "latte", "cappuccino", "tea", "chai", "mocha"]],
  ["smoothie_juice", ["smoothie", "juice", "lemonade", "shake", "slush", "punch"]],
  ["cocktail_drink", ["cocktail", "martini", "margarita", "sangria", "vodka", "rum", "liqueur", "amaretto", "kahlua", "beer", "wine"]],
  ["cake", ["cake", "cheesecake", "cupcake", "torte", "gateau"]],
  ["cookies_bars", ["cookie", "cookies", "bar", "bars", "brownie", "blondie", "biscotti", "shortbread"]],
  ["pie_tart", ["pie", "tart", "quiche"]],
  ["pudding_custard", ["pudding", "custard", "mousse", "flan", "souffl"]],
  ["ice_cream_frozen", ["ice cream", "sorbet", "sherbet", "frozen yogurt", "popsicle"]],
  ["candy_chocolate", ["candy", "chocolate", "fudge", "truffle", "caramel", "toffee", "praline"]],
  ["bread_rolls", ["bread", "roll", "rolls", "bun", "buns", "bagel", "focaccia", "naan", "pita", "loaf"]],
  ["muffins_scones", ["muffin", "muffins", "scone", "scones"]],
  ["pancakes_waffles", ["pancake", "pancakes", "waffle", "waffles", "crepe", "crepes", "french toast"]],
  ["eggs_breakfast", ["egg", "eggs", "omelet", "omelette", "frittata", "scramble", "scrambled"]],
  ["oatmeal_cereal", ["oatmeal", "granola", "cereal", "porridge", "muesli"]],
  ["chicken", ["chicken", "hen", "turkey", "duck"]],
  ["beef_steak", ["beef", "steak", "brisket", "veal", "sirloin", "meatloaf", "hamburger"]],
  ["pork_bacon_ham", ["pork", "bacon", "ham", "sausage", "prosciutto", "ribs"]],
  ["lamb", ["lamb", "mutton"]],
  ["fish_seafood", ["fish", "salmon", "tuna", "cod", "halibut", "tilapia", "shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel", "oyster", "seafood"]],
  ["pasta_noodles", ["pasta", "spaghetti", "noodle", "noodles", "linguine", "fettuccine", "lasagna", "ravioli", "macaroni", "penne", "gnocchi"]],
  ["rice_grains", ["rice", "risotto", "pilaf", "quinoa", "couscous", "barley", "farro", "bulgur"]],
  ["potato", ["potato", "potatoes", "fries", "hash brown"]],
  ["beans_lentils", ["bean", "beans", "lentil", "lentils", "chickpea", "chickpeas", "hummus", "peas"]],
  ["tofu_vegetarian", ["tofu", "tempeh", "seitan", "vegan", "vegetarian"]],
  ["salad", ["salad", "slaw", "coleslaw"]],
  ["soup_stew_chili", ["soup", "stew", "chili", "chowder", "bisque", "gumbo"]],
  ["sandwich_wrap", ["sandwich", "wrap", "panini", "sub", "hoagie", "slider", "burger", "quesadilla"]],
  ["pizza_flatbread", ["pizza", "flatbread", "calzone"]],
  ["tacos_mexican", ["taco", "tacos", "burrito", "enchilada", "fajita", "nachos", "salsa", "guacamole", "queso"]],
  ["curry_indian", ["curry", "masala", "tikka", "dal", "vindaloo", "korma", "samosa", "naan"]],
  ["asian_stir_fry", ["stir fry", "stir-fry", "teriyaki", "soy sauce", "sushi", "ramen", "pho", "pad thai", "kimchi", "dumpling", "wonton", "spring roll"]],
  ["mediterranean", ["greek", "mediterranean", "falafel", "tzatziki", "feta", "gyro", "tabbouleh"]],
  ["vegetable_mixed", ["vegetable", "veggie", "veggies", "ratatouille"]],
  ["cauliflower_broccoli", ["cauliflower", "broccoli"]],
  ["carrot_squash_pumpkin", ["carrot", "squash", "pumpkin", "zucchini"]],
  ["mushroom", ["mushroom", "mushrooms"]],
  ["corn", ["corn", "polenta", "grits"]],
  ["tomato", ["tomato", "tomatoes"]],
  ["cheese_dairy", ["cheese", "cheddar", "mozzarella", "parmesan", "ricotta", "feta", "cream cheese", "yogurt"]],
  ["sauce_dressing", ["sauce", "dressing", "vinaigrette", "marinade", "gravy", "glaze", "dip", "spread", "pesto", "chutney", "relish"]],
  ["snack_appetizer", ["appetizer", "snack", "chips", "crackers", "popcorn", "nuts", "almonds", "cashews", "pecans"]],
  ["fruit", ["apple", "banana", "orange", "lemon", "lime", "berry", "berries", "strawberry", "blueberry", "raspberry", "peach", "pear", "mango", "pineapple", "grape", "melon"]],
  ["jam_preserve", ["jam", "jelly", "preserve", "marmalade"]],
  ["holiday", ["christmas", "thanksgiving", "easter", "halloween", "hanukkah", "holiday"]],
];

// Helper to determine if an image URL is an Unsplash placeholder or generic fallback image
const isPlaceholderImage = (url: string | null | undefined): boolean => {
  if (!url) return true;
  return (
    url.includes("photo-1546069901-ba9599a7e63c") ||
    url.includes("photo-1512621776951-a57141f2eefd") ||
    url === "/images/hero.png" ||
    url === "/images/pizza.png" ||
    url === "/images/salad.png" ||
    url === ""
  );
};

// Generates a deterministic match percentage between 85% and 98% based on the recipe ID
export const getDeterministicMatchScore = (id: number): string => {
  const score = 85 + (Math.abs(id) % 14);
  return `${score}%`;
};

const findCategory = (text: string): string | null => {
  const normalized = text.toLowerCase();

  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return null;
};

const getCategoryImage = (item: any): string => {
  const titleCategory = findCategory(String(item.name || ""));
  if (titleCategory) return CATEGORY_IMAGES[titleCategory];

  const ingredients = Array.isArray(item.ingredients) ? item.ingredients.join(" ") : "";
  const ingredientCategory = findCategory(ingredients);
  if (ingredientCategory) return CATEGORY_IMAGES[ingredientCategory];

  return CATEGORY_IMAGES.general_food;
};

const getRecipeImage = (item: any): string => {
  const linkedImage = Array.isArray(item.recipe_images)
    ? item.recipe_images[0]?.image_url
    : item.recipe_images?.image_url;
  const imageUrl = linkedImage || item.image_url;

  return isPlaceholderImage(imageUrl) ? getCategoryImage(item) : imageUrl;
};

const mapRecipeRow = (item: any): RecipeItem => ({
  id: Number(item.id),
  title: item.name || String(item.id),
  image: getRecipeImage(item),
  match: getDeterministicMatchScore(Number(item.id)),
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
    image: CATEGORY_IMAGES.general_food,
    match: getDeterministicMatchScore(numericId),
    time: "15m"
  };
};

export const fetchRecipeById = async (recipeId: string | number): Promise<RecipeItem> => {
  const numericId = typeof recipeId === "number" ? recipeId : Number(recipeId);
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select(RECIPE_SELECT)
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
        .select(RECIPE_SELECT)
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
        .select(RECIPE_SELECT)
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

export const fetchColdStartRecipes = async (limit: number = 5): Promise<RecipeItem[]> => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select(RECIPE_SELECT)
        .not("name", "is", null)
        .limit(Math.max(limit * 4, 20));

      if (data && !error) {
        const mapped = data
          .map(mapRecipeRow)
          .filter((recipe) => recipe.title.trim().length > 0 && !/^\d+$/.test(recipe.title.trim()));

        if (mapped.length >= limit) {
          return mapped.slice(0, limit);
        }

        return mapped;
      }
    } catch (err) {
      console.error("Failed to fetch cold-start recipes from Supabase:", err);
    }
  }

  return [];
};
