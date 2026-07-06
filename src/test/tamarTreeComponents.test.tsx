import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TamarTreePanel from "@/components/TamarTreePanel";
import type { TamarTreeState } from "@/lib/tamarTree";

const state: TamarTreeState = {
  runId: 1,
  status: "alive",
  level: 4,
  growthDays: 4,
  currentStreak: 2,
  longestStreak: 3,
  bestLevel: 4,
  bestRunLevel: 4,
  bestRunStreak: 3,
  totalRuns: 1,
  totalRewardEvents: 7,
  wateredToday: true,
  compostedToday: false,
  grownToday: false,
  daysSinceCare: 0,
  daysUntilDeath: 7,
  lastWateredDate: "2026-07-10",
  lastCompostedDate: "2026-07-09",
  lastCareDate: "2026-07-10",
  lastGrowthDate: "2026-07-09",
  plantedAt: "2026-07-01T08:00:00.000Z",
  diedAt: null,
  zone: "ground",
  zoneLabel: "Sapling ground",
  nextRewardLevel: 5,
  nextMilestoneLevel: 7,
  careMessage: "Watered today. Add how you feel to turn care into growth.",
  todayKey: "2026-07-10",
  migrationReady: true,
};

vi.mock("@/lib/tamarTree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tamarTree")>();
  return {
    ...actual,
    fetchTamarTreeState: vi.fn(async () => state),
    replantTamarTree: vi.fn(async () => ({ state, events: [] })),
  };
});

describe("TamarTreePanel", () => {
  it("renders the tree panel and today's missing care", async () => {
    render(<TamarTreePanel userId="user-1" />);

    await waitFor(() => expect(screen.getByTestId("tamar-tree-panel")).toBeInTheDocument());
    expect(await screen.findByText("Care for the date tree")).toBeInTheDocument();
    expect(screen.getByText("Watered")).toBeInTheDocument();
    expect(screen.getByText("Needs compost")).toBeInTheDocument();
    expect(screen.getByText("Level 4")).toBeInTheDocument();
  });
});
