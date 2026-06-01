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
    FLAVOR_SEED_KEYWORDS,
    get_artifact_bucket,
    get_artifact_storage_path,
    is_flavorful,
    is_healthy,
    is_quick,
    load_supabase_client,
    normalize_match_scores,
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


# ---------------------------------------------------------------------------
# Category recommendation helpers.
#
# In addition to the personalized "Curated for You" list, the homepage shows
# four category rows: Trending in Your Area, Bursting with Flavor, Healthy &
# Mindful, Quick & Satisfying. Each row is filled by `recommend_for_user`
# below from a single CF pass plus light per-category logic:
#
#   - Curated:  unconstrained CF top-k.
#   - Trending: global popularity in `recipe_interactions` (positive types
#               only) over the last week, dedup-ed against earlier rows.
#   - Flavor:   currently disabled — left as NULL while the team decides
#               between a keyword predicate and embedding-based ranking.
#   - Healthy:  CF top-k restricted to recipes passing `is_healthy`.
#   - Quick:    CF top-k restricted to recipes passing `is_quick`.
#
# The single greedy pass enforces "a recipe shown under one heading does not
# appear under another": once a recipe is assigned to row N, it is added to
# `assigned` and skipped by all later rows. The walk order (defined here) is
# Curated -> Trending -> Healthy -> Quick. Curated wins ties because it is
# the most personalized signal we have.
# ---------------------------------------------------------------------------

TRENDING_LOOKBACK_DAYS = 7
TRENDING_FETCH_LIMIT = 200  # over-fetch from the popularity ranking to leave room for dedup
TRENDING_POSITIVE_TYPES = ["liked", "saved", "started", "completed"]

# Module-level cache for the recipes-metadata pull. The recipes table has
# ~100k rows and we only need the small projection (id, minutes, nutrition).
# TTL matches the artifact cache by default; override with an env var.
_RECIPES_META_CACHE: dict = {"data": None, "loaded_at": None}


def recipes_meta_cache_ttl_seconds() -> int:
    return int(os.getenv("RECOMMENDER_RECIPES_META_TTL_SECONDS", "600"))


def fetch_recipes_metadata(supabase: Client, force: bool = False) -> dict[str, dict]:
    """Return {recipe_id_str: {id, minutes, nutrition}} for every row in `recipes`.

    Used by category predicates that need recipe attributes (`is_quick`,
    `is_healthy`). Result is cached at module scope to amortize the ~100k-row
    fetch across many user refreshes.
    """
    now = datetime.now(timezone.utc)
    cached_at = _RECIPES_META_CACHE["loaded_at"]
    if (
        not force
        and cached_at is not None
        and _RECIPES_META_CACHE["data"] is not None
        and (now - cached_at).total_seconds() < recipes_meta_cache_ttl_seconds()
    ):
        return _RECIPES_META_CACHE["data"]

    rows: list[dict] = []
    page_size = int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000"))
    start = 0
    while True:
        response = (
            supabase.table("recipes")
            .select("id, minutes, nutrition, ingredients")
            .order("id")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    data = {str(row["id"]): row for row in rows}
    _RECIPES_META_CACHE["data"] = data
    _RECIPES_META_CACHE["loaded_at"] = now
    return data


def compute_trending_recipe_ids(
    supabase: Client,
    days: int = TRENDING_LOOKBACK_DAYS,
    limit: int = TRENDING_FETCH_LIMIT,
) -> list[str]:
    """Recipe ids ranked by positive interactions in the last `days` days.

    Pulled fresh per request — interactions are small and we want this row to
    reflect recent activity. We pull positive-only types (liked/saved/started/
    completed); dismissed and viewed do not promote a recipe to trending.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows: list[dict] = []
    page_size = int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000"))
    start = 0
    # Cap the scan at 50k recent interactions — well above what a small app
    # produces in a week, and prevents pathological pulls if the table grows.
    hard_cap = 50_000
    while start < hard_cap:
        response = (
            supabase.table("recipe_interactions")
            .select("recipe_id")
            .gte("created_at", cutoff)
            .in_("interaction_type", TRENDING_POSITIVE_TYPES)
            .order("created_at", desc=True)
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    if not rows:
        return []

    counts = pd.Series([str(row["recipe_id"]) for row in rows]).value_counts()
    return counts.head(limit).index.tolist()


# ---------------------------------------------------------------------------
# Bursting-with-Flavor — Route A: centroid in CF embedding space.
#
# The CF artifact already contains a 10-dim latent embedding per recipe
# (`item_factors`). The same embeddings drive Curated for You (where the
# anchor is the *user* vector built from their interactions). Here we build
# a different anchor: the average embedding of a small set of seed recipes
# whose ingredients contain unambiguous bold-flavor terms (harissa, sriracha,
# gochujang, ...). The Flavor row is then the recipes whose embeddings are
# closest (cosine) to that centroid, with greedy dedup against the other rows.
#
# This trades two assumptions:
#   1. The seed keywords are precise enough that the centroid points in a
#      meaningful direction in latent space (50-200 seeds smooth out noise).
#   2. CF "users-who-liked-X-also-liked-Y" similarity correlates with flavor
#      similarity. Empirically: yes, because people who like one curry tend
#      to like other curries.
#
# Honest framing: this is not literal flavor-from-text; it is latent
# co-preference similarity anchored on a flavor seed set. Strong tradeoff
# against running a sentence-transformer model on 100k recipes.
# ---------------------------------------------------------------------------

# Cached at module scope. The centroid depends on the artifact's recipe_index
# and the cached recipes_meta; we tie its freshness to the metadata TTL so
# new catalog rows can join the seed pool when they appear.
_FLAVOR_CENTROID_CACHE: dict = {"centroid": None, "computed_at": None, "n_seeds": 0}


def identify_flavor_seed_ids(recipes_meta: dict, keywords: frozenset[str]) -> list[str]:
    """Recipe ids whose ingredients contain any seed keyword.

    Substring match against the lower-cased, space-joined ingredients text —
    same matching rule as `is_flavorful`, but called with a tighter keyword
    set so the resulting centroid is anchored on high-precision exemplars.
    """
    seeds: list[str] = []
    for rid, meta in recipes_meta.items():
        ingredients = meta.get("ingredients") or []
        if not ingredients:
            continue
        text = " ".join(str(item).lower() for item in ingredients)
        if any(kw in text for kw in keywords):
            seeds.append(rid)
    return seeds


def compute_flavor_centroid(
    seed_ids: list[str],
    recipe_index: dict,
    item_factors: np.ndarray,
) -> Optional[np.ndarray]:
    """Average the CF embeddings of the seed recipes.

    Returns a single 10-dim vector that serves as the "flavor anchor" in
    latent space. Returns None if no seed recipes overlap the artifact's
    catalog — caller should treat that as "no Flavor row available".
    """
    vectors: list[np.ndarray] = []
    for sid in seed_ids:
        idx = recipe_index.get(sid)
        if idx is not None:
            vectors.append(item_factors[idx])
    if not vectors:
        return None
    return np.mean(np.array(vectors), axis=0)


def compute_flavor_scores(
    centroid: np.ndarray,
    item_factors: np.ndarray,
    recipe_ids: np.ndarray,
) -> dict[str, float]:
    """Cosine similarity from each recipe embedding to the flavor centroid.

    Vectorized over the whole catalog (100k recipes -> microseconds). Returns
    {recipe_id_str: similarity} for every recipe in the artifact.
    """
    centroid_norm = float(np.linalg.norm(centroid))
    if centroid_norm < 1e-9:
        return {}
    item_norms = np.linalg.norm(item_factors, axis=1)
    # Clamp zero-norm vectors so the division is safe; affected recipes get
    # similarity ~0 which pushes them out of the top-K anyway.
    safe_norms = np.where(item_norms < 1e-9, 1e-9, item_norms)
    sims = (item_factors @ centroid) / (safe_norms * centroid_norm)
    return {str(rid): float(sims[i]) for i, rid in enumerate(recipe_ids)}


def get_flavor_artifact(
    recipes_meta: dict,
    artifact: dict,
    force: bool = False,
) -> tuple[Optional[np.ndarray], dict[str, float]]:
    """Return (centroid, scores_by_id) for the Flavor row, cached across calls.

    The centroid is invariant per artifact+catalog so we cache both it and
    the full scores map. TTL matches the recipes-metadata cache.
    """
    now = datetime.now(timezone.utc)
    cached_at = _FLAVOR_CENTROID_CACHE["computed_at"]
    if (
        not force
        and _FLAVOR_CENTROID_CACHE["centroid"] is not None
        and cached_at is not None
        and (now - cached_at).total_seconds() < recipes_meta_cache_ttl_seconds()
    ):
        return _FLAVOR_CENTROID_CACHE["centroid"], _FLAVOR_CENTROID_CACHE["scores"]

    seed_ids = identify_flavor_seed_ids(recipes_meta, FLAVOR_SEED_KEYWORDS)
    centroid = compute_flavor_centroid(seed_ids, artifact["recipe_index"], artifact["item_factors"])
    scores: dict[str, float] = {}
    if centroid is not None:
        scores = compute_flavor_scores(centroid, artifact["item_factors"], artifact["recipe_ids"])

    _FLAVOR_CENTROID_CACHE["centroid"] = centroid
    _FLAVOR_CENTROID_CACHE["scores"] = scores
    _FLAVOR_CENTROID_CACHE["computed_at"] = now
    _FLAVOR_CENTROID_CACHE["n_seeds"] = len(seed_ids)
    print(
        f"[Info] Built flavor centroid from {len(seed_ids):,} seed recipes "
        f"({sum(1 for sid in seed_ids if sid in artifact['recipe_index'])} matched artifact)."
    )
    return centroid, scores


def recommend_for_user(user_id: str, k: int = 6, upload: bool = True) -> list[tuple[str, float]]:
    """Compute Curated + Trending + Healthy + Quick recommendations and upsert all of them.

    Returns the Curated list (for backwards compatibility with the FastAPI
    `recommender_service` response shape). The other category lists are
    written into the same `user_recommendations` row and read directly by
    the homepage.

    Note: the "Bursting with Flavor" column is intentionally left as NULL
    until the team picks an approach (keyword predicate vs CF-factor
    embedding centroid vs sentence-transformer embeddings).
    """
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

    # CF score for every recipe in the artifact, then descending order.
    if user_vector is None:
        scores = global_mean + item_biases
    else:
        scores = global_mean + item_biases + item_factors.dot(user_vector)

    ranked_indices = np.argsort(scores)[::-1]
    cf_ranked_ids = [str(recipe_ids[idx]) for idx in ranked_indices]
    score_by_id = {str(recipe_ids[i]): float(scores[i]) for i in range(len(recipe_ids))}

    # Auxiliary signals for the category rows.
    # Both fetches tolerate empty results — categories simply come up short
    # in that case; the upsert still goes through and the row is consistent.
    try:
        recipes_meta = fetch_recipes_metadata(supabase)
    except Exception as exc:
        print(f"[Warning] Failed to fetch recipes metadata for category predicates: {exc}")
        recipes_meta = {}

    try:
        trending_ranked_ids = compute_trending_recipe_ids(supabase)
    except Exception as exc:
        print(f"[Warning] Failed to compute trending recipes: {exc}")
        trending_ranked_ids = []

    # Flavor centroid in CF embedding space (Route A). Cached at module scope;
    # returns ({}, None) on first call when no seeds match the artifact, which
    # leaves the Flavor row empty and the frontend falls back to its placeholder.
    try:
        _flavor_centroid, flavor_scores_by_id = get_flavor_artifact(recipes_meta, artifact)
    except Exception as exc:
        print(f"[Warning] Failed to build flavor centroid: {exc}")
        flavor_scores_by_id = {}

    # Greedy cross-category dedup. `assigned` starts populated with recipes
    # the user has already saved/liked (the existing exclusion rule) so they
    # are not surfaced in any row.
    assigned: set[str] = set(excluded_recipe_ids)

    def take(source_ids, predicate, count, score_lookup=None) -> list[tuple[str, float]]:
        """Pick up to `count` recipes from `source_ids` (already in priority order)
        skipping anything in `assigned` and anything failing `predicate`.

        `predicate=None` means no constraint. `score_lookup` defaults to the
        per-user CF scores; categories that want a different display score
        (Flavor uses cosine-to-centroid) pass their own map. Each picked
        recipe is added to `assigned` so later category passes can't reuse it.
        """
        lookup = score_lookup if score_lookup is not None else score_by_id
        picked: list[tuple[str, float]] = []
        for rid in source_ids:
            if rid in assigned:
                continue
            if predicate is not None:
                meta = recipes_meta.get(rid)
                if meta is None or not predicate(meta):
                    continue
            picked.append((rid, float(lookup.get(rid, global_mean))))
            assigned.add(rid)
            if len(picked) == count:
                break
        return picked

    # Walk order matches CATEGORY_ORDER from recommender_common:
    #   curated -> trending -> flavor -> healthy -> quick
    # Curated wins ties because it is the most personalized; Trending second
    # so the popularity row stays dense; Flavor third because its source is
    # *not* the CF ranking (it uses cosine-to-centroid) and we want it to
    # claim its best matches before the predicate-filtered rows narrow the
    # remaining pool.
    curated = take(cf_ranked_ids, predicate=None, count=k)

    # Trending walks the global-popularity ranking first and falls back to
    # CF-ranked recipes if popularity is sparse (new install with few
    # interactions). dict.fromkeys preserves order while deduping the two
    # lists, so the fallback never re-iterates a recipe trending already saw.
    trending_source = list(dict.fromkeys(trending_ranked_ids + cf_ranked_ids))
    trending = take(trending_source, predicate=None, count=k)

    # Flavor: hybrid approach combining two signals.
    #
    #   - Ranking by cosine similarity to the seed-recipe centroid (semantic
    #     generalization in latent CF space — captures "this recipe is liked
    #     by the same people who like harissa/curry/sriracha dishes").
    #   - Filtered by `is_flavorful` so the recipe must also contain at least
    #     one ingredient from the broader flavor keyword list (literal floor
    #     of flavor signal — prevents the centroid from surfacing comfort
    #     food just because it happens to be popular).
    #
    # The displayed match score still comes from the cosine map so the row's
    # internal ordering reflects centroid similarity, not CF taste match.
    flavor_ranked_ids = sorted(
        flavor_scores_by_id.keys(),
        key=lambda rid: flavor_scores_by_id[rid],
        reverse=True,
    )
    flavor = take(
        flavor_ranked_ids,
        predicate=is_flavorful,
        count=k,
        score_lookup=flavor_scores_by_id,
    )

    healthy = take(cf_ranked_ids, predicate=is_healthy, count=k)
    quick = take(cf_ranked_ids, predicate=is_quick, count=k)

    if upload:
        payload = {
            "user_id": user_id,
            "recommended_recipe_ids": [rid for rid, _ in curated],
            "match_scores": normalize_match_scores([s for _, s in curated]),
            "trending_recipe_ids": [rid for rid, _ in trending],
            "trending_match_scores": normalize_match_scores([s for _, s in trending]),
            "flavor_recipe_ids": [rid for rid, _ in flavor],
            "flavor_match_scores": normalize_match_scores([s for _, s in flavor]),
            "healthy_recipe_ids": [rid for rid, _ in healthy],
            "healthy_match_scores": normalize_match_scores([s for _, s in healthy]),
            "quick_recipe_ids": [rid for rid, _ in quick],
            "quick_match_scores": normalize_match_scores([s for _, s in quick]),
            "updated_at": datetime.utcnow().isoformat(),
        }
        supabase.table("user_recommendations").upsert(payload).execute()

    return curated


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
