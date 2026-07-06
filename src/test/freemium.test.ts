import { describe, expect, it, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  getCanopyTrialStatus,
  markCanopyReminderShown,
  shouldShowCanopyReminder,
} from "@/lib/freemium";

const user = (createdAt: string, appMetadata: Record<string, unknown> = {}) =>
  ({
    id: "user-1",
    aud: "authenticated",
    created_at: createdAt,
    app_metadata: appMetadata,
    user_metadata: {},
  }) as User;

describe("freemium helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("counts down the 30-day Sapling trial from account creation", () => {
    const status = getCanopyTrialStatus(
      user("2026-07-01T12:00:00.000Z"),
      new Date("2026-07-16T12:00:00.000Z"),
    );

    expect(status.planLabel).toBe("Sapling");
    expect(status.daysUsed).toBe(15);
    expect(status.daysRemaining).toBe(15);
    expect(status.featureAccess).toBe(true);
  });

  it("expires Sapling feature access after 30 days", () => {
    const status = getCanopyTrialStatus(
      user("2026-07-01T12:00:00.000Z"),
      new Date("2026-07-31T12:00:00.000Z"),
    );

    expect(status.daysRemaining).toBe(0);
    expect(status.trialActive).toBe(false);
    expect(status.featureAccess).toBe(false);
  });

  it("keeps Canopy+ users active from app metadata", () => {
    const status = getCanopyTrialStatus(
      user("2026-01-01T12:00:00.000Z", { tamar_plan: "canopy_plus" }),
      new Date("2026-07-31T12:00:00.000Z"),
    );

    expect(status.planLabel).toBe("Canopy+");
    expect(status.isCanopyPlus).toBe(true);
    expect(status.featureAccess).toBe(true);
  });

  it("throttles reminders by whole local days", () => {
    const first = new Date("2026-07-01T12:00:00.000Z");
    const nextDay = new Date("2026-07-02T12:00:00.000Z");
    const thirdDay = new Date("2026-07-03T12:00:00.000Z");

    expect(shouldShowCanopyReminder("user-1", "analysis", 2, first)).toBe(true);
    markCanopyReminderShown("user-1", "analysis", first);
    expect(shouldShowCanopyReminder("user-1", "analysis", 2, nextDay)).toBe(false);
    expect(shouldShowCanopyReminder("user-1", "analysis", 2, thirdDay)).toBe(true);
  });
});
