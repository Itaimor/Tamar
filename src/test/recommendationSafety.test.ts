import { describe, expect, it } from "vitest";
import {
  filterRecipesForHardRestrictions,
  isRecipeAllowedByHardRestrictions,
  normalizeIngredientName,
  restrictionMatchesIngredient,
  selectActiveHardRestrictions,
} from "@/lib/recommendationSafety";

describe("hard-restriction recipe safety", () => {
  it("normalizes hyphens, plurals, and common irregular ingredient names", () => {
    expect(normalizeIngredientName("Sun-Dried Tomatoes")).toBe("sun dried tomato");
    expect(normalizeIngredientName("Potatoes & Leaves")).toBe("potato and leaf");
  });

  it("matches broad restrictions directionally without near-name collisions", () => {
    expect(restrictionMatchesIngredient("peanut", "salted peanuts")).toBe(true);
    expect(restrictionMatchesIngredient("peanut", "creamy peanut-butter")).toBe(true);
    expect(restrictionMatchesIngredient("peanut butter", "roasted peanuts")).toBe(false);
    expect(restrictionMatchesIngredient("pea", "peanut oil")).toBe(false);
  });

  it("supports hard-restriction aliases without treating plant milk as dairy", () => {
    expect(restrictionMatchesIngredient("gluten", "durum wheat semolina")).toBe(true);
    expect(restrictionMatchesIngredient("dairy", "aged cheddar cheese")).toBe(true);
    expect(restrictionMatchesIngredient("dairy", "unsweetened almond milk")).toBe(false);
    expect(restrictionMatchesIngredient("milk", "coconut milk")).toBe(false);
    expect(restrictionMatchesIngredient("cream", "cream of tartar")).toBe(false);
    expect(restrictionMatchesIngredient("soy", "roasted soybeans")).toBe(true);
    expect(restrictionMatchesIngredient("nut", "chopped walnuts")).toBe(true);
    expect(restrictionMatchesIngredient("shellfish", "grilled prawns")).toBe(true);
    expect(restrictionMatchesIngredient("dairy", "almond milk with whey protein")).toBe(true);
    expect(restrictionMatchesIngredient("milk", "almond milk plus milk powder")).toBe(true);
    expect(restrictionMatchesIngredient("cream", "cream of tartar and heavy cream")).toBe(true);
  });

  it("selects backend hard types and explicitly strict rows", () => {
    const active = selectActiveHardRestrictions([
      {
        ingredient_name: "peanut",
        restriction_type: "allergy",
        is_strict: false,
      },
      {
        ingredient_name: "onion",
        restriction_type: "preference",
        is_strict: "yes",
      },
      {
        ingredient_name: "mushroom",
        restriction_type: "preference",
        is_strict: false,
      },
    ]);

    expect(active.map((restriction) => restriction.ingredient_name)).toEqual([
      "peanut",
      "onion",
    ]);
  });

  it("fails closed when active restrictions exist but recipe metadata is absent", () => {
    const restrictions = [
      {
        ingredient_name: "peanut",
        restriction_type: "forbidden_ingredient",
        is_strict: true,
      },
    ];

    expect(isRecipeAllowedByHardRestrictions(undefined, restrictions)).toBe(false);
    expect(isRecipeAllowedByHardRestrictions({}, restrictions)).toBe(false);
    expect(isRecipeAllowedByHardRestrictions({ ingredients: [] }, restrictions)).toBe(false);
    expect(isRecipeAllowedByHardRestrictions({}, [])).toBe(true);
  });

  it("removes forbidden and unverifiable fallback recipes while preserving safe recipes", () => {
    const restrictions = [
      {
        normalized_name: "tree nut",
        restriction_type: "allergy",
        is_strict: true,
      },
    ];
    const recipes = [
      { id: 1, ingredients: ["rice", "carrot", "olive oil"] },
      { id: 2, ingredients: ["almond flour", "banana"] },
      { id: 3 },
    ];

    expect(
      filterRecipesForHardRestrictions(recipes, restrictions).map((recipe) => recipe.id),
    ).toEqual([1]);
  });

  it("fails closed for an active restriction row with no usable ingredient name", () => {
    expect(
      isRecipeAllowedByHardRestrictions(
        { ingredients: ["rice", "carrot"] },
        [{ restriction_type: "allergy", is_strict: true }],
      ),
    ).toBe(false);
  });
});
