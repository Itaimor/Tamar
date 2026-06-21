import { describe, expect, it } from "vitest";
import {
  buildColdStartRiskRows,
  buildIbsEvidenceTable,
  computeUpdatedIbsRiskRows,
  validateIbsCheckInResult,
} from "@/lib/ibsRisk";

describe("IBS risk helpers", () => {
  it("extracts IBS ingredients from structured food windows", () => {
    const result = validateIbsCheckInResult({
      complete: true,
      feeling: {
        severity: 0.8,
        symptoms: ["bloating"],
        summary: "Strong bloating after meals.",
        confidence: 0.8,
      },
      food_windows: {
        hours_0_8: ["pasta with garlic bread"],
        hours_9_16: ["coffee and yogurt"],
        hours_17_24: ["rice and chicken"],
      },
      missing_fields: [],
    });

    expect(result).not.toBeNull();
    const evidence = buildIbsEvidenceTable(result!);
    const names = evidence.map((row) => row.ingredientName);

    expect(names).toContain("pasta");
    expect(names).toContain("garlic");
    expect(names).toContain("coffee");
    expect(names).toContain("yogurt");
  });

  it("moves risk up when symptoms are high and ingredient exposure is recent", () => {
    const updated = computeUpdatedIbsRiskRows(
      [
        {
          ingredientName: "garlic",
          triggerGroup: "fructans_gos",
          count_8h: 2,
          count_9_16h: 0,
          count_17_24h: 0,
          frequencyScore: 0.66,
          evidenceScore: 0.594,
        },
      ],
      [{ ingredient_name: "garlic", grade: 0.2, confidence: 0.2, evidence_count: 0 }],
      0.9,
      "2026-06-21T00:00:00.000Z",
    );

    expect(updated[0].grade).toBeGreaterThan(0.2);
    expect(updated[0].confidence).toBeGreaterThan(0.2);
    expect(updated[0].evidence_count).toBe(1);
  });

  it("initializes cold-start rows for every IBS ingredient", () => {
    const rows = buildColdStartRiskRows({
      lactose: 3,
      wheat_fructans: 0,
      drinks: null,
    });

    expect(rows.length).toBeGreaterThan(100);
    expect(rows.find((row) => row.ingredient_name === "milk")?.grade).toBe(1);
    expect(rows.find((row) => row.ingredient_name === "coffee")?.grade).toBe(0);
  });
});

