import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Sparkles, Sprout, Trophy } from "lucide-react";
import { TamarTreeState, fetchTamarTreeState } from "@/lib/tamarTree";

type TamarRecordPanelProps = {
  userId: string;
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-primary/10 bg-white/65 p-3">
    <p className="text-xs text-[#667864]">{label}</p>
    <p className="mt-1 text-xl font-semibold text-[#1f3d2b]">{value}</p>
  </div>
);

const TamarRecordPanel = ({ userId }: TamarRecordPanelProps) => {
  const [state, setState] = useState<TamarTreeState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      setState(await fetchTamarTreeState(userId));
    } catch (error) {
      console.warn("Tamar record unavailable:", error);
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

  return (
    <section className="rounded-lg border border-primary/15 bg-white/82 p-5 shadow-xl shadow-primary/10" data-testid="tamar-record-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[#1f3d2b]">
            <Trophy size={18} className="text-[#8a6b3f]" />
            <h2 className="text-base font-semibold">Tamar Record</h2>
          </div>
          <p className="mt-1 text-sm text-[#667864]">Tree progress from showing up for meals and how-you-feel notes.</p>
        </div>
        {state && (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {state.status === "dead" ? "Dead run" : state.zoneLabel}
          </span>
        )}
      </div>

      {loading && !state ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[#667864]">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading Tamar record
        </div>
      ) : state ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Current level" value={String(state.level)} />
            <Stat label="Current streak" value={String(state.currentStreak)} />
            <Stat label="Longest streak" value={String(state.bestRunStreak)} />
            <Stat label="Best level" value={String(state.bestRunLevel)} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-primary/10 bg-white/65 px-3 py-2 text-sm text-[#667864]">
              <Sparkles className="h-4 w-4 text-[#8a6b3f]" />
              {state.totalRewardEvents} reward moments
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-primary/10 bg-white/65 px-3 py-2 text-sm text-[#667864]">
              <Sprout className="h-4 w-4 text-primary" />
              {state.totalRuns} planted run{state.totalRuns === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-primary/10 bg-white/65 px-3 py-2 text-sm text-[#667864]">
              <CalendarDays className="h-4 w-4 text-primary" />
              Next milestone {state.nextMilestoneLevel ? `L${state.nextMilestoneLevel}` : "complete"}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
};

export default TamarRecordPanel;
