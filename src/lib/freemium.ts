import type { User } from "@supabase/supabase-js";

export const CANOPY_TRIAL_DAYS = 30;
export const CANOPY_DAY_MS = 24 * 60 * 60 * 1000;

export type CanopyReminderKind = "image-upload" | "analysis";

export type CanopyTrialStatus = {
  isCanopyPlus: boolean;
  planLabel: "Canopy+" | "Sapling";
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  daysUsed: number;
  daysRemaining: number;
  trialActive: boolean;
  featureAccess: boolean;
};

const truthyPlanValues = new Set(["canopy", "canopy+", "canopy_plus", "premium", "pro", "paid"]);

const normalizeMetadataValue = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : value;

export const isCanopyPlusUser = (user: User | null | undefined) => {
  const metadata = user?.app_metadata || {};
  const values = [
    metadata.tamar_plan,
    metadata.plan,
    metadata.subscription_tier,
    metadata.subscription_plan,
    metadata.membership,
    metadata.role,
  ].map(normalizeMetadataValue);

  return (
    metadata.canopy_plus === true ||
    metadata.tamar_canopy === true ||
    metadata.is_canopy_plus === true ||
    values.some((value) => typeof value === "string" && truthyPlanValues.has(value))
  );
};

export const getCanopyTrialStatus = (user: User | null | undefined, now = new Date()): CanopyTrialStatus => {
  const isCanopyPlus = isCanopyPlusUser(user);
  const createdAt = user?.created_at ? new Date(user.created_at) : null;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  const elapsedMs = validCreatedAt ? Math.max(0, now.getTime() - validCreatedAt.getTime()) : 0;
  const daysUsed = validCreatedAt ? Math.floor(elapsedMs / CANOPY_DAY_MS) : 0;
  const daysRemaining = isCanopyPlus ? CANOPY_TRIAL_DAYS : Math.max(0, CANOPY_TRIAL_DAYS - daysUsed);
  const trialActive = isCanopyPlus || !validCreatedAt || daysUsed < CANOPY_TRIAL_DAYS;

  return {
    isCanopyPlus,
    planLabel: isCanopyPlus ? "Canopy+" : "Sapling",
    trialStartedAt: validCreatedAt,
    trialEndsAt: validCreatedAt ? new Date(validCreatedAt.getTime() + CANOPY_TRIAL_DAYS * CANOPY_DAY_MS) : null,
    daysUsed,
    daysRemaining,
    trialActive,
    featureAccess: isCanopyPlus || trialActive,
  };
};

export const formatTrialDaysRemaining = (daysRemaining: number) =>
  `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`;

const reminderKey = (userId: string, kind: CanopyReminderKind) => `tamar:canopy:${kind}:lastShown:${userId}`;

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const shouldShowCanopyReminder = (
  userId: string | null | undefined,
  kind: CanopyReminderKind,
  intervalDays: number,
  now = new Date(),
) => {
  if (!userId || typeof window === "undefined") return false;

  try {
    const stored = window.localStorage.getItem(reminderKey(userId, kind));
    if (!stored) return true;

    const lastShownAt = new Date(stored);
    if (Number.isNaN(lastShownAt.getTime())) return true;

    return startOfLocalDay(now) - startOfLocalDay(lastShownAt) >= intervalDays * CANOPY_DAY_MS;
  } catch {
    return false;
  }
};

export const markCanopyReminderShown = (
  userId: string | null | undefined,
  kind: CanopyReminderKind,
  now = new Date(),
) => {
  if (!userId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(reminderKey(userId, kind), now.toISOString());
  } catch {
    // Reminder throttling is non-critical; the feature can still work without storage.
  }
};
