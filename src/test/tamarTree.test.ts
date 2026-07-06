import { describe, expect, it } from "vitest";
import {
  TamarTreeRunRow,
  buildCareCalendar,
  buildTamarTreeStateFromSnapshot,
  getTamarRewardUnlocksForLevel,
} from "@/lib/tamarTree";

const run = (overrides: Partial<TamarTreeRunRow> = {}): TamarTreeRunRow => ({
  id: 1,
  user_id: "user-1",
  is_current: true,
  status: "alive",
  level: 0,
  growth_days: 0,
  current_streak: 0,
  longest_streak: 0,
  best_level: 0,
  last_watered_date: null,
  last_composted_date: null,
  last_care_date: "2026-07-09",
  last_growth_date: null,
  planted_at: "2026-07-09T08:00:00.000Z",
  died_at: null,
  updated_at: "2026-07-09T08:00:00.000Z",
  ...overrides,
});

describe("tamar tree lifecycle helpers", () => {
  it("tracks water-only care without marking the day as grown", () => {
    const state = buildTamarTreeStateFromSnapshot({
      run: run({ last_watered_date: "2026-07-10", last_care_date: "2026-07-10" }),
      careCalendar: buildCareCalendar({ waterDates: ["2026-07-10"] }),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(state.wateredToday).toBe(true);
    expect(state.compostedToday).toBe(false);
    expect(state.grownToday).toBe(false);
    expect(state.status).toBe("alive");
  });

  it("tracks compost-only care without marking the day as grown", () => {
    const state = buildTamarTreeStateFromSnapshot({
      run: run({ last_composted_date: "2026-07-10", last_care_date: "2026-07-10" }),
      careCalendar: buildCareCalendar({ compostDates: ["2026-07-10"] }),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(state.wateredToday).toBe(false);
    expect(state.compostedToday).toBe(true);
    expect(state.grownToday).toBe(false);
  });

  it("marks a full-care day as grown only when the run recorded one growth for that date", () => {
    const state = buildTamarTreeStateFromSnapshot({
      run: run({
        level: 3,
        growth_days: 3,
        current_streak: 3,
        longest_streak: 3,
        last_watered_date: "2026-07-10",
        last_composted_date: "2026-07-10",
        last_care_date: "2026-07-10",
        last_growth_date: "2026-07-10",
      }),
      careCalendar: buildCareCalendar({ waterDates: ["2026-07-10"], compostDates: ["2026-07-10"] }),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(state.wateredToday).toBe(true);
    expect(state.compostedToday).toBe(true);
    expect(state.grownToday).toBe(true);
    expect(state.level).toBe(3);
    expect(state.currentStreak).toBe(3);
  });

  it("kills the current run after seven consecutive dates without care", () => {
    const state = buildTamarTreeStateFromSnapshot({
      run: run({ level: 4, last_care_date: "2026-07-03", last_growth_date: "2026-07-03" }),
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(state.status).toBe("dead");
    expect(state.daysUntilDeath).toBe(0);
    expect(state.currentStreak).toBe(0);
  });

  it("keeps a replanted sapling at level zero while preserving historical bests", () => {
    const state = buildTamarTreeStateFromSnapshot({
      run: run({ id: 2, planted_at: "2026-07-10T09:00:00.000Z" }),
      allRuns: [
        run({ id: 2, planted_at: "2026-07-10T09:00:00.000Z" }),
        run({ id: 1, is_current: false, status: "dead", level: 12, best_level: 12, longest_streak: 8 }),
      ],
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(state.level).toBe(0);
    expect(state.bestRunLevel).toBe(12);
    expect(state.bestRunStreak).toBe(8);
  });

  it("unlocks frequent deterministic rewards", () => {
    expect(getTamarRewardUnlocksForLevel(1, 1, "2026-07-10").some((event) => event.eventType === "cosmetic")).toBe(true);
    expect(getTamarRewardUnlocksForLevel(1, 8, "2026-07-10").some((event) => event.eventType === "cosmetic")).toBe(true);
    expect(getTamarRewardUnlocksForLevel(1, 10, "2026-07-10").find((event) => event.title === "World detail unlocked")).toBeTruthy();
    expect(getTamarRewardUnlocksForLevel(1, 100, "2026-07-10").some((event) => event.eventType === "milestone")).toBe(true);
  });
});
