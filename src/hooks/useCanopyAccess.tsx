import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import {
  CanopyUpgradeDialog,
  type CanopyUpgradeDialogConfig,
} from "@/components/CanopyUpgradeDialog";
import {
  formatTrialDaysRemaining,
  getCanopyTrialStatus,
  markCanopyReminderShown,
  shouldShowCanopyReminder,
} from "@/lib/freemium";

export const useCanopyAccess = (user: User | null | undefined) => {
  const navigate = useNavigate();
  const [dialogConfig, setDialogConfig] = useState<CanopyUpgradeDialogConfig | null>(null);
  const trialStatus = useMemo(() => getCanopyTrialStatus(user), [user]);

  const openPricing = useCallback(() => {
    navigate("/pricing");
  }, [navigate]);

  const openImageUploadPrompt = useCallback(() => {
    if (!user || trialStatus.isCanopyPlus) return true;

    if (!trialStatus.featureAccess) {
      setDialogConfig({
        title: "Camera uploads are in Canopy+",
        description:
          "Your 30-day Sapling trial has ended. Join Canopy+ to keep uploading meal and recipe images from your camera.",
        primaryLabel: "Join Canopy+",
      });
      return false;
    }

    if (shouldShowCanopyReminder(user.id, "image-upload", 1)) {
      markCanopyReminderShown(user.id, "image-upload");
      setDialogConfig({
        title: `Your free plan runs out in ${formatTrialDaysRemaining(trialStatus.daysRemaining)}`,
        description:
          "Camera uploads are included during your first 30 days. Join Canopy+ to keep image uploads after the Sapling trial ends.",
        primaryLabel: "Join Canopy+",
        secondaryLabel: "Continue uploading",
      });
    }

    return true;
  }, [trialStatus.daysRemaining, trialStatus.featureAccess, trialStatus.isCanopyPlus, user]);

  const openAnalysisPrompt = useCallback(() => {
    if (!user || trialStatus.isCanopyPlus) return;

    if (!shouldShowCanopyReminder(user.id, "analysis", 2)) return;

    markCanopyReminderShown(user.id, "analysis");
    setDialogConfig(
      trialStatus.featureAccess
        ? {
            title: "Keep Analysis fully unlocked",
            description: `Your Sapling trial has ${formatTrialDaysRemaining(
              trialStatus.daysRemaining,
            )} left. The testing feature and calorie insights will move to Canopy+ after that.`,
            primaryLabel: "Join Canopy+",
            secondaryLabel: "Keep exploring",
          }
        : {
            title: "Analysis testing is in Canopy+",
            description:
              "The testing feature and calorie insights are Canopy+ tools now that your 30-day Sapling trial has ended.",
            primaryLabel: "Join Canopy+",
          },
    );
  }, [trialStatus.daysRemaining, trialStatus.featureAccess, trialStatus.isCanopyPlus, user]);

  const openPremiumFeaturePrompt = useCallback(
    (featureName: string) => {
      if (!user || trialStatus.featureAccess) return true;

      setDialogConfig({
        title: `${featureName} is in Canopy+`,
        description:
          "Your 30-day Sapling trial has ended. Join Canopy+ to keep using macro tracking, camera uploads, and Analysis testing.",
        primaryLabel: "Join Canopy+",
      });
      return false;
    },
    [trialStatus.featureAccess, user],
  );

  const canopyDialog = (
    <CanopyUpgradeDialog
      open={Boolean(dialogConfig)}
      config={dialogConfig}
      onOpenChange={(open) => {
        if (!open) setDialogConfig(null);
      }}
      onUpgrade={openPricing}
    />
  );

  return {
    canopyDialog,
    hasCanopyFeatureAccess: trialStatus.featureAccess,
    isCanopyPlus: trialStatus.isCanopyPlus,
    openAnalysisPrompt,
    openImageUploadPrompt,
    openPremiumFeaturePrompt,
    openPricing,
    planLabel: trialStatus.planLabel,
    trialStatus,
  };
};
