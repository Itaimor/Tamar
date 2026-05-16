"""Item-Based Collaborative Filtering.

Intuition: if two recipes are similar, a user who liked one will likely like
the other. Similarity is computed with cosine over the user-rating columns.
"""
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class ItemBasedCF:
    def __init__(self):
        self.user_item: pd.DataFrame | None = None
        self.item_sim: pd.DataFrame | None = None

    def fit(self, user_item_matrix: pd.DataFrame) -> "ItemBasedCF":
        self.user_item = user_item_matrix
        filled = user_item_matrix.fillna(0).values
        sim = cosine_similarity(filled.T)
        self.item_sim = pd.DataFrame(
            sim,
            index=user_item_matrix.columns,
            columns=user_item_matrix.columns,
        )
        return self

    def predict(self, user_id, recipe_id) -> float:
        """Predict a single rating (used by evaluate.py for RMSE)."""
        if user_id not in self.user_item.index or recipe_id not in self.user_item.columns:
            return float("nan")
        user_ratings = self.user_item.loc[user_id].dropna()
        if user_ratings.empty:
            return float("nan")
        sims = self.item_sim.loc[user_ratings.index, recipe_id]
        denom = float(sims.abs().sum())
        if denom == 0:
            return float("nan")
        return float((sims.values * user_ratings.values).sum() / denom)

    def recommend(self, user_id, k: int = 10) -> pd.Series:
        """Return top-k recipe IDs (index) with predicted scores (values)."""
        if user_id not in self.user_item.index:
            return pd.Series(dtype=float)
        user_ratings = self.user_item.loc[user_id].dropna()
        if user_ratings.empty:
            return pd.Series(dtype=float)

        sims = self.item_sim.loc[user_ratings.index]            # (rated, all_recipes)
        weighted = sims.T.dot(user_ratings.values)              # (all_recipes,)
        sim_sums = np.abs(sims).sum(axis=0)
        scores = weighted / sim_sums.replace(0, np.nan)
        scores = scores.drop(user_ratings.index, errors="ignore").dropna()
        return scores.nlargest(k)
