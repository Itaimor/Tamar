import { describe, expect, it } from "vitest";
import { buildAnalysisDashboard, formatIngredientName } from "@/lib/analysis";

describe("analysis dashboard helpers", () => {
  it("separates foods to watch from foods that seem easier", () => {
    const dashboard = buildAnalysisDashboard(
      {
        genericRisks: [
          {
            ingredient_name: "garlic",
            normalized_name: "garlic",
            exposure_count: 5,
            positive_evidence: 4,
            negative_evidence: 0,
            risk_score: 0.82,
            last_evidence_at: "2026-07-01T12:00:00.000Z",
          },
          {
            ingredient_name: "rice",
            normalized_name: "rice",
            exposure_count: 4,
            positive_evidence: 0,
            negative_evidence: 4,
            risk_score: 0.12,
            last_evidence_at: "2026-07-01T12:00:00.000Z",
          },
        ],
        ibsRisks: [],
        exposures: [],
        mealLogs: [{ id: 1, logged_at: "2026-07-01T09:00:00.000Z" }],
        healthReports: [{ severity: 0.7, no_symptoms: false, reported_at: "2026-07-01T18:00:00.000Z" }],
        ibsCheckins: [],
      },
      new Date("2026-07-02T00:00:00.000Z"),
    );

    expect(dashboard.watchlist[0].name).toBe("Garlic");
    expect(dashboard.watchlist[0].label).toBe("Strong signal");
    expect(dashboard.easierFoods[0].name).toBe("Rice");
    expect(dashboard.easierFoods[0].label).toBe("Usually goes well");
  });

  it("formats ingredient names for display", () => {
    expect(formatIngredientName("spring onion white")).toBe("Spring Onion White");
    expect(formatIngredientName("pb")).toBe("PB");
  });
});
