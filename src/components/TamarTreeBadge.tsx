import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Droplets, Leaf, Loader2, MessageSquare, Sprout } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TamarTreeState, fetchTamarTreeState } from "@/lib/tamarTree";

type TamarTreeBadgeProps = {
  userId: string;
  onOpenDiary: () => void;
  onOpenChat: () => void;
};

const TamarTreeBadge = ({ userId, onOpenDiary, onOpenChat }: TamarTreeBadgeProps) => {
  const [state, setState] = useState<TamarTreeState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      setState(await fetchTamarTreeState(userId));
    } catch (error) {
      console.warn("Navbar Tamar tree unavailable:", error);
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

  const badgeTone =
    state?.status === "dead"
      ? "text-[#9f6d53] hover:bg-[#9f6d53]/10"
      : state?.wateredToday && state?.compostedToday
        ? "text-primary hover:bg-primary/10"
        : state && state.daysUntilDeath <= 2
          ? "text-[#8a6b3f] hover:bg-[#8a6b3f]/10"
          : "text-[#536451] hover:bg-primary/10 hover:text-primary";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`relative rounded-full p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 shrink-0 ${badgeTone}`}
          aria-label="Open Tamar tree status"
        >
          {loading && !state ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sprout className="h-5 w-5" />}
          {state && state.status !== "dead" && (!state.wateredToday || !state.compostedToday) && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#d7b86f] ring-2 ring-[#fbf7ec]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-xs sm:w-72 rounded-lg border-primary/15 bg-[#fbf7ec] p-0 text-foreground shadow-xl shadow-primary/10">
        <div className="border-b border-primary/10 px-4 py-3">
          <p className="text-sm font-bold text-[#1f3d2b]">Your Tamar</p>
          <p className="mt-1 text-xs leading-relaxed text-[#667864]">
            {state ? state.careMessage : "Checking the tree."}
          </p>
        </div>
        {state && (
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-primary/8 p-2">
                <p className="text-[11px] text-[#667864]">Level</p>
                <p className="text-sm font-bold text-[#1f3d2b]">{state.level}</p>
              </div>
              <div className="rounded-lg bg-primary/8 p-2">
                <p className="text-[11px] text-[#667864]">Streak</p>
                <p className="text-sm font-bold text-[#1f3d2b]">{state.currentStreak}</p>
              </div>
              <div className="rounded-lg bg-primary/8 p-2">
                <p className="text-[11px] text-[#667864]">Days</p>
                <p className="text-sm font-bold text-[#1f3d2b]">{state.status === "dead" ? 0 : state.daysUntilDeath}</p>
              </div>
            </div>
            <div className="grid gap-2 text-xs text-[#536451]">
              <span className="inline-flex items-center gap-2">
                <Droplets className="h-4 w-4 text-primary" />
                {state.wateredToday ? "Watered today" : "Needs a food log"}
              </span>
              <span className="inline-flex items-center gap-2">
                <Leaf className="h-4 w-4 text-primary" />
                {state.compostedToday ? "Composted today" : "Needs a how-you-feel note"}
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {state.zoneLabel}
              </span>
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={onOpenDiary}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Open Diary
              </button>
              <button
                type="button"
                onClick={onOpenChat}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-white/55 px-3 text-sm font-semibold text-primary transition hover:bg-primary/10"
              >
                <MessageSquare className="h-4 w-4" />
                Log food in Chat
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default TamarTreeBadge;
