"""Matrix Factorization CF using Surprise's SVD (Rubi's workshop slides 84-94).

Decompose the User × Recipe matrix into latent matrices U (users × k) and
V (recipes × k). A rating is approximated by the dot product of the user's
and the recipe's latent vectors, plus bias terms (the Netflix-prize trick).
"""
import pandas as pd
from surprise import SVD, Dataset, Reader


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
        self.model: SVD | None = None
        self._all_recipes = None
        self._rated_by_user: dict | None = None

    def fit(self, interactions: pd.DataFrame) -> "MatrixFactorizationCF":
        """Train on a DataFrame with columns [user_id, recipe_id, rating]."""
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

        self._all_recipes = interactions["recipe_id"].unique()
        self._rated_by_user = (
            interactions.groupby("user_id")["recipe_id"].apply(set).to_dict()
        )
        return self

    def predict(self, user_id, recipe_id) -> float:
        return float(self.model.predict(user_id, recipe_id).est)

    def recommend(self, user_id, k: int = 10) -> pd.Series:
        rated = self._rated_by_user.get(user_id, set())
        candidates = [r for r in self._all_recipes if r not in rated]
        scored = [(r, self.predict(user_id, r)) for r in candidates]
        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[:k]
        return pd.Series({r: s for r, s in top}, dtype=float)
