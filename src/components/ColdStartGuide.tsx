import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Home,
  MessageSquare,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ColdStartGuideProps = {
  open: boolean;
  onBegin: () => void;
  onSkip: () => void;
};

type TourStep = {
  selector: string;
  title: string;
  body: string;
  icon: typeof Home;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 340;

const tourSteps: TourStep[] = [
  {
    selector: "[data-tour='home']",
    icon: Home,
    title: "Home",
    body: "This is where Tamar starts: recipe rows, the main recommendation hero, and quick taste feedback when setup is active.",
  },
  {
    selector: "[data-tour='cookbook']",
    icon: BookOpen,
    title: "CookBook",
    body: "Saved recipes and your own personal recipes live here, organized into cooklists for easier meal planning.",
  },
  {
    selector: "[data-tour='chat']",
    icon: MessageSquare,
    title: "Chat",
    body: "Use Chat to log food, add personal recipes, and give guided feedback after eating recommended recipes.",
  },
  {
    selector: "[data-tour='analysis']",
    icon: BarChart3,
    title: "Analysis",
    body: "Analysis turns meal and symptom history into possible trigger foods, easier foods, and recent pattern summaries.",
  },
  {
    selector: "[data-tour='diary']",
    icon: CalendarDays,
    title: "Diary",
    body: "Diary is the timeline for meals, notes, photos, symptoms, and how-you-feel check-ins.",
  },
  {
    selector: "[data-tour='search']",
    icon: Search,
    title: "Search",
    body: "Search recipes by name, ingredient, or meal idea whenever you want to jump straight to something specific.",
  },
  {
    selector: "[data-tour='floating-chat']",
    icon: Sparkles,
    title: "Quick Log",
    body: "This button opens Tamar chat from anywhere, so logging food stays close even while browsing recipes.",
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getElementRect = (selector: string): HighlightRect | null => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    top: Math.max(8, rect.top - SPOTLIGHT_PADDING),
    left: Math.max(8, rect.left - SPOTLIGHT_PADDING),
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
};

const ColdStartGuide = ({ open, onBegin, onSkip }: ColdStartGuideProps) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const currentStep = tourSteps[currentStepIndex];
  const Icon = currentStep.icon;
  const isLastStep = currentStepIndex === tourSteps.length - 1;

  useEffect(() => {
    if (!open) {
      setCurrentStepIndex(0);
      setHighlightRect(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updateHighlight = () => {
      const target = document.querySelector<HTMLElement>(currentStep.selector);
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
      setHighlightRect(getElementRect(currentStep.selector));
    };

    updateHighlight();
    const frame = window.requestAnimationFrame(updateHighlight);
    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight, true);
    };
  }, [currentStep.selector, open]);

  const cardStyle = useMemo(() => {
    if (!highlightRect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: `min(${CARD_WIDTH}px, calc(100vw - 2rem))`,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - (highlightRect.top + highlightRect.height);
    const placeBelow = spaceBelow > 250 || highlightRect.top < 260;
    const top = placeBelow
      ? highlightRect.top + highlightRect.height + 16
      : Math.max(16, highlightRect.top - 238);
    const left = clamp(
      highlightRect.left + highlightRect.width / 2 - CARD_WIDTH / 2,
      16,
      Math.max(16, viewportWidth - CARD_WIDTH - 16),
    );

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `min(${CARD_WIDTH}px, calc(100vw - 2rem))`,
    };
  }, [highlightRect]);

  if (!open) return null;

  const goNext = () => {
    if (isLastStep) {
      onBegin();
      return;
    }

    setCurrentStepIndex((index) => Math.min(tourSteps.length - 1, index + 1));
  };

  return (
    <div className="fixed inset-0 z-[120]">
      {!highlightRect && <div className="absolute inset-0 bg-[#0f1f18]/72 backdrop-blur-[2px]" />}

      {highlightRect && (
        <>
          <div
            className="absolute bg-transparent transition-all duration-300"
            style={{
              top: highlightRect.top,
              left: highlightRect.left,
              width: highlightRect.width,
              height: highlightRect.height,
              boxShadow: "0 0 0 9999px rgba(15, 31, 24, 0.72)",
              borderRadius: 999,
            }}
          />
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white bg-white/10 shadow-2xl shadow-white/20 ring-4 ring-primary/45 transition-all duration-300"
            style={{
              top: highlightRect.top,
              left: highlightRect.left,
              width: highlightRect.width,
              height: highlightRect.height,
            }}
          />
        </>
      )}

      <div className="absolute rounded-lg border border-primary/15 bg-[#fbf7ec] p-4 text-foreground shadow-2xl shadow-primary/20 transition-all duration-300" style={cardStyle}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
                Step {currentStepIndex + 1} of {tourSteps.length}
              </p>
              <h2 className="mt-1 text-lg font-black text-[#1f3d2b]">{currentStep.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full p-1.5 text-[#667864] transition hover:bg-primary/10 hover:text-primary"
            aria-label="Skip tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-[#667864]">{currentStep.body}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {tourSteps.map((step, index) => (
            <span
              key={step.title}
              className={`h-1.5 rounded-full transition-all ${
                index === currentStepIndex ? "w-7 bg-primary" : "w-1.5 bg-primary/20"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            className="px-2 text-[#667864] hover:bg-primary/10 hover:text-primary"
          >
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStepIndex((index) => Math.max(0, index - 1))}
              disabled={currentStepIndex === 0}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="button" onClick={goNext} className="gap-1.5">
              {isLastStep ? "Start setup" : "Next"}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColdStartGuide;
