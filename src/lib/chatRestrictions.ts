import {
  normalizeIngredientName,
  notifyHardRestrictionsUpdated,
  upsertHardRestrictions,
} from "@/lib/recommendationSafety";

export { notifyHardRestrictionsUpdated };

const ALLERGY_STATEMENT_PATTERNS = [
  /\b(?:i\s+am|i['’]?m|im)\s+(?:(?:severely|highly|very)\s+)?allergic\s+to\s+(.+)/i,
  /\bi\s+have\s+(?:(?:a|an)\s+)?(?:(?:severe|serious)\s+)?allerg(?:y|ies)\s+to\s+(.+)/i,
] as const;

const UNCERTAIN_OR_HYPOTHETICAL_PREFIX =
  /\b(?:if|maybe|may|might|possibly|probably|suspect|think|unsure|wonder)\b/i;

const NON_INGREDIENT_WORDS =
  /\b(?:avoid|because|can|could|do|does|don['’]?t|it|please|recipe|recommend|remember|save|show|that|them|these|this|those|why|would)\b/i;

const trimAllergyListTail = (value: string) =>
  value
    .split(/[.!?](?:\s|$)/, 1)[0]
    .split(/\s+(?:but|because|so|although|though|however)\b/i, 1)[0]
    .split(/\s+(?:and\s+)?(?:i|can\s+you|could\s+you|would\s+you|please)\b/i, 1)[0]
    .trim();

const normalizeAllergyCandidate = (value: string) => {
  const withoutListWords = value
    .trim()
    .replace(/^(?:and|or|both|all|any|the)\s+/i, "")
    .replace(/\s+(?:products?|foods?|ingredients?)$/i, "")
    .trim();

  if (!withoutListWords || NON_INGREDIENT_WORDS.test(withoutListWords)) {
    return "";
  }

  const words = withoutListWords.match(/[a-z0-9]+/gi) || [];
  if (words.length === 0 || words.length > 5) return "";

  return normalizeIngredientName(withoutListWords);
};

export const extractExplicitAllergyNames = (text: string): string[] => {
  const message = String(text || "").trim();
  if (!message) return [];

  for (const pattern of ALLERGY_STATEMENT_PATTERNS) {
    const match = pattern.exec(message);
    if (!match) continue;

    const prefix = message.slice(Math.max(0, match.index - 45), match.index);
    if (UNCERTAIN_OR_HYPOTHETICAL_PREFIX.test(prefix)) return [];

    const allergyList = trimAllergyListTail(match[1]);
    const names = allergyList
      .split(/\s*(?:,|;|\/|&|\band\b|\bor\b)\s*/i)
      .map(normalizeAllergyCandidate)
      .filter(Boolean);

    return [...new Set(names)];
  }

  return [];
};

export const saveChatAllergies = async (
  userId: string,
  allergyNames: readonly string[],
): Promise<string[]> => {
  return upsertHardRestrictions({
    userId,
    ingredientNames: allergyNames,
    restrictionType: "allergy",
    notes: "Added from Tamar chat after an explicit user allergy statement.",
  });
};
