"""Matrix Factorization CF using Surprise's SVD (Rubi's workshop slides 84-94).

Decompose the User × Recipe matrix into latent matrices U (users × k) and
V (recipes × k). A rating is approximated by the dot product of the user's
and the recipe's latent vectors, plus bias terms (the Netflix-prize trick).
"""
from pathlib import Path
import pandas as pd
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD

try:
    from surprise import SVD, Dataset, Reader
except ImportError:
    SVD = None
    Dataset = None
    Reader = None


class MatrixFactorizationCF:
    def __init__(
        self,
        n_factors: int = 50,
        n_epochs: int = 20,
        lr_all: float = 0.005,
        reg_all: float = 0.02,
        rating_scale=(0, 5),
        random_state: int = 42,
    ):
        self.n_factors = n_factors
        self.n_epochs = n_epochs
        self.lr_all = lr_all
        self.reg_all = reg_all
        self.rating_scale = rating_scale
        self.random_state = random_state
        self.model = None
        self.backend = "surprise" if SVD is not None else "sklearn"
        self.trainset = None
        self._all_recipes = None
        self._rated_by_user: dict | None = None
        self._user_to_idx: dict | None = None
        self._recipe_to_idx: dict | None = None
        self._idx_to_recipe: list | None = None
        self._user_factors = None
        self._item_factors = None
        self._item_biases = None
        self._global_mean = 0.0

    def fit(self, interactions: pd.DataFrame) -> "MatrixFactorizationCF":
        """Train on a DataFrame with columns [user_id, recipe_id, rating]."""
        interactions = interactions.copy()
        interactions["user_id"] = interactions["user_id"].astype(str)
        interactions["recipe_id"] = interactions["recipe_id"].astype(str)

        self._all_recipes = interactions["recipe_id"].unique()
        self._rated_by_user = (
            interactions.groupby("user_id")["recipe_id"].apply(set).to_dict()
        )

        if self.backend == "sklearn":
            return self._fit_sklearn(interactions)

        reader = Reader(rating_scale=self.rating_scale)
        data = Dataset.load_from_df(
            interactions[["user_id", "recipe_id", "rating"]], reader
        ).build_full_trainset()

        self.model = SVD(
            n_factors=self.n_factors,
            n_epochs=self.n_epochs,
            lr_all=self.lr_all,
            reg_all=self.reg_all,
            biased=True,
            random_state=self.random_state,
        )
        self.model.fit(data)
        self.trainset = data

        return self

    def _fit_sklearn(self, interactions: pd.DataFrame) -> "MatrixFactorizationCF":
        """Fallback matrix factorization using scipy sparse matrices + TruncatedSVD."""
        user_ids = interactions["user_id"].drop_duplicates().tolist()
        recipe_ids = interactions["recipe_id"].drop_duplicates().tolist()

        self._user_to_idx = {user_id: idx for idx, user_id in enumerate(user_ids)}
        self._recipe_to_idx = {recipe_id: idx for idx, recipe_id in enumerate(recipe_ids)}
        self._idx_to_recipe = recipe_ids

        rows = interactions["user_id"].map(self._user_to_idx).to_numpy()
        cols = interactions["recipe_id"].map(self._recipe_to_idx).to_numpy()
        ratings = interactions["rating"].astype(float).to_numpy()
        matrix = csr_matrix((ratings, (rows, cols)), shape=(len(user_ids), len(recipe_ids)))

        max_components = max(1, min(matrix.shape) - 1)
        n_components = min(self.n_factors, max_components)

        self.model = TruncatedSVD(n_components=n_components, random_state=self.random_state)
        self._user_factors = self.model.fit_transform(matrix)
        self._item_factors = self.model.components_.T
        self._global_mean = float(ratings.mean()) if len(ratings) else 0.0

        item_sums = np.asarray(matrix.sum(axis=0)).ravel()
        item_counts = np.diff(matrix.tocsc().indptr)
        item_means = np.divide(
            item_sums,
            item_counts,
            out=np.full_like(item_sums, self._global_mean, dtype=float),
            where=item_counts > 0,
        )
        self._item_biases = item_means - self._global_mean
        return self

    def save_item_factor_artifact(self, artifact_path: str | Path) -> None:
        """Save the learned recipe/item factors for fast no-retrain recommendations."""
        if self.model is None:
            raise ValueError("Model must be fitted before saving item factors.")

        artifact_path = Path(artifact_path)
        artifact_path.parent.mkdir(parents=True, exist_ok=True)

        if self.backend == "surprise":
            recipe_ids = np.array(
                [str(self.trainset.to_raw_iid(inner_id)) for inner_id in range(self.trainset.n_items)],
                dtype=object,
            )
            item_factors = self.model.qi
            item_biases = self.model.bi
            global_mean = self.trainset.global_mean
        else:
            recipe_ids = np.array([str(recipe_id) for recipe_id in self._idx_to_recipe], dtype=object)
            item_factors = self._item_factors
            item_biases = self._item_biases
            global_mean = self._global_mean

        np.savez_compressed(
            artifact_path,
            recipe_ids=recipe_ids,
            item_factors=item_factors,
            item_biases=item_biases,
            global_mean=np.array([global_mean], dtype=np.float64),
            n_factors=np.array([self.n_factors], dtype=np.int64),
            backend=np.array([self.backend], dtype=object),
        )

    def predict(self, user_id, recipe_id) -> float:
        if self.backend == "surprise":
            return float(self.model.predict(user_id, recipe_id).est)

        user_idx = self._user_to_idx.get(str(user_id)) if self._user_to_idx else None
        recipe_idx = self._recipe_to_idx.get(str(recipe_id)) if self._recipe_to_idx else None
        if recipe_idx is None:
            return float(self._global_mean)

        score = self._global_mean + float(self._item_biases[recipe_idx])
        if user_idx is not None:
            score += float(self._user_factors[user_idx].dot(self._item_factors[recipe_idx]))

        low, high = self.rating_scale
        return float(np.clip(score, low, high))

    def recommend(self, user_id, k: int = 10) -> pd.Series:
        rated = self._rated_by_user.get(user_id, set())
        candidates = [r for r in self._all_recipes if r not in rated]
        scored = [(r, self.predict(user_id, r)) for r in candidates]
        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[:k]
        return pd.Series({r: s for r, s in top}, dtype=float)
