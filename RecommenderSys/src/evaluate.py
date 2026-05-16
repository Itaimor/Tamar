"""Evaluation: RMSE and Precision@K to compare CF methods.

RMSE is the same metric used in the Netflix Prize (slide 28).
Precision@K answers: of the top-K recommendations, how many did the user like?
"""
import numpy as np
import pandas as pd
from sklearn.metrics import mean_squared_error


def rmse(y_true, y_pred) -> float:
    """Root Mean Squared Error, ignoring NaN predictions."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = ~np.isnan(y_pred)
    if mask.sum() == 0:
        return float("nan")
    return float(np.sqrt(mean_squared_error(y_true[mask], y_pred[mask])))


def evaluate_rmse(model, test_df: pd.DataFrame, sample_size: int = 2_000,
                  random_state: int = 0) -> float:
    """Sample `sample_size` rows from test_df and compute RMSE."""
    sample = test_df.sample(min(sample_size, len(test_df)), random_state=random_state)
    preds = [model.predict(u, r) for u, r in zip(sample["user_id"], sample["recipe_id"])]
    return rmse(sample["rating"].values, preds)


def precision_at_k(
    model,
    test_df: pd.DataFrame,
    candidate_recipes,
    k: int = 10,
    liked_threshold: float = 4.0,
    n_users: int = 100,
    random_state: int = 0,
) -> float:
    """Average precision@k across a sample of test users."""
    liked = (
        test_df[test_df["rating"] >= liked_threshold]
        .groupby("user_id")["recipe_id"]
        .apply(set)
    )
    eligible = liked.index
    sample_users = pd.Series(eligible).sample(
        min(n_users, len(eligible)), random_state=random_state
    )

    candidate_recipes = list(candidate_recipes)
    scores = []
    for u in sample_users:
        ranked = sorted(
            ((r, model.predict(u, r)) for r in candidate_recipes),
            key=lambda x: (np.nan_to_num(x[1], nan=-np.inf)),
            reverse=True,
        )
        top_k = {r for r, _ in ranked[:k]}
        hits = len(top_k & liked[u])
        scores.append(hits / k)
    return float(np.mean(scores)) if scores else float("nan")


def compare_methods(
    models: dict,
    test_df: pd.DataFrame,
    candidate_recipes,
    rmse_sample: int = 2_000,
    precision_users: int = 100,
    k: int = 10,
) -> pd.DataFrame:
    """Return a comparison table: model name -> RMSE, Precision@K."""
    rows = {}
    for name, model in models.items():
        print(f"  evaluating {name}...")
        rows[name] = {
            "RMSE": evaluate_rmse(model, test_df, sample_size=rmse_sample),
            f"Precision@{k}": precision_at_k(
                model, test_df, candidate_recipes,
                k=k, n_users=precision_users,
            ),
        }
    return pd.DataFrame(rows).T.sort_values("RMSE")
