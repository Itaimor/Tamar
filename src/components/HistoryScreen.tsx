import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  BookmarkPlus,
  Camera,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History as HistoryIcon,
  HeartPulse,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SmilePlus,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { CanopyFeaturePanel } from "@/components/CanopyUpgradeDialog";
import ImageUploadDropzone from "@/components/ImageUploadDropzone";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Cooklist,
  addPersonalRecipeToCooklist,
  ensureDefaultCooklist,
  fetchCookbookRecipeTitleExists,
  fetchCooklists,
  fetchRecipeCooklistIds,
  findOrCreateCooklist,
  setRecipeCooklists,
} from "@/lib/recipeInteractions";
import {
  DiaryData,
  DiaryEntry,
  MealLogRow,
  MealSourceOption,
  createHealthReport,
  createMealLog,
  deleteMealLog,
  fetchCookbookMealOptions,
  fetchDiaryData,
  updateMealLog,
} from "@/lib/diary";
import {
  FoodImageAnalysis,
  analyzeFoodImage,
  buildFoodImageSuggestionNotes,
} from "@/lib/foodImageAnalysis";
import {
  MealNutritionEstimate,
  MealNutritionSource,
  estimateMealNutrition,
} from "@/lib/nutrition";
import { uploadUserImage } from "@/lib/imageUploads";
import { useCanopyAccess } from "@/hooks/useCanopyAccess";
import TamarTreePanel from "@/components/TamarTreePanel";

const symptomOptions = [
  { value: "digestive_discomfort", label: "Digestive discomfort" },
  { value: "bloating", label: "Bloating" },
  { value: "stomach_pain", label: "Stomach pain" },
  { value: "cramping", label: "Cramping" },
  { value: "nausea", label: "Nausea" },
  { value: "constipation", label: "Constipation" },
  { value: "diarrhea", label: "Diarrhea" },
];

const localDateTimeValue = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const localDateTimeInputValue = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? localDateTimeValue() : localDateTimeValue(date);
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const formatDay = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));

const symptomLabel = (value: string) =>
  symptomOptions.find((option) => option.value === value)?.label || value.replace(/_/g, " ");

const feelingText = (severity: number, noSymptoms?: boolean) => {
  if (noSymptoms || severity <= 0.05) return "Felt good";
  if (severity < 0.35) return "A little off";
  if (severity < 0.7) return "Uncomfortable";
  return "Rough";
};

const normalizeMealName = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const optionalNumberFromInput = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const sourceForManualNutrition = (calories: string, proteinG: string, fatG: string): MealNutritionSource | null =>
  [calories, proteinG, fatG].some((value) => value.trim()) ? "manual" : null;

const formatNutritionNumber = (value: number | null | undefined, suffix = "") => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded)}${suffix}`;
};

const nutritionSourceLabel = (source: MealNutritionSource | null | undefined) => {
  if (source === "catalog_recipe") return "Catalog nutrition";
  if (source === "gemini_estimate") return "Gemini estimate";
  if (source === "manual") return "Edited nutrition";
  return null;
};

const buildHistoryMealOptions = (meals: MealLogRow[]): MealSourceOption[] => {
  const seen = new Set<string>();
  return meals
    .map((meal) => {
      const foodName = meal.food_name.trim();
      const key = normalizeMealName(foodName);
      if (!foodName || seen.has(key)) return null;
      seen.add(key);
      return {
        id: `history-${meal.id}`,
        foodName,
        sourceLabel: "History",
        recipeId: meal.recipe_id || null,
        imageUrl: meal.image_url || null,
        calories: meal.calories ?? null,
        proteinG: meal.protein_g ?? null,
        fatG: meal.fat_g ?? null,
        nutritionSource: meal.nutrition_source || null,
        nutritionConfidence: meal.nutrition_confidence ?? null,
        helper: formatTime(meal.logged_at),
      };
    })
    .filter((option): option is MealSourceOption => Boolean(option));
};

const mergePhotoNotes = (currentNotes: string, analysis: FoodImageAnalysis) => {
  const photoNotes = buildFoodImageSuggestionNotes(analysis);
  if (!photoNotes || currentNotes.includes(photoNotes)) return currentNotes;
  return currentNotes.trim() ? `${currentNotes.trim()}\n${photoNotes}` : photoNotes;
};

type CooklistCandidate = {
  recipeId?: string | number | null;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
};

const candidateFromEntry = (entry: DiaryEntry): CooklistCandidate | null => {
  if (entry.type === "meal") {
    return {
      recipeId: entry.meal.recipe_id || null,
      title: entry.meal.food_name,
      imageUrl: entry.meal.image_url || null,
      description: entry.meal.notes || null,
    };
  }

  if (entry.type === "chat_food") {
    return {
      title: entry.food.food_name,
      description: entry.food.checkin_summary || entry.food.source_label,
    };
  }

  if (entry.type === "recipe") {
    return {
      recipeId: entry.recipe.recipe_id,
      title: entry.recipe.recipe_title,
      description: entry.recipe.interaction_type === "completed" ? "Completed from diary." : "Started from diary.",
    };
  }

  return null;
};

const StatTile = ({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: typeof Utensils;
  label: string;
  value: string;
  helper: string;
  tone: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs text-white/50">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      </div>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon size={19} strokeWidth={1.8} />
      </div>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-white/45">{helper}</p>
  </div>
);

const EmptyState = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-6">
    <p className="text-sm font-medium text-white">{title}</p>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">{body}</p>
  </div>
);

const TimelineEntry = ({
  entry,
  index,
  onAddToCooklist,
  onEditMeal,
  onDeleteMeal,
  deletingMealId,
}: {
  entry: DiaryEntry;
  index: number;
  onAddToCooklist: (candidate: CooklistCandidate) => void;
  onEditMeal: (meal: MealLogRow) => void;
  onDeleteMeal: (meal: MealLogRow) => void;
  deletingMealId: number | null;
}) => {
  const isFood = entry.type === "meal" || entry.type === "chat_food" || entry.type === "recipe";
  const title =
    entry.type === "meal"
      ? entry.meal.food_name
      : entry.type === "chat_food"
        ? entry.food.food_name
        : entry.type === "recipe"
          ? entry.recipe.recipe_title
          : entry.type === "chat_checkin"
            ? feelingText(Number(entry.checkin.severity))
            : feelingText(entry.report.severity, entry.report.no_symptoms);
  const subtitle =
    entry.type === "meal"
      ? [entry.meal.portion_size, entry.meal.portion_unit].filter(Boolean).join(" ") || "Meal"
      : entry.type === "chat_food"
        ? entry.food.source_label
        : entry.type === "recipe"
          ? entry.recipe.interaction_type === "completed" ? "Completed recipe" : "Started recipe"
          : entry.type === "chat_checkin"
            ? "Chat check-in"
            : entry.report.no_symptoms
              ? "No digestive symptoms"
              : symptomLabel(entry.report.symptom_type);
  const notes =
    entry.type === "meal"
      ? entry.meal.notes
      : entry.type === "chat_food"
        ? entry.food.checkin_summary
        : entry.type === "recipe"
          ? null
          : entry.type === "chat_checkin"
            ? entry.checkin.summary
            : entry.report.notes;
  const Icon = isFood ? Utensils : HeartPulse;
  const tone = isFood ? "bg-cyan-300/12 text-cyan-100" : "bg-rose-300/12 text-rose-100";
  const imageUrl = entry.type === "meal" ? entry.meal.image_url : null;
  const cooklistCandidate = candidateFromEntry(entry);
  const isDeletingMeal = entry.type === "meal" && deletingMealId === entry.meal.id;
  const nutritionParts = entry.type === "meal"
    ? [
        formatNutritionNumber(entry.meal.calories, " cal"),
        formatNutritionNumber(entry.meal.protein_g, "g protein"),
        formatNutritionNumber(entry.meal.fat_g, "g fat"),
      ].filter(Boolean)
    : [];
  const nutritionSource = entry.type === "meal" ? nutritionSourceLabel(entry.meal.nutrition_source) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035 }}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3"
    >
      <div className={`mt-1 grid h-10 w-10 place-items-center rounded-lg ${tone}`}>
        <Icon size={18} />
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="mb-3 aspect-video w-full rounded-lg border border-white/10 object-cover"
            loading="lazy"
          />
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs text-white/45">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cooklistCandidate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onAddToCooklist(cooklistCandidate)}
                    aria-label={`Add ${title} to cooklist`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-transparent text-white/55 transition hover:border-cyan-200/45 hover:bg-cyan-200/[0.08] hover:text-cyan-100"
                  >
                    <BookmarkPlus size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Add to cooklist</TooltipContent>
              </Tooltip>
            )}
            {entry.type === "meal" && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onEditMeal(entry.meal)}
                      aria-label={`Edit ${title}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-transparent text-white/55 transition hover:border-emerald-200/45 hover:bg-emerald-200/[0.08] hover:text-emerald-100"
                    >
                      <Pencil size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Edit meal</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onDeleteMeal(entry.meal)}
                      disabled={isDeletingMeal}
                      aria-label={`Remove ${title}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-transparent text-white/55 transition hover:border-rose-200/45 hover:bg-rose-200/[0.08] hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDeletingMeal ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Remove meal</TooltipContent>
                </Tooltip>
              </>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55">
              <Clock3 size={12} />
              {formatTime(entry.at)}
            </span>
          </div>
        </div>
        {notes && <p className="mt-3 text-sm leading-relaxed text-white/55">{notes}</p>}
        {nutritionParts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {nutritionParts.map((part) => (
              <span key={part} className="rounded-full border border-cyan-200/15 bg-cyan-200/[0.08] px-2.5 py-1 text-cyan-50">
                {part}
              </span>
            ))}
            {nutritionSource && <span className="text-white/38">{nutritionSource}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const HistoryScreen = () => {
  const { user, loading: authLoading, configured } = useAuth();
  const {
    canopyDialog,
    hasCanopyFeatureAccess,
    openImageUploadPrompt,
    openPremiumFeaturePrompt,
    openPricing,
  } = useCanopyAccess(user);
  const [data, setData] = useState<DiaryData>({
    meals: [],
    reports: [],
    ibsCheckins: [],
    recipeInteractions: [],
    entries: [],
  });
  const [loading, setLoading] = useState(true);
  const [savingMeal, setSavingMeal] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealRecipeId, setMealRecipeId] = useState<number | null>(null);
  const [mealAt, setMealAt] = useState(localDateTimeValue());
  const [portionSize, setPortionSize] = useState("");
  const [portionUnit, setPortionUnit] = useState("serving");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [fatG, setFatG] = useState("");
  const [nutritionSource, setNutritionSource] = useState<MealNutritionSource | null>(null);
  const [nutritionConfidence, setNutritionConfidence] = useState<number | null>(null);
  const [estimatingNutrition, setEstimatingNutrition] = useState(false);
  const [mealImageUrl, setMealImageUrl] = useState("");
  const [mealPhotoAnalysis, setMealPhotoAnalysis] = useState<FoodImageAnalysis | null>(null);
  const [analyzingMealImage, setAnalyzingMealImage] = useState(false);
  const [mealNotes, setMealNotes] = useState("");
  const [editingMeal, setEditingMeal] = useState<MealLogRow | null>(null);
  const [editMealName, setEditMealName] = useState("");
  const [editMealRecipeId, setEditMealRecipeId] = useState<number | null>(null);
  const [editMealAt, setEditMealAt] = useState(localDateTimeValue());
  const [editPortionSize, setEditPortionSize] = useState("");
  const [editPortionUnit, setEditPortionUnit] = useState("serving");
  const [editCalories, setEditCalories] = useState("");
  const [editProteinG, setEditProteinG] = useState("");
  const [editFatG, setEditFatG] = useState("");
  const [editNutritionSource, setEditNutritionSource] = useState<MealNutritionSource | null>(null);
  const [editNutritionConfidence, setEditNutritionConfidence] = useState<number | null>(null);
  const [estimatingEditNutrition, setEstimatingEditNutrition] = useState(false);
  const [editMealImageUrl, setEditMealImageUrl] = useState("");
  const [editMealNotes, setEditMealNotes] = useState("");
  const [savingMealEdit, setSavingMealEdit] = useState(false);
  const [deletingMealId, setDeletingMealId] = useState<number | null>(null);
  const [mealPickerSource, setMealPickerSource] = useState<"cookbook" | "history">("cookbook");
  const [mealPickerSearch, setMealPickerSearch] = useState("");
  const [cookbookOptions, setCookbookOptions] = useState<MealSourceOption[]>([]);
  const [cooklists, setCooklists] = useState<Cooklist[]>([]);
  const [cooklistCandidate, setCooklistCandidate] = useState<CooklistCandidate | null>(null);
  const [selectedCooklistIds, setSelectedCooklistIds] = useState<number[]>([]);
  const [newCooklistName, setNewCooklistName] = useState("");
  const [savingCooklist, setSavingCooklist] = useState(false);
  const [diarySearch, setDiarySearch] = useState("");
  const [symptomType, setSymptomType] = useState("digestive_discomfort");
  const [reportedAt, setReportedAt] = useState(localDateTimeValue());
  const [severity, setSeverity] = useState(3);
  const [noSymptoms, setNoSymptoms] = useState(false);
  const [reportNotes, setReportNotes] = useState("");
  const mealFromImageInputRef = useRef<HTMLInputElement>(null);

  const todayStats = useMemo(() => {
    const todayKey = new Date().toDateString();
    const foodEntries = data.entries.filter((entry) =>
      entry.type === "meal" || entry.type === "chat_food" || entry.type === "recipe"
    );
    const mealsToday = foodEntries.filter((entry) => new Date(entry.at).toDateString() === todayKey).length;
    const reportsToday = data.entries.filter((entry) =>
      (entry.type === "checkin" || entry.type === "chat_checkin") &&
      new Date(entry.at).toDateString() === todayKey
    ).length;
    const roughNotes = data.reports.filter((report) => report.severity >= 0.55).length +
      data.ibsCheckins.filter((checkin) => Number(checkin.severity) >= 0.55).length;
    return { mealsToday, reportsToday, roughNotes, totalFoodEntries: foodEntries.length };
  }, [data]);

  const filteredEntries = useMemo(() => {
    const query = normalizeMealName(diarySearch);
    if (!query) return data.entries;

    return data.entries.filter((entry) => {
      const candidate = candidateFromEntry(entry);
      const searchable =
        entry.type === "checkin"
          ? `${entry.report.symptom_type} ${entry.report.notes || ""}`
          : entry.type === "chat_checkin"
            ? `${entry.checkin.summary} ${(entry.checkin.symptoms || []).join(" ")}`
            : `${candidate?.title || ""} ${candidate?.description || ""}`;
      return normalizeMealName(searchable).includes(query);
    });
  }, [data.entries, diarySearch]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, DiaryEntry[]>();
    filteredEntries.forEach((entry) => {
      const key = formatDay(entry.at);
      groups.set(key, [...(groups.get(key) || []), entry]);
    });
    return [...groups.entries()];
  }, [filteredEntries]);

  const historyMealOptions = useMemo(() => buildHistoryMealOptions(data.meals), [data.meals]);
  const visibleMealOptions = useMemo(() => {
    const sourceOptions = mealPickerSource === "cookbook" ? cookbookOptions : historyMealOptions;
    const query = normalizeMealName(mealPickerSearch);
    if (!query) return sourceOptions.slice(0, 12);
    return sourceOptions
      .filter((option) =>
        normalizeMealName(`${option.foodName} ${option.sourceLabel} ${option.helper || ""}`).includes(query)
      )
      .slice(0, 20);
  }, [cookbookOptions, historyMealOptions, mealPickerSearch, mealPickerSource]);

  const loadDiary = useCallback(async () => {
    if (authLoading) return;
    if (!configured || !user) {
      setData({ meals: [], reports: [], ibsCheckins: [], recipeInteractions: [], entries: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setData(await fetchDiaryData(user.id));
    } catch (error) {
      console.error("Failed to load diary:", error);
      toast.error("Could not load your diary right now.");
    } finally {
      setLoading(false);
    }
  }, [authLoading, configured, user]);

  useEffect(() => {
    loadDiary();
  }, [loadDiary]);

  const loadCookbookState = useCallback(async () => {
    if (!configured || !user) {
      setCookbookOptions([]);
      setCooklists([]);
      return;
    }

    try {
      await ensureDefaultCooklist(user.id);
      const [options, lists] = await Promise.all([
        fetchCookbookMealOptions(user.id),
        fetchCooklists(user.id),
      ]);
      setCookbookOptions(options);
      setCooklists(lists);
    } catch (error) {
      console.error("Failed to load cookbook meal options:", error);
      setCookbookOptions([]);
      setCooklists([]);
    }
  }, [configured, user]);

  useEffect(() => {
    loadCookbookState();
  }, [loadCookbookState]);

  const chooseMealOption = (option: MealSourceOption) => {
    setMealName(option.foodName);
    setMealRecipeId(option.recipeId || null);
    setMealImageUrl(option.imageUrl || "");
    if (hasCanopyFeatureAccess) {
      setCalories(option.calories == null ? "" : String(option.calories));
      setProteinG(option.proteinG == null ? "" : String(option.proteinG));
      setFatG(option.fatG == null ? "" : String(option.fatG));
      setNutritionSource(option.nutritionSource || null);
      setNutritionConfidence(option.nutritionConfidence ?? null);
    } else {
      setCalories("");
      setProteinG("");
      setFatG("");
      setNutritionSource(null);
      setNutritionConfidence(null);
    }
    setMealPhotoAnalysis(null);
  };

  const applyNutritionEstimate = (estimate: MealNutritionEstimate, target: "new" | "edit") => {
    const nextCalories = estimate.calories == null ? "" : String(estimate.calories);
    const nextProtein = estimate.protein_g == null ? "" : String(estimate.protein_g);
    const nextFat = estimate.fat_g == null ? "" : String(estimate.fat_g);

    if (target === "new") {
      setCalories(nextCalories);
      setProteinG(nextProtein);
      setFatG(nextFat);
      setNutritionSource(estimate.source);
      setNutritionConfidence(estimate.confidence);
      return;
    }

    setEditCalories(nextCalories);
    setEditProteinG(nextProtein);
    setEditFatG(nextFat);
    setEditNutritionSource(estimate.source);
    setEditNutritionConfidence(estimate.confidence);
  };

  const requestNutritionEstimate = async (target: "new" | "edit") => {
    if (!openPremiumFeaturePrompt("Macro tracking")) return;

    const isEdit = target === "edit";
    const foodName = isEdit ? editMealName : mealName;
    const recipeId = isEdit ? editMealRecipeId : mealRecipeId;
    const size = isEdit ? editPortionSize : portionSize;
    const unit = isEdit ? editPortionUnit : portionUnit;
    const notes = isEdit ? editMealNotes : mealNotes;
    const photoAnalysis = isEdit ? null : mealPhotoAnalysis;

    if (!foodName.trim() && !recipeId) {
      toast.error("Add a food or meal name first.");
      return;
    }

    if (isEdit) setEstimatingEditNutrition(true);
    else setEstimatingNutrition(true);

    try {
      const estimate = await estimateMealNutrition({
        foodName,
        recipeId,
        portionSize: size,
        portionUnit: unit,
        notes,
        visibleIngredients: photoAnalysis?.visible_ingredients || [],
        possibleHiddenIngredients: photoAnalysis?.possible_hidden_ingredients || [],
      });
      applyNutritionEstimate(estimate, target);
      toast.success(estimate.source === "catalog_recipe" ? "Nutrition added from recipe." : "Nutrition estimate added.");
    } catch (error) {
      console.error("Failed to estimate meal nutrition:", error);
      toast.error(error instanceof Error ? error.message : "Could not estimate nutrition.");
    } finally {
      if (isEdit) setEstimatingEditNutrition(false);
      else setEstimatingNutrition(false);
    }
  };

  const applyMealPhotoAnalysis = useCallback((analysis: FoodImageAnalysis, replaceName = false) => {
    if (!analysis.is_food || !analysis.food_name) return;

    if (replaceName || !mealName.trim()) {
      setMealName(analysis.food_name);
      setMealRecipeId(null);
    }
    setMealNotes((current) => mergePhotoNotes(current, analysis));
  }, [mealName]);

  const handleMealImageUrlChange = useCallback((imageUrl: string) => {
    setMealImageUrl(imageUrl);
    if (!imageUrl) setMealPhotoAnalysis(null);
  }, []);

  const handleMealFromImageFileSelected = async (file: File | null | undefined) => {
    if (!user || !file) return;
    if (!openImageUploadPrompt()) {
      if (mealFromImageInputRef.current) mealFromImageInputRef.current.value = "";
      return;
    }

    setMealPhotoAnalysis(null);
    setAnalyzingMealImage(true);
    try {
      const imageUrl = await uploadUserImage({ userId: user.id, file, folder: "meal-logs" });
      setMealImageUrl(imageUrl);
      const analysis = await analyzeFoodImage({ imageUrl, context: "meal_log" });
      setMealPhotoAnalysis(analysis);
      if (analysis.is_food && analysis.food_name) {
        applyMealPhotoAnalysis(analysis);
        toast.success("Photo analyzed.");
      } else {
        toast.info("Image attached. Tamar could not confidently name the food.");
      }
    } catch (error) {
      console.error("Diary food image analysis error:", error);
      toast.error(error instanceof Error ? error.message : "Could not analyze that photo.");
    } finally {
      setAnalyzingMealImage(false);
      if (mealFromImageInputRef.current) mealFromImageInputRef.current.value = "";
    }
  };

  const openCooklistDialog = useCallback(async (candidate: CooklistCandidate) => {
    if (!user) return;

    setCooklistCandidate(candidate);
    setSavingCooklist(true);
    try {
      await ensureDefaultCooklist(user.id);
      const lists = cooklists.length > 0 ? cooklists : await fetchCooklists(user.id);
      setCooklists(lists);

      if (candidate.recipeId) {
        setSelectedCooklistIds(await fetchRecipeCooklistIds(user.id, candidate.recipeId));
      } else {
        const exists = await fetchCookbookRecipeTitleExists(user.id, candidate.title);
        if (exists) {
          toast.info(`"${candidate.title}" is already in your CookBook.`);
          setCooklistCandidate(null);
          return;
        }
        setSelectedCooklistIds(lists.find((cooklist) => cooklist.is_default)?.id ? [lists.find((cooklist) => cooklist.is_default)!.id] : []);
      }
    } catch (error) {
      console.error("Failed to prepare cooklist picker:", error);
      toast.error("Could not load cooklists.");
      setCooklistCandidate(null);
    } finally {
      setSavingCooklist(false);
    }
  }, [cooklists, user]);

  const handleCooklistCheckedChange = (cooklistId: number, checked: boolean) => {
    setSelectedCooklistIds((current) =>
      checked ? [...new Set([...current, cooklistId])] : current.filter((id) => id !== cooklistId)
    );
  };

  const handleCreateCooklist = async () => {
    if (!user || !newCooklistName.trim()) return;

    setSavingCooklist(true);
    try {
      const created = await findOrCreateCooklist(user.id, newCooklistName);
      if (!created) return;
      setCooklists((current) => {
        if (current.some((cooklist) => cooklist.id === created.id)) return current;
        return [...current, created];
      });
      setSelectedCooklistIds((current) => [...new Set([...current, created.id])]);
      setNewCooklistName("");
      toast.success(`"${created.name}" created.`);
    } catch (error) {
      console.error("Failed to create cooklist:", error);
      toast.error("Could not create that cooklist.");
    } finally {
      setSavingCooklist(false);
    }
  };

  const saveCooklistCandidate = async () => {
    if (!user || !cooklistCandidate) return;
    if (selectedCooklistIds.length === 0) {
      toast.error("Choose at least one cooklist.");
      return;
    }

    setSavingCooklist(true);
    try {
      if (cooklistCandidate.recipeId) {
        await setRecipeCooklists({
          userId: user.id,
          recipeId: cooklistCandidate.recipeId,
          recipeTitle: cooklistCandidate.title,
          cooklistIds: selectedCooklistIds,
        });
      } else {
        await Promise.all(selectedCooklistIds.map((cooklistId) =>
          addPersonalRecipeToCooklist({
            userId: user.id,
            cooklistId,
            title: cooklistCandidate.title,
            imageUrl: cooklistCandidate.imageUrl,
            description: cooklistCandidate.description,
          })
        ));
      }

      toast.success(`"${cooklistCandidate.title}" added to your CookBook.`);
      setCooklistCandidate(null);
      setSelectedCooklistIds([]);
      await loadCookbookState();
    } catch (error) {
      console.error("Failed to save recipe to cooklist:", error);
      toast.error("Could not update your cooklists.");
    } finally {
      setSavingCooklist(false);
    }
  };

  const resetMealEdit = () => {
    setEditingMeal(null);
    setEditMealName("");
    setEditMealRecipeId(null);
    setEditMealAt(localDateTimeValue());
    setEditPortionSize("");
    setEditPortionUnit("serving");
    setEditCalories("");
    setEditProteinG("");
    setEditFatG("");
    setEditNutritionSource(null);
    setEditNutritionConfidence(null);
    setEditMealImageUrl("");
    setEditMealNotes("");
  };

  const openMealEdit = (meal: MealLogRow) => {
    setEditingMeal(meal);
    setEditMealName(meal.food_name);
    setEditMealRecipeId(meal.recipe_id || null);
    setEditMealAt(localDateTimeInputValue(meal.logged_at));
    setEditPortionSize(meal.portion_size == null ? "" : String(meal.portion_size));
    setEditPortionUnit(meal.portion_unit || "serving");
    if (hasCanopyFeatureAccess) {
      setEditCalories(meal.calories == null ? "" : String(meal.calories));
      setEditProteinG(meal.protein_g == null ? "" : String(meal.protein_g));
      setEditFatG(meal.fat_g == null ? "" : String(meal.fat_g));
      setEditNutritionSource(meal.nutrition_source || null);
      setEditNutritionConfidence(meal.nutrition_confidence ?? null);
    } else {
      setEditCalories("");
      setEditProteinG("");
      setEditFatG("");
      setEditNutritionSource(null);
      setEditNutritionConfidence(null);
    }
    setEditMealImageUrl(meal.image_url || "");
    setEditMealNotes(meal.notes || "");
  };

  const submitMealEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !editingMeal) return;

    const trimmedName = editMealName.trim();
    if (!trimmedName) {
      toast.error("Add a food or meal name first.");
      return;
    }

    setSavingMealEdit(true);
    try {
      await updateMealLog({
        id: editingMeal.id,
        userId: user.id,
        foodName: trimmedName,
        loggedAt: editMealAt,
        recipeId: editMealRecipeId,
        portionSize: editPortionSize ? Number(editPortionSize) : null,
        portionUnit: editPortionUnit.trim() || null,
        calories: hasCanopyFeatureAccess ? optionalNumberFromInput(editCalories) : editingMeal.calories ?? null,
        proteinG: hasCanopyFeatureAccess ? optionalNumberFromInput(editProteinG) : editingMeal.protein_g ?? null,
        fatG: hasCanopyFeatureAccess ? optionalNumberFromInput(editFatG) : editingMeal.fat_g ?? null,
        nutritionSource: hasCanopyFeatureAccess ? editNutritionSource : editingMeal.nutrition_source || null,
        nutritionConfidence: hasCanopyFeatureAccess ? editNutritionConfidence : editingMeal.nutrition_confidence ?? null,
        imageUrl: editMealImageUrl,
        notes: editMealNotes,
      });
      toast.success("Meal updated.");
      resetMealEdit();
      await loadDiary();
    } catch (error) {
      console.error("Failed to update meal:", error);
      toast.error("Could not update that meal. Please try again.");
    } finally {
      setSavingMealEdit(false);
    }
  };

  const removeMeal = async (meal: MealLogRow) => {
    if (!user) return;
    const confirmed = window.confirm(`Remove "${meal.food_name}" from your diary?`);
    if (!confirmed) return;

    setDeletingMealId(meal.id);
    try {
      await deleteMealLog(user.id, meal.id);
      toast.success("Meal removed from your diary.");
      if (editingMeal?.id === meal.id) resetMealEdit();
      await loadDiary();
    } catch (error) {
      console.error("Failed to remove meal:", error);
      toast.error("Could not remove that meal. Please try again.");
    } finally {
      setDeletingMealId(null);
    }
  };

  const submitMeal = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const trimmedName = mealName.trim();
    if (!trimmedName) {
      toast.error("Add a food or meal name first.");
      return;
    }

    setSavingMeal(true);
    try {
      const savedMeal = await createMealLog({
        userId: user.id,
        foodName: trimmedName,
        loggedAt: mealAt,
        recipeId: mealRecipeId,
        portionSize: portionSize ? Number(portionSize) : null,
        portionUnit: portionUnit.trim() || null,
        calories: hasCanopyFeatureAccess ? optionalNumberFromInput(calories) : null,
        proteinG: hasCanopyFeatureAccess ? optionalNumberFromInput(proteinG) : null,
        fatG: hasCanopyFeatureAccess ? optionalNumberFromInput(fatG) : null,
        nutritionSource: hasCanopyFeatureAccess ? nutritionSource : null,
        nutritionConfidence: hasCanopyFeatureAccess ? nutritionConfidence : null,
        imageUrl: mealImageUrl,
        notes: mealNotes,
      });
      toast.success("Meal added to your diary.");
      setMealName("");
      setMealRecipeId(null);
      setPortionSize("");
      setCalories("");
      setProteinG("");
      setFatG("");
      setNutritionSource(null);
      setNutritionConfidence(null);
      setMealImageUrl("");
      setMealPhotoAnalysis(null);
      setMealNotes("");
      setMealAt(localDateTimeValue());
      await loadDiary();
      let alreadyInCookbook = false;
      try {
        alreadyInCookbook = savedMeal.recipe_id
          ? (await fetchRecipeCooklistIds(user.id, savedMeal.recipe_id)).length > 0
          : await fetchCookbookRecipeTitleExists(user.id, savedMeal.food_name);
      } catch (error) {
        console.warn("Could not check cookbook membership after meal save:", error);
      }
      if (!alreadyInCookbook) {
        openCooklistDialog({
          recipeId: savedMeal.recipe_id || null,
          title: savedMeal.food_name,
          imageUrl: savedMeal.image_url || null,
          description: savedMeal.notes || null,
        });
      }
    } catch (error) {
      console.error("Failed to save meal:", error);
      toast.error("Could not save that meal. Please try again.");
    } finally {
      setSavingMeal(false);
    }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setSavingReport(true);
    try {
      await createHealthReport({
        userId: user.id,
        symptomType,
        severity: severity / 10,
        reportedAt,
        noSymptoms,
        notes: reportNotes,
      });
      toast.success("Check-in added to your diary.");
      setSeverity(3);
      setNoSymptoms(false);
      setReportNotes("");
      setReportedAt(localDateTimeValue());
      await loadDiary();
    } catch (error) {
      console.error("Failed to save check-in:", error);
      toast.error("Could not save that check-in. Please try again.");
    } finally {
      setSavingReport(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="grid min-h-[420px] place-items-center">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-5 py-4 text-sm text-white/70">
          <Loader2 size={18} className="animate-spin text-cyan-200" />
          Opening your diary
        </div>
      </div>
    );
  }

  if (!configured || !user) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-200/80">Private food diary</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">Diary</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
            Sign in to save meals and how you feel so Tamar can learn your food patterns.
          </p>
        </div>
        <EmptyState
          title="Your diary is private"
          body="After you sign in, you can log meals and quick check-ins here. The analysis page will use those notes to explain possible patterns in friendlier language."
        />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-w-0 space-y-6 pb-2">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-200/80">Private food diary</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">Track meals and how you feel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
            Add quick notes throughout the day. Meals and check-ins help Tamar connect your food history with future analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDiary}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.08]"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          icon={Utensils}
          label="Meals today"
          value={String(todayStats.mealsToday)}
          helper={`${todayStats.totalFoodEntries} total food notes in your diary.`}
          tone="bg-cyan-300/[0.12] text-cyan-100"
        />
        <StatTile
          icon={SmilePlus}
          label="Check-ins today"
          value={String(todayStats.reportsToday)}
          helper="Good days count just as much as rough ones."
          tone="bg-emerald-300/[0.12] text-emerald-100"
        />
        <StatTile
          icon={HeartPulse}
          label="Rough notes saved"
          value={String(todayStats.roughNotes)}
          helper="These help Tamar notice foods worth watching."
          tone="bg-rose-300/[0.12] text-rose-100"
        />
      </div>

      <TamarTreePanel userId={user.id} />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
        <form onSubmit={submitMeal} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2">
              <Utensils size={18} className="text-cyan-200" />
              <h2 className="text-base font-semibold">Add a meal</h2>
            </div>
            <input
              ref={mealFromImageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => handleMealFromImageFileSelected(event.target.files?.[0])}
            />
          </div>
          <div className="mt-5 grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!openImageUploadPrompt()) return;
                  mealFromImageInputRef.current?.click();
                }}
                disabled={analyzingMealImage || savingMeal}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-cyan-200/30 bg-cyan-200/[0.08] px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-200/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzingMealImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                {analyzingMealImage ? "Reading image" : "Add meal from image"}
              </button>
              {analyzingMealImage && (
                <div className="flex items-center gap-2 rounded-lg border border-cyan-200/20 bg-cyan-200/[0.06] px-3 py-2 text-sm text-cyan-50">
                  <Loader2 size={15} className="animate-spin" />
                  Reading photo
                </div>
              )}
              {mealPhotoAnalysis && !analyzingMealImage && (
                <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/[0.06] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-cyan-100/70">Photo suggestion</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {mealPhotoAnalysis.is_food && mealPhotoAnalysis.food_name
                          ? mealPhotoAnalysis.food_name
                          : "Food not recognized"}
                      </p>
                    </div>
                    {mealPhotoAnalysis.is_food && mealPhotoAnalysis.food_name && (
                      <button
                        type="button"
                        onClick={() => applyMealPhotoAnalysis(mealPhotoAnalysis, true)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-cyan-200/25 px-3 text-xs font-medium text-cyan-50 transition hover:bg-cyan-200/[0.1]"
                      >
                        <CheckCircle2 size={13} />
                        Use
                      </button>
                    )}
                  </div>
                  {mealPhotoAnalysis.visible_ingredients.length > 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-white/55">
                      Visible: {mealPhotoAnalysis.visible_ingredients.join(", ")}
                    </p>
                  )}
                  {mealPhotoAnalysis.possible_hidden_ingredients.length > 0 && (
                    <p className="mt-1 text-xs leading-relaxed text-white/50">
                      Possible: {mealPhotoAnalysis.possible_hidden_ingredients.join(", ")}
                    </p>
                  )}
                  {mealPhotoAnalysis.portion_guess && (
                    <p className="mt-1 text-xs leading-relaxed text-white/50">
                      Portion: {mealPhotoAnalysis.portion_guess}
                    </p>
                  )}
                  {mealPhotoAnalysis.questions.length > 0 && (
                    <p className="mt-1 text-xs leading-relaxed text-white/50">
                      {mealPhotoAnalysis.questions[0]}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="grid min-w-0 gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium text-white/55">Choose a saved or recent meal</span>
                <div className="grid shrink-0 grid-cols-2 rounded-lg border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => setMealPickerSource("cookbook")}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                      mealPickerSource === "cookbook"
                        ? "bg-cyan-200 text-slate-950"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <BookOpen size={13} />
                    Cookbook
                  </button>
                  <button
                    type="button"
                    onClick={() => setMealPickerSource("history")}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                      mealPickerSource === "history"
                        ? "bg-cyan-200 text-slate-950"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <HistoryIcon size={13} />
                    History
                  </button>
                </div>
              </div>
              <label className="relative block">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  value={mealPickerSearch}
                  onChange={(event) => setMealPickerSearch(event.target.value)}
                  placeholder={mealPickerSource === "cookbook" ? "Search your cookbook" : "Search meal history"}
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                />
              </label>
              {visibleMealOptions.length > 0 ? (
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  {visibleMealOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => chooseMealOption(option)}
                      className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-cyan-200/45 hover:bg-cyan-200/[0.08]"
                    >
                      <span className="block truncate text-sm font-medium text-white">{option.foodName}</span>
                      <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-white/45">
                        <span className="shrink-0">{option.sourceLabel}</span>
                        {option.helper && (
                          <>
                            <span className="text-white/25">/</span>
                            <span className="truncate">{option.helper}</span>
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-sm text-white/45">
                  {mealPickerSource === "cookbook"
                    ? "Saved cookbook meals will show up here."
                    : "Meals you previously logged will show up here."}
                </div>
              )}
            </div>
            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-medium text-white/55">What did you eat?</span>
              <input
                value={mealName}
                onChange={(event) => {
                  setMealName(event.target.value);
                  setMealRecipeId(null);
                  setNutritionSource(sourceForManualNutrition(calories, proteinG, fatG));
                  setNutritionConfidence(null);
                }}
                placeholder="Rice bowl with tofu"
                className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
              />
            </label>
            <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(12rem,1fr)_minmax(7rem,0.7fr)_minmax(8rem,0.9fr)]">
              <label className="grid min-w-0 gap-2">
                <span className="text-xs font-medium text-white/55">When?</span>
                <input
                  type="datetime-local"
                  value={mealAt}
                  onChange={(event) => setMealAt(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/60"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-xs font-medium text-white/55">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={portionSize}
                  onChange={(event) => setPortionSize(event.target.value)}
                  placeholder="1"
                  className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-xs font-medium text-white/55">Unit</span>
                <input
                  value={portionUnit}
                  onChange={(event) => setPortionUnit(event.target.value)}
                  placeholder="serving"
                  className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                />
              </label>
            </div>
            {hasCanopyFeatureAccess ? (
              <div className="grid min-w-0 gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-white/55">Nutrition</p>
                    {nutritionSource && (
                      <p className="mt-1 text-xs text-white/35">{nutritionSourceLabel(nutritionSource)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestNutritionEstimate("new")}
                    disabled={estimatingNutrition || !mealName.trim()}
                    title="Auto calculate nutrition with Gemini"
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-cyan-200/25 px-3 text-xs font-medium text-cyan-50 transition hover:bg-cyan-200/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {estimatingNutrition ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    Auto calculate
                  </button>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <label className="grid min-w-0 gap-2">
                    <span className="text-xs font-medium text-white/45">Calories</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={calories}
                      onChange={(event) => {
                        const next = event.target.value;
                        setCalories(next);
                        setNutritionSource(sourceForManualNutrition(next, proteinG, fatG));
                        setNutritionConfidence(null);
                      }}
                      placeholder="420"
                      className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                    />
                  </label>
                  <label className="grid min-w-0 gap-2">
                    <span className="text-xs font-medium text-white/45">Protein g</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={proteinG}
                      onChange={(event) => {
                        const next = event.target.value;
                        setProteinG(next);
                        setNutritionSource(sourceForManualNutrition(calories, next, fatG));
                        setNutritionConfidence(null);
                      }}
                      placeholder="18"
                      className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                    />
                  </label>
                  <label className="grid min-w-0 gap-2">
                    <span className="text-xs font-medium text-white/45">Fat g</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fatG}
                      onChange={(event) => {
                        const next = event.target.value;
                        setFatG(next);
                        setNutritionSource(sourceForManualNutrition(calories, proteinG, next));
                        setNutritionConfidence(null);
                      }}
                      placeholder="14"
                      className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <CanopyFeaturePanel
                icon={Sparkles}
                title="Macro tracking is in Canopy+"
                body="Calories, protein, fat, and nutrition estimates are available during your first 30 days, then continue with Canopy+."
                onUpgrade={openPricing}
              />
            )}
            <ImageUploadDropzone
              userId={user.id}
              folder="meal-logs"
              imageUrl={mealImageUrl}
              onImageUrlChange={handleMealImageUrlChange}
              label="Image"
              dark
              capture="environment"
              primaryText="Drop a meal image here or browse"
              helperText="Attach a photo to this diary entry"
              onBeforeUpload={openImageUploadPrompt}
            />
            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-medium text-white/55">Notes</span>
              <textarea
                value={mealNotes}
                onChange={(event) => setMealNotes(event.target.value)}
                placeholder="Anything useful, like spicy, late dinner, or ate quickly"
                rows={3}
                className="w-full min-w-0 resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
              />
            </label>
            <button
              type="submit"
              disabled={savingMeal || analyzingMealImage}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-200 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingMeal ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Save meal
            </button>
          </div>
        </form>

        <form onSubmit={submitReport} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-white">
            <HeartPulse size={18} className="text-rose-200" />
            <h2 className="text-base font-semibold">Add how you feel</h2>
          </div>
          <div className="mt-5 grid min-w-0 gap-4">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-3">
              <span className="text-sm text-white/70">I feel good right now</span>
              <input
                type="checkbox"
                checked={noSymptoms}
                onChange={(event) => setNoSymptoms(event.target.checked)}
                className="h-4 w-4 accent-emerald-300"
              />
            </label>
            <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
              <label className="grid min-w-0 gap-2">
                <span className="text-xs font-medium text-white/55">Main feeling</span>
                <select
                  value={symptomType}
                  onChange={(event) => setSymptomType(event.target.value)}
                  disabled={noSymptoms}
                  className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-rose-200/60 disabled:opacity-50"
                >
                  {symptomOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#203629]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-xs font-medium text-white/55">When?</span>
                <input
                  type="datetime-local"
                  value={reportedAt}
                  onChange={(event) => setReportedAt(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-rose-200/60"
                />
              </label>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/15 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white">{noSymptoms ? "Felt good" : feelingText(severity / 10)}</span>
                <span className="text-xs text-white/45">{noSymptoms ? "0" : severity} / 10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={noSymptoms ? 0 : severity}
                disabled={noSymptoms}
                onChange={(event) => setSeverity(Number(event.target.value))}
                className="mt-4 w-full accent-rose-300 disabled:opacity-45"
              />
              <div className="mt-2 flex justify-between text-[11px] text-white/35">
                <span>Good</span>
                <span>Very rough</span>
              </div>
            </div>
            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-medium text-white/55">Notes</span>
              <textarea
                value={reportNotes}
                onChange={(event) => setReportNotes(event.target.value)}
                placeholder="Optional context, like stress, sleep, timing, or what changed"
                rows={3}
                className="w-full min-w-0 resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-rose-200/60"
              />
            </label>
            <button
              type="submit"
              disabled={savingReport}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-200 px-4 text-sm font-semibold text-slate-950 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingReport ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Save check-in
            </button>
          </div>
        </form>
      </div>

      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white">
            <NotebookPen size={18} className="text-violet-200" />
            <h2 className="text-base font-semibold">Recent diary</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
            <CalendarDays size={13} />
            {filteredEntries.length} of {data.entries.length} saved notes
          </span>
        </div>
        <label className="relative mt-4 block max-w-xl">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={diarySearch}
            onChange={(event) => setDiarySearch(event.target.value)}
            placeholder="Search recent diary"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-200/60"
          />
        </label>

        <div className="mt-5 space-y-6">
          {groupedEntries.length > 0 ? (
            groupedEntries.map(([day, entries]) => (
              <div key={day}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{day}</h3>
                <div className="space-y-3">
                  {entries.map((entry, index) => (
                    <TimelineEntry
                      key={`${entry.type}-${entry.id}`}
                      entry={entry}
                      index={index}
                      onAddToCooklist={openCooklistDialog}
                      onEditMeal={openMealEdit}
                      onDeleteMeal={removeMeal}
                      deletingMealId={deletingMealId}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Nothing in your diary yet"
              body="Start with one meal and one quick note about how you feel. That is enough for Tamar to begin building a useful timeline."
            />
          )}
        </div>
      </section>

      <Dialog
        open={Boolean(editingMeal)}
        onOpenChange={(open) => {
          if (!open && !savingMealEdit) resetMealEdit();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit meal</DialogTitle>
            <DialogDescription className="sr-only">
              Update the meal name, time, portion, image, and notes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitMealEdit} className="space-y-4">
            <label className="grid gap-2">
              <span className="text-xs font-bold text-[#667864]">What did you eat?</span>
              <input
                value={editMealName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setEditMealName(nextName);
                  setEditMealRecipeId(
                    normalizeMealName(nextName) === normalizeMealName(editingMeal?.food_name || "")
                      ? editingMeal?.recipe_id || null
                      : null
                  );
                  setEditNutritionSource(sourceForManualNutrition(editCalories, editProteinG, editFatG));
                  setEditNutritionConfidence(null);
                }}
                placeholder="Rice bowl with tofu"
                className="min-h-11 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-[1fr_0.7fr_0.9fr]">
              <label className="grid gap-2">
                <span className="text-xs font-bold text-[#667864]">When?</span>
                <input
                  type="datetime-local"
                  value={editMealAt}
                  onChange={(event) => setEditMealAt(event.target.value)}
                  className="min-h-11 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition focus:border-primary"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold text-[#667864]">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={editPortionSize}
                  onChange={(event) => setEditPortionSize(event.target.value)}
                  placeholder="1"
                  className="min-h-11 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold text-[#667864]">Unit</span>
                <input
                  value={editPortionUnit}
                  onChange={(event) => setEditPortionUnit(event.target.value)}
                  placeholder="serving"
                  className="min-h-11 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
                />
              </label>
            </div>
            {hasCanopyFeatureAccess ? (
              <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#667864]">Nutrition</p>
                    {editNutritionSource && (
                      <p className="mt-1 text-xs text-[#8b9a87]">{nutritionSourceLabel(editNutritionSource)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestNutritionEstimate("edit")}
                    disabled={estimatingEditNutrition || !editMealName.trim()}
                    title="Auto calculate nutrition with Gemini"
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-primary/20 px-3 text-xs font-semibold text-[#536451] transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {estimatingEditNutrition ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    Auto calculate
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="text-xs font-bold text-[#667864]">Calories</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editCalories}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEditCalories(next);
                        setEditNutritionSource(sourceForManualNutrition(next, editProteinG, editFatG));
                        setEditNutritionConfidence(null);
                      }}
                      placeholder="420"
                      className="min-h-10 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold text-[#667864]">Protein g</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={editProteinG}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEditProteinG(next);
                        setEditNutritionSource(sourceForManualNutrition(editCalories, next, editFatG));
                        setEditNutritionConfidence(null);
                      }}
                      placeholder="18"
                      className="min-h-10 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold text-[#667864]">Fat g</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={editFatG}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEditFatG(next);
                        setEditNutritionSource(sourceForManualNutrition(editCalories, editProteinG, next));
                        setEditNutritionConfidence(null);
                      }}
                      placeholder="14"
                      className="min-h-10 rounded-lg border border-primary/15 px-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <CanopyFeaturePanel
                icon={Sparkles}
                title="Macro tracking is in Canopy+"
                body="Calories, protein, fat, and nutrition estimates are available during your first 30 days, then continue with Canopy+."
                onUpgrade={openPricing}
              />
            )}
            <ImageUploadDropzone
              userId={user.id}
              folder="meal-logs"
              imageUrl={editMealImageUrl}
              onImageUrlChange={setEditMealImageUrl}
              label="Image"
              onBeforeUpload={openImageUploadPrompt}
            />
            <label className="grid gap-2">
              <span className="text-xs font-bold text-[#667864]">Notes</span>
              <textarea
                value={editMealNotes}
                onChange={(event) => setEditMealNotes(event.target.value)}
                placeholder="Anything useful, like spicy, late dinner, or ate quickly"
                rows={3}
                className="resize-none rounded-lg border border-primary/15 px-3 py-3 text-sm text-[#24352a] outline-none transition placeholder:text-[#8b9a87] focus:border-primary"
              />
            </label>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => editingMeal && removeMeal(editingMeal)}
                disabled={savingMealEdit || deletingMealId === editingMeal?.id}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200/70 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingMealId === editingMeal?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove
              </button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={resetMealEdit}
                  disabled={savingMealEdit}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary/15 px-4 text-sm font-semibold text-[#536451] transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMealEdit}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingMealEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save changes
                </button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cooklistCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setCooklistCandidate(null);
            setSelectedCooklistIds([]);
            setNewCooklistName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to cooklist</DialogTitle>
            <DialogDescription>
              Choose where to save {cooklistCandidate ? `"${cooklistCandidate.title}"` : "this recipe"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {savingCooklist && cooklists.length === 0 ? (
                <div className="h-20 rounded-lg bg-secondary animate-pulse" />
              ) : (
                cooklists.map((cooklist) => (
                  <label
                    key={cooklist.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-primary/10 px-3 py-2 hover:bg-primary/5"
                  >
                    <Checkbox
                      checked={selectedCooklistIds.includes(cooklist.id)}
                      onCheckedChange={(checked) => handleCooklistCheckedChange(cooklist.id, checked === true)}
                    />
                    <span className="flex-1 text-sm font-semibold text-[#1f3d2b]">{cooklist.name}</span>
                    {cooklist.is_default && <span className="text-xs font-bold text-primary">default</span>}
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newCooklistName}
                onChange={(event) => setNewCooklistName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleCreateCooklist();
                }}
                placeholder="New cooklist"
                className="min-h-10 flex-1 rounded-lg border border-primary/15 px-3 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleCreateCooklist}
                disabled={savingCooklist || !newCooklistName.trim()}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-primary/15 px-3 text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={saveCooklistCandidate}
              disabled={savingCooklist || selectedCooklistIds.length === 0}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingCooklist ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
              Save to cooklist
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {canopyDialog}
    </div>
    </TooltipProvider>
  );
};

export default HistoryScreen;
