import { supabase } from "@/lib/supabase";

export type IngredientSignal = {
  name: string;
  score: number;
  supportCount: number;
  lastSeenAt: string | null;
  positiveEvidence: number;
  negativeEvidence: number;
  sources: string[];
  label: string;
  helper: string;
};

export type WeeklyPattern = {
  label: string;
  meals: number;
  symptomLevel: number;
  easierReports: number;
};

export type DailyNutrition = {
  date: string;
  label: string;
  calories: number;
  protein: number;
  fat: number;
  mealsWithNutrition: number;
};

export type NextStep = {
  title: string;
  body: string;
  tone: "learn" | "steady" | "watch";
  kind?: "recipe_experiment" | "ingredient_experiment" | "logging";
  recipeId?: number;
  recipeTitle?: string;
};

export type AnalysisDashboard = {
  watchlist: IngredientSignal[];
  easierFoods: IngredientSignal[];
  weeklyPatterns: WeeklyPattern[];
  dailyNutrition: DailyNutrition[];
  nextSteps: NextStep[];
  totals: {
    trackedMeals: number;
    checkIns: number;
    easierReports: number;
    roughReports: number;
    topSignalCount: number;
    calories7Day: number;
    protein7Day: number;
    fat7Day: number;
    mealsWithNutrition: number;
  };
  hasData: boolean;
};

type GenericRiskRow = {
  ingredient_name: string;
  normalized_name?: string | null;
  exposure_count?: number | null;
  positive_evidence?: number | null;
  negative_evidence?: number | null;
  risk_score?: number | null;
  confidence?: number | null;
  last_evidence_at?: string | null;
  updated_at?: string | null;
};

type IbsRiskRow = {
  ingredient_name: string;
  grade?: number | null;
  confidence?: number | null;
  evidence_count?: number | null;
  last_evidence_at?: string | null;
  updated_at?: string | null;
};

type ExposureRow = {
  ingredient_name: string;
  normalized_name?: string | null;
  exposed_at?: string | null;
};

type MealLogRow = {
  id: number;
  recipe_id?: number | null;
  food_name?: string | null;
  logged_at?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
};

type HealthReportRow = {
  severity?: number | null;
  no_symptoms?: boolean | null;
  reported_at?: string | null;
};

type IbsCheckinRow = {
  severity?: number | null;
  created_at?: string | null;
};

type RecommendationRow = {
  recommended_recipe_ids?: Array<number | string> | null;
  trending_recipe_ids?: Array<number | string> | null;
  flavor_recipe_ids?: Array<number | string> | null;
  healthy_recipe_ids?: Array<number | string> | null;
  quick_recipe_ids?: Array<number | string> | null;
};

type RecipeCandidateRow = {
  id: number;
  name: string;
  ingredients?: string[] | null;
  description?: string | null;
};

type RawAnalysisData = {
  genericRisks: GenericRiskRow[];
  ibsRisks: IbsRiskRow[];
  exposures: ExposureRow[];
  mealLogs: MealLogRow[];
  healthReports: HealthReportRow[];
  ibsCheckins: IbsCheckinRow[];
  recommendationRows?: RecommendationRow[];
  candidateRecipes?: RecipeCandidateRow[];
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const formatIngredientName = (value: string) =>
  normalizeName(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 2) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isRecentEnough = (dateValue: string | null | undefined, now: Date, days = 30) => {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
};

const signalLabel = (score: number, supportCount: number) => {
  if (score >= 0.72 && supportCount >= 4) return "Strong signal";
  if (score >= 0.58) return supportCount >= 2 ? "Worth watching" : "Early clue";
  if (score <= 0.25 && supportCount >= 2) return "Usually goes well";
  if (score <= 0.35) return "Looks gentle so far";
  return "Still learning";
};

const signalHelper = (score: number, supportCount: number) => {
  if (supportCount === 0) return "Based on your starter profile.";
  if (score >= 0.58) return `Seen in ${supportCount} logged pattern${supportCount === 1 ? "" : "s"}.`;
  if (score <= 0.35) return `Logged ${supportCount} time${supportCount === 1 ? "" : "s"} without a strong pattern.`;
  return `Logged ${supportCount} time${supportCount === 1 ? "" : "s"}; Tamar is still learning.`;
};

const mergeSignals = (data: RawAnalysisData): IngredientSignal[] => {
  const byName = new Map<string, IngredientSignal>();
  const lastSeenByName = new Map<string, string>();

  data.exposures.forEach((row) => {
    const normalized = normalizeName(row.normalized_name || row.ingredient_name || "");
    if (!normalized || !row.exposed_at) return;
    const current = lastSeenByName.get(normalized);
    if (!current || new Date(row.exposed_at).getTime() > new Date(current).getTime()) {
      lastSeenByName.set(normalized, row.exposed_at);
    }
  });

  const upsertSignal = (partial: {
    name: string;
    score: number;
    supportCount: number;
    lastSeenAt: string | null;
    positiveEvidence?: number;
    negativeEvidence?: number;
    source: string;
  }) => {
    const normalized = normalizeName(partial.name);
    if (!normalized) return;
    const existing = byName.get(normalized);
    if (!existing) {
      const score = clamp01(partial.score);
      byName.set(normalized, {
        name: formatIngredientName(partial.name),
        score,
        supportCount: partial.supportCount,
        lastSeenAt: partial.lastSeenAt || lastSeenByName.get(normalized) || null,
        positiveEvidence: partial.positiveEvidence || 0,
        negativeEvidence: partial.negativeEvidence || 0,
        sources: [partial.source],
        label: signalLabel(score, partial.supportCount),
        helper: signalHelper(score, partial.supportCount),
      });
      return;
    }

    const totalSupport = Math.max(existing.supportCount, partial.supportCount);
    const nextScore =
      partial.supportCount > existing.supportCount
        ? clamp01(partial.score)
        : Math.max(existing.score, clamp01(partial.score));
    const lastSeenAt = [existing.lastSeenAt, partial.lastSeenAt, lastSeenByName.get(normalized)]
      .filter(Boolean)
      .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] || null;

    existing.score = nextScore;
    existing.supportCount = totalSupport;
    existing.lastSeenAt = lastSeenAt;
    existing.positiveEvidence += partial.positiveEvidence || 0;
    existing.negativeEvidence += partial.negativeEvidence || 0;
    existing.sources = Array.from(new Set([...existing.sources, partial.source]));
    existing.label = signalLabel(existing.score, existing.supportCount);
    existing.helper = signalHelper(existing.score, existing.supportCount);
  };

  data.genericRisks.forEach((row) => {
    upsertSignal({
      name: row.ingredient_name,
      score: safeNumber(row.risk_score),
      supportCount: Math.max(0, Math.round(safeNumber(row.exposure_count))),
      positiveEvidence: safeNumber(row.positive_evidence),
      negativeEvidence: safeNumber(row.negative_evidence),
      lastSeenAt: row.last_evidence_at || row.updated_at || null,
      source: "meal patterns",
    });
  });

  data.ibsRisks.forEach((row) => {
    upsertSignal({
      name: row.ingredient_name,
      score: safeNumber(row.grade),
      supportCount: Math.max(0, Math.round(safeNumber(row.evidence_count))),
      lastSeenAt: row.last_evidence_at || row.updated_at || null,
      source: "IBS check-ins",
    });
  });

  return [...byName.values()];
};

const buildWeeklyPatterns = (
  mealLogs: MealLogRow[],
  reports: Array<{ severity: number; date: string | null; easier: boolean }>,
  now: Date,
): WeeklyPattern[] => {
  const start = new Date(now);
  start.setDate(start.getDate() - 27);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: 4 }, (_, index) => {
    const bucketStart = new Date(start);
    bucketStart.setDate(start.getDate() + index * 7);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + 7);

    const meals = mealLogs.filter((meal) => {
      if (!meal.logged_at) return false;
      const date = new Date(meal.logged_at);
      return date >= bucketStart && date < bucketEnd;
    }).length;

    const bucketReports = reports.filter((report) => {
      if (!report.date) return false;
      const date = new Date(report.date);
      return date >= bucketStart && date < bucketEnd;
    });

    const symptomLevel = bucketReports.length
      ? Math.round((bucketReports.reduce((sum, report) => sum + report.severity, 0) / bucketReports.length) * 100)
      : 0;

    return {
      label: `Week ${index + 1}`,
      meals,
      symptomLevel,
      easierReports: bucketReports.filter((report) => report.easier).length,
    };
  });
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildDailyNutrition = (mealLogs: MealLogRow[], now: Date): DailyNutrition[] => {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: dateKey(date),
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
      calories: 0,
      protein: 0,
      fat: 0,
      mealsWithNutrition: 0,
    };
  });
  const byKey = new Map(days.map((day) => [day.key, day]));
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  mealLogs.forEach((meal) => {
    if (!meal.logged_at) return;
    const loggedAt = new Date(meal.logged_at);
    if (Number.isNaN(loggedAt.getTime()) || loggedAt < start || loggedAt > end) return;

    const bucket = byKey.get(dateKey(loggedAt));
    if (!bucket) return;

    const calories = safeNumber(meal.calories, 0);
    const protein = safeNumber(meal.protein_g, 0);
    const fat = safeNumber(meal.fat_g, 0);
    if (calories <= 0 && protein <= 0 && fat <= 0) return;

    bucket.calories += calories;
    bucket.protein += protein;
    bucket.fat += fat;
    bucket.mealsWithNutrition += 1;
  });

  return days.map((day) => ({
    date: day.key,
    label: day.label,
    calories: Math.round(day.calories),
    protein: Math.round(day.protein * 10) / 10,
    fat: Math.round(day.fat * 10) / 10,
    mealsWithNutrition: day.mealsWithNutrition,
  }));
};

const CONTENT_STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "into",
  "your",
  "this",
  "that",
  "recipe",
  "recipes",
  "fresh",
  "easy",
  "best",
  "quick",
  "simple",
  "style",
  "cup",
  "cups",
  "tbsp",
  "tsp",
]);

const tokenizeContent = (value: string): string[] =>
  normalizeName(value)
    .replace(/-/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !CONTENT_STOP_WORDS.has(token));

const addWeightedTokens = (vector: Map<string, number>, text: string, weight = 1) => {
  tokenizeContent(text).forEach((token) => {
    vector.set(token, (vector.get(token) || 0) + weight);
  });
};

const recipeContentText = (recipe: RecipeCandidateRow) =>
  [
    recipe.name,
    ...(recipe.ingredients || []),
    recipe.description || "",
  ].join(" ");

const cosineScore = (a: Map<string, number>, b: Map<string, number>) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  a.forEach((value, token) => {
    normA += value * value;
    dot += value * (b.get(token) || 0);
  });

  b.forEach((value) => {
    normB += value * value;
  });

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const recipeContainsSignal = (recipeText: string, signal: IngredientSignal) => {
  const text = ` ${normalizeName(recipeText).replace(/-/g, " ")} `;
  const normalizedSignal = normalizeName(signal.name).replace(/-/g, " ");
  return normalizedSignal ? text.includes(` ${normalizedSignal} `) : false;
};

export const buildContentBasedRecipeSuggestion = ({
  watchlist,
  easierFoods,
  mealLogs,
  candidateRecipes,
}: {
  watchlist: IngredientSignal[];
  easierFoods: IngredientSignal[];
  mealLogs: MealLogRow[];
  candidateRecipes: RecipeCandidateRow[];
}): NextStep | null => {
  if (!candidateRecipes.length || (!easierFoods.length && !mealLogs.length)) {
    return null;
  }

  const profile = new Map<string, number>();
  easierFoods.forEach((food, index) => {
    const supportBoost = Math.min(3, Math.max(1, food.supportCount));
    addWeightedTokens(profile, food.name, (easierFoods.length - index) * supportBoost);
  });

  mealLogs.slice(0, 20).forEach((meal) => {
    if (meal.food_name) {
      addWeightedTokens(profile, meal.food_name, 0.75);
    }
  });

  const loggedRecipeIds = new Set(
    mealLogs
      .map((meal) => meal.recipe_id)
      .filter((recipeId): recipeId is number => typeof recipeId === "number" && Number.isFinite(recipeId)),
  );

  const scored = candidateRecipes
    .filter((recipe) => !loggedRecipeIds.has(recipe.id))
    .map((recipe) => {
      const recipeText = recipeContentText(recipe);
      const recipeVector = new Map<string, number>();
      addWeightedTokens(recipeVector, recipe.name, 2);
      (recipe.ingredients || []).forEach((ingredient) => addWeightedTokens(recipeVector, ingredient, 2.5));
      if (recipe.description) addWeightedTokens(recipeVector, recipe.description, 0.75);

      const similarity = cosineScore(profile, recipeVector);
      const watchPenalty = watchlist.reduce((maxPenalty, signal) => {
        if (!recipeContainsSignal(recipeText, signal)) return maxPenalty;
        return Math.max(maxPenalty, clamp01(signal.score) * 0.85);
      }, 0);

      return {
        recipe,
        score: similarity * (1 - watchPenalty),
        similarity,
      };
    })
    .filter((item) => item.similarity > 0);

  scored.sort((a, b) => b.score - a.score || b.similarity - a.similarity || a.recipe.name.localeCompare(b.recipe.name));

  const best = scored[0];
  if (!best || best.score <= 0) return null;

  return {
    title: `Try ${best.recipe.name} as a familiar-feeling test`,
    body: "It overlaps with foods that have looked easier lately. Log how you feel afterward so Tamar can compare it with similar meals.",
    tone: "steady",
    kind: "recipe_experiment",
    recipeId: best.recipe.id,
    recipeTitle: best.recipe.name,
  };
};

const buildNextSteps = (
  watchlist: IngredientSignal[],
  easierFoods: IngredientSignal[],
  totals: AnalysisDashboard["totals"],
  contentRecipeStep: NextStep | null,
): NextStep[] => {
  const steps: NextStep[] = [];
  const earlyClue = watchlist.find((item) => item.supportCount < 3);
  const topSignal = watchlist[0];
  const gentleFood = easierFoods[0];

  if (totals.trackedMeals < 3) {
    steps.push({
      title: "Start with a simple baseline",
      body: "Log three ordinary meals and how you feel later. That gives Tamar enough signal to separate noise from a real pattern.",
      tone: "learn",
      kind: "logging",
    });
  }

  if (contentRecipeStep) {
    steps.push(contentRecipeStep);
  }

  if (earlyClue) {
    steps.push({
      title: `Test ${earlyClue.name} with a similar meal`,
      body: `${earlyClue.name} is showing an early pattern. Try logging one meal that includes it and one similar meal without it.`,
      tone: "watch",
      kind: "ingredient_experiment",
    });
  } else if (topSignal) {
    steps.push({
      title: `Give ${topSignal.name} a quieter test week`,
      body: `This ingredient has the strongest signal right now. A few lower-${topSignal.name.toLowerCase()} meals can show whether symptoms settle.`,
      tone: "watch",
      kind: "ingredient_experiment",
    });
  }

  if (gentleFood && !contentRecipeStep) {
    steps.push({
      title: `Use ${gentleFood.name} as a safe-feeling anchor`,
      body: `${gentleFood.name} has looked easier lately. Pairing new tests with familiar gentle foods can make patterns easier to read.`,
      tone: "steady",
      kind: "logging",
    });
  }

  if (totals.checkIns < 2) {
    steps.push({
      title: "Add a quick good-day check-in",
      body: "Good days matter too. Logging when you feel okay helps Tamar find foods that usually work for you.",
      tone: "learn",
      kind: "logging",
    });
  }

  return steps.slice(0, 3);
};

export const buildAnalysisDashboard = (data: RawAnalysisData, now = new Date()): AnalysisDashboard => {
  const signals = mergeSignals(data);
  const recentSignals = signals.map((signal) => ({
    ...signal,
    recentlySeen: isRecentEnough(signal.lastSeenAt, now, 45),
  }));

  const watchlist = recentSignals
    .filter((signal) => signal.score >= 0.45)
    .sort((a, b) => b.score - a.score || b.supportCount - a.supportCount)
    .slice(0, 8);

  const easierFoods = recentSignals
    .filter((signal) => signal.score <= 0.35 && signal.supportCount >= 1)
    .sort((a, b) => a.score - b.score || b.supportCount - a.supportCount)
    .slice(0, 6);

  const healthReports = data.healthReports.map((report) => ({
    severity: clamp01(safeNumber(report.severity)),
    date: report.reported_at || null,
    easier: Boolean(report.no_symptoms) || safeNumber(report.severity) <= 0.2,
  }));

  const ibsReports = data.ibsCheckins.map((checkin) => ({
    severity: clamp01(safeNumber(checkin.severity)),
    date: checkin.created_at || null,
    easier: safeNumber(checkin.severity) <= 0.2,
  }));

  const reports = [...healthReports, ...ibsReports];
  const dailyNutrition = buildDailyNutrition(data.mealLogs, now);
  const totals = {
    trackedMeals: data.mealLogs.length,
    checkIns: reports.length,
    easierReports: reports.filter((report) => report.easier).length,
    roughReports: reports.filter((report) => report.severity >= 0.55).length,
    topSignalCount: watchlist.length,
    calories7Day: dailyNutrition.reduce((sum, day) => sum + day.calories, 0),
    protein7Day: Math.round(dailyNutrition.reduce((sum, day) => sum + day.protein, 0) * 10) / 10,
    fat7Day: Math.round(dailyNutrition.reduce((sum, day) => sum + day.fat, 0) * 10) / 10,
    mealsWithNutrition: dailyNutrition.reduce((sum, day) => sum + day.mealsWithNutrition, 0),
  };
  const contentRecipeStep = buildContentBasedRecipeSuggestion({
    watchlist,
    easierFoods,
    mealLogs: data.mealLogs,
    candidateRecipes: data.candidateRecipes || [],
  });

  return {
    watchlist,
    easierFoods,
    weeklyPatterns: buildWeeklyPatterns(data.mealLogs, reports, now),
    dailyNutrition,
    nextSteps: buildNextSteps(watchlist, easierFoods, totals, contentRecipeStep),
    totals,
    hasData: signals.length > 0 || data.mealLogs.length > 0 || reports.length > 0 || totals.mealsWithNutrition > 0,
  };
};

const readTable = async <T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> => {
  const { data, error } = await query;
  if (error) {
    console.warn(`Analysis data unavailable from ${label}:`, error.message || error);
    return [];
  }
  return data || [];
};

const recommendationRecipeIds = (rows: RecommendationRow[]): number[] => {
  const fields: Array<keyof RecommendationRow> = [
    "recommended_recipe_ids",
    "trending_recipe_ids",
    "flavor_recipe_ids",
    "healthy_recipe_ids",
    "quick_recipe_ids",
  ];
  const ids = new Set<number>();

  rows.forEach((row) => {
    fields.forEach((field) => {
      (row[field] || []).forEach((value) => {
        const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          ids.add(parsed);
        }
      });
    });
  });

  return [...ids].slice(0, 80);
};

export const fetchAnalysisDashboard = async (userId: string): Promise<AnalysisDashboard> => {
  if (!supabase) {
    return buildAnalysisDashboard({
      genericRisks: [],
      ibsRisks: [],
      exposures: [],
      mealLogs: [],
      healthReports: [],
      ibsCheckins: [],
      candidateRecipes: [],
    });
  }

  const [genericRisks, ibsRisks, exposures, mealLogs, healthReports, ibsCheckins, recommendationRows] = await Promise.all([
    readTable<GenericRiskRow>(
      "user_ingredient_risks",
      supabase
        .from("user_ingredient_risks")
        .select("ingredient_name,normalized_name,exposure_count,positive_evidence,negative_evidence,risk_score,confidence,last_evidence_at,updated_at")
        .eq("user_id", userId)
        .order("risk_score", { ascending: false })
        .limit(80),
    ),
    readTable<IbsRiskRow>(
      "user_ibs_ingredient_risks",
      supabase
        .from("user_ibs_ingredient_risks")
        .select("ingredient_name,grade,confidence,evidence_count,last_evidence_at,updated_at")
        .eq("user_id", userId)
        .order("grade", { ascending: false })
        .limit(120),
    ),
    readTable<ExposureRow>(
      "user_ingredient_exposures",
      supabase
        .from("user_ingredient_exposures")
        .select("ingredient_name,normalized_name,exposed_at")
        .eq("user_id", userId)
        .order("exposed_at", { ascending: false })
        .limit(250),
    ),
    readTable<MealLogRow>(
      "meal_logs",
      supabase
        .from("meal_logs")
        .select("id,recipe_id,food_name,logged_at,calories,protein_g,fat_g")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(250),
    ),
    readTable<HealthReportRow>(
      "health_reports",
      supabase
        .from("health_reports")
        .select("severity,no_symptoms,reported_at")
        .eq("user_id", userId)
        .order("reported_at", { ascending: false })
        .limit(120),
    ),
    readTable<IbsCheckinRow>(
      "user_ibs_checkins",
      supabase
        .from("user_ibs_checkins")
        .select("severity,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(120),
    ),
    readTable<RecommendationRow>(
      "user_recommendations",
      supabase
        .from("user_recommendations")
        .select("recommended_recipe_ids,trending_recipe_ids,flavor_recipe_ids,healthy_recipe_ids,quick_recipe_ids")
        .eq("user_id", userId)
        .limit(1),
    ),
  ]);
  const candidateRecipeIds = recommendationRecipeIds(recommendationRows);
  const candidateRecipes = candidateRecipeIds.length
    ? await readTable<RecipeCandidateRow>(
        "recipes",
        supabase
          .from("recipes")
          .select("id,name,ingredients,description")
          .in("id", candidateRecipeIds),
      )
    : [];

  return buildAnalysisDashboard({
    genericRisks,
    ibsRisks,
    exposures,
    mealLogs,
    healthReports,
    ibsCheckins,
    recommendationRows,
    candidateRecipes,
  });
};
