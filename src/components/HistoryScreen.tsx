import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  SmilePlus,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import {
  DiaryData,
  DiaryEntry,
  createHealthReport,
  createMealLog,
  fetchDiaryData,
} from "@/lib/diary";

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

const TimelineEntry = ({ entry, index }: { entry: DiaryEntry; index: number }) => {
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs text-white/45">{subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55">
            <Clock3 size={12} />
            {formatTime(entry.at)}
          </span>
        </div>
        {notes && <p className="mt-3 text-sm leading-relaxed text-white/55">{notes}</p>}
      </div>
    </motion.div>
  );
};

const HistoryScreen = () => {
  const { user, loading: authLoading, configured } = useAuth();
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
  const [mealAt, setMealAt] = useState(localDateTimeValue());
  const [portionSize, setPortionSize] = useState("");
  const [portionUnit, setPortionUnit] = useState("serving");
  const [mealNotes, setMealNotes] = useState("");
  const [symptomType, setSymptomType] = useState("digestive_discomfort");
  const [reportedAt, setReportedAt] = useState(localDateTimeValue());
  const [severity, setSeverity] = useState(3);
  const [noSymptoms, setNoSymptoms] = useState(false);
  const [reportNotes, setReportNotes] = useState("");

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

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, DiaryEntry[]>();
    data.entries.forEach((entry) => {
      const key = formatDay(entry.at);
      groups.set(key, [...(groups.get(key) || []), entry]);
    });
    return [...groups.entries()];
  }, [data.entries]);

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
      await createMealLog({
        userId: user.id,
        foodName: trimmedName,
        loggedAt: mealAt,
        portionSize: portionSize ? Number(portionSize) : null,
        portionUnit: portionUnit.trim() || null,
        notes: mealNotes,
      });
      toast.success("Meal added to your diary.");
      setMealName("");
      setPortionSize("");
      setMealNotes("");
      setMealAt(localDateTimeValue());
      await loadDiary();
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
    <div className="space-y-6 pb-2">
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

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={submitMeal} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-white">
            <Utensils size={18} className="text-cyan-200" />
            <h2 className="text-base font-semibold">Add a meal</h2>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-medium text-white/55">What did you eat?</span>
              <input
                value={mealName}
                onChange={(event) => setMealName(event.target.value)}
                placeholder="Rice bowl with tofu"
                className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-[1fr_0.7fr_0.9fr]">
              <label className="grid gap-2">
                <span className="text-xs font-medium text-white/55">When?</span>
                <input
                  type="datetime-local"
                  value={mealAt}
                  onChange={(event) => setMealAt(event.target.value)}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-cyan-200/60"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-white/55">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={portionSize}
                  onChange={(event) => setPortionSize(event.target.value)}
                  placeholder="1"
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-white/55">Unit</span>
                <input
                  value={portionUnit}
                  onChange={(event) => setPortionUnit(event.target.value)}
                  placeholder="serving"
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
                />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-white/55">Notes</span>
              <textarea
                value={mealNotes}
                onChange={(event) => setMealNotes(event.target.value)}
                placeholder="Anything useful, like spicy, late dinner, or ate quickly"
                rows={3}
                className="resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/60"
              />
            </label>
            <button
              type="submit"
              disabled={savingMeal}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-200 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingMeal ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Save meal
            </button>
          </div>
        </form>

        <form onSubmit={submitReport} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-white">
            <HeartPulse size={18} className="text-rose-200" />
            <h2 className="text-base font-semibold">Add how you feel</h2>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-3">
              <span className="text-sm text-white/70">I feel good right now</span>
              <input
                type="checkbox"
                checked={noSymptoms}
                onChange={(event) => setNoSymptoms(event.target.checked)}
                className="h-4 w-4 accent-emerald-300"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-medium text-white/55">Main feeling</span>
                <select
                  value={symptomType}
                  onChange={(event) => setSymptomType(event.target.value)}
                  disabled={noSymptoms}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-rose-200/60 disabled:opacity-50"
                >
                  {symptomOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#203629]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-white/55">When?</span>
                <input
                  type="datetime-local"
                  value={reportedAt}
                  onChange={(event) => setReportedAt(event.target.value)}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-rose-200/60"
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
            <label className="grid gap-2">
              <span className="text-xs font-medium text-white/55">Notes</span>
              <textarea
                value={reportNotes}
                onChange={(event) => setReportNotes(event.target.value)}
                placeholder="Optional context, like stress, sleep, timing, or what changed"
                rows={3}
                className="resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-rose-200/60"
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
            {data.entries.length} saved notes
          </span>
        </div>

        <div className="mt-5 space-y-6">
          {groupedEntries.length > 0 ? (
            groupedEntries.map(([day, entries]) => (
              <div key={day}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{day}</h3>
                <div className="space-y-3">
                  {entries.map((entry, index) => (
                    <TimelineEntry key={`${entry.type}-${entry.id}`} entry={entry} index={index} />
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
    </div>
  );
};

export default HistoryScreen;
