"""User-Based Collaborative Filtering (Rubi's workshop slides 64-72).

Intuition: the preferences of similar users (neighbors) predict yours.
"""
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class UserBasedCF:
    def __init__(self, neighborhood_size: int = 50):
        self.neighborhood_size = neighborhood_size
        self.user_item: pd.DataFrame | None = None
        self.user_sim: pd.DataFrame | None = None

    def fit(self, user_item_matrix: pd.DataFrame) -> "UserBasedCF":
        self.user_item = user_item_matrix
        filled = user_item_matrix.fillna(0).values
        sim = cosine_similarity(filled)
        self.user_sim = pd.DataFrame(
            sim,
            index=user_item_matrix.index,
            columns=user_item_matrix.index,
        )
        return self

    def predict(self, user_id, recipe_id) -> float:
        if user_id not in self.user_item.index or recipe_id not in self.user_item.columns:
            return float("nan")
        sims = self.user_sim[user_id].drop(user_id)
        raters = self.user_item[recipe_id].dropna().index
        sims = sims.loc[sims.index.intersection(raters)]
        if sims.empty:
            return float("nan")
        top = sims.nlargest(self.neighborhood_size)
        ratings = self.user_item.loc[top.index, recipe_id]
        denom = float(top.abs().sum())
        if denom == 0:
            return float("nan")
        return float((top.values * ratings.values).sum() / denom)

    def recommend(self, user_id, k: int = 10) -> pd.Series:
        if user_id not in self.user_item.index:
            return pd.Series(dtype=float)

        sims = self.user_sim[user_id].drop(user_id)
        neighbors = sims.nlargest(self.neighborhood_size)
        neighbor_ratings = self.user_item.loc[neighbors.index]      # (N, R)

        weights = neighbors.values[:, None]
        weighted_sum = (neighbor_ratings.fillna(0) * weights).sum(axis=0)
        weight_count = ((~neighbor_ratings.isna()) * np.abs(weights)).sum(axis=0)
        scores = weighted_sum / weight_count.replace(0, np.nan)

        user_rated = self.user_item.loc[user_id].dropna().index
        scores = scores.drop(user_rated, errors="ignore").dropna()
        return scores.nlargest(k)
