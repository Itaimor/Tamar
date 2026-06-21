export type IbsTriggerGroup =
  | "fructans_gos"
  | "lactose"
  | "excess_fructose"
  | "polyols"
  | "gas_producing"
  | "fatty_spicy_processed"
  | "caffeine_alcohol_fizzy"
  | "fiber_sensitive";

export type IbsIngredient = {
  ingredientName: string;
  aliases: string[];
  triggerGroup: IbsTriggerGroup;
  sourceNotes: string;
};

const withAliases = (
  ingredientName: string,
  triggerGroup: IbsTriggerGroup,
  aliases: string[] = [],
  sourceNotes = "IBS/FODMAP trigger candidate",
): IbsIngredient => ({
  ingredientName,
  triggerGroup,
  aliases: [ingredientName, ...aliases],
  sourceNotes,
});

export const IBS_INGREDIENTS: IbsIngredient[] = [
  withAliases("garlic", "fructans_gos", ["garlic powder", "garlic salt", "garlic paste", "minced garlic", "roasted garlic"]),
  withAliases("onion", "fructans_gos", ["onions", "onion powder", "red onion", "white onion", "yellow onion", "cooked onion"]),
  withAliases("shallot", "fructans_gos", ["shallots"]),
  withAliases("leek", "fructans_gos", ["leeks", "leek white", "white part of leek"]),
  withAliases("spring onion white", "fructans_gos", ["scallion white", "white spring onion", "white scallion"]),
  withAliases("wheat", "fructans_gos", ["wheat flour", "plain flour", "all purpose flour", "flour"]),
  withAliases("bread", "fructans_gos", ["white bread", "wheat bread", "sandwich bread", "baguette", "roll"]),
  withAliases("pasta", "fructans_gos", ["spaghetti", "macaroni", "penne", "fettuccine", "lasagna"]),
  withAliases("couscous", "fructans_gos"),
  withAliases("noodles", "fructans_gos", ["wheat noodles", "ramen noodles"]),
  withAliases("rye", "fructans_gos", ["rye bread", "rye flour"]),
  withAliases("barley", "fructans_gos"),
  withAliases("spelt", "fructans_gos", ["spelt flour"]),
  withAliases("semolina", "fructans_gos"),
  withAliases("bulgur", "fructans_gos", ["bulgur wheat"]),
  withAliases("farro", "fructans_gos"),
  withAliases("muesli", "fructans_gos"),
  withAliases("wheat cereal", "fructans_gos", ["breakfast cereal", "bran cereal"]),
  withAliases("crackers", "fructans_gos", ["wheat crackers"]),
  withAliases("biscuits", "fructans_gos", ["cookies", "wheat biscuits"]),
  withAliases("pastry", "fructans_gos", ["puff pastry", "pie crust", "shortcrust"]),
  withAliases("pizza dough", "fructans_gos", ["pizza base", "pizza crust"]),
  withAliases("breadcrumbs", "fructans_gos", ["bread crumbs", "panko"]),
  withAliases("inulin", "fructans_gos", ["chicory fiber", "chicory root fiber"]),
  withAliases("chicory root", "fructans_gos", ["chicory"]),
  withAliases("artichoke", "fructans_gos", ["globe artichoke"]),
  withAliases("jerusalem artichoke", "fructans_gos", ["sunchoke"]),
  withAliases("asparagus", "fructans_gos"),
  withAliases("beetroot", "fructans_gos", ["beet", "beets"]),
  withAliases("black beans", "fructans_gos", ["black bean"]),
  withAliases("kidney beans", "fructans_gos", ["kidney bean"]),
  withAliases("baked beans", "fructans_gos"),
  withAliases("pinto beans", "fructans_gos", ["pinto bean"]),
  withAliases("navy beans", "fructans_gos", ["navy bean"]),
  withAliases("cannellini beans", "fructans_gos", ["cannellini bean", "white beans"]),
  withAliases("lentils", "fructans_gos", ["lentil", "red lentils", "green lentils"]),
  withAliases("chickpeas", "fructans_gos", ["chickpea", "garbanzo", "garbanzo beans"]),
  withAliases("hummus", "fructans_gos"),
  withAliases("split peas", "fructans_gos", ["split pea"]),
  withAliases("soybeans", "fructans_gos", ["soy beans", "soya beans"]),
  withAliases("edamame", "fructans_gos"),
  withAliases("cashews", "fructans_gos", ["cashew"]),
  withAliases("pistachios", "fructans_gos", ["pistachio"]),

  withAliases("milk", "lactose", ["cow milk", "whole milk", "skim milk", "low fat milk"]),
  withAliases("goat milk", "lactose"),
  withAliases("evaporated milk", "lactose"),
  withAliases("condensed milk", "lactose", ["sweetened condensed milk"]),
  withAliases("cream", "lactose", ["heavy cream", "single cream", "double cream"]),
  withAliases("sour cream", "lactose"),
  withAliases("whipped cream", "lactose"),
  withAliases("ice cream", "lactose"),
  withAliases("yogurt", "lactose", ["yoghurt"]),
  withAliases("greek yogurt", "lactose", ["greek yoghurt"]),
  withAliases("soft cheese", "lactose", ["brie", "camembert"]),
  withAliases("cream cheese", "lactose"),
  withAliases("ricotta", "lactose"),
  withAliases("cottage cheese", "lactose"),
  withAliases("custard", "lactose"),
  withAliases("kefir", "lactose"),
  withAliases("milk chocolate", "lactose"),
  withAliases("whey protein", "lactose", ["whey powder"]),
  withAliases("buttermilk", "lactose"),

  withAliases("apple", "excess_fructose", ["apples"]),
  withAliases("pear", "excess_fructose", ["pears"]),
  withAliases("mango", "excess_fructose", ["mangoes"]),
  withAliases("watermelon", "excess_fructose"),
  withAliases("cherries", "excess_fructose", ["cherry"]),
  withAliases("honey", "excess_fructose"),
  withAliases("agave", "excess_fructose", ["agave syrup", "agave nectar"]),
  withAliases("high fructose corn syrup", "excess_fructose", ["hfcs", "corn syrup"]),
  withAliases("fruit juice", "excess_fructose", ["juice"]),
  withAliases("apple juice", "excess_fructose"),
  withAliases("orange juice", "excess_fructose"),
  withAliases("dried fruit", "excess_fructose"),
  withAliases("raisins", "excess_fructose", ["raisin"]),
  withAliases("dates", "excess_fructose", ["date"]),
  withAliases("figs", "excess_fructose", ["fig"]),
  withAliases("prunes", "excess_fructose", ["prune"]),
  withAliases("peach", "excess_fructose", ["peaches"]),
  withAliases("nectarine", "excess_fructose", ["nectarines"]),
  withAliases("apricot", "excess_fructose", ["apricots"]),
  withAliases("plum", "excess_fructose", ["plums"]),
  withAliases("persimmon", "excess_fructose", ["persimmons"]),
  withAliases("lychee", "excess_fructose", ["lychees"]),

  withAliases("sorbitol", "polyols"),
  withAliases("mannitol", "polyols"),
  withAliases("xylitol", "polyols"),
  withAliases("maltitol", "polyols"),
  withAliases("erythritol", "polyols"),
  withAliases("isomalt", "polyols"),
  withAliases("sugar-free gum", "polyols", ["sugar free gum"]),
  withAliases("sugar-free candy", "polyols", ["sugar free candy", "diet candy"]),
  withAliases("mushrooms", "polyols", ["mushroom", "button mushrooms", "portobello"]),
  withAliases("cauliflower", "polyols"),
  withAliases("snow peas", "polyols", ["snow pea"]),
  withAliases("sugar snap peas", "polyols", ["snap peas"]),
  withAliases("avocado", "polyols", ["avocados"]),
  withAliases("sweet corn", "polyols", ["corn on the cob"]),

  withAliases("broccoli", "gas_producing"),
  withAliases("cabbage", "gas_producing", ["green cabbage", "red cabbage"]),
  withAliases("brussels sprouts", "gas_producing", ["brussel sprouts"]),
  withAliases("kale", "gas_producing"),
  withAliases("radish", "gas_producing", ["radishes"]),
  withAliases("turnip", "gas_producing", ["turnips"]),
  withAliases("sauerkraut", "gas_producing"),
  withAliases("coleslaw", "gas_producing"),
  withAliases("raw salad", "gas_producing", ["large salad"]),

  withAliases("fried food", "fatty_spicy_processed", ["fried foods"]),
  withAliases("french fries", "fatty_spicy_processed", ["fries", "chips"]),
  withAliases("onion rings", "fatty_spicy_processed"),
  withAliases("fried chicken", "fatty_spicy_processed"),
  withAliases("bacon", "fatty_spicy_processed"),
  withAliases("sausage", "fatty_spicy_processed", ["sausages"]),
  withAliases("salami", "fatty_spicy_processed"),
  withAliases("pepperoni", "fatty_spicy_processed"),
  withAliases("processed meat", "fatty_spicy_processed", ["deli meat", "cold cuts"]),
  withAliases("hot dog", "fatty_spicy_processed", ["hotdog"]),
  withAliases("spicy food", "fatty_spicy_processed", ["spicy foods"]),
  withAliases("chili pepper", "fatty_spicy_processed", ["chilli pepper", "chile pepper"]),
  withAliases("jalapeno", "fatty_spicy_processed", ["jalapenos"]),
  withAliases("hot sauce", "fatty_spicy_processed"),
  withAliases("curry", "fatty_spicy_processed", ["spicy curry"]),
  withAliases("cream sauce", "fatty_spicy_processed", ["alfredo sauce"]),
  withAliases("gravy", "fatty_spicy_processed"),
  withAliases("butter", "fatty_spicy_processed"),
  withAliases("margarine", "fatty_spicy_processed"),
  withAliases("mayonnaise", "fatty_spicy_processed", ["mayo"]),
  withAliases("fast food", "fatty_spicy_processed"),
  withAliases("pizza", "fatty_spicy_processed"),
  withAliases("burger", "fatty_spicy_processed", ["hamburger", "cheeseburger"]),
  withAliases("chocolate", "fatty_spicy_processed"),
  withAliases("cocoa", "fatty_spicy_processed"),

  withAliases("coffee", "caffeine_alcohol_fizzy"),
  withAliases("espresso", "caffeine_alcohol_fizzy"),
  withAliases("latte", "caffeine_alcohol_fizzy"),
  withAliases("cappuccino", "caffeine_alcohol_fizzy"),
  withAliases("black tea", "caffeine_alcohol_fizzy"),
  withAliases("energy drink", "caffeine_alcohol_fizzy", ["energy drinks"]),
  withAliases("cola", "caffeine_alcohol_fizzy", ["coke"]),
  withAliases("soda", "caffeine_alcohol_fizzy", ["soft drink", "fizzy drink", "fizzy drinks"]),
  withAliases("sparkling water", "caffeine_alcohol_fizzy", ["carbonated water"]),
  withAliases("beer", "caffeine_alcohol_fizzy"),
  withAliases("wine", "caffeine_alcohol_fizzy"),
  withAliases("liquor", "caffeine_alcohol_fizzy", ["vodka", "whiskey", "rum", "tequila"]),
  withAliases("cocktail", "caffeine_alcohol_fizzy", ["cocktails"]),
  withAliases("alcohol", "caffeine_alcohol_fizzy"),

  withAliases("bran", "fiber_sensitive", ["wheat bran"]),
  withAliases("oat bran", "fiber_sensitive"),
  withAliases("high-fiber cereal", "fiber_sensitive", ["high fiber cereal"]),
  withAliases("granola", "fiber_sensitive"),
  withAliases("whole wheat bread", "fiber_sensitive", ["wholemeal bread"]),
  withAliases("wholegrain bread", "fiber_sensitive", ["whole grain bread"]),
  withAliases("brown rice", "fiber_sensitive"),
  withAliases("quinoa", "fiber_sensitive"),
  withAliases("chia seeds", "fiber_sensitive", ["chia"]),
  withAliases("flaxseed", "fiber_sensitive", ["flax seed", "flax seeds"]),
  withAliases("almonds", "fiber_sensitive", ["almond"]),
  withAliases("walnuts", "fiber_sensitive", ["walnut"]),
  withAliases("peanuts", "fiber_sensitive", ["peanut"]),
  withAliases("popcorn", "fiber_sensitive"),
];

export const normalizeIbsText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const aliasPatternCache = new Map<string, RegExp>();

const getAliasPattern = (alias: string) => {
  const normalizedAlias = normalizeIbsText(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cached = aliasPatternCache.get(normalizedAlias);
  if (cached) return cached;

  const pattern = new RegExp(`(^|\\s)${normalizedAlias}(s|es)?(?=\\s|$)`, "i");
  aliasPatternCache.set(normalizedAlias, pattern);
  return pattern;
};

export const findIbsIngredientMatches = (text: string): IbsIngredient[] => {
  const normalizedText = ` ${normalizeIbsText(text)} `;
  const matches = new Map<string, IbsIngredient>();

  IBS_INGREDIENTS.forEach((ingredient) => {
    if (ingredient.aliases.some((alias) => getAliasPattern(alias).test(normalizedText))) {
      matches.set(ingredient.ingredientName, ingredient);
    }
  });

  return [...matches.values()];
};

export const getIbsIngredientByName = (ingredientName: string) =>
  IBS_INGREDIENTS.find((ingredient) => ingredient.ingredientName === ingredientName) || null;

