import { describe, expect, it } from "vitest";
import { ensureUniqueRecipeRowImages, getImageSignature } from "@/lib/recipes";
import type { RecipeItem } from "@/lib/recipes";

const buildRecipe = (overrides: Partial<RecipeItem>): RecipeItem => ({
  id: 1,
  title: "Test Recipe",
  image: "",
  ingredients: [],
  ...overrides,
});

describe("recipe image helpers", () => {
  it("replaces duplicate images inside a visible row", () => {
    const duplicateImage = "https://images.unsplash.com/photo-1558030006-450675393462?q=80&w=1200&auto=format&fit=crop";
    const recommendations = [
      buildRecipe({ id: 101, title: "Steak Dinner", image: duplicateImage, ingredients: ["beef"] }),
      buildRecipe({ id: 102, title: "Pork Chops", image: duplicateImage, ingredients: ["pork"] }),
    ];
    const row = ensureUniqueRecipeRowImages(recommendations);

    const signatures = row.map((recipe) => getImageSignature(recipe.image));
    expect(row.map((recipe) => recipe.id)).toEqual(recommendations.map((recipe) => recipe.id));
    expect(row.map((recipe) => recipe.title)).toEqual(recommendations.map((recipe) => recipe.title));
    expect(row).toHaveLength(recommendations.length);
    expect(row[0].image).toBe(duplicateImage);
    expect(row[1].image).not.toBe(duplicateImage);
    expect(new Set(signatures).size).toBe(row.length);
  });

  it("falls back from known book images", () => {
    const bookImage = "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?q=80&w=1200&auto=format&fit=crop";
    const row = ensureUniqueRecipeRowImages([
      buildRecipe({ id: 201, title: "Dairy Free Smoothie", image: bookImage, ingredients: ["banana", "oat milk"] }),
    ]);

    expect(row[0].image).not.toBe(bookImage);
    expect(getImageSignature(row[0].image)).not.toBe(getImageSignature(bookImage));
  });
});
