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

  it("uses a server-controlled trial date for QA accounts", () => {
    const status = getCanopyTrialStatus(
      user("2026-07-31T12:00:00.000Z", {
        qa_account: true,
        qa_trial_started_at: "2026-06-20T12:00:00.000Z",
      }),
      new Date("2026-07-31T12:00:00.000Z"),
    );

    expect(status.daysUsed).toBe(41);
    expect(status.featureAccess).toBe(false);
  });

  it("ignores trial date overrides for normal users", () => {
    const status = getCanopyTrialStatus(
      user("2026-07-21T12:00:00.000Z", {
        qa_trial_started_at: "2026-01-01T12:00:00.000Z",
      }),
      new Date("2026-07-31T12:00:00.000Z"),
    );

    expect(status.daysUsed).toBe(10);
    expect(status.featureAccess).toBe(true);
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
