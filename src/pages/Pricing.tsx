import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Camera, Check, ChevronLeft, FlaskConical, Sparkles, TreePalm } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCanopyTrialStatus } from "@/lib/freemium";

type Plan = {
  name: string;
  price: string;
  cadence: string;
  helper: string;
  highlight?: string;
};

const plans: Plan[] = [
  {
    name: "Single month",
    price: "$8",
    cadence: "1 month",
    helper: "A flexible month of Canopy+.",
  },
  {
    name: "6 months",
    price: "$45",
    cadence: "6 months",
    helper: "For a steadier tracking rhythm.",
    highlight: "Popular",
  },
  {
    name: "Year",
    price: "$85",
    cadence: "12 months",
    helper: "The best long-term value.",
    highlight: "Best value",
  },
];

const features = [
  {
    icon: BarChart3,
    title: "Macro tracking",
    body: "Calories, protein, and fat in Diary and Analysis.",
  },
  {
    icon: Camera,
    title: "Camera image uploads",
    body: "Upload meal and recipe photos from the camera.",
  },
  {
    icon: FlaskConical,
    title: "Analysis testing",
    body: "Keep the testing feature in your personal food map.",
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const status = getCanopyTrialStatus(user);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  return (
    <div className="wellness-canvas min-h-screen text-foreground">
      <Navbar forceSolid />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-28 md:px-12">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-[#536451] transition hover:bg-primary/8 hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <section className="grid gap-6 rounded-lg border border-primary/15 bg-[#203629] p-6 text-[#fffaf0] shadow-xl shadow-primary/15 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f7c873]/30 bg-[#f7c873]/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#f7c873]">
                <TreePalm className="h-3.5 w-3.5" />
                Canopy+
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-tight md:text-5xl">
                Keep Tamar's premium tools growing with you.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#dce8d9]/78 md:text-base">
                Sapling includes the first 30 days of premium access. Canopy+ keeps macro tracking, camera uploads, and Analysis testing available after that.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-[#dce8d9]">
              <Sparkles className="h-4 w-4 text-[#f7c873]" />
              Current plan: <span className="font-semibold text-white">{status.planLabel}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-lg border border-white/12 bg-white/[0.06] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#fffaf0] text-[#203629]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-white">{feature.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#dce8d9]/70">{feature.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <button
              key={plan.name}
              type="button"
              onClick={() => setSelectedPlan(plan)}
              className="group flex min-h-[260px] flex-col justify-between rounded-lg border border-primary/15 bg-white/90 p-5 text-left shadow-md shadow-primary/8 transition hover:-translate-y-1 hover:border-[#d7b86f]/70 hover:shadow-xl hover:shadow-primary/12"
            >
              <span>
                <span className="flex min-h-7 items-center justify-between gap-3">
                  <span className="text-lg font-extrabold text-[#203629]">{plan.name}</span>
                  {plan.highlight && (
                    <span className="rounded-full bg-[#203629] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#f7c873]">
                      {plan.highlight}
                    </span>
                  )}
                </span>
                <span className="mt-6 block text-5xl font-black tracking-tight text-[#203629]">{plan.price}</span>
                <span className="mt-2 block text-sm font-medium text-[#667864]">{plan.cadence}</span>
                <span className="mt-4 block text-sm leading-relaxed text-[#667864]">{plan.helper}</span>
              </span>
              <span className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#203629] px-4 text-sm font-semibold text-[#fffaf0] transition group-hover:bg-[#2f4f3d]">
                <TreePalm className="h-4 w-4" />
                Choose plan
              </span>
            </button>
          ))}
        </section>

        <section className="rounded-lg border border-primary/15 bg-white/82 p-5">
          <h2 className="text-base font-bold text-[#203629]">Included with every Canopy+ plan</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-3 rounded-lg border border-primary/10 bg-white/75 p-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-[#203629]">{feature.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#667864]">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Dialog open={Boolean(selectedPlan)} onOpenChange={(open) => !open && setSelectedPlan(null)}>
        <DialogContent className="border-primary/15 bg-[#fbf7ec] text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment coming soon</DialogTitle>
            <DialogDescription>
              {selectedPlan
                ? `Checkout for the ${selectedPlan.name} Canopy+ plan is coming soon.`
                : "Canopy+ checkout is coming soon."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-primary/10 bg-white/70 p-4 text-sm text-[#667864]">
            This plan is not available for payment yet. You can keep using Tamar with your current access for now.
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setSelectedPlan(null)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pricing;
