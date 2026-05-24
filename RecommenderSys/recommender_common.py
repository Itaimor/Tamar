import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv")
    sys.exit(1)


RECIPE_CATALOG = [str(i) for i in range(1, 31)]
ARTIFACT_PATH = Path(__file__).resolve().parent / "artifacts" / "cf_item_factors.npz"

INTERACTION_WEIGHTS = {
    "viewed": 1.5,
    "started": 3.5,
    "liked": 4.5,
    "saved": 5.0,
    "completed": 5.0,
    "dismissed": 0.0,
}


def get_artifact_bucket() -> str:
    return os.getenv("SUPABASE_RECOMMENDER_BUCKET", "recommender-artifacts")


def get_artifact_storage_path() -> str:
    return os.getenv("SUPABASE_RECOMMENDER_ARTIFACT", "cf_item_factors.npz")


def load_supabase_client() -> Client:
    """Load configuration from root .env and return a Supabase Client."""
    root_dir = Path(__file__).resolve().parent.parent
    env_paths = [root_dir / ".env", root_dir / ".env.local"]

    loaded_env = False
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
            loaded_env = True

    if not loaded_env:
        load_dotenv()

    url = os.getenv("VITE_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )

    if not url or not key:
        print("[Error] Supabase credentials missing in .env file.")
        print("Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.")
        sys.exit(1)

    return create_client(url, key)


def process_interactions_to_ratings(interactions_df: pd.DataFrame) -> pd.DataFrame:
    """Maps categorical interactions to numeric rating values and aggregates duplicates."""
    if interactions_df.empty:
        return pd.DataFrame(columns=["user_id", "recipe_id", "rating"])

    interactions_df["weight"] = interactions_df["interaction_type"].map(INTERACTION_WEIGHTS).fillna(1.0)
    ratings_df = interactions_df.groupby(["user_id", "recipe_id"])["weight"].max().reset_index()
    ratings_df.columns = ["user_id", "recipe_id", "rating"]

    return ratings_df


def normalize_match_scores(scores: list[float]) -> list[float]:
    """Map raw CF scores into a display-friendly 0.78-0.98 confidence band."""
    if not scores:
        return []

    arr = np.array(scores, dtype=float)
    if arr.max() == arr.min():
        return [0.9] * len(scores)

    normalized = (arr - arr.min()) / (arr.max() - arr.min())
    return (normalized * 0.2 + 0.78).tolist()
