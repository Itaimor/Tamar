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


# ---------------------------------------------------------------------------
# Homepage category predicates.
#
# Each homepage row (besides "Curated for You") corresponds to one category.
# A recipe is "eligible" for a category if the predicate below returns True.
# The recommender then personalizes within each category using the same CF
# scores it already computes for Curated.
#
# Predicates operate on a single recipe-row dict as returned from Supabase
# `recipes.select("id, minutes, nutrition, ingredients")`. Missing fields
# count as not-eligible (the predicate returns False) so we never crash on
# partially populated rows.
# ---------------------------------------------------------------------------

# Maximum cooking time in minutes for "Quick & Satisfying".
QUICK_MINUTES_THRESHOLD = 30

# Thresholds for "Healthy & Mindful" applied against the nutrition[] array,
# which Supabase stores in this order:
#   [calories, total_fat, sugar, sodium, protein, sat_fat, carbs]
HEALTHY_CALORIES_THRESHOLD = 400.0
HEALTHY_FAT_THRESHOLD = 20.0

# Ingredient keywords that mark a recipe as "Bursting with Flavor".
# Plain substring match against the lower-cased ingredients text.
# Keep tokens specific enough to avoid false positives (e.g. "ginger" yes,
# generic words like "sweet" no).
FLAVOR_INGREDIENT_KEYWORDS = frozenset({
    "chili", "chilli", "chile",
    "ginger", "lemongrass",
    "lemon", "lime",
    "curry", "harissa", "sriracha", "wasabi", "tabasco",
    "paprika", "cinnamon", "cardamom", "cumin", "turmeric", "saffron",
    "cilantro", "coriander", "basil", "mint",
    "soy sauce", "fish sauce", "miso",
    "vinegar",
})


def is_quick(recipe: dict) -> bool:
    """True if the recipe takes less than QUICK_MINUTES_THRESHOLD minutes."""
    minutes = recipe.get("minutes")
    if minutes is None:
        return False
    try:
        return int(minutes) < QUICK_MINUTES_THRESHOLD
    except (TypeError, ValueError):
        return False


def is_healthy(recipe: dict) -> bool:
    """True if calories and total fat are both below the configured thresholds."""
    nutrition = recipe.get("nutrition")
    if not nutrition or len(nutrition) < 2:
        return False
    try:
        calories = float(nutrition[0])
        fat = float(nutrition[1])
    except (TypeError, ValueError):
        return False
    return calories < HEALTHY_CALORIES_THRESHOLD and fat < HEALTHY_FAT_THRESHOLD


def is_flavorful(recipe: dict) -> bool:
    """True if any ingredient contains a FLAVOR_INGREDIENT_KEYWORDS substring."""
    ingredients = recipe.get("ingredients")
    if not ingredients:
        return False
    text = " ".join(str(item).lower() for item in ingredients)
    return any(keyword in text for keyword in FLAVOR_INGREDIENT_KEYWORDS)


# Predicate-driven category names, in the order the algorithm walks them
# during greedy cross-category dedup. "curated" and "trending" do not use a
# recipe predicate — Curated takes the unconstrained CF top, Trending takes a
# global popularity ranking — but they participate in the same dedup pass.
CATEGORY_PREDICATES = {
    "flavor": is_flavorful,
    "healthy": is_healthy,
    "quick": is_quick,
}

# Order matters: a recipe assigned to an earlier category will not reappear
# in a later one. Keep Curated first so personalization wins, Trending second
# so the "what's hot" row is dense even when categories are picky.
CATEGORY_ORDER = ("curated", "trending", "flavor", "healthy", "quick")
