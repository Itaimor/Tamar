import { describe, expect, it } from "vitest";
import { buildInsightCards, getUnreadInsightCount, InsightActivity, InsightLocalActivity } from "@/lib/insights";

const now = new Date("2026-07-10T12:00:00.000Z");

const localActivity = (overrides: Partial<InsightLocalActivity> = {}): InsightLocalActivity => ({
  analysisVisitedAt: "2026-07-09T08:00:00.000Z",
  diaryVisitedAt: "2026-07-09T08:00:00.000Z",
  cookbookVisitedAt: "2026-07-09T08:00:00.000Z",
  ...overrides,
});

const remoteActivity = (overrides: Partial<InsightActivity> = {}): InsightActivity => ({
  latestMealLoggedAt: "2026-07-09T08:00:00.000Z",
  latestHealthReportedAt: "2026-07-09T20:00:00.000Z",
  latestIbsCheckinAt: null,
  cookbookRecipeCount: 0,
  latestCookbookSavedAt: null,
  tamarTree: null,
  ...overrides,
});

describe("insight card helpers", () => {
  it("prioritizes stale meal logging over general navigation nudges", () => {
    const cards = buildInsightCards({
      remote: remoteActivity({
        latestMealLoggedAt: "2026-07-01T08:00:00.000Z",
        latestHealthReportedAt: "2026-07-09T20:00:00.000Z",
      }),
      local: localActivity(),
      now,
    });

    expect(cards[0].id).toBe("log-meal");
    expect(cards[0].body).toContain("9 days ago");
  });

  it("shows analysis when the user has not opened it yet", () => {
    const cards = buildInsightCards({
      remote: remoteActivity(),
      local: localActivity({ analysisVisitedAt: null }),
      now,
    });

    expect(cards.some((card) => card.id === "analysis" && card.title === "Open Analysis")).toBe(true);
  });

  it("shows saved meal follow-up only when cookbook has recipes", () => {
    const withoutSavedMeals = buildInsightCards({
      remote: remoteActivity({ cookbookRecipeCount: 0 }),
      local: localActivity({ cookbookVisitedAt: null }),
      now,
    });
    const withSavedMeals = buildInsightCards({
      remote: remoteActivity({ cookbookRecipeCount: 3, latestCookbookSavedAt: "2026-07-01T08:00:00.000Z" }),
      local: localActivity({ cookbookVisitedAt: null }),
      now,
    });

    expect(withoutSavedMeals.some((card) => card.id === "cookbook" && card.issuedAt)).toBe(false);
    expect(withSavedMeals.some((card) => card.id === "cookbook" && card.title === "Revisit saved meals")).toBe(true);
  });

  it("clears unread counts once the current insight set has been viewed", () => {
    const cards = buildInsightCards({
      remote: remoteActivity({ latestMealLoggedAt: "2026-07-01T08:00:00.000Z" }),
      local: localActivity({ analysisVisitedAt: null }),
      now,
    });

    expect(getUnreadInsightCount(cards, null)).toBeGreaterThan(0);
    expect(getUnreadInsightCount(cards, now.toISOString())).toBe(0);
  });

  it("prioritizes a Tamar danger warning over ordinary nudges", () => {
    const cards = buildInsightCards({
      remote: remoteActivity({
        latestMealLoggedAt: "2026-07-09T08:00:00.000Z",
        latestHealthReportedAt: "2026-07-09T20:00:00.000Z",
        tamarTree: {
          runId: 1,
          status: "alive",
          level: 4,
          growthDays: 4,
          currentStreak: 0,
          longestStreak: 3,
          bestLevel: 4,
          bestRunLevel: 4,
          bestRunStreak: 3,
          totalRuns: 1,
          totalRewardEvents: 8,
          wateredToday: false,
          compostedToday: false,
          grownToday: false,
          daysSinceCare: 6,
          daysUntilDeath: 1,
          lastWateredDate: "2026-07-04",
          lastCompostedDate: "2026-07-04",
          lastCareDate: "2026-07-04",
          lastGrowthDate: "2026-07-04",
          plantedAt: "2026-07-01T08:00:00.000Z",
          diedAt: null,
          zone: "ground",
          zoneLabel: "Sapling ground",
          nextRewardLevel: 5,
          nextMilestoneLevel: 7,
          careMessage: "Tamar needs care today to survive.",
          todayKey: "2026-07-10",
          migrationReady: true,
        },
      }),
      local: localActivity(),
      now,
    });

    expect(cards[0].id).toBe("tamar-danger");
  });
});
