import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CalendarCheck,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Leaf,
  Loader2,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  AnalysisDashboard,
  IngredientSignal,
  NextStep,
  fetchAnalysisDashboard,
} from "@/lib/analysis";

const percent = (value: number) => `${Math.round(value * 100)}%`;

const barTone = (score: number) => {
  if (score >= 0.72) return "bg-rose-400";
  if (score >= 0.58) return "bg-amber-300";
  if (score >= 0.45) return "bg-cyan-300";
  return "bg-emerald-300";
};

const textTone = (score: number) => {
  if (score >= 0.72) return "text-rose-200";
  if (score >= 0.58) return "text-amber-100";
  if (score >= 0.45) return "text-cyan-100";
  return "text-emerald-100";
};

const stepTone: Record<NextStep["tone"], string> = {
  learn: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  steady: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  watch: "border-amber-300/25 bg-amber-300/10 text-amber-100",
};

const StatTile = ({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  helper: string;
  tone: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 min-h-[118px]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs text-white/55">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      </div>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon size={19} strokeWidth={1.8} />
      </div>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-white/50">{helper}</p>
  </div>
);

const EmptyPanel = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-5">
    <p className="text-sm font-medium text-white">{title}</p>
    <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
  </div>
);

const SignalRow = ({
  item,
  index,
  gentle = false,
}: {
  item: IngredientSignal;
  index: number;
  gentle?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.035 }}
    className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3"
  >
    <div className="pt-1 text-right text-xs text-white/35">{index + 1}</div>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{item.name}</p>
          <p className="mt-0.5 text-xs text-white/45">{item.helper}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            gentle
              ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              : `${textTone(item.score)} border-white/10 bg-white/[0.045]`
          }`}
        >
          {gentle ? item.label : `${item.label} ${percent(item.score)}`}
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full ${gentle ? "bg-emerald-300" : barTone(item.score)}`}
          style={{ width: gentle ? `${Math.max(12, Math.round((1 - item.score) * 100))}%` : percent(item.score) }}
        />
      </div>
    </div>
  </motion.div>
);

const PatternChart = ({ dashboard }: { dashboard: AnalysisDashboard }) => {
  const chartData = useMemo(
    () =>
      dashboard.weeklyPatterns.map((week) => ({
        ...week,
        symptomLevel: Math.max(0, week.symptomLevel),
      })),
    [dashboard.weeklyPatterns],
  );

  return (
    <div className="h-[285px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="analysisSymptomFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.34} />
              <stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.48)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#203629",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "white",
            }}
            labelStyle={{ color: "rgba(255,255,255,0.7)" }}
          />
          <Bar dataKey="meals" name="Meals logged" fill="#67e8f9" radius={[4, 4, 0, 0]} barSize={18} />
          <Area
            type="monotone"
            dataKey="symptomLevel"
            name="Average symptom level"
            stroke="#fb7185"
            fill="url(#analysisSymptomFill)"
            strokeWidth={2.2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

const AnalysisScreen = () => {
  const { user, loading: authLoading, configured } = useAuth();
  const [dashboard, setDashboard] = useState<AnalysisDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (authLoading) return;
      if (!configured || !user) {
        setLoading(false);
        setDashboard(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const nextDashboard = await fetchAnalysisDashboard(user.id);
        if (mounted) setDashboard(nextDashboard);
      } catch (err) {
        console.error("Failed to load analysis dashboard:", err);
        if (mounted) setError("Tamar could not load your patterns right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [authLoading, configured, user]);

  const topScore = dashboard?.watchlist[0]?.score || 0;
  const topScoreLabel = topScore > 0 ? percent(topScore) : "New";

  if (authLoading || loading) {
    return (
      <div className="grid min-h-[420px] place-items-center">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-5 py-4 text-sm text-white/70">
          <Loader2 size={18} className="animate-spin text-cyan-200" />
          Reading your recent food patterns
        </div>
      </div>
    );
  }

  if (!configured || !user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Food Patterns</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
            Sign in to see the foods Tamar is learning from your meals and check-ins.
          </p>
        </div>
        <EmptyPanel
          title="Your analysis is private"
          body="Once you are signed in, this page will show possible trigger foods, foods that seem easier lately, recent symptom patterns, and a few gentle next steps."
        />
      </div>
    );
  }

  if (error) {
    return <EmptyPanel title="Analysis unavailable" body={error} />;
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-200/80">Personal food map</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">What Tamar is learning</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
            This is a pattern view, not a diagnosis. It looks for foods that often show up near tougher days and foods that seem to go more smoothly.
          </p>
        </div>

        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <div
            className="grid h-16 w-16 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#fb7185 ${Math.round(topScore * 360)}deg, rgba(255,255,255,0.08) 0deg)`,
            }}
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[#203629]">
              <span className="text-sm font-semibold text-white">{topScoreLabel}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Strongest food signal</p>
            <p className="mt-1 text-xs text-white/50">
              {dashboard.watchlist[0]?.name || "Tamar needs a few logs first"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Utensils}
          label="Meals logged"
          value={String(dashboard.totals.trackedMeals)}
          helper="Meals Tamar can use for pattern learning."
          tone="bg-cyan-300/[0.12] text-cyan-100"
        />
        <StatTile
          icon={CalendarCheck}
          label="How-you-felt notes"
          value={String(dashboard.totals.checkIns)}
          helper="Good and rough days both help the picture."
          tone="bg-violet-300/[0.12] text-violet-100"
        />
        <StatTile
          icon={HeartPulse}
          label="Rougher notes"
          value={String(dashboard.totals.roughReports)}
          helper="Higher symptom days in your saved history."
          tone="bg-rose-300/[0.12] text-rose-100"
        />
        <StatTile
          icon={ShieldCheck}
          label="Easier notes"
          value={String(dashboard.totals.easierReports)}
          helper="Times you logged feeling okay or low symptoms."
          tone="bg-emerald-300/[0.12] text-emerald-100"
        />
      </div>

      {!dashboard.hasData && (
        <EmptyPanel
          title="Tamar is ready when you are"
          body="Log a few meals and how you feel later. After that, this page will start showing possible food patterns in plain language."
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-white">
                <Activity size={18} className="text-rose-200" />
                <h2 className="text-base font-semibold">Foods to watch</h2>
              </div>
              <p className="mt-1 text-sm text-white/50">Ingredients that may be worth paying attention to.</p>
            </div>
            <span className="rounded-full border border-rose-200/20 bg-rose-200/10 px-3 py-1 text-xs text-rose-100">
              {dashboard.totals.topSignalCount} active signals
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {dashboard.watchlist.length > 0 ? (
              dashboard.watchlist.map((item, index) => <SignalRow key={item.name} item={item} index={index} />)
            ) : (
              <EmptyPanel
                title="No food stands out yet"
                body="That can be good news, or it can mean Tamar needs more meals and how-you-felt notes before naming a pattern."
              />
            )}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-white">
            <Leaf size={18} className="text-emerald-200" />
            <h2 className="text-base font-semibold">Foods that seem easier</h2>
          </div>
          <p className="mt-1 text-sm text-white/50">Useful anchors for simple meals and future tests.</p>

          <div className="mt-5 space-y-4">
            {dashboard.easierFoods.length > 0 ? (
              dashboard.easierFoods.map((item, index) => (
                <SignalRow key={item.name} item={item} index={index} gentle />
              ))
            ) : (
              <EmptyPanel
                title="No gentle-food pattern yet"
                body="Try logging a calm day too. Tamar learns safer-feeling foods from the days that go well."
              />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-white">
            <ClipboardList size={18} className="text-cyan-200" />
            <h2 className="text-base font-semibold">Recent pattern</h2>
          </div>
          <p className="mt-1 text-sm text-white/50">Meals logged next to the average symptom level for each week.</p>
          <PatternChart dashboard={dashboard} />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-cyan-300" />
              Meals
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              Symptom level
            </span>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-white">
            <FlaskConical size={18} className="text-amber-100" />
            <h2 className="text-base font-semibold">What to test next</h2>
          </div>
          <p className="mt-1 text-sm text-white/50">Small experiments that can make the next recommendation refresh smarter.</p>

          <div className="mt-5 grid gap-3">
            {dashboard.nextSteps.length > 0 ? (
              dashboard.nextSteps.map((step, index) => (
                <motion.div
                  key={`${step.title}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`rounded-lg border p-4 ${stepTone[step.tone]}`}
                >
                  <div className="flex items-start gap-3">
                    <Sparkles size={17} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/62">{step.body}</p>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <EmptyPanel
                title="No tests needed yet"
                body="Keep logging normally. Tamar will suggest a gentle next step when enough pattern data is available."
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AnalysisScreen;
