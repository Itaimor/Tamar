"""Load Food.com dataset, subsample for tractability, build User-Item matrix.
Food.com has ~1.1M ratings over ~230K recipes. Full matrix is too sparse and
too big for a laptop. We keep the most-reviewed recipes and the most-active
users so the matrix is denser and faster to work with.
"""
#TODO: it takes only 5,000 recipes, but still 1.5GB of RAM. We could try 1,000 or 500 recipes to fit in 1GB.    
from pathlib import Path
import pandas as pd

DATA_RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
DATA_PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"

#two optional parameters:
#- top_recipes: how many of the most-reviewed recipes to keep (default 5,000)
#- min_ratings_per_user: minimum number of ratings a user must have to be included (default 5)
def load_food_com(top_recipes: int = 5_000, min_ratings_per_user: int = 5):
    """Load and subsample Food.com interactions and recipes.
    Returns:
        interactions: DataFrame with columns [user_id, recipe_id, rating, ...]
        recipes: DataFrame with columns [id, name, ingredients, ...]
    """
    # Loads both raw CSV files into DataFrames. interactions has user–recipe ratings; recipes has recipe metadata (name, ingredients, etc.).
    interactions = pd.read_csv(DATA_RAW / "RAW_interactions.csv")
    recipes = pd.read_csv(DATA_RAW / "RAW_recipes.csv")
    # Picks the top_recipes (5,000) most-rated recipe IDs. .index extracts just the IDs, not the counts.
    ratings_per_recipe = interactions.groupby("recipe_id").size()
    top_ids = ratings_per_recipe.nlargest(top_recipes).index
    sub = interactions[interactions["recipe_id"].isin(top_ids)]
    # Filters the interactions table to only rows where the recipe is in that top list. Everything else is dropped.
    user_counts = sub.groupby("user_id").size()
    active_users = user_counts[user_counts >= min_ratings_per_user].index
    sub = sub[sub["user_id"].isin(active_users)].copy()

    return sub, recipes


def build_user_item_matrix(interactions: pd.DataFrame) -> pd.DataFrame:
    """Build the User × Recipe rating matrix."""
    return interactions.pivot_table(
        index="user_id",
        columns="recipe_id",
        values="rating",
        aggfunc="mean",
    )


def print_stats(interactions: pd.DataFrame) -> None:
    n_users = interactions["user_id"].nunique()
    n_recipes = interactions["recipe_id"].nunique()
    n_ratings = len(interactions)
    density = n_ratings / (n_users * n_recipes) * 100
    print(f"Users:    {n_users:>8,}")
    print(f"Recipes:  {n_recipes:>8,}")
    print(f"Ratings:  {n_ratings:>8,}")
    print(f"Density:  {density:.3f}%  (sparsity = {100 - density:.3f}%)")
