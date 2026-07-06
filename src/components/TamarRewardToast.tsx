import { useEffect } from "react";
import { Droplets, Leaf, Sparkles, Sprout } from "lucide-react";
import { toast } from "sonner";
import type { TamarRewardEvent } from "@/lib/tamarTree";

const rewardIcon = (eventType: TamarRewardEvent["eventType"]) => {
  if (eventType === "water") return Droplets;
  if (eventType === "compost") return Leaf;
  if (eventType === "replant") return Sprout;
  return Sparkles;
};

const RewardToastBody = ({ event }: { event: TamarRewardEvent }) => {
  const Icon = rewardIcon(event.eventType);

  return (
    <div className="flex max-w-sm items-start gap-3 rounded-lg border border-primary/15 bg-[#fbf7ec] p-4 text-[#1f3d2b] shadow-xl shadow-primary/15">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{event.title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[#667864]">{event.body}</span>
      </span>
    </div>
  );
};

const shouldToast = (event: TamarRewardEvent) =>
  event.eventType === "growth" ||
  event.eventType === "cosmetic" ||
  event.eventType === "milestone" ||
  event.eventType === "death" ||
  event.eventType === "replant";

const TamarRewardToast = () => {
  useEffect(() => {
    const handleRewards = (event: Event) => {
      const rewards = (event as CustomEvent<TamarRewardEvent[]>).detail || [];
      rewards.filter(shouldToast).forEach((reward, index) => {
        window.setTimeout(() => {
          toast.custom(() => <RewardToastBody event={reward} />, { duration: reward.eventType === "milestone" ? 6000 : 4200 });
        }, index * 450);
      });
    };

    window.addEventListener("tamar:tree-rewards", handleRewards);
    return () => window.removeEventListener("tamar:tree-rewards", handleRewards);
  }, []);

  return null;
};

export default TamarRewardToast;
