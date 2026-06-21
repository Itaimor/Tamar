import {
  IBS_INGREDIENTS,
  IbsIngredient,
  IbsTriggerGroup,
  findIbsIngredientMatches,
} from "@/lib/ibsIngredients";

export type IbsFoodWindows = {
  hours_0_8: string[];
  hours_9_16: string[];
  hours_17_24: string[];
};

export type IbsCheckInResult = {
  complete: boolean;
  feeling: {
    severity: number;
    symptoms: string[];
    summary: string;
    confidence: number;
  };
  food_windows: IbsFoodWindows;
  missing_fields: string[];
};

export type IbsEvidenceRow = {
  ingredientName: string;
  triggerGroup: IbsTriggerGroup;
  count_8h: number;
  count_9_16h: number;
  count_17_24h: number;
  frequencyScore: number;
  evidenceScore: number;
};

export type ExistingIbsRiskRow = {
  ingredient_name: string;
  grade: number;
  confidence: number;
  evidence_count: number;
};

export type UpdatedIbsRiskRow = {
  ingredient_name: string;
  trigger_group: IbsTriggerGroup;
  grade: number;
  confidence: number;
  evidence_count: number;
  last_evidence_at: string;
  updated_at: string;
};

export type IbsQuestionOption = {
  label: string;
  value: number | null;
  helper: string;
};

export type IbsColdStartQuestion = {
  id: string;
  prompt: string;
  triggerGroups: IbsTriggerGroup[];
  groupWeight: number;
};

export const IBS_COLD_START_OPTIONS: IbsQuestionOption[] = [
  { label: "Usually fine", value: 0, helper: "No clear issue" },
  { label: "Mild", value: 1, helper: "Small discomfort" },
  { label: "Moderate", value: 2, helper: "Noticeable symptoms" },
  { label: "Strong", value: 3, helper: "Often a problem" },
  { label: "Not sure", value: null, helper: "Skip this group" },
];

export const IBS_COLD_START_QUESTIONS: IbsColdStartQuestion[] = [
  {
    id: "lactose",
    prompt: "How do you usually feel after milk, soft cheese, yogurt, or ice cream?",
    triggerGroups: ["lactose"],
    groupWeight: 1,
  },
  {
    id: "wheat_fructans",
    prompt: "How do you usually feel after wheat foods like bread, pasta, couscous, or regular flour?",
    triggerGroups: ["fructans_gos"],
    groupWeight: 0.9,
  },
  {
    id: "onion_garlic",
    prompt: "How do you usually feel after onion, garlic, leeks, or shallots?",
    triggerGroups: ["fructans_gos"],
    groupWeight: 1,
  },
  {
    id: "legumes",
    prompt: "How do you usually feel after beans, lentils, chickpeas, hummus, or peas?",
    triggerGroups: ["fructans_gos", "gas_producing"],
    groupWeight: 0.85,
  },
  {
    id: "fructose",
    prompt: "How do you usually feel after apples, pears, mango, watermelon, honey, fruit juice, or dried fruit?",
    triggerGroups: ["excess_fructose"],
    groupWeight: 1,
  },
  {
    id: "polyols",
    prompt: "How do you usually feel after mushrooms, cauliflower, stone fruits, avocado, or sugar-free gum/candy?",
    triggerGroups: ["polyols"],
    groupWeight: 1,
  },
  {
    id: "gas_vegetables",
    prompt: "How do you usually feel after cabbage, broccoli, brussels sprouts, or large raw salads?",
    triggerGroups: ["gas_producing"],
    groupWeight: 0.85,
  },
  {
    id: "fat_spice_processed",
    prompt: "How do you usually feel after fried, fatty, spicy, or highly processed foods?",
    triggerGroups: ["fatty_spicy_processed"],
    groupWeight: 0.65,
  },
  {
    id: "drinks",
    prompt: "How do you usually feel after coffee, alcohol, energy drinks, soda, or fizzy drinks?",
    triggerGroups: ["caffeine_alcohol_fizzy"],
    groupWeight: 0.8,
  },
  {
    id: "fiber",
    prompt: "When your stomach is sensitive, do large high-fiber meals make symptoms worse?",
    triggerGroups: ["fiber_sensitive"],
    groupWeight: 0.65,
  },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const sanitizeFoodList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25);
};

export const validateIbsCheckInResult = (value: unknown): IbsCheckInResult | null => {
  if (!value || typeof value !== "object") return null;

  const candidate = value as any;
  const severity = Number(candidate.feeling?.severity);
  const confidence = Number(candidate.feeling?.confidence ?? 0);
  const foodWindows = candidate.food_windows || {};
  const normalized: IbsCheckInResult = {
    complete: Boolean(candidate.complete),
    feeling: {
      severity: clamp01(Number.isFinite(severity) ? severity : NaN),
      symptoms: Array.isArray(candidate.feeling?.symptoms)
        ? candidate.feeling.symptoms.filter((item: unknown): item is string => typeof item === "string").slice(0, 8)
        : [],
      summary: typeof candidate.feeling?.summary === "string" ? candidate.feeling.summary.trim() : "",
      confidence: clamp01(Number.isFinite(confidence) ? confidence : 0),
    },
    food_windows: {
      hours_0_8: sanitizeFoodList(foodWindows.hours_0_8),
      hours_9_16: sanitizeFoodList(foodWindows.hours_9_16),
      hours_17_24: sanitizeFoodList(foodWindows.hours_17_24),
    },
    missing_fields: Array.isArray(candidate.missing_fields)
      ? candidate.missing_fields.filter((item: unknown): item is string => typeof item === "string")
      : [],
  };

  if (!Number.isFinite(severity)) return null;
  if (!normalized.complete) return normalized;
  if (!normalized.feeling.summary) return null;
  if (
    normalized.food_windows.hours_0_8.length === 0 ||
    normalized.food_windows.hours_9_16.length === 0 ||
    normalized.food_windows.hours_17_24.length === 0
  ) {
    return null;
  }

  return normalized;
};

const addMatches = (
  evidenceByIngredient: Map<string, { ingredient: IbsIngredient; counts: [number, number, number] }>,
  foodItems: string[],
  bucketIndex: 0 | 1 | 2,
) => {
  foodItems.forEach((foodItem) => {
    findIbsIngredientMatches(foodItem).forEach((ingredient) => {
      const current =
        evidenceByIngredient.get(ingredient.ingredientName) ||
        { ingredient, counts: [0, 0, 0] as [number, number, number] };
      current.counts[bucketIndex] += 1;
      evidenceByIngredient.set(ingredient.ingredientName, current);
    });
  });
};

export const buildIbsEvidenceTable = (result: IbsCheckInResult): IbsEvidenceRow[] => {
  const evidenceByIngredient = new Map<string, { ingredient: IbsIngredient; counts: [number, number, number] }>();

  addMatches(evidenceByIngredient, result.food_windows.hours_0_8, 0);
  addMatches(evidenceByIngredient, result.food_windows.hours_9_16, 1);
  addMatches(evidenceByIngredient, result.food_windows.hours_17_24, 2);

  return [...evidenceByIngredient.values()]
    .map(({ ingredient, counts }) => {
      const frequencyScore = Math.min(1, (1 * counts[0] + 0.65 * counts[1] + 0.35 * counts[2]) / 3);
      return {
        ingredientName: ingredient.ingredientName,
        triggerGroup: ingredient.triggerGroup,
        count_8h: counts[0],
        count_9_16h: counts[1],
        count_17_24h: counts[2],
        frequencyScore,
        evidenceScore: clamp01(result.feeling.severity * frequencyScore),
      };
    })
    .sort((a, b) => b.evidenceScore - a.evidenceScore || a.ingredientName.localeCompare(b.ingredientName));
};

export const computeUpdatedIbsRiskRows = (
  evidenceRows: IbsEvidenceRow[],
  existingRows: ExistingIbsRiskRow[],
  symptomSeverity: number,
  now = new Date().toISOString(),
): UpdatedIbsRiskRow[] => {
  const existingByIngredient = new Map(existingRows.map((row) => [row.ingredient_name, row]));

  return evidenceRows.map((row) => {
    const existing = existingByIngredient.get(row.ingredientName);
    const oldGrade = clamp01(Number(existing?.grade ?? 0));
    const oldConfidence = clamp01(Number(existing?.confidence ?? 0));
    const evidenceCount = Math.max(0, Number(existing?.evidence_count ?? 0));
    const learningRate = Math.min(0.35, 1 / (evidenceCount + 2));
    let nextGrade = oldGrade;

    if (symptomSeverity > 0.2) {
      nextGrade = oldGrade * (1 - learningRate) + row.evidenceScore * learningRate;
    } else {
      const negativeEvidenceStrength = row.frequencyScore * (1 - symptomSeverity);
      nextGrade = oldGrade * (1 - learningRate * negativeEvidenceStrength);
    }

    return {
      ingredient_name: row.ingredientName,
      trigger_group: row.triggerGroup,
      grade: Number(clamp01(nextGrade).toFixed(4)),
      confidence: Number(Math.min(1, oldConfidence + 0.08 + 0.04 * row.frequencyScore).toFixed(4)),
      evidence_count: evidenceCount + 1,
      last_evidence_at: now,
      updated_at: now,
    };
  });
};

export const buildColdStartRiskRows = (answers: Record<string, number | null>, now = new Date().toISOString()) => {
  const rows = IBS_INGREDIENTS.map((ingredient) => ({
    ingredient_name: ingredient.ingredientName,
    trigger_group: ingredient.triggerGroup,
    grade: 0,
    confidence: 0.05,
    evidence_count: 0,
    last_evidence_at: now,
    updated_at: now,
  }));

  const rowsByName = new Map(rows.map((row) => [row.ingredient_name, row]));

  IBS_COLD_START_QUESTIONS.forEach((question) => {
    const answer = answers[question.id];
    if (answer === null || answer === undefined) return;

    const baseRisk = clamp01(answer / 3);
    IBS_INGREDIENTS
      .filter((ingredient) => question.triggerGroups.includes(ingredient.triggerGroup))
      .forEach((ingredient) => {
        const row = rowsByName.get(ingredient.ingredientName);
        if (!row) return;
        row.grade = Math.max(row.grade, Number((baseRisk * question.groupWeight).toFixed(4)));
        row.confidence = Math.max(row.confidence, 0.35);
        row.evidence_count = Math.max(row.evidence_count, 1);
      });
  });

  return rows;
};
