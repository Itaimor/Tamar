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

const RECIPE_SELECT = "*, recipe_images(image_url,source_tier)";

const imageUrl = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?q=80&w=1200&auto=format&fit=crop`;

const CATEGORY_IMAGES: Record<string, string[]> = {
  banana_bread: [imageUrl("photo-1509440159596-0249088772ff"), imageUrl("photo-1607958996333-41aef7caefaa"), imageUrl("photo-1499636136210-6f4ee915583e")],
  chocolate_cake: [imageUrl("photo-1578985545062-69928b1d9587"), imageUrl("photo-1606313564200-e75d5e30476c"), imageUrl("photo-1488477181946-6428a0291777")],
  apple_pie: [imageUrl("photo-1621743478914-cc8a86d7e7b5"), imageUrl("photo-1619566636858-adf3ef46400b"), imageUrl("photo-1481391319762-47dff72954d9")],
  chicken_soup: [imageUrl("photo-1547592166-23ac45744acd"), imageUrl("photo-1598515214211-89d3c73ae83b"), imageUrl("photo-1540420773420-3366772f4999")],
  beef_stew: [imageUrl("photo-1547592166-23ac45744acd"), imageUrl("photo-1558030006-450675393462"), imageUrl("photo-1518013431117-eb1465fa5752")],
  shrimp_pasta: [imageUrl("photo-1551183053-bf91a1d81141"), imageUrl("photo-1559737558-2f5a35f4523b"), imageUrl("photo-1512058564366-18510be2db19")],
  tuna_salad: [imageUrl("photo-1512621776951-a57141f2eefd"), imageUrl("photo-1559737558-2f5a35f4523b"), imageUrl("photo-1540189549336-e6e99c3679fe")],
  rice_bowl: [imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1546069901-ba9599a7e63c"), imageUrl("photo-1540189549336-e6e99c3679fe")],
  breakfast_bowl: [imageUrl("photo-1517673132405-a56a62b18caf"), imageUrl("photo-1525351484163-7529414344d8"), imageUrl("photo-1528207776546-365bb710ee93")],
  roasted_vegetables: [imageUrl("photo-1540420773420-3366772f4999"), imageUrl("photo-1474979266404-7eaacbcd87c5"), imageUrl("photo-1568584711075-3d021a7c3ca3")],
  dips_spreads: [imageUrl("photo-1472476443507-c7a5948772fc"), imageUrl("photo-1515543904379-3d757afe72e4"), imageUrl("photo-1599490659213-e2b9527bd087")],
  smoothie_bowl: [imageUrl("photo-1502741224143-90386d7f8c82"), imageUrl("photo-1619566636858-adf3ef46400b"), imageUrl("photo-1517673132405-a56a62b18caf")],
  coffee_tea: [imageUrl("photo-1509042239860-f550ce710b93"), imageUrl("photo-1502741224143-90386d7f8c82")],
  smoothie_juice: [imageUrl("photo-1502741224143-90386d7f8c82"), imageUrl("photo-1619566636858-adf3ef46400b"), imageUrl("photo-1517673132405-a56a62b18caf")],
  cocktail_drink: [imageUrl("photo-1536935338788-846bb9981813"), imageUrl("photo-1509042239860-f550ce710b93")],
  cake: [imageUrl("photo-1578985545062-69928b1d9587"), imageUrl("photo-1606313564200-e75d5e30476c"), imageUrl("photo-1488477181946-6428a0291777")],
  cookies_bars: [imageUrl("photo-1499636136210-6f4ee915583e"), imageUrl("photo-1606313564200-e75d5e30476c"), imageUrl("photo-1578985545062-69928b1d9587")],
  pie_tart: [imageUrl("photo-1621743478914-cc8a86d7e7b5"), imageUrl("photo-1481391319762-47dff72954d9"), imageUrl("photo-1578985545062-69928b1d9587")],
  pudding_custard: [imageUrl("photo-1488477181946-6428a0291777"), imageUrl("photo-1578985545062-69928b1d9587"), imageUrl("photo-1501443762994-82bd5dace89a")],
  ice_cream_frozen: [imageUrl("photo-1501443762994-82bd5dace89a"), imageUrl("photo-1488477181946-6428a0291777"), imageUrl("photo-1606313564200-e75d5e30476c")],
  candy_chocolate: [imageUrl("photo-1606313564200-e75d5e30476c"), imageUrl("photo-1499636136210-6f4ee915583e"), imageUrl("photo-1578985545062-69928b1d9587")],
  bread_rolls: [imageUrl("photo-1509440159596-0249088772ff"), imageUrl("photo-1607958996333-41aef7caefaa"), imageUrl("photo-1528735602780-2552fd46c7af")],
  muffins_scones: [imageUrl("photo-1607958996333-41aef7caefaa"), imageUrl("photo-1499636136210-6f4ee915583e"), imageUrl("photo-1509440159596-0249088772ff")],
  pancakes_waffles: [imageUrl("photo-1528207776546-365bb710ee93"), imageUrl("photo-1525351484163-7529414344d8"), imageUrl("photo-1517673132405-a56a62b18caf")],
  eggs_breakfast: [imageUrl("photo-1525351484163-7529414344d8"), imageUrl("photo-1517673132405-a56a62b18caf"), imageUrl("photo-1528207776546-365bb710ee93")],
  oatmeal_cereal: [imageUrl("photo-1517673132405-a56a62b18caf"), imageUrl("photo-1502741224143-90386d7f8c82"), imageUrl("photo-1619566636858-adf3ef46400b")],
  chicken: [imageUrl("photo-1598515214211-89d3c73ae83b"), imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1540189549336-e6e99c3679fe")],
  beef_steak: [imageUrl("photo-1558030006-450675393462"), imageUrl("photo-1603360946369-dc9bb6258143"), imageUrl("photo-1518013431117-eb1465fa5752")],
  pork_bacon_ham: [imageUrl("photo-1529692236671-f1f6cf9683ba"), imageUrl("photo-1525351484163-7529414344d8"), imageUrl("photo-1509440159596-0249088772ff")],
  lamb: [imageUrl("photo-1603360946369-dc9bb6258143"), imageUrl("photo-1540189549336-e6e99c3679fe"), imageUrl("photo-1558030006-450675393462")],
  fish_seafood: [imageUrl("photo-1559737558-2f5a35f4523b"), imageUrl("photo-1540189549336-e6e99c3679fe"), imageUrl("photo-1512621776951-a57141f2eefd")],
  pasta_noodles: [imageUrl("photo-1551183053-bf91a1d81141"), imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1585937421612-70a008356fbe")],
  rice_grains: [imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1546069901-ba9599a7e63c"), imageUrl("photo-1540189549336-e6e99c3679fe")],
  potato: [imageUrl("photo-1518013431117-eb1465fa5752"), imageUrl("photo-1551754655-cd27e38d2076"), imageUrl("photo-1540420773420-3366772f4999")],
  beans_lentils: [imageUrl("photo-1515543904379-3d757afe72e4"), imageUrl("photo-1585937421612-70a008356fbe"), imageUrl("photo-1547592166-23ac45744acd")],
  tofu_vegetarian: [imageUrl("photo-1546069901-ba9599a7e63c"), imageUrl("photo-1540420773420-3366772f4999"), imageUrl("photo-1512058564366-18510be2db19")],
  salad: [imageUrl("photo-1512621776951-a57141f2eefd"), imageUrl("photo-1540189549336-e6e99c3679fe"), imageUrl("photo-1540420773420-3366772f4999")],
  soup_stew_chili: [imageUrl("photo-1547592166-23ac45744acd"), imageUrl("photo-1515543904379-3d757afe72e4"), imageUrl("photo-1585937421612-70a008356fbe")],
  sandwich_wrap: [imageUrl("photo-1528735602780-2552fd46c7af"), imageUrl("photo-1509440159596-0249088772ff"), imageUrl("photo-1599490659213-e2b9527bd087")],
  pizza_flatbread: [imageUrl("photo-1513104890138-7c749659a591"), imageUrl("photo-1565299585323-38d6b0865b47"), imageUrl("photo-1509440159596-0249088772ff")],
  tacos_mexican: [imageUrl("photo-1565299585323-38d6b0865b47"), imageUrl("photo-1513104890138-7c749659a591"), imageUrl("photo-1599490659213-e2b9527bd087")],
  curry_indian: [imageUrl("photo-1585937421612-70a008356fbe"), imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1515543904379-3d757afe72e4")],
  asian_stir_fry: [imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1551183053-bf91a1d81141"), imageUrl("photo-1546069901-ba9599a7e63c")],
  mediterranean: [imageUrl("photo-1540189549336-e6e99c3679fe"), imageUrl("photo-1512621776951-a57141f2eefd"), imageUrl("photo-1452195100486-9cc805987862")],
  vegetable_mixed: [imageUrl("photo-1540420773420-3366772f4999"), imageUrl("photo-1546069901-ba9599a7e63c"), imageUrl("photo-1568584711075-3d021a7c3ca3")],
  cauliflower_broccoli: [imageUrl("photo-1568584711075-3d021a7c3ca3"), imageUrl("photo-1540420773420-3366772f4999"), imageUrl("photo-1546069901-ba9599a7e63c")],
  carrot_squash_pumpkin: [imageUrl("photo-1474979266404-7eaacbcd87c5"), imageUrl("photo-1540420773420-3366772f4999"), imageUrl("photo-1547592166-23ac45744acd")],
  mushroom: [imageUrl("photo-1504545102780-26774c1bb073"), imageUrl("photo-1540420773420-3366772f4999"), imageUrl("photo-1512058564366-18510be2db19")],
  corn: [imageUrl("photo-1551754655-cd27e38d2076"), imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1599490659213-e2b9527bd087")],
  tomato: [imageUrl("photo-1592924357228-91a4daadcfea"), imageUrl("photo-1551183053-bf91a1d81141"), imageUrl("photo-1540189549336-e6e99c3679fe")],
  cheese_dairy: [imageUrl("photo-1452195100486-9cc805987862"), imageUrl("photo-1513104890138-7c749659a591"), imageUrl("photo-1509440159596-0249088772ff")],
  sauce_dressing: [imageUrl("photo-1472476443507-c7a5948772fc"), imageUrl("photo-1585937421612-70a008356fbe"), imageUrl("photo-1512621776951-a57141f2eefd")],
  snack_appetizer: [imageUrl("photo-1599490659213-e2b9527bd087"), imageUrl("photo-1528735602780-2552fd46c7af"), imageUrl("photo-1565299585323-38d6b0865b47")],
  fruit: [imageUrl("photo-1619566636858-adf3ef46400b"), imageUrl("photo-1502741224143-90386d7f8c82"), imageUrl("photo-1481391319762-47dff72954d9")],
  jam_preserve: [imageUrl("photo-1608219992759-8d74ed8d76eb"), imageUrl("photo-1509440159596-0249088772ff"), imageUrl("photo-1619566636858-adf3ef46400b")],
  holiday: [imageUrl("photo-1481391319762-47dff72954d9"), imageUrl("photo-1578985545062-69928b1d9587"), imageUrl("photo-1606313564200-e75d5e30476c")],
  meal_breakfast: [imageUrl("photo-1525351484163-7529414344d8"), imageUrl("photo-1517673132405-a56a62b18caf"), imageUrl("photo-1528207776546-365bb710ee93")],
  meal_baked: [imageUrl("photo-1509440159596-0249088772ff"), imageUrl("photo-1607958996333-41aef7caefaa"), imageUrl("photo-1499636136210-6f4ee915583e")],
  meal_dessert: [imageUrl("photo-1578985545062-69928b1d9587"), imageUrl("photo-1499636136210-6f4ee915583e"), imageUrl("photo-1621743478914-cc8a86d7e7b5")],
  meal_drink: [imageUrl("photo-1509042239860-f550ce710b93"), imageUrl("photo-1502741224143-90386d7f8c82"), imageUrl("photo-1536935338788-846bb9981813")],
  meal_grain_bowl: [imageUrl("photo-1512058564366-18510be2db19"), imageUrl("photo-1546069901-ba9599a7e63c"), imageUrl("photo-1540189549336-e6e99c3679fe")],
  meal_main: [imageUrl("photo-1598515214211-89d3c73ae83b"), imageUrl("photo-1558030006-450675393462"), imageUrl("photo-1559737558-2f5a35f4523b")],
  general_food: [imageUrl("photo-1543352634-a1c51d9f1fa7"), imageUrl("photo-1540189549336-e6e99c3679fe"), imageUrl("photo-1546069901-ba9599a7e63c")],
};

const SPECIFIC_CATEGORY_RULES: Array<[string, string[]]> = [
  ["banana_bread", ["banana bread", "banana loaf"]],
  ["chocolate_cake", ["chocolate cake", "chocolate cupcake", "chocolate torte", "brownie cake"]],
  ["apple_pie", ["apple pie", "apple tart", "apple crisp", "apple crumble"]],
  ["chicken_soup", ["chicken soup", "chicken stew", "chicken chili", "chicken chowder"]],
  ["beef_stew", ["beef stew", "beef chili", "beef soup", "pot roast", "braised beef"]],
  ["shrimp_pasta", ["shrimp pasta", "shrimp linguine", "shrimp fettuccine", "seafood pasta"]],
  ["tuna_salad", ["tuna salad", "salmon salad", "seafood salad"]],
  ["rice_bowl", ["rice bowl", "rice and", "burrito bowl", "grain bowl", "quinoa bowl", "tofu bowl"]],
  ["breakfast_bowl", ["breakfast bowl", "oat bowl", "oatmeal bowl", "smoothie bowl", "yogurt bowl"]],
  ["roasted_vegetables", ["roasted vegetables", "roast vegetables", "roasted veggie", "grilled vegetables"]],
  ["dips_spreads", ["hummus", "guacamole", "bean dip", "cheese dip", "spinach dip", "pesto", "spread"]],
  ["smoothie_bowl", ["smoothie bowl", "acai bowl"]],
];

const CATEGORY_RULES: Array<[string, string[]]> = [
  ["coffee_tea", ["coffee", "espresso", "latte", "cappuccino", "tea", "chai", "mocha"]],
  ["smoothie_juice", ["smoothie", "juice", "lemonade", "shake", "slush", "punch"]],
  ["cocktail_drink", ["cocktail", "martini", "margarita", "sangria", "vodka", "rum", "liqueur", "amaretto", "kahlua", "beer", "wine"]],
  ["cake", ["cake", "cheesecake", "cupcake", "torte", "gateau"]],
  ["cookies_bars", ["cookie", "cookies", "bar", "bars", "brownie", "blondie", "biscotti", "shortbread"]],
  ["pie_tart", ["pie", "tart", "quiche"]],
  ["pudding_custard", ["pudding", "custard", "mousse", "flan", "souffle"]],
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
  ["beans_lentils", ["bean", "beans", "lentil", "lentils", "chickpea", "chickpeas", "peas"]],
  ["tofu_vegetarian", ["tofu", "tempeh", "seitan", "vegan", "vegetarian"]],
  ["salad", ["salad", "slaw", "coleslaw"]],
  ["soup_stew_chili", ["soup", "stew", "chili", "chowder", "bisque", "gumbo", "broth", "stock"]],
  ["sandwich_wrap", ["sandwich", "wrap", "panini", "sub", "hoagie", "slider", "burger", "quesadilla"]],
  ["pizza_flatbread", ["pizza", "flatbread", "calzone"]],
  ["tacos_mexican", ["taco", "tacos", "burrito", "enchilada", "fajita", "nachos", "salsa", "queso"]],
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
  ["sauce_dressing", ["sauce", "dressing", "vinaigrette", "marinade", "gravy", "glaze", "dip", "chutney", "relish"]],
  ["snack_appetizer", ["appetizer", "snack", "chips", "crackers", "popcorn", "nuts", "almonds", "cashews", "pecans"]],
  ["fruit", ["apple", "banana", "orange", "lemon", "lime", "berry", "berries", "strawberry", "blueberry", "raspberry", "peach", "pear", "mango", "pineapple", "grape", "melon"]],
  ["jam_preserve", ["jam", "jelly", "preserve", "marmalade"]],
  ["holiday", ["christmas", "thanksgiving", "easter", "halloween", "hanukkah", "holiday"]],
];

const MEAL_TYPE_RULES: Array<[string, string[]]> = [
  ["meal_breakfast", ["breakfast", "oats", "oat", "egg", "pancake", "waffle", "toast", "granola", "cereal", "yogurt"]],
  ["meal_baked", ["flour", "yeast", "baking powder", "baking soda", "dough", "bake"]],
  ["meal_dessert", ["sugar", "vanilla", "cocoa", "frosting", "sweetened", "dessert"]],
  ["meal_drink", ["drink", "beverage", "juice", "tea", "coffee", "lemonade", "smoothie"]],
  ["soup_stew_chili", ["broth", "stock", "bouillon", "simmer", "stew", "soup", "chili"]],
  ["meal_grain_bowl", ["rice", "quinoa", "barley", "farro", "couscous", "grain", "bowl"]],
  ["meal_main", ["chicken", "beef", "pork", "salmon", "fish", "shrimp", "tofu", "steak"]],
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesKeyword = (text: string, keyword: string): boolean => {
  const normalizedKeyword = keyword.toLowerCase().trim();
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.includes(" ") || normalizedKeyword.includes("-")) {
    return text.includes(normalizedKeyword);
  }

  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`).test(text);
};

const findCategory = (text: string, rules: Array<[string, string[]]>): string | null => {
  const normalized = text.toLowerCase();

  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => matchesKeyword(normalized, keyword))) {
      return category;
    }
  }

  return null;
};

const getImageSignature = (imageUrl: string): string => {
  const unsplashPhotoId = imageUrl.match(/photo-[a-z0-9-]+/i)?.[0];
  if (unsplashPhotoId) return unsplashPhotoId.toLowerCase();

  try {
    const url = new URL(imageUrl);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return imageUrl.split("?")[0].toLowerCase();
  }
};

const pickCategoryImage = (category: string, recipeId: number, usedImageSignatures?: Set<string>): string => {
  const images = CATEGORY_IMAGES[category] || CATEGORY_IMAGES.general_food;
  const startIndex = Math.abs(Number.isFinite(recipeId) ? recipeId : 0) % images.length;

  for (let offset = 0; offset < images.length; offset += 1) {
    const image = images[(startIndex + offset) % images.length];
    const signature = getImageSignature(image);
    if (!usedImageSignatures || !usedImageSignatures.has(signature)) {
      usedImageSignatures?.add(signature);
      return image;
    }
  }

  const fallbackImage = images[startIndex] || CATEGORY_IMAGES.general_food[0];
  usedImageSignatures?.add(getImageSignature(fallbackImage));
  return fallbackImage;
};

const getCategoryImage = (item: any, usedImageSignatures?: Set<string>): string => {
  const recipeId = Number(item.id);
  const title = String(item.name || "");
  const ingredients = Array.isArray(item.ingredients) ? item.ingredients.join(" ") : "";
  const description = String(item.description || "");

  const titleCategory =
    findCategory(title, SPECIFIC_CATEGORY_RULES) ||
    findCategory(title, CATEGORY_RULES);
  if (titleCategory) return pickCategoryImage(titleCategory, recipeId, usedImageSignatures);

  const ingredientSpecificCategory = findCategory(ingredients, SPECIFIC_CATEGORY_RULES);
  if (ingredientSpecificCategory) return pickCategoryImage(ingredientSpecificCategory, recipeId, usedImageSignatures);

  const mealTypeCategory = findCategory(`${title} ${ingredients} ${description}`, MEAL_TYPE_RULES);
  if (mealTypeCategory) return pickCategoryImage(mealTypeCategory, recipeId, usedImageSignatures);

  const ingredientCategory = findCategory(ingredients, CATEGORY_RULES);
  if (ingredientCategory) return pickCategoryImage(ingredientCategory, recipeId, usedImageSignatures);

  return pickCategoryImage("general_food", recipeId, usedImageSignatures);
};

const getLinkedRecipeImage = (item: any): { imageUrl: string | null; sourceTier: string | null } => {
  const linkedImage = Array.isArray(item.recipe_images)
    ? item.recipe_images[0]?.image_url
    : item.recipe_images?.image_url;
  const sourceTier = Array.isArray(item.recipe_images)
    ? item.recipe_images[0]?.source_tier
    : item.recipe_images?.source_tier;

  return {
    imageUrl: linkedImage || null,
    sourceTier: sourceTier || null,
  };
};

const getStoredRecipeImage = (item: any): { imageUrl: string | null; sourceTier: string | null } => {
  const linked = getLinkedRecipeImage(item);
  if (linked.imageUrl) return linked;

  return {
    imageUrl: item.image_url || null,
    sourceTier: null,
  };
};

const getRecipeImage = (item: any, forceFallbackImage = false, usedImageSignatures?: Set<string>): string => {
  if (forceFallbackImage) return getCategoryImage(item, usedImageSignatures);

  const { imageUrl } = getStoredRecipeImage(item);

  if (isPlaceholderImage(imageUrl)) return getCategoryImage(item, usedImageSignatures);

  usedImageSignatures?.add(getImageSignature(imageUrl));
  return imageUrl;
};

const mapRecipeRow = (item: any, forceFallbackImage = false, usedImageSignatures?: Set<string>): RecipeItem => ({
  id: Number(item.id),
  title: item.name || String(item.id),
  image: getRecipeImage(item, forceFallbackImage, usedImageSignatures),
  match: getDeterministicMatchScore(Number(item.id)),
  time: item.minutes ? `${item.minutes}m` : "15m",
  ingredients: item.ingredients,
  steps: item.steps,
  description: item.description,
  is_ibs_friendly: item.is_ibs_friendly,
});

const mapRecipeRows = (items: any[]): RecipeItem[] => {
  const storedImageCounts = new Map<string, number>();
  const usedImageSignatures = new Set<string>();

  for (const item of items) {
    const { imageUrl, sourceTier } = getStoredRecipeImage(item);
    const isProtectedSource = sourceTier === "manual" || sourceTier === "admin";
    if (!isProtectedSource && imageUrl && !isPlaceholderImage(imageUrl)) {
      const signature = getImageSignature(imageUrl);
      storedImageCounts.set(signature, (storedImageCounts.get(signature) || 0) + 1);
    }
  }

  return items.map((item) => {
    const { imageUrl, sourceTier } = getStoredRecipeImage(item);
    const isProtectedSource = sourceTier === "manual" || sourceTier === "admin";
    const signature = imageUrl ? getImageSignature(imageUrl) : "";
    const forceFallbackImage =
      !isProtectedSource &&
      !!imageUrl &&
      !isPlaceholderImage(imageUrl) &&
      (storedImageCounts.get(signature) || 0) > 1;
    return mapRecipeRow(item, forceFallbackImage, usedImageSignatures);
  });
};

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
    image: pickCategoryImage("general_food", numericId),
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
        const mapped = mapRecipeRows(data);
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
        return mapRecipeRows(data);
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
        const mapped = mapRecipeRows(data)
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
