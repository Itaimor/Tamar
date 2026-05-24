"""
Fast no-retrain recommendations from a saved CF item-factor artifact.

This script uses the item vectors learned by recommend_batch.py. It does not
train SVD. For a target app user, it reads their latest interactions, builds a
temporary user vector as a weighted average of the learned recipe vectors they
interacted with, scores the catalog, and upserts top recommendations.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd

sys.path.append(str(Path(__file__).resolve().parent))

try:
    from supabase import Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv")
    sys.exit(1)

from recommender_common import (
    get_artifact_bucket,
    get_artifact_storage_path,
    load_supabase_client,
    process_interactions_to_ratings,
)

ARTIFACT_PATH = Path(__file__).resolve().parent / "artifacts" / "cf_item_factors.npz"


def artifact_cache_ttl_seconds() -> int:
    return int(os.getenv("RECOMMENDER_ARTIFACT_CACHE_TTL_SECONDS", "600"))


def is_artifact_cache_fresh(artifact_path: Path = ARTIFACT_PATH) -> bool:
    if not artifact_path.exists():
        return False

    modified_at = datetime.fromtimestamp(artifact_path.stat().st_mtime, tz=timezone.utc)
    return datetime.now(timezone.utc) - modified_at < timedelta(seconds=artifact_cache_ttl_seconds())


def download_artifact_from_storage(
    supabase: Client,
    artifact_path: Path = ARTIFACT_PATH,
    force: bool = False,
) -> bool:
    if not force and is_artifact_cache_fresh(artifact_path):
        return True

    artifact_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        data = supabase.storage.from_(get_artifact_bucket()).download(get_artifact_storage_path())
        artifact_path.write_bytes(data)
        return True
    except Exception as e:
        print(f"[Warning] Failed to download CF artifact from Supabase Storage: {e}")
        return False


def load_cf_artifact(artifact_path: Path = ARTIFACT_PATH) -> dict:
    if not artifact_path.exists():
        raise FileNotFoundError(
            f"CF artifact not found at {artifact_path}. Run recommend_batch.py once to train and save it."
        )

    artifact = np.load(artifact_path, allow_pickle=True)
    recipe_ids = artifact["recipe_ids"].astype(str)
    item_factors = artifact["item_factors"].astype(float)
    item_biases = artifact["item_biases"].astype(float)
    global_mean = float(artifact["global_mean"][0])

    return {
        "recipe_ids": recipe_ids,
        "item_factors": item_factors,
        "item_biases": item_biases,
        "global_mean": global_mean,
        "recipe_index": {recipe_id: idx for idx, recipe_id in enumerate(recipe_ids)},
    }


def fetch_user_interactions(supabase: Client, user_id: str) -> pd.DataFrame:
    response = (
        supabase.table("recipe_interactions")
        .select("user_id, recipe_id, interaction_type")
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        return pd.DataFrame(columns=["user_id", "recipe_id", "interaction_type"])

    return pd.DataFrame(response.data)


def get_excluded_recipe_ids(raw_interactions: pd.DataFrame) -> set[str]:
    """Recipes that should be removed from Curated because the user intentionally kept them."""
    if raw_interactions.empty:
        return set()

    excluded_types = {"liked", "saved", "save"}
    return {
        str(row["recipe_id"])
        for _, row in raw_interactions.iterrows()
        if str(row["interaction_type"]).lower() in excluded_types
    }


def build_user_vector(user_ratings: pd.DataFrame, artifact: dict) -> Optional[np.ndarray]:
    recipe_index = artifact["recipe_index"]
    item_factors = artifact["item_factors"]

    weighted_vectors = []
    weights = []

    for _, row in user_ratings.iterrows():
        recipe_id = str(row["recipe_id"])

        idx = recipe_index.get(recipe_id)
        if idx is None:
            continue

        rating = float(row["rating"])
        if rating <= 0:
            continue

        weights.append(rating)
        weighted_vectors.append(item_factors[idx] * rating)

    if not weighted_vectors or not weights:
        return None

    return np.sum(weighted_vectors, axis=0) / np.sum(weights)


def recommend_for_user(user_id: str, k: int = 6, upload: bool = True) -> list[tuple[str, float]]:
    supabase = load_supabase_client()
    download_artifact_from_storage(supabase)
    artifact = load_cf_artifact()

    raw_interactions = fetch_user_interactions(supabase, user_id)
    user_ratings = process_interactions_to_ratings(raw_interactions)
    user_vector = build_user_vector(user_ratings, artifact)
    excluded_recipe_ids = get_excluded_recipe_ids(raw_interactions)

    recipe_ids = artifact["recipe_ids"]
    item_factors = artifact["item_factors"]
    item_biases = artifact["item_biases"]
    global_mean = artifact["global_mean"]

    if user_vector is None:
        scores = global_mean + item_biases
    else:
        scores = global_mean + item_biases + item_factors.dot(user_vector)

    ranked_indices = np.argsort(scores)[::-1]
    recommendations: list[tuple[str, float]] = []

    for idx in ranked_indices:
        recipe_id = str(recipe_ids[idx])
        if recipe_id in excluded_recipe_ids:
            continue

        recommendations.append((recipe_id, float(scores[idx])))
        if len(recommendations) == k:
            break

    if upload and recommendations:
        raw_scores = np.array([score for _, score in recommendations], dtype=float)
        if raw_scores.max() > raw_scores.min():
            match_scores = ((raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min()) * 0.2 + 0.78).tolist()
        else:
            match_scores = [0.9] * len(recommendations)

        supabase.table("user_recommendations").upsert({
            "user_id": user_id,
            "recommended_recipe_ids": [recipe_id for recipe_id, _ in recommendations],
            "match_scores": match_scores,
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

    return recommendations


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CF recommendations for one user without retraining.")
    parser.add_argument("user_id", help="Supabase auth/profile UUID")
    parser.add_argument("--k", type=int, default=6, help="Number of recommendations to generate")
    parser.add_argument("--no-upload", action="store_true", help="Print recommendations without writing Supabase")
    args = parser.parse_args()

    recommendations = recommend_for_user(args.user_id, k=args.k, upload=not args.no_upload)
    for recipe_id, score in recommendations:
        print(f"{recipe_id}\t{score:.4f}")


if __name__ == "__main__":
    main()
