import { supabase } from "@/lib/supabase";

export type MealLogRow = {
  id: number;
  user_id: string;
  recipe_id?: number | null;
  food_name: string;
  logged_at: string;
  portion_size?: number | null;
  portion_unit?: string | null;
  image_url?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type HealthReportRow = {
  id: number;
  user_id: string;
  reported_at: string;
  symptom_type: string;
  severity: number;
  no_symptoms: boolean;
  notes?: string | null;
  created_at?: string | null;
};

export type IbsCheckinRow = {
  id: number;
  user_id: string;
  severity: number;
  symptoms?: string[] | null;
  summary: string;
  food_windows?: {
    hours_0_8?: string[];
    hours_9_16?: string[];
    hours_17_24?: string[];
  } | null;
  created_at: string;
};

export type RecipeInteractionRow = {
  id: number;
  user_id: string;
  recipe_id: string;
  recipe_title: string;
  interaction_type: "viewed" | "started" | "saved" | "completed" | "liked" | "dismissed";
  created_at: string;
};

export type ChatFoodRow = {
  id: string;
  user_id: string;
  food_name: string;
  logged_at: string;
  source_label: string;
  checkin_summary?: string | null;
};

export type DiaryEntry =
  | { type: "meal"; id: number; at: string; meal: MealLogRow }
  | { type: "chat_food"; id: string; at: string; food: ChatFoodRow }
  | { type: "recipe"; id: number; at: string; recipe: RecipeInteractionRow }
  | { type: "checkin"; id: number; at: string; report: HealthReportRow }
  | { type: "chat_checkin"; id: number; at: string; checkin: IbsCheckinRow };

export type DiaryData = {
  meals: MealLogRow[];
  reports: HealthReportRow[];
  ibsCheckins: IbsCheckinRow[];
  recipeInteractions: RecipeInteractionRow[];
  entries: DiaryEntry[];
};

export type MealSourceOption = {
  id: string;
  foodName: string;
  sourceLabel: string;
  recipeId?: number | null;
  imageUrl?: string | null;
  helper?: string | null;
};

export type MealLogInput = {
  userId: string;
  foodName: string;
  loggedAt: string;
  recipeId?: number | null;
  portionSize?: number | null;
  portionUnit?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
};

export type HealthReportInput = {
  userId: string;
  symptomType: string;
  severity: number;
  reportedAt: string;
  noSymptoms: boolean;
  notes?: string | null;
};

const readTable = async <T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> => {
  const { data, error } = await query;
  if (error) {
    console.warn(`Diary data unavailable from ${label}:`, error.message || error);
    return [];
  }
  return data || [];
};

const authHeaders = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
};

const parseApiError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return body?.error || body?.detail || `Request failed with ${response.status}`;
};

const postDiaryApi = async <T>(path: string, payload: Record<string, unknown>): Promise<T | null> => {
  const headers = await authHeaders();
  if (!headers) return null;

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json();
};

const normalizeDate = (value: string) => new Date(value).toISOString();

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const numericCatalogRecipeId = (recipeId: string | number | null | undefined) => {
  const value = String(recipeId || "").trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);

const chatWindowConfig = [
  { key: "hours_0_8" as const, label: "From chat: last 0-8 hours", offsetHours: -4 },
  { key: "hours_9_16" as const, label: "From chat: 9-16 hours before", offsetHours: -12.5 },
  { key: "hours_17_24" as const, label: "From chat: 17-24 hours before", offsetHours: -20.5 },
];

export const getChatMealTime = (checkinCreatedAt: string, windowKey: keyof NonNullable<IbsCheckinRow["food_windows"]>) => {
  const config = chatWindowConfig.find((item) => item.key === windowKey);
  return addHours(new Date(checkinCreatedAt), config?.offsetHours || -4).toISOString();
};

const hasMatchingMealLog = (meals: MealLogRow[], foodName: string, loggedAt: string) => {
  const normalizedFood = normalizeName(foodName);
  const targetTime = new Date(loggedAt).getTime();
  if (!normalizedFood || Number.isNaN(targetTime)) return false;

  return meals.some((meal) => {
    const mealTime = new Date(meal.logged_at).getTime();
    if (Number.isNaN(mealTime)) return false;
    const closeInTime = Math.abs(mealTime - targetTime) <= 60 * 60 * 1000;
    return closeInTime && normalizeName(meal.food_name) === normalizedFood;
  });
};

const buildChatFoodEntries = (checkins: IbsCheckinRow[], meals: MealLogRow[]): DiaryEntry[] =>
  checkins.flatMap((checkin) =>
    chatWindowConfig.flatMap((config) => {
      const foods = checkin.food_windows?.[config.key] || [];
      const loggedAt = getChatMealTime(checkin.created_at, config.key);
      return foods
        .map((foodName) => String(foodName).trim())
        .filter(Boolean)
        .filter((foodName) => !hasMatchingMealLog(meals, foodName, loggedAt))
        .map((foodName, index) => ({
          type: "chat_food" as const,
          id: `chat-food-${checkin.id}-${config.key}-${index}`,
          at: loggedAt,
          food: {
            id: `chat-food-${checkin.id}-${config.key}-${index}`,
            user_id: checkin.user_id,
            food_name: foodName,
            logged_at: loggedAt,
            source_label: config.label,
            checkin_summary: checkin.summary,
          },
        }));
    }),
  );

const combineEntries = (
  meals: MealLogRow[],
  reports: HealthReportRow[],
  ibsCheckins: IbsCheckinRow[],
  recipeInteractions: RecipeInteractionRow[],
): DiaryEntry[] =>
  [
    ...meals.map((meal) => ({ type: "meal" as const, id: meal.id, at: meal.logged_at, meal })),
    ...buildChatFoodEntries(ibsCheckins, meals),
    ...recipeInteractions.map((recipe) => ({ type: "recipe" as const, id: recipe.id, at: recipe.created_at, recipe })),
    ...reports.map((report) => ({ type: "checkin" as const, id: report.id, at: report.reported_at, report })),
    ...ibsCheckins.map((checkin) => ({ type: "chat_checkin" as const, id: checkin.id, at: checkin.created_at, checkin })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

export const fetchDiaryData = async (userId: string): Promise<DiaryData> => {
  if (!supabase) {
    return { meals: [], reports: [], ibsCheckins: [], recipeInteractions: [], entries: [] };
  }

  const [meals, reports, ibsCheckins, recipeInteractions] = await Promise.all([
    readTable<MealLogRow>(
      "meal_logs",
      supabase
        .from("meal_logs")
        .select("id,user_id,recipe_id,food_name,logged_at,portion_size,portion_unit,image_url,notes,created_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(120),
    ),
    readTable<HealthReportRow>(
      "health_reports",
      supabase
        .from("health_reports")
        .select("id,user_id,reported_at,symptom_type,severity,no_symptoms,notes,created_at")
        .eq("user_id", userId)
        .order("reported_at", { ascending: false })
        .limit(120),
    ),
    readTable<IbsCheckinRow>(
      "user_ibs_checkins",
      supabase
        .from("user_ibs_checkins")
        .select("id,user_id,severity,symptoms,summary,food_windows,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(120),
    ),
    readTable<RecipeInteractionRow>(
      "recipe_interactions",
      supabase
        .from("recipe_interactions")
        .select("id,user_id,recipe_id,recipe_title,interaction_type,created_at")
        .eq("user_id", userId)
        .in("interaction_type", ["started", "completed"])
        .order("created_at", { ascending: false })
        .limit(120),
    ),
  ]);

  return {
    meals,
    reports,
    ibsCheckins,
    recipeInteractions,
    entries: combineEntries(meals, reports, ibsCheckins, recipeInteractions),
  };
};

export const fetchCookbookMealOptions = async (userId: string): Promise<MealSourceOption[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("cooklist_recipes")
    .select("id,recipe_id,recipe_title,recipe_source,image_url,description,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    console.warn("Cookbook meal options unavailable:", error.message || error);
    return [];
  }

  const optionsByRecipe = new Map<string, MealSourceOption>();
  (data || []).forEach((row) => {
    const foodName = String(row.recipe_title || "").trim();
    if (!foodName) return;

    const recipeSource = row.recipe_source === "personal" ? "Personal recipe" : "Cookbook";
    const recipeKey = `${row.recipe_source || "catalog"}-${row.recipe_id || row.id}-${normalizeName(foodName)}`;
    if (optionsByRecipe.has(recipeKey)) return;

    optionsByRecipe.set(recipeKey, {
      id: `cookbook-${row.id}`,
      foodName,
      sourceLabel: recipeSource,
      recipeId: row.recipe_source === "personal" ? null : numericCatalogRecipeId(row.recipe_id),
      imageUrl: row.image_url || null,
      helper: row.description || null,
    });
  });

  return [...optionsByRecipe.values()];
};

export const createMealLog = async (input: MealLogInput): Promise<MealLogRow> => {
  const payload = {
    user_id: input.userId,
    food_name: input.foodName.trim(),
    recipe_id: input.recipeId || null,
    logged_at: normalizeDate(input.loggedAt),
    portion_size: input.portionSize || null,
    portion_unit: input.portionUnit || null,
    image_url: input.imageUrl?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  try {
    const apiResult = await postDiaryApi<{ meal_log?: MealLogRow }>("/api/meal-log", payload);
    if (apiResult?.meal_log) return apiResult.meal_log;
  } catch (error) {
    console.warn("Meal-log API unavailable; falling back to Supabase insert.", error);
  }

  if (!supabase) throw new Error("Tamar is not connected to Supabase yet.");
  const { data, error } = await supabase.from("meal_logs").insert(payload).select().single();
  if (error) throw error;
  return data as MealLogRow;
};

export const createHealthReport = async (input: HealthReportInput): Promise<HealthReportRow> => {
  const severity = Math.max(0, Math.min(1, input.noSymptoms ? 0 : input.severity));
  const payload = {
    user_id: input.userId,
    symptom_type: input.noSymptoms ? "none" : input.symptomType,
    severity,
    reported_at: normalizeDate(input.reportedAt),
    no_symptoms: input.noSymptoms,
    notes: input.notes?.trim() || null,
  };

  try {
    const apiResult = await postDiaryApi<{ health_report?: HealthReportRow }>("/api/health-report", payload);
    if (apiResult?.health_report) return apiResult.health_report;
  } catch (error) {
    console.warn("Health-report API unavailable; falling back to Supabase insert.", error);
  }

  if (!supabase) throw new Error("Tamar is not connected to Supabase yet.");
  const { data, error } = await supabase.from("health_reports").insert(payload).select().single();
  if (error) throw error;
  return data as HealthReportRow;
};
