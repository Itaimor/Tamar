import { IBS_INGREDIENTS, normalizeIbsText } from "@/lib/ibsIngredients";

export type ChatFoodEntryKind = "food" | "cancel" | "not_food";

const CORE_FOOD_TERMS = [
  "rice",
  "chicken",
  "beef",
  "steak",
  "pork",
  "turkey",
  "lamb",
  "fish",
  "salmon",
  "tuna",
  "cod",
  "shrimp",
  "prawn",
  "egg",
  "eggs",
  "tofu",
  "tempeh",
  "potato",
  "sweet potato",
  "carrot",
  "cucumber",
  "tomato",
  "spinach",
  "lettuce",
  "zucchini",
  "eggplant",
  "bell pepper",
  "pumpkin",
  "squash",
  "green beans",
  "peas",
  "corn",
  "banana",
  "orange",
  "berries",
  "strawberry",
  "blueberry",
  "grapes",
  "kiwi",
  "pineapple",
  "lemon",
  "lime",
  "oats",
  "oatmeal",
  "cereal",
  "toast",
  "sandwich",
  "wrap",
  "taco",
  "burrito",
  "quesadilla",
  "sushi",
  "poke",
  "falafel",
  "shawarma",
  "sabich",
  "schnitzel",
  "soup",
  "stew",
  "salad",
  "omelet",
  "omelette",
  "pancake",
  "waffle",
  "muffin",
  "cake",
  "donut",
  "doughnut",
  "cheese",
  "halloumi",
  "feta",
  "mozzarella",
  "parmesan",
  "olive",
  "olive oil",
  "sesame",
  "tahini",
  "peanut butter",
  "jam",
  "salsa",
  "smoothie",
  "protein shake",
  "tea",
  "water",
];

const FOOD_TERMS = [
  ...new Set([
    ...CORE_FOOD_TERMS,
    ...IBS_INGREDIENTS.flatMap((ingredient) => ingredient.aliases),
  ].map(normalizeIbsText).filter(Boolean)),
];

const CANCEL_PATTERN =
  /^(?:please\s+)?(?:cancel|stop|exit|quit|back|nevermind|never\s+mind|forget\s+it|leave\s+it|nothing|skip|i\s+(?:do\s+not|don't)\s+want\s+to)(?:\s+(?:this|that|logging|food\s+log|food\s+logging))?[.!]?$/i;

const NON_FOOD_REPLY_PATTERN =
  /^(?:hey+|hi+|hello|hiya|yo|sup|howdy|yes|yeah|yep|no|nope|ok|okay|sure|thanks|thank\s+you|please|good|great|fine|cool|nice|maybe|idk|i\s+don'?t\s+know|help|test|testing|lol|bye|goodbye)[.!]*$/i;

const QUESTION_PATTERN =
  /^(?:who|what|where|when|why|how)\b|^(?:can|could|would|should|do|does|did|is|are|am|will)\s+(?:you|i|we|this|that|it)\b/i;

const containsFoodTerm = (normalizedText: string) => {
  const paddedText = ` ${normalizedText} `;
  return FOOD_TERMS.some((term) => {
    const paddedTerm = ` ${term} `;
    if (paddedText.includes(paddedTerm)) return true;
    if (term.includes(" ")) return false;
    return paddedText.includes(` ${term}s `) || paddedText.includes(` ${term}es `);
  });
};

export const isCancelChatFlowIntent = (text: string) => CANCEL_PATTERN.test(text.trim());

export const classifyChatFoodEntry = (text: string): ChatFoodEntryKind => {
  const trimmedText = text.trim();
  if (isCancelChatFlowIntent(trimmedText)) return "cancel";
  if (!trimmedText || trimmedText.length > 240) return "not_food";
  if (NON_FOOD_REPLY_PATTERN.test(trimmedText)) return "not_food";
  if (trimmedText.includes("?") || QUESTION_PATTERN.test(trimmedText)) return "not_food";

  const normalizedText = normalizeIbsText(trimmedText);
  if (!normalizedText || normalizedText.split(" ").length > 32) return "not_food";

  return containsFoodTerm(normalizedText) ? "food" : "not_food";
};
