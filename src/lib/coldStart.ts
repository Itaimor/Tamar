// Latent space definition and active learning utilities for cold-start bootstrapping.

export interface LatentRecipe {
  id: number;
  title: string;
  image: string;
  time: string;
  vector: number[]; // 4-dimensional latent space: [Complexity, IngredientSparsity, CarbHeavy, ProteinHeavy]
}

// All 5 medoid recipes mapped to our 4D latent space for active learning onboarding
export const latentRecipes: Record<number, LatentRecipe> = {
  3: { id: 3, title: "3", image: "/images/empty_plate.png", time: "20m", vector: [0.3, 0.5, 0.9, 0.1] },
  4: { id: 4, title: "4", image: "/images/empty_plate.png", time: "8m", vector: [-0.8, -0.9, -0.2, -0.4] },
  6: { id: 6, title: "6", image: "/images/empty_plate.png", time: "25m", vector: [0.4, 0.2, -0.9, 0.9] },
  13: { id: 13, title: "13", image: "/images/empty_plate.png", time: "22m", vector: [0.8, 0.7, 0.2, 0.5] },
  19: { id: 19, title: "19", image: "/images/empty_plate.png", time: "10m", vector: [-0.6, -0.4, -0.8, 0.2] }
};

// Mathematically selected medoids representing 5 distinct culinary styles:
// 1. Complexity/Minimalist (Avocado Toast Deluxe) - Cluster 0
// 2. High-Protein Fitness (Grilled Salmon) - Cluster 1
// 3. Carb Heavy Comfort (Artisan Wood-Fired Pizza) - Cluster 2
// 4. Healthy/Salad (Detox Green Bowl) - Cluster 3
// 5. Complex Slow Cooked (Spicy Thai Red Curry) - Cluster 4
export const medoidRecipeIds = [4, 6, 3, 19, 13];

export const getMedoidRecipes = (): LatentRecipe[] => {
  return medoidRecipeIds.map(id => latentRecipes[id]);
};

/**
 * Projects binary swipe interactions (like/dislike) into the latent space.
 * 
 * Mathematical transition:
 * U_new = sum( w_i * V_i ) / sum(|w_i|)
 * where V_i is the 4D recipe latent vector and w_i is +1.0 for Like and -1.0 for Dislike.
 */
export const calculateUserVector = (feedback: Record<number, number>): number[] => {
  const dimensions = 4;
  let userVector = new Array(dimensions).fill(0);
  let totalWeight = 0;

  Object.entries(feedback).forEach(([idStr, score]) => {
    const id = Number(idStr);
    const recipe = latentRecipes[id];
    if (!recipe) return;

    const vector = recipe.vector;
    // score is +1 for Like, -1 for Dislike
    for (let d = 0; d < dimensions; d++) {
      userVector[d] += score * vector[d];
    }
    totalWeight += Math.abs(score);
  });

  if (totalWeight > 0) {
    userVector = userVector.map(val => val / totalWeight);
  }

  return userVector;
};

/**
 * Calculates cosine similarity between two vectors: (A . B) / (||A|| * ||B||)
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
};

/**
 * Computes recommendations for the user vector across the entire catalog.
 * Returns sorted recipe IDs in descending order of cosine similarity.
 */
export const getRecommendationsFromVector = (userVector: number[], excludeIds: number[] = []): number[] => {
  const similarities: { id: number; score: number }[] = [];

  Object.keys(latentRecipes).forEach(idStr => {
    const id = Number(idStr);
    if (excludeIds.includes(id)) return;

    const recipe = latentRecipes[id];
    const score = cosineSimilarity(userVector, recipe.vector);
    similarities.push({ id, score });
  });

  // Sort by similarity score descending
  similarities.sort((a, b) => b.score - a.score);

  return similarities.map(item => item.id);
};
