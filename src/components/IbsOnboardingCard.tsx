import { useMemo, useState } from "react";
import { Activity, CheckCircle2, ChevronLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  IBS_COLD_START_OPTIONS,
  IBS_COLD_START_QUESTIONS,
} from "@/lib/ibsRisk";
import { saveIbsColdStartProfile } from "@/lib/ibsProfile";

type IbsOnboardingCardProps = {
  userId: string;
  onCompleted: () => void;
};

const IbsOnboardingCard = ({ userId, onCompleted }: IbsOnboardingCardProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentQuestion = IBS_COLD_START_QUESTIONS[currentIndex];
  const progressPercent = useMemo(
    () => Math.round(((currentIndex + 1) / IBS_COLD_START_QUESTIONS.length) * 100),
    [currentIndex],
  );

  const saveAnswer = async (value: number | null) => {
    if (!currentQuestion || isSaving) return;

    setSaveError(null);
    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(nextAnswers);

    if (currentIndex < IBS_COLD_START_QUESTIONS.length - 1) {
      setCurrentIndex((index) => index + 1);
      return;
    }

    setIsSaving(true);
    try {
      await saveIbsColdStartProfile(userId, nextAnswers);
      toast.success("IBS profile initialized.");
      onCompleted();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown save error";
      setSaveError(
        message.includes("user_ibs")
          ? "The IBS database tables are not available yet. Apply the IBS Supabase migration, then try saving again."
          : `Could not save your IBS profile: ${message}`,
      );
      toast.error("Could not save your IBS profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const goBack = () => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  };

  if (!currentQuestion) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 mb-12">
      <div className="bg-[#181818] border border-emerald-400/20 rounded-xl overflow-hidden p-5 md:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-emerald-300 text-xs uppercase tracking-widest font-extrabold mb-3">
              <Activity className="w-4 h-4" />
              <span>IBS Personalization</span>
            </div>
            <h4 className="text-xl md:text-2xl font-bold text-white leading-tight">
              Build your personal IBS ingredient table
            </h4>
            <p className="text-gray-400 text-xs md:text-sm mt-2 max-w-2xl">
              Tamar learns possible trigger patterns from your answers. This is not medical advice and does not diagnose IBS.
            </p>
          </div>
          <div className="h-11 w-11 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2">
            <span>Question {currentIndex + 1} of {IBS_COLD_START_QUESTIONS.length}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="bg-[#141414] border border-white/10 rounded-lg p-4 md:p-5">
          <p className="text-base md:text-lg font-semibold text-white leading-snug min-h-[56px]">
            {currentQuestion.prompt}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-5">
            {IBS_COLD_START_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={isSaving}
                onClick={() => saveAnswer(option.value)}
                className="min-h-[72px] rounded-lg border border-white/10 hover:border-emerald-300/70 bg-white/[0.03] hover:bg-emerald-400/10 text-left px-3 py-3 transition-all disabled:opacity-50"
              >
                <span className="block text-sm font-bold text-white">{option.label}</span>
                <span className="block text-[11px] text-gray-400 mt-1">{option.helper}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button
            type="button"
            onClick={goBack}
            disabled={currentIndex === 0 || isSaving}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Saved only after all questions are answered
          </div>
        </div>

        {saveError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {saveError}
          </div>
        )}
      </div>
    </div>
  );
};

export default IbsOnboardingCard;
