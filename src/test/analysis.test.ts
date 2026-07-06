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

  it("adds a content-based recipe experiment from easier food signals", () => {
    const dashboard = buildAnalysisDashboard(
      {
        genericRisks: [
          {
            ingredient_name: "rice",
            normalized_name: "rice",
            exposure_count: 4,
            negative_evidence: 4,
            risk_score: 0.12,
            last_evidence_at: "2026-07-01T12:00:00.000Z",
          },
          {
            ingredient_name: "garlic",
            normalized_name: "garlic",
            exposure_count: 2,
            positive_evidence: 2,
            risk_score: 0.76,
            last_evidence_at: "2026-07-01T12:00:00.000Z",
          },
        ],
        ibsRisks: [],
        exposures: [],
        mealLogs: [{ id: 1, food_name: "rice bowl", logged_at: "2026-07-01T09:00:00.000Z" }],
        healthReports: [{ severity: 0.1, no_symptoms: true, reported_at: "2026-07-01T18:00:00.000Z" }],
        ibsCheckins: [],
        candidateRecipes: [
          {
            id: 101,
            name: "Chicken Rice Bowl",
            ingredients: ["rice", "chicken", "carrot"],
            description: "A gentle rice bowl with simple vegetables.",
          },
          {
            id: 102,
            name: "Garlic Pasta",
            ingredients: ["garlic", "pasta", "cream"],
            description: "Rich pasta with roasted garlic.",
          },
        ],
      },
      new Date("2026-07-02T00:00:00.000Z"),
    );

    const recipeStep = dashboard.nextSteps.find((step) => step.kind === "recipe_experiment");

    expect(recipeStep?.recipeId).toBe(101);
    expect(recipeStep?.recipeTitle).toBe("Chicken Rice Bowl");
    expect(dashboard.nextSteps.some((step) => step.kind === "ingredient_experiment")).toBe(true);
  });

  it("keeps a similar recipe with watchlist ingredients below a cleaner match", () => {
    const dashboard = buildAnalysisDashboard(
      {
        genericRisks: [
          {
            ingredient_name: "rice",
            normalized_name: "rice",
            exposure_count: 5,
            negative_evidence: 5,
            risk_score: 0.1,
            last_evidence_at: "2026-07-01T12:00:00.000Z",
          },
          {
            ingredient_name: "garlic",
            normalized_name: "garlic",
            exposure_count: 4,
            positive_evidence: 4,
            risk_score: 0.85,
            last_evidence_at: "2026-07-01T12:00:00.000Z",
          },
        ],
        ibsRisks: [],
        exposures: [],
        mealLogs: [{ id: 1, food_name: "rice bowl", logged_at: "2026-07-01T09:00:00.000Z" }],
        healthReports: [{ severity: 0.1, no_symptoms: true, reported_at: "2026-07-01T18:00:00.000Z" }],
        ibsCheckins: [],
        candidateRecipes: [
          {
            id: 201,
            name: "Garlic Rice Bowl",
            ingredients: ["rice", "garlic", "chicken"],
            description: "Rice bowl with a lot of garlic.",
          },
          {
            id: 202,
            name: "Carrot Rice Bowl",
            ingredients: ["rice", "carrot", "chicken"],
            description: "Rice bowl with mild vegetables.",
          },
        ],
      },
      new Date("2026-07-02T00:00:00.000Z"),
    );

    const recipeStep = dashboard.nextSteps.find((step) => step.kind === "recipe_experiment");

    expect(recipeStep?.recipeId).toBe(202);
  });

  it("keeps fallback next steps when no content candidates exist", () => {
    const dashboard = buildAnalysisDashboard(
      {
        genericRisks: [],
        ibsRisks: [],
        exposures: [],
        mealLogs: [],
        healthReports: [],
        ibsCheckins: [],
        candidateRecipes: [],
      },
      new Date("2026-07-02T00:00:00.000Z"),
    );

    expect(dashboard.nextSteps.some((step) => step.title === "Start with a simple baseline")).toBe(true);
    expect(dashboard.nextSteps.some((step) => step.kind === "recipe_experiment")).toBe(false);
  });

  it("aggregates saved meal nutrition for the last seven days", () => {
    const dashboard = buildAnalysisDashboard(
      {
        genericRisks: [],
        ibsRisks: [],
        exposures: [],
        mealLogs: [
          {
            id: 1,
            food_name: "rice bowl",
            logged_at: "2026-07-02T09:00:00.000Z",
            calories: 420,
            protein_g: 18,
            fat_g: 12,
          },
          {
            id: 2,
            food_name: "eggs",
            logged_at: "2026-07-02T13:00:00.000Z",
            calories: 210,
            protein_g: 14,
            fat_g: 15,
          },
          {
            id: 3,
            food_name: "old snack",
            logged_at: "2026-06-20T13:00:00.000Z",
            calories: 999,
            protein_g: 99,
            fat_g: 99,
          },
        ],
        healthReports: [],
        ibsCheckins: [],
        candidateRecipes: [],
      },
      new Date("2026-07-05T12:00:00.000Z"),
    );

    const julySecond = dashboard.dailyNutrition.find((day) => day.date === "2026-07-02");

    expect(julySecond?.calories).toBe(630);
    expect(julySecond?.protein).toBe(32);
    expect(julySecond?.fat).toBe(27);
    expect(dashboard.totals.calories7Day).toBe(630);
    expect(dashboard.totals.mealsWithNutrition).toBe(2);
  });
});
