import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Droplets, HeartPulse, Leaf, Loader2, RefreshCw, Sparkles, Sprout } from "lucide-react";
import { toast } from "sonner";
import {
  TamarTreeState,
  fetchTamarTreeState,
  getNextTamarMilestoneLevel,
  replantTamarTree,
} from "@/lib/tamarTree";

type TamarTreePanelProps = {
  userId: string;
};

const formatDate = (value: string | null) => {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
};

const getTreeScale = (level: number) => {
  if (level >= 300) return 1.35;
  if (level >= 200) return 1.25;
  if (level >= 100) return 1.16;
  if (level >= 30) return 1.08;
  if (level >= 7) return 1;
  return 0.78 + Math.min(level, 6) * 0.035;
};

const backgroundForZone = (state: TamarTreeState) => {
  if (state.status === "dead") return "from-[#efe5d3] via-[#c5b293] to-[#8a6b3f]";
  if (state.zone === "ufo") return "from-[#061522] via-[#12424a] to-[#53785f]";
  if (state.zone === "space") return "from-[#e9ead8] via-[#b9c9ac] to-[#536451]";
  if (state.zone === "clouds") return "from-[#f8f2e5] via-[#d5e8df] to-[#9baa8d]";
  if (state.zone === "canopy") return "from-[#f8f2e5] via-[#d9dfbf] to-[#6f8269]";
  if (state.zone === "oasis") return "from-[#fbf7ec] via-[#d7d3a5] to-[#8a6b3f]";
  return "from-[#fbf7ec] via-[#d8dcb9] to-[#9baa8d]";
};

const ufoStars = [
  { left: "6%", top: "16%", size: 3, delay: 0.1 },
  { left: "14%", top: "38%", size: 2, delay: 1.2 },
  { left: "23%", top: "9%", size: 4, delay: 0.5 },
  { left: "34%", top: "27%", size: 2, delay: 1.8 },
  { left: "45%", top: "11%", size: 3, delay: 0.8 },
  { left: "55%", top: "33%", size: 2, delay: 2.1 },
  { left: "63%", top: "8%", size: 3, delay: 1.4 },
  { left: "77%", top: "27%", size: 2, delay: 0.3 },
  { left: "89%", top: "13%", size: 4, delay: 1.7 },
  { left: "94%", top: "39%", size: 2, delay: 0.9 },
];

const AlienUfoScene = () => (
  <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-testid="alien-ufo-scene">
    <div className="absolute -left-8 -top-10 h-44 w-44 rounded-full bg-[#74f7db]/10 blur-3xl" />
    {ufoStars.map((star, index) => (
      <motion.span
        key={`${star.left}-${star.top}`}
        className="absolute rounded-full bg-[#d9fff5] shadow-[0_0_7px_rgba(174,255,235,0.95)]"
        style={{ left: star.left, top: star.top, width: star.size, height: star.size }}
        animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.35, 0.8] }}
        transition={{ duration: 2.4, delay: star.delay, repeat: Infinity, ease: "easeInOut" }}
      />
    ))}

    <motion.div
      className="absolute left-7 top-7 h-14 w-14 rounded-full border border-[#b9ffd9]/35 bg-gradient-to-br from-[#c9ffe5]/70 via-[#58bfa7]/45 to-[#173c4b]/80 shadow-[0_0_28px_rgba(108,244,209,0.25)]"
      animate={{ rotate: 360 }}
      transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
    >
      <span className="absolute -inset-x-4 top-6 h-2 rotate-[-14deg] rounded-full border border-[#b9ffd9]/35 bg-[#7ce9ce]/15" />
      <span className="absolute left-3 top-2 h-2 w-2 rounded-full bg-white/25" />
    </motion.div>

    <motion.div
      className="absolute right-[6%] top-5 h-20 w-36"
      animate={{ y: [0, -5, 0], rotate: [-1, 1, -1] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="absolute left-1/2 top-0 h-10 w-16 -translate-x-1/2 overflow-hidden rounded-t-[2rem] border border-[#bcfff0]/55 bg-[#8ef7df]/25 shadow-[0_0_20px_rgba(112,255,220,0.45)] backdrop-blur-sm">
        <span className="absolute left-1/2 top-2 h-6 w-5 -translate-x-1/2 rounded-[50%_50%_45%_45%] bg-[#b9f26f] shadow-[0_0_8px_rgba(185,242,111,0.8)]">
          <span className="absolute left-1 top-2 h-1.5 w-1 rotate-[-18deg] rounded-full bg-[#102a2d]" />
          <span className="absolute right-1 top-2 h-1.5 w-1 rotate-[18deg] rounded-full bg-[#102a2d]" />
        </span>
      </div>
      <div className="absolute left-1/2 top-8 h-8 w-36 -translate-x-1/2 rounded-[50%] border border-[#c8fff1]/55 bg-gradient-to-b from-[#b8eadf] via-[#467d78] to-[#183844] shadow-[0_8px_18px_rgba(2,12,22,0.45),0_0_22px_rgba(91,255,218,0.35)]">
        <span className="absolute bottom-1 left-5 h-2 w-2 rounded-full bg-[#ffe889] shadow-[0_0_9px_#ffe889]" />
        <span className="absolute bottom-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#7effd5] shadow-[0_0_10px_#7effd5]" />
        <span className="absolute bottom-1 right-5 h-2 w-2 rounded-full bg-[#ff9ee5] shadow-[0_0_9px_#ff9ee5]" />
      </div>
      <div className="absolute left-1/2 top-[3.7rem] h-3 w-20 -translate-x-1/2 rounded-[50%] bg-[#85ffe2]/55 blur-[2px]" />
    </motion.div>

    <motion.div
      className="absolute right-[12%] top-[4.7rem] h-44 w-28 origin-top bg-gradient-to-b from-[#91ffe4]/35 via-[#75fbd4]/12 to-transparent blur-[1px]"
      style={{ clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)" }}
      animate={{ opacity: [0.35, 0.72, 0.35] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    />

    <div className="absolute bottom-10 left-8 flex items-end gap-5">
      {[18, 11, 15].map((height, index) => (
        <motion.span
          key={height}
          className="relative w-1 rounded-full bg-[#76f5c9]/70 shadow-[0_0_10px_rgba(118,245,201,0.8)]"
          style={{ height }}
          animate={{ scaleY: [0.86, 1.08, 0.86] }}
          transition={{ duration: 2 + index * 0.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="absolute -left-1.5 -top-2 h-3 w-4 rounded-[50%] bg-[#f58ce0] shadow-[0_0_12px_rgba(245,140,224,0.9)]" />
        </motion.span>
      ))}
    </div>
  </div>
);

export const TamarVisual = ({ state }: { state: TamarTreeState }) => {
  const scale = getTreeScale(state.level);
  const fruitCount = Math.min(14, Math.max(0, Math.floor(state.level / 3)));
  const isDead = state.status === "dead";

  return (
    <div className={`relative h-72 overflow-hidden rounded-lg border border-primary/15 bg-gradient-to-b ${backgroundForZone(state)} shadow-inner shadow-primary/10`}>
      {state.zone === "ufo" && <AlienUfoScene />}
      {(state.zone === "clouds" || state.zone === "space") && (
        <div className="absolute inset-x-0 top-12 flex justify-center gap-6 opacity-80">
          <span className="h-4 w-24 rounded-full bg-white/55" />
          <span className="mt-6 h-3 w-16 rounded-full bg-white/40" />
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-0 h-16 ${state.zone === "ufo" ? "bg-[#102f2c]/55 shadow-[0_-12px_30px_rgba(95,255,206,0.08)]" : "bg-primary/12"}`} />
      <motion.div
        className="absolute bottom-10 left-1/2 h-44 w-40 origin-bottom -translate-x-1/2"
        animate={state.grownToday ? { scale: [scale, scale * 1.08, scale] } : { scale }}
        transition={{ duration: 0.9 }}
      >
        <div className={`absolute bottom-0 left-1/2 h-32 w-7 -translate-x-1/2 rounded-t-full ${isDead ? "bg-[#5a3d2d]" : "bg-[#8b5e34]"}`} />
        {!isDead && (
          <>
            <div className="absolute left-1/2 top-5 h-16 w-7 -translate-x-1/2 rounded-full bg-[#7c4d2b]" />
            {[-68, -43, -18, 18, 43, 68].map((rotation, index) => (
              <motion.span
                key={rotation}
                className="absolute left-1/2 top-5 h-10 w-24 origin-left rounded-full bg-primary/75"
                style={{ rotate: `${rotation}deg`, transformOrigin: "left center" }}
                animate={{ rotate: [`${rotation - 2}deg`, `${rotation + 2}deg`, `${rotation - 2}deg`] }}
                transition={{ duration: 3 + index * 0.2, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}
            {Array.from({ length: fruitCount }).map((_, index) => (
              <span
                key={index}
                className="absolute h-2.5 w-2.5 rounded-full bg-[#d7b86f] shadow-sm shadow-black/30"
                style={{
                  left: `${48 + Math.sin(index * 1.7) * 26}%`,
                  top: `${35 + (index % 5) * 9}%`,
                }}
              />
            ))}
          </>
        )}
        {isDead && (
          <>
            <span className="absolute left-1/2 top-10 h-1.5 w-28 -translate-x-1/2 rotate-[-18deg] rounded-full bg-[#6a4b38]" />
            <span className="absolute left-1/2 top-16 h-1.5 w-24 -translate-x-1/2 rotate-[22deg] rounded-full bg-[#6a4b38]" />
          </>
        )}
      </motion.div>
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#1f3d2b]">
        <span className="rounded-full border border-primary/15 bg-white/70 px-3 py-1">{state.zoneLabel}</span>
        <span className="rounded-full border border-primary/15 bg-white/70 px-3 py-1">Level {state.level}</span>
      </div>
    </div>
  );
};

const CarePill = ({
  done,
  icon: Icon,
  label,
}: {
  done: boolean;
  icon: typeof Droplets;
  label: string;
}) => (
  <span
    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
      done
        ? "border-primary/20 bg-primary/10 text-primary"
        : "border-primary/10 bg-white/65 text-[#667864]"
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </span>
);

const TamarTreePanel = ({ userId }: TamarTreePanelProps) => {
  const [state, setState] = useState<TamarTreeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [replanting, setReplanting] = useState(false);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      setState(await fetchTamarTreeState(userId));
    } catch (error) {
      console.error("Failed to load Tamar tree:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    window.addEventListener("tamar:tree-updated", loadTree);
    return () => window.removeEventListener("tamar:tree-updated", loadTree);
  }, [loadTree]);

  const handleReplant = async () => {
    setReplanting(true);
    try {
      const result = await replantTamarTree(userId);
      setState(result.state);
      toast.success("A new Tamar sapling is planted.");
    } catch (error) {
      console.error("Failed to replant Tamar:", error);
      toast.error("Could not replant Tamar right now.");
    } finally {
      setReplanting(false);
    }
  };

  if (loading && !state) {
    return (
      <section className="rounded-lg border border-primary/15 bg-white/82 p-5 shadow-xl shadow-primary/10" data-testid="tamar-tree-panel">
        <div className="flex items-center gap-3 text-sm text-[#667864]">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Waking Tamar
        </div>
      </section>
    );
  }

  if (!state) return null;

  const nextMilestone = getNextTamarMilestoneLevel(state.level);

  return (
    <section className="rounded-lg border border-primary/15 bg-white/82 p-5 shadow-xl shadow-primary/10" data-testid="tamar-tree-panel">
      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1fr)]">
        <TamarVisual state={state} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-primary">Your Tamar</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1f3d2b]">
                {state.status === "dead" ? "A quiet stump" : state.grownToday ? "Growing today" : "Care for the date tree"}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#667864]">{state.careMessage}</p>
            </div>
            <button
              type="button"
              onClick={loadTree}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-primary/15 px-3 text-xs font-semibold text-[#536451] transition hover:bg-primary/10 hover:text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <CarePill done={state.wateredToday} icon={Droplets} label={state.wateredToday ? "Watered" : "Needs water"} />
            <CarePill done={state.compostedToday} icon={Leaf} label={state.compostedToday ? "Composted" : "Needs compost"} />
            <CarePill done={state.grownToday} icon={Sparkles} label={state.grownToday ? "Grew today" : "Growth pending"} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-primary/10 bg-white/65 p-3">
              <p className="text-xs text-[#667864]">Current streak</p>
              <p className="mt-1 text-xl font-semibold text-[#1f3d2b]">{state.currentStreak}</p>
            </div>
            <div className="rounded-lg border border-primary/10 bg-white/65 p-3">
              <p className="text-xs text-[#667864]">Longest streak</p>
              <p className="mt-1 text-xl font-semibold text-[#1f3d2b]">{state.longestStreak}</p>
            </div>
            <div className="rounded-lg border border-primary/10 bg-white/65 p-3">
              <p className="text-xs text-[#667864]">Days to death</p>
              <p className="mt-1 text-xl font-semibold text-[#1f3d2b]">{state.status === "dead" ? "0" : state.daysUntilDeath}</p>
            </div>
            <div className="rounded-lg border border-primary/10 bg-white/65 p-3">
              <p className="text-xs text-[#667864]">Next reward</p>
              <p className="mt-1 text-xl font-semibold text-[#1f3d2b]">{state.nextRewardLevel ? `L${state.nextRewardLevel}` : "Max"}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-[#667864] sm:grid-cols-3">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Water: {formatDate(state.lastWateredDate)}
            </span>
            <span className="inline-flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-[#9f6d53]" />
              Compost: {formatDate(state.lastCompostedDate)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Sprout className="h-4 w-4 text-primary" />
              Milestone: {nextMilestone ? `Level ${nextMilestone}` : "All unlocked"}
            </span>
          </div>

          {state.status === "dead" && (
            <button
              type="button"
              onClick={handleReplant}
              disabled={replanting}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {replanting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
              Replant Tamar
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default TamarTreePanel;
