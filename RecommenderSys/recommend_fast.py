"""
Fast no-retrain recommendations from a saved CF item-factor artifact.

This script uses the user/item vectors learned by recommend_batch.py. It does
not train LightFM or SVD. For a target app user, it blends the learned batch
user representation with positive interactions written after that artifact's
training boundary, scores the candidate pool, and upserts recommendations.
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
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
from risk_scoring import (
    RerankedCandidate,
    SYMPTOM_MODEL_PATH,
    build_feature_row,
    clamp01,
    compute_recipe_ingredient_risk,
    fetch_population_priors,
    fetch_recent_user_context,
    fetch_user_ingredient_risks,
    fetch_user_restrictions,
    heuristic_symptom_risk,
    is_hard_filtered,
    load_symptom_model,
    prediction_feature_payload,
    rerank_candidates,
)

ARTIFACT_PATH = Path(__file__).resolve().parent / "artifacts" / "cf_item_factors.npz"
PREFERENCE_MODEL_NAME = os.getenv("RECOMMENDER_PREFERENCE_MODEL_NAME")
CANDIDATE_FETCH_LIMIT = int(os.getenv("RECOMMENDER_CANDIDATE_FETCH_LIMIT", "500"))
MODEL_PREDICTION_WRITE_LIMIT = int(os.getenv("RECOMMENDER_MODEL_PREDICTION_WRITE_LIMIT", "120"))
COOKBOOK_RECOMMENDATION_LIMIT = int(os.getenv("RECOMMENDER_COOKBOOK_LIMIT", "5"))
ONLINE_VECTOR_WEIGHT = float(os.getenv("RECOMMENDER_ONLINE_VECTOR_WEIGHT", "0.35"))
ONLINE_VECTOR_FULL_STRENGTH = float(
    os.getenv("RECOMMENDER_ONLINE_VECTOR_FULL_STRENGTH", "5.0")
)
ONLINE_SCORE_DELTA_LIMIT = float(
    os.getenv("RECOMMENDER_ONLINE_SCORE_DELTA_LIMIT", "1.0")
)

_RECIPES_META_CACHE: dict = {"data": None, "loaded_at": None}
_SYMPTOM_ARTIFACT_DOWNLOAD: dict = {"attempted_at": None}


def _artifact_scalar(artifact, name: str, default=None):
    if name not in artifact:
        return default
    values = artifact[name]
    if values.size == 0:
        return default
    return values.reshape(-1)[0].item() if hasattr(values.reshape(-1)[0], "item") else values.reshape(-1)[0]


def artifact_cache_ttl_seconds() -> int:
    return int(os.getenv("RECOMMENDER_ARTIFACT_CACHE_TTL_SECONDS", "600"))


def symptom_artifact_cache_ttl_seconds() -> int:
    return int(
        os.getenv(
            "RECOMMENDER_SYMPTOM_ARTIFACT_CACHE_TTL_SECONDS",
            str(artifact_cache_ttl_seconds()),
        )
    )


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
    """Refresh the CF artifact without replacing a usable cache on failure."""
    if not force and is_artifact_cache_fresh(artifact_path):
        return True

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        data = supabase.storage.from_(get_artifact_bucket()).download(get_artifact_storage_path())
        with tempfile.NamedTemporaryFile(
            prefix=f".{artifact_path.name}.",
            suffix=".download",
            dir=artifact_path.parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            temporary_file.write(data)

        # Fully parse and validate before atomically publishing the new file.
        load_cf_artifact(temporary_path, populate_metadata_cache=False)
        temporary_path.replace(artifact_path)
        return True
    except Exception as e:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
        print(f"[Warning] Failed to download CF artifact from Supabase Storage: {e}")
        return artifact_path.exists()


def download_symptom_artifact_from_storage(
    supabase: Client,
    artifact_path: Path = SYMPTOM_MODEL_PATH,
    force: bool = False,
) -> bool:
    """Refresh the optional XGBoost artifact without replacing a valid cache on error."""
    now = datetime.now(timezone.utc)
    attempted_at = _SYMPTOM_ARTIFACT_DOWNLOAD["attempted_at"]
    if not force:
        if artifact_path.exists():
            modified_at = datetime.fromtimestamp(artifact_path.stat().st_mtime, tz=timezone.utc)
            if now - modified_at < timedelta(seconds=symptom_artifact_cache_ttl_seconds()):
                return True
        if (
            attempted_at is not None
            and now - attempted_at < timedelta(seconds=symptom_artifact_cache_ttl_seconds())
        ):
            return artifact_path.exists()

    _SYMPTOM_ARTIFACT_DOWNLOAD["attempted_at"] = now
    storage_path = os.getenv(
        "SUPABASE_SYMPTOM_MODEL_ARTIFACT",
        "xgboost_symptom_model.pkl",
    ).strip()
    if not storage_path:
        return artifact_path.exists()

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        data = supabase.storage.from_(get_artifact_bucket()).download(storage_path)
        with tempfile.NamedTemporaryFile(
            prefix=f".{artifact_path.name}.",
            suffix=".download",
            dir=artifact_path.parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            temporary_file.write(data)
        if load_symptom_model(temporary_path) is None:
            raise ValueError("downloaded symptom artifact failed validation")
        temporary_path.replace(artifact_path)
        return True
    except Exception as exc:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
        print(f"[Warning] Failed to download symptom model artifact: {exc}")
        return artifact_path.exists()


def load_cf_artifact(
    artifact_path: Path = ARTIFACT_PATH,
    populate_metadata_cache: bool = True,
) -> dict:
    if not artifact_path.exists():
        raise FileNotFoundError(
            f"CF artifact not found at {artifact_path}. Run recommend_batch.py once to train and save it."
        )

    # Materialize every array while the archive is open. This is required for
    # Windows-safe atomic replacement after validating a downloaded temp file.
    with np.load(artifact_path, allow_pickle=True) as archive:
        artifact = {name: archive[name] for name in archive.files}
    recipe_ids = artifact["recipe_ids"].astype(str)
    item_factors = artifact["item_factors"].astype(float)
    item_biases = artifact["item_biases"].astype(float)
    global_mean_values = np.asarray(artifact["global_mean"], dtype=float).reshape(-1)
    if global_mean_values.size != 1:
        raise ValueError("CF artifact global_mean must contain exactly one value.")
    global_mean = float(global_mean_values[0])
    if item_factors.ndim != 2 or item_factors.shape[0] != len(recipe_ids):
        raise ValueError("CF artifact item_factors are not aligned with recipe_ids.")
    if item_biases.ndim != 1 or item_biases.shape[0] != len(recipe_ids):
        raise ValueError("CF artifact item_biases are not aligned with recipe_ids.")
    if (
        not np.isfinite(item_factors).all()
        or not np.isfinite(item_biases).all()
        or not np.isfinite(global_mean)
    ):
        raise ValueError("CF artifact contains non-finite item factors or biases.")

    artifact_version = int(_artifact_scalar(artifact, "artifact_version", 1))
    backend = str(_artifact_scalar(artifact, "backend", "unknown"))
    trained_at = _artifact_scalar(artifact, "trained_at")
    model_name = _artifact_scalar(artifact, "model_name")
    artifact_stat = artifact_path.stat()
    result = {
        "artifact_version": artifact_version,
        "backend": backend,
        "trained_at": trained_at,
        "model_name": model_name,
        "artifact_file_identity": (
            str(artifact_path.resolve()),
            artifact_stat.st_mtime_ns,
            artifact_stat.st_size,
        ),
        "recipe_ids": recipe_ids,
        "item_factors": item_factors,
        "item_biases": item_biases,
        "global_mean": global_mean,
        "recipe_index": {recipe_id: idx for idx, recipe_id in enumerate(recipe_ids)},
    }

    learned_keys = {
        "learned_user_ids",
        "learned_user_factors",
        "learned_user_biases",
    }
    present_learned_keys = learned_keys.intersection(artifact)
    requires_learned_users = backend.lower() == "lightfm" and artifact_version >= 2
    if present_learned_keys and present_learned_keys != learned_keys:
        raise ValueError(
            "CF artifact contains an incomplete learned-user representation."
        )
    if requires_learned_users and present_learned_keys != learned_keys:
        raise ValueError(
            "LightFM v2 artifact is missing its learned-user representation."
        )
    if learned_keys.issubset(artifact):
        learned_user_ids = artifact["learned_user_ids"].astype(str)
        learned_user_factors = artifact["learned_user_factors"].astype(float)
        learned_user_biases = artifact["learned_user_biases"].astype(float)
        learned_users_are_valid = (
            learned_user_factors.ndim == 2
            and learned_user_factors.shape[0] == len(learned_user_ids)
            and learned_user_factors.shape[1] == item_factors.shape[1]
            and learned_user_biases.ndim == 1
            and learned_user_biases.shape[0] == len(learned_user_ids)
            and len(set(learned_user_ids)) == len(learned_user_ids)
            and np.isfinite(learned_user_factors).all()
            and np.isfinite(learned_user_biases).all()
        )
        if not learned_users_are_valid:
            raise ValueError(
                "CF artifact learned-user factors are not aligned with user IDs "
                "and item-factor dimensions."
            )
        result.update(
            {
                "learned_user_ids": learned_user_ids,
                "learned_user_factors": learned_user_factors,
                "learned_user_biases": learned_user_biases,
                "learned_user_index": {
                    user_id: index
                    for index, user_id in enumerate(learned_user_ids)
                },
            }
        )
    if requires_learned_users and (not trained_at or not model_name):
        raise ValueError(
            "LightFM v2 artifact is missing trained_at or model_name metadata."
        )

    # Load precomputed flavor centroid if present
    if "flavor_centroid" in artifact:
        result["flavor_centroid"] = artifact["flavor_centroid"].astype(float)

    # Load recipe metadata if present and populate in-memory cache
    if "meta_recipe_ids" in artifact:
        try:
            meta_ids = artifact["meta_recipe_ids"].astype(str)
            meta_minutes = artifact["meta_minutes"]
            meta_nutrition = artifact["meta_nutrition"]
            meta_ingredients = artifact["meta_ingredients"]
            meta_names = (
                artifact["meta_names"].astype(str)
                if "meta_names" in artifact
                else np.array([""] * len(meta_ids), dtype=object)
            )
            meta_n_steps = (
                artifact["meta_n_steps"]
                if "meta_n_steps" in artifact
                else np.zeros(len(meta_ids), dtype=np.int32)
            )
            meta_n_ingredients = (
                artifact["meta_n_ingredients"]
                if "meta_n_ingredients" in artifact
                else np.array(
                    [
                        len(value.split("|")) if isinstance(value, str) and value else 0
                        for value in meta_ingredients
                    ],
                    dtype=np.int32,
                )
            )
            meta_is_ibs_friendly = (
                artifact["meta_is_ibs_friendly"]
                if "meta_is_ibs_friendly" in artifact
                else np.full(len(meta_ids), -1, dtype=np.int8)
            )
            meta_minutes_present = (
                artifact["meta_minutes_present"]
                if "meta_minutes_present" in artifact
                else np.ones(len(meta_ids), dtype=np.int8)
            )
            meta_n_steps_present = (
                artifact["meta_n_steps_present"]
                if "meta_n_steps_present" in artifact
                else np.ones(len(meta_ids), dtype=np.int8)
            )
            meta_n_ingredients_present = (
                artifact["meta_n_ingredients_present"]
                if "meta_n_ingredients_present" in artifact
                else np.ones(len(meta_ids), dtype=np.int8)
            )
            meta_nutrition_present = (
                artifact["meta_nutrition_present"]
                if "meta_nutrition_present" in artifact
                else np.ones(len(meta_ids), dtype=np.int8)
            )
            meta_ingredients_present = (
                artifact["meta_ingredients_present"]
                if "meta_ingredients_present" in artifact
                else np.ones(len(meta_ids), dtype=np.int8)
            )

            recipes_meta = {}
            for i, rid in enumerate(meta_ids):
                ing_str = meta_ingredients[i]
                ingredients = (
                    ing_str.split("|")
                    if int(meta_ingredients_present[i]) > 0
                    and isinstance(ing_str, str)
                    and ing_str
                    else []
                )
                recipe_meta = {
                    "id": int(rid) if rid.isdigit() else rid,
                    "name": str(meta_names[i]),
                    "ingredients": ingredients
                }
                if int(meta_minutes_present[i]) > 0:
                    recipe_meta["minutes"] = int(meta_minutes[i])
                if int(meta_n_steps_present[i]) > 0:
                    recipe_meta["n_steps"] = int(meta_n_steps[i])
                if int(meta_n_ingredients_present[i]) > 0:
                    recipe_meta["n_ingredients"] = int(meta_n_ingredients[i])
                if int(meta_nutrition_present[i]) > 0:
                    recipe_meta["nutrition"] = [
                        float(value)
                        for value in meta_nutrition[i]
                    ]
                if int(meta_is_ibs_friendly[i]) >= 0:
                    recipe_meta["is_ibs_friendly"] = bool(meta_is_ibs_friendly[i])
                recipes_meta[rid] = recipe_meta

            if populate_metadata_cache:
                _RECIPES_META_CACHE["data"] = recipes_meta
                _RECIPES_META_CACHE["loaded_at"] = datetime.now(timezone.utc)
                print(
                    f"[Info] Loaded {len(recipes_meta):,} recipe metadata "
                    "items from local CF artifact."
                )
        except Exception as exc:
            print(f"[Warning] Failed to parse metadata from CF artifact: {exc}")

    return result


def fetch_user_interactions(supabase: Client, user_id: str) -> pd.DataFrame:
    """Fetch the user's complete interaction history without row-cap truncation."""
    rows: list[dict] = []
    page_size = max(1, int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000")))
    start = 0
    while True:
        response = (
            supabase.table("recipe_interactions")
            .select("id, user_id, recipe_id, interaction_type, created_at")
            .eq("user_id", user_id)
            .order("created_at")
            .order("id")
            .range(start, start + page_size - 1)
            .execute()
        )
        page = response.data or []
        if not page:
            break
        rows.extend(page)
        # Advance by the number actually returned. Supabase/PostgREST may cap a
        # response below the requested page size, and jumping by page_size
        # would silently skip the intervening rows.
        start += len(page)

    if not rows:
        return pd.DataFrame(
            columns=["user_id", "recipe_id", "interaction_type", "created_at"]
        )

    return pd.DataFrame(rows).drop(columns=["id"], errors="ignore")


def fetch_precomputed_candidates(
    supabase: Client,
    user_id: str,
    limit: int = CANDIDATE_FETCH_LIMIT,
    model_name: str | None = None,
) -> list[tuple[str, float]]:
    """Fetch offline preference candidates if the candidate table is populated."""
    try:
        query = (
            supabase.table("user_candidate_recipes")
            .select("recipe_id, preference_score")
            .eq("user_id", user_id)
        )
        # The artifact's unique generation is authoritative. The environment
        # override remains only for legacy artifacts without model metadata.
        selected_model_name = model_name or PREFERENCE_MODEL_NAME
        if selected_model_name:
            query = query.eq("model_name", selected_model_name)
        query = query.order("preference_score", desc=True).limit(limit)
        response = query.execute()
    except Exception as exc:
        print(f"[Warning] Failed to fetch precomputed candidates, falling back to artifact scores: {exc}")
        return []

    return [
        (str(row["recipe_id"]), float(row["preference_score"]))
        for row in response.data or []
        if row.get("recipe_id") is not None and row.get("preference_score") is not None
    ]


def upsert_model_predictions(
    supabase: Client,
    user_id: str,
    candidates: list[RerankedCandidate],
    model_name: str = "online_risk_rerank",
) -> None:
    """Persist the latest online risk components for debugging/evaluation."""
    if not candidates:
        return

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for candidate in candidates[:MODEL_PREDICTION_WRITE_LIMIT]:
        try:
            recipe_id = int(candidate.recipe_id)
        except (TypeError, ValueError):
            continue
        rows.append(
            {
                "user_id": user_id,
                "recipe_id": recipe_id,
                "model_name": model_name,
                "prediction_type": "online_rerank",
                "score": candidate.final_score,
                "features": prediction_feature_payload(candidate),
                "generated_at": now,
            }
        )

    if not rows:
        return

    try:
        supabase.table("model_predictions").upsert(
            rows,
            on_conflict="user_id,recipe_id,model_name,prediction_type",
        ).execute()
    except Exception as exc:
        print(f"[Warning] Failed to upsert model predictions: {exc}")


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


def effective_online_vector_weight(
    online_ratings: pd.DataFrame,
    maximum_weight: float = ONLINE_VECTOR_WEIGHT,
    full_strength: float = ONLINE_VECTOR_FULL_STRENGTH,
) -> float:
    """Scale the online blend by total positive post-training evidence."""
    if online_ratings.empty or "rating" not in online_ratings.columns:
        return 0.0

    ratings = pd.to_numeric(online_ratings["rating"], errors="coerce")
    total_strength = float(ratings.clip(lower=0.0).fillna(0.0).sum())
    bounded_maximum = max(0.0, min(1.0, float(maximum_weight)))
    saturation = max(float(full_strength), 1e-9)
    return bounded_maximum * min(1.0, total_strength / saturation)


def interactions_for_online_update(
    raw_interactions: pd.DataFrame,
    artifact: dict,
    use_full_history: bool = False,
) -> pd.DataFrame:
    """Select interactions not already represented by the batch user state."""
    if use_full_history:
        return raw_interactions
    trained_at = artifact.get("trained_at")
    if raw_interactions.empty or not trained_at:
        return raw_interactions
    if "created_at" not in raw_interactions.columns:
        return raw_interactions.iloc[0:0].copy()

    cutoff = pd.to_datetime(trained_at, utc=True, errors="coerce")
    if pd.isna(cutoff):
        return raw_interactions
    created_at = pd.to_datetime(
        raw_interactions["created_at"],
        utc=True,
        errors="coerce",
    )
    return raw_interactions.loc[created_at > cutoff].copy()


def get_learned_user_state(
    user_id: str,
    artifact: dict,
) -> tuple[Optional[np.ndarray], float]:
    user_index = artifact.get("learned_user_index") or {}
    index = user_index.get(str(user_id))
    if index is None:
        return None, 0.0

    learned_factors = artifact.get("learned_user_factors")
    learned_biases = artifact.get("learned_user_biases")
    if learned_factors is None or learned_biases is None:
        return None, 0.0

    vector = np.asarray(learned_factors[index], dtype=float)
    if vector.ndim != 1 or vector.shape[0] != artifact["item_factors"].shape[1]:
        return None, 0.0
    return vector, float(learned_biases[index])


def blend_user_vectors(
    learned_vector: Optional[np.ndarray],
    online_vector: Optional[np.ndarray],
    online_weight: float = ONLINE_VECTOR_WEIGHT,
) -> Optional[np.ndarray]:
    bounded_weight = max(0.0, min(1.0, float(online_weight)))
    if learned_vector is None:
        if online_vector is None:
            return None
        # A cold user has no learned vector to interpolate against, but fresh
        # evidence must still obey the same evidence-strength cap. Treat the
        # missing learned representation as the zero-vector baseline.
        return bounded_weight * online_vector
    if online_vector is None:
        return learned_vector
    if learned_vector.shape != online_vector.shape:
        return learned_vector

    return (1.0 - bounded_weight) * learned_vector + bounded_weight * online_vector


def reconstruct_artifact_scores(
    artifact: dict,
    target_recipe_ids,
    lightfm_user_vector: Optional[np.ndarray] = None,
    learned_user_bias: float = 0.0,
    online_vector: Optional[np.ndarray] = None,
    online_weight: float = 0.0,
    delta_limit: float = ONLINE_SCORE_DELTA_LIMIT,
) -> dict[str, float]:
    """Reconstruct preference scores only for requested artifact recipes.

    LightFM can reproduce its batch score from the materialized hybrid user
    representation. The SVD fallback uses this only as a backstop because its
    exact per-user batch scores remain authoritative in the candidate table.
    """
    recipe_index = artifact["recipe_index"]
    requested_ids = list(dict.fromkeys(str(recipe_id) for recipe_id in target_recipe_ids))
    matched = [
        (recipe_id, recipe_index[recipe_id])
        for recipe_id in requested_ids
        if recipe_id in recipe_index
    ]
    if not matched:
        return {}

    recipe_ids = [recipe_id for recipe_id, _index in matched]
    indices = np.asarray([index for _recipe_id, index in matched], dtype=np.int64)
    item_factors = artifact["item_factors"][indices]
    scores = (
        float(artifact["global_mean"])
        + artifact["item_biases"][indices].astype(float)
    )
    is_lightfm = str(artifact.get("backend", "")).lower() == "lightfm"

    if is_lightfm:
        scores = scores + float(learned_user_bias)
        vector = (
            None
            if lightfm_user_vector is None
            else np.asarray(lightfm_user_vector, dtype=float)
        )
        if (
            vector is not None
            and vector.ndim == 1
            and vector.shape[0] == item_factors.shape[1]
        ):
            scores = scores + item_factors.dot(vector)
    else:
        vector = (
            None
            if online_vector is None
            else np.asarray(online_vector, dtype=float)
        )
        bounded_weight = max(0.0, min(1.0, float(online_weight)))
        if (
            vector is not None
            and vector.ndim == 1
            and vector.shape[0] == item_factors.shape[1]
            and bounded_weight > 0.0
        ):
            raw_delta = bounded_weight * item_factors.dot(vector)
            scores = scores + np.clip(
                raw_delta,
                -max(0.0, float(delta_limit)),
                max(0.0, float(delta_limit)),
            )

    return {
        recipe_id: float(score)
        for recipe_id, score in zip(recipe_ids, scores)
    }


def rescore_precomputed_candidates(
    precomputed_candidates: list[tuple[str, float]],
    score_by_id: dict[str, float],
    limit: int = CANDIDATE_FETCH_LIMIT,
) -> list[tuple[str, float]]:
    rescored: list[tuple[str, float]] = []
    seen: set[str] = set()
    for recipe_id, _offline_score in precomputed_candidates:
        recipe_id = str(recipe_id)
        if recipe_id in seen or recipe_id not in score_by_id:
            continue
        seen.add(recipe_id)
        rescored.append((recipe_id, float(score_by_id[recipe_id])))
    rescored.sort(key=lambda item: item[1], reverse=True)
    return rescored[:limit]


def apply_bounded_online_delta(
    precomputed_candidates: list[tuple[str, float]],
    artifact: dict,
    online_vector: Optional[np.ndarray],
    online_weight: float,
    delta_limit: float = ONLINE_SCORE_DELTA_LIMIT,
    limit: int = CANDIDATE_FETCH_LIMIT,
) -> list[tuple[str, float]]:
    """Preserve fallback batch scores and add only a capped online adjustment."""
    recipe_index = artifact["recipe_index"]
    item_factors = artifact["item_factors"]
    vector = None if online_vector is None else np.asarray(online_vector, dtype=float)
    vector_is_valid = (
        vector is not None
        and vector.ndim == 1
        and vector.shape[0] == item_factors.shape[1]
    )
    bounded_weight = max(0.0, min(1.0, float(online_weight)))
    bounded_delta = max(0.0, float(delta_limit))

    rescored: list[tuple[str, float]] = []
    seen: set[str] = set()
    for recipe_id, offline_score in precomputed_candidates:
        recipe_id = str(recipe_id)
        if recipe_id in seen:
            continue
        seen.add(recipe_id)
        score = float(offline_score)
        item_index = recipe_index.get(recipe_id)
        if vector_is_valid and bounded_weight > 0.0 and item_index is not None:
            delta = bounded_weight * float(item_factors[item_index].dot(vector))
            score += float(np.clip(delta, -bounded_delta, bounded_delta))
        rescored.append((recipe_id, score))

    rescored.sort(key=lambda item: item[1], reverse=True)
    return rescored[:limit]


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
#   - Flavor:   CF embedding similarity to a bold-flavor seed centroid,
#               filtered by flavor keywords and deduped against earlier rows.
#   - Healthy:  CF top-k restricted to recipes passing `is_healthy`.
#   - Quick:    CF top-k restricted to recipes passing `is_quick`.
#
# The single greedy pass enforces "a recipe shown under one heading does not
# appear under another": once a recipe is assigned to row N, it is added to
# `assigned` and skipped by all later rows. The walk order (defined here) is
# Curated -> Trending -> Flavor -> Healthy -> Quick. Curated wins ties because it is
# the most personalized signal we have.
# ---------------------------------------------------------------------------

TRENDING_LOOKBACK_DAYS = 7
TRENDING_FETCH_LIMIT = 200  # over-fetch from the popularity ranking to leave room for dedup
TRENDING_POSITIVE_TYPES = ["liked", "saved", "started", "completed"]

# Module-level cache for the recipes-metadata pull. The recipes table has
# ~100k rows and we only need the small projection (id, minutes, nutrition).
# TTL matches the artifact cache by default; override with an env var.


def recipes_meta_cache_ttl_seconds() -> int:
    return int(os.getenv("RECOMMENDER_RECIPES_META_TTL_SECONDS", "600"))


def fetch_recipes_metadata(supabase: Client, force: bool = False, needed_ids: set[str] | None = None) -> dict[str, dict]:
    """Return actual catalog metadata used by category and health scoring.

    If the metadata was already populated from the artifact, returns the cache.
    Otherwise, if needed_ids is provided, queries Supabase only for those IDs (fallback).
    If needed_ids is not provided, does paginated query over all recipes (legacy fallback).
    """
    now = datetime.now(timezone.utc)
    cached_at = _RECIPES_META_CACHE["loaded_at"]
    if (
        not force
        and cached_at is not None
        and _RECIPES_META_CACHE["data"] is not None
    ):
        return _RECIPES_META_CACHE["data"]

    # If needed_ids is provided and cache is not loaded, fetch only the needed recipes
    if needed_ids:
        data = dict(_RECIPES_META_CACHE["data"]) if _RECIPES_META_CACHE["data"] is not None else {}
        ids_to_fetch = [rid for rid in needed_ids if rid not in data]
        if ids_to_fetch:
            print(f"[Info] Querying metadata for {len(ids_to_fetch)} specific recipe IDs from Supabase (fallback)...")
            chunk_size = 200
            fetched_rows = []
            for i in range(0, len(ids_to_fetch), chunk_size):
                chunk = ids_to_fetch[i : i + chunk_size]
                try:
                    response = (
                        supabase.table("recipes")
                        .select(
                            "id, name, minutes, n_steps, n_ingredients, "
                            "nutrition, ingredients, is_ibs_friendly"
                        )
                        .in_("id", chunk)
                        .execute()
                    )
                    fetched_rows.extend(response.data or [])
                except Exception as exc:
                    print(f"[Warning] Failed to fetch metadata chunk: {exc}")
            
            for row in fetched_rows:
                data[str(row["id"])] = row
        return data

    print("[Warning] Fetching all 100k recipes' metadata from Supabase (legacy fallback)...")
    rows: list[dict] = []
    page_size = int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000"))
    start = 0
    while True:
        response = (
            supabase.table("recipes")
            .select(
                "id, name, minutes, n_steps, n_ingredients, "
                "nutrition, ingredients, is_ibs_friendly"
            )
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


def parse_iso_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    text = str(value or "")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def split_personal_ingredients(value: object) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    return [
        part.strip()
        for chunk in text.splitlines()
        for part in chunk.split(",")
        if part.strip()
    ]


def fetch_cookbook_memberships(supabase: Client, user_id: str) -> list[dict]:
    try:
        response = (
            supabase.table("cooklist_recipes")
            .select("id,cooklist_id,recipe_id,recipe_title,recipe_source,image_url,ingredients,instructions,created_at,updated_at")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        print(f"[Warning] Failed to fetch cookbook memberships: {exc}")
        return []

    return response.data or []


def group_cookbook_memberships(rows: list[dict]) -> dict[str, dict]:
    grouped: dict[str, dict] = {}
    for row in rows:
        recipe_id = str(row.get("recipe_id") or "")
        if not recipe_id:
            continue

        created_at = parse_iso_datetime(row.get("created_at"))
        current = grouped.get(recipe_id)
        if current is None:
            grouped[recipe_id] = {
                "recipe_id": recipe_id,
                "recipe_title": row.get("recipe_title") or recipe_id,
                "recipe_source": row.get("recipe_source") or "catalog",
                "image_url": row.get("image_url"),
                "ingredients": row.get("ingredients"),
                "instructions": row.get("instructions"),
                "created_at": row.get("created_at"),
                "latest_at": created_at,
                "cooklist_count": 1,
            }
            continue

        current["cooklist_count"] += 1
        if created_at > current["latest_at"]:
            current.update(
                {
                    "recipe_title": row.get("recipe_title") or current["recipe_title"],
                    "recipe_source": row.get("recipe_source") or current["recipe_source"],
                    "image_url": row.get("image_url") or current.get("image_url"),
                    "ingredients": row.get("ingredients") or current.get("ingredients"),
                    "instructions": row.get("instructions") or current.get("instructions"),
                    "created_at": row.get("created_at") or current.get("created_at"),
                    "latest_at": created_at,
                }
            )
    return grouped


def personal_recipe_reason(recency_score: float, frequency_score: float, combined_risk: float) -> str:
    if combined_risk <= 0.25:
        return "Gentler personal pick"
    if recency_score >= 0.75:
        return "Recently saved"
    if frequency_score >= 0.65:
        return "Saved in multiple cooklists"
    return "From your personal recipes"


def catalog_recipe_reason(candidate: RerankedCandidate) -> str:
    if candidate.combined_risk_score <= 0.25:
        return "Gentler saved pick"
    if candidate.preference_score >= 0:
        return "Matches your taste"
    return "From your saved recipes"


def compute_personal_cookbook_score(
    item: dict,
    restrictions: list[dict],
    personal_signals,
    population_signals,
    recent_context: dict,
    now: datetime,
) -> tuple[float, str] | None:
    recipe = {
        "id": item["recipe_id"],
        "name": item.get("recipe_title"),
        "ingredients": split_personal_ingredients(item.get("ingredients")),
        "minutes": None,
        "nutrition": [],
    }

    if is_hard_filtered(recipe, restrictions):
        return None

    ingredient_risk = compute_recipe_ingredient_risk(recipe, personal_signals, population_signals)
    feature_row = build_feature_row(recipe, ingredient_risk, recent_context, now=now)
    symptom_risk = heuristic_symptom_risk(feature_row, ingredient_risk.score)
    combined_risk = clamp01(0.4 * ingredient_risk.score + 0.6 * symptom_risk)

    age_days = max(0.0, (now - item["latest_at"]).total_seconds() / 86400)
    recency_score = clamp01(1.0 - (age_days / 45.0))
    frequency_score = clamp01(float(item.get("cooklist_count") or 1) / 3.0)
    raw_score = clamp01(0.55 * recency_score + 0.20 * frequency_score + 0.25 * (1.0 - combined_risk))
    display_score = 0.78 + 0.20 * raw_score
    return display_score, personal_recipe_reason(recency_score, frequency_score, combined_risk)


def compute_cookbook_recommendations(
    supabase: Client,
    user_id: str,
    cookbook_rows: list[dict],
    score_by_id: dict[str, float],
    precomputed_candidates: list[tuple[str, float]],
    recipes_meta: dict[str, dict],
    restrictions: list[dict],
    personal_signals,
    population_signals,
    recent_context: dict,
    limit: int = COOKBOOK_RECOMMENDATION_LIMIT,
) -> list[dict]:
    grouped = group_cookbook_memberships(cookbook_rows)
    if not grouped:
        return []

    now = datetime.now(timezone.utc)
    precomputed_by_id = {rid: score for rid, score in precomputed_candidates}
    catalog_pairs: list[tuple[str, float]] = []
    personal_items: list[dict] = []

    for recipe_id, item in grouped.items():
        source = str(item.get("recipe_source") or "catalog")
        if source == "personal" or recipe_id.startswith("personal-"):
            personal_items.append(item)
        else:
            catalog_pairs.append(
                (
                    recipe_id,
                    float(precomputed_by_id.get(recipe_id, score_by_id.get(recipe_id, 0.0))),
                )
            )

    catalog_ranked = rerank_candidates(
        candidates=catalog_pairs,
        recipes_meta=recipes_meta,
        restrictions=restrictions,
        personal_signals=personal_signals,
        population_signals=population_signals,
        recent_context=recent_context,
    )
    catalog_scores = normalize_match_scores([candidate.final_score for candidate in catalog_ranked])

    mixed: list[dict] = []
    for candidate, display_score in zip(catalog_ranked, catalog_scores):
        source_item = grouped.get(candidate.recipe_id, {})
        mixed.append(
            {
                "recipe_id": candidate.recipe_id,
                "recipe_source": "catalog",
                "score": float(display_score),
                "reason": catalog_recipe_reason(candidate),
                "created_at": source_item.get("created_at"),
            }
        )

    for item in personal_items:
        scored = compute_personal_cookbook_score(
            item=item,
            restrictions=restrictions,
            personal_signals=personal_signals,
            population_signals=population_signals,
            recent_context=recent_context,
            now=now,
        )
        if scored is None:
            continue
        display_score, reason = scored
        mixed.append(
            {
                "recipe_id": item["recipe_id"],
                "recipe_source": "personal",
                "score": float(display_score),
                "reason": reason,
                "created_at": item.get("created_at"),
            }
        )

    mixed.sort(
        key=lambda item: (
            item["score"],
            parse_iso_datetime(item.get("created_at")),
        ),
        reverse=True,
    )
    return mixed[:limit]


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

# Cached at module scope. Only the centroid is invariant for a model
# generation; per-recipe similarities are computed for the bounded candidate
# IDs on each request. The exact generation key prevents a hot artifact refresh
# from reusing the prior generation's centroid.
_FLAVOR_CENTROID_CACHE: dict = {
    "artifact_key": None,
    "centroid": None,
    "computed_at": None,
    "n_seeds": 0,
}


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


def flavor_artifact_cache_key(artifact: dict) -> tuple:
    recipe_ids = artifact["recipe_ids"]
    return (
        int(artifact.get("artifact_version", 1)),
        str(artifact.get("backend", "")),
        str(artifact.get("model_name") or ""),
        str(artifact.get("trained_at") or ""),
        artifact.get("artifact_file_identity"),
        len(recipe_ids),
        str(recipe_ids[0]) if len(recipe_ids) else "",
        str(recipe_ids[-1]) if len(recipe_ids) else "",
    )


def compute_flavor_scores(
    centroid: np.ndarray,
    artifact: dict,
    candidate_ids,
) -> dict[str, float]:
    """Compute cosine-to-centroid only for the bounded candidate factor rows."""
    centroid_norm = float(np.linalg.norm(centroid))
    if centroid_norm < 1e-9:
        return {}

    recipe_index = artifact["recipe_index"]
    matched = [
        (recipe_id, recipe_index[recipe_id])
        for recipe_id in dict.fromkeys(str(value) for value in candidate_ids)
        if recipe_id in recipe_index
    ]
    if not matched:
        return {}

    recipe_ids = [recipe_id for recipe_id, _index in matched]
    indices = np.asarray([index for _recipe_id, index in matched], dtype=np.int64)
    item_factors = artifact["item_factors"][indices]
    item_norms = np.linalg.norm(item_factors, axis=1)
    # Clamp zero-norm vectors so the division is safe; affected recipes get
    # similarity ~0 which pushes them out of the top-K anyway.
    safe_norms = np.where(item_norms < 1e-9, 1e-9, item_norms)
    sims = (item_factors @ centroid) / (safe_norms * centroid_norm)
    return {str(rid): float(sims[i]) for i, rid in enumerate(recipe_ids)}


def get_flavor_artifact(
    recipes_meta: dict,
    artifact: dict,
    candidate_ids,
    force: bool = False,
) -> tuple[Optional[np.ndarray], dict[str, float]]:
    """Return the generation centroid and bounded candidate similarities.

    The centroid is invariant per artifact+catalog, so it is cached by exact
    artifact generation. Candidate similarities remain request-local.
    """
    now = datetime.now(timezone.utc)
    cached_at = _FLAVOR_CENTROID_CACHE["computed_at"]
    artifact_key = flavor_artifact_cache_key(artifact)
    if (
        not force
        and _FLAVOR_CENTROID_CACHE["artifact_key"] == artifact_key
        and cached_at is not None
        and (now - cached_at).total_seconds() < recipes_meta_cache_ttl_seconds()
    ):
        centroid = _FLAVOR_CENTROID_CACHE["centroid"]
        scores = (
            compute_flavor_scores(centroid, artifact, candidate_ids)
            if centroid is not None
            else {}
        )
        return centroid, scores

    # If precomputed flavor centroid is in the artifact, use it directly!
    precomputed_centroid = artifact.get("flavor_centroid")
    if precomputed_centroid is not None:
        centroid = precomputed_centroid.astype(float)
        scores = compute_flavor_scores(centroid, artifact, candidate_ids)
        _FLAVOR_CENTROID_CACHE["artifact_key"] = artifact_key
        _FLAVOR_CENTROID_CACHE["centroid"] = centroid
        _FLAVOR_CENTROID_CACHE["computed_at"] = now
        _FLAVOR_CENTROID_CACHE["n_seeds"] = 0
        print("[Info] Loaded precomputed flavor centroid from artifact.")
        return centroid, scores

    # Fallback to computing on-the-fly if not in artifact
    seed_ids = identify_flavor_seed_ids(recipes_meta, FLAVOR_SEED_KEYWORDS)
    centroid = compute_flavor_centroid(seed_ids, artifact["recipe_index"], artifact["item_factors"])
    scores: dict[str, float] = {}
    if centroid is not None:
        scores = compute_flavor_scores(centroid, artifact, candidate_ids)

    _FLAVOR_CENTROID_CACHE["artifact_key"] = artifact_key
    _FLAVOR_CENTROID_CACHE["centroid"] = centroid
    _FLAVOR_CENTROID_CACHE["computed_at"] = now
    _FLAVOR_CENTROID_CACHE["n_seeds"] = len(seed_ids)
    print(
        f"[Info] Built flavor centroid from {len(seed_ids):,} seed recipes "
        f"({sum(1 for sid in seed_ids if sid in artifact['recipe_index'])} matched artifact)."
    )
    return centroid, scores


def recommend_for_user(user_id: str, k: int = 6, upload: bool = True) -> list[tuple[str, float]]:
    """Compute risk-aware Curated + category recommendations and upsert all of them.

    Returns the Curated list (for backwards compatibility with the FastAPI
    `recommender_service` response shape). The other category lists are
    written into the same `user_recommendations` row and read directly by
    the homepage. Offline candidate rows are preferred when present; otherwise
    this falls back to the saved CF item-factor artifact for preference scores.
    """
    supabase = load_supabase_client()
    download_artifact_from_storage(supabase)
    download_symptom_artifact_from_storage(supabase)
    artifact = load_cf_artifact()

    raw_interactions = fetch_user_interactions(supabase, user_id)
    learned_user_vector, learned_user_bias = get_learned_user_state(user_id, artifact)
    is_lightfm_artifact = str(artifact.get("backend", "")).lower() == "lightfm"
    # If a current LightFM artifact lacks this particular user's materialized
    # state, rebuild from their full history. Applying trained_at in that case
    # would silently discard older evidence.
    online_interactions = interactions_for_online_update(
        raw_interactions,
        artifact,
        use_full_history=is_lightfm_artifact and learned_user_vector is None,
    )
    online_ratings = process_interactions_to_ratings(online_interactions)
    online_user_vector = build_user_vector(online_ratings, artifact)
    online_weight = effective_online_vector_weight(online_ratings)
    user_vector = (
        blend_user_vectors(
            learned_user_vector,
            online_user_vector,
            online_weight=online_weight,
        )
        if is_lightfm_artifact
        else None
    )
    excluded_recipe_ids = get_excluded_recipe_ids(raw_interactions)
    cookbook_rows = fetch_cookbook_memberships(supabase, user_id)

    global_mean = artifact["global_mean"]

    # Fetch the bounded, generation-matched candidate set before doing latent
    # scoring. Catalog cookbook recipes are added because they need preference
    # scores even when they did not make the user's offline top-N.
    precomputed_candidates = fetch_precomputed_candidates(
        supabase,
        user_id,
        model_name=artifact.get("model_name"),
    )
    cookbook_catalog_ids = {
        str(row["recipe_id"])
        for row in cookbook_rows
        if row.get("recipe_id") is not None
        and str(row.get("recipe_source") or "catalog") != "personal"
        and not str(row["recipe_id"]).startswith("personal-")
    }
    score_targets = [
        *(recipe_id for recipe_id, _score in precomputed_candidates),
        *cookbook_catalog_ids,
    ]
    score_by_id = reconstruct_artifact_scores(
        artifact,
        score_targets,
        lightfm_user_vector=user_vector,
        learned_user_bias=learned_user_bias,
        online_vector=online_user_vector,
        online_weight=online_weight,
    )
    if is_lightfm_artifact:
        rescored_precomputed_candidates = rescore_precomputed_candidates(
            precomputed_candidates,
            score_by_id,
        )
    else:
        rescored_precomputed_candidates = apply_bounded_online_delta(
            precomputed_candidates,
            artifact,
            online_user_vector,
            online_weight,
        )
        score_by_id.update(rescored_precomputed_candidates)
    if rescored_precomputed_candidates:
        candidate_pairs = rescored_precomputed_candidates
    else:
        # Explicit cold/no-candidate fallback: reconstruct the full artifact
        # only when the bounded candidate generation is absent or unusable.
        fallback_scores = reconstruct_artifact_scores(
            artifact,
            artifact["recipe_ids"],
            lightfm_user_vector=user_vector,
            learned_user_bias=learned_user_bias,
            online_vector=online_user_vector,
            online_weight=online_weight,
        )
        score_by_id.update(fallback_scores)
        candidate_pairs = sorted(
            fallback_scores.items(),
            key=lambda item: item[1],
            reverse=True,
        )[:CANDIDATE_FETCH_LIMIT]

    # Auxiliary signals for the category rows.
    # Both fetches tolerate empty results — categories simply come up short
    # in that case; the upsert still goes through and the row is consistent.
    try:
        # Collect needed recipe IDs to minimize DB fetch if cache is empty
        needed_ids = {rid for rid, _ in candidate_pairs}
        for row in cookbook_rows:
            rid = row.get("recipe_id")
            if rid:
                needed_ids.add(str(rid))
        recipes_meta = fetch_recipes_metadata(supabase, needed_ids=needed_ids)
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
        _flavor_centroid, flavor_scores_by_id = get_flavor_artifact(
            recipes_meta,
            artifact,
            (recipe_id for recipe_id, _score in candidate_pairs),
        )
    except Exception as exc:
        print(f"[Warning] Failed to build flavor centroid: {exc}")
        flavor_scores_by_id = {}

    # Health-risk layer: hard restrictions, direct personalized ingredient
    # risk, IBS population priors, optional symptom model, final rerank.
    restrictions = fetch_user_restrictions(supabase, user_id)
    personal_signals = fetch_user_ingredient_risks(supabase, user_id)
    population_signals = fetch_population_priors(supabase)
    recent_context = fetch_recent_user_context(supabase, user_id)
    risk_ranked_candidates = rerank_candidates(
        candidates=candidate_pairs,
        recipes_meta=recipes_meta,
        restrictions=restrictions,
        personal_signals=personal_signals,
        population_signals=population_signals,
        recent_context=recent_context,
    )
    candidate_by_id = {candidate.recipe_id: candidate for candidate in risk_ranked_candidates}
    risk_ranked_ids = [candidate.recipe_id for candidate in risk_ranked_candidates]
    final_score_by_id = {
        candidate.recipe_id: candidate.final_score
        for candidate in risk_ranked_candidates
    }

    if upload:
        upsert_model_predictions(supabase, user_id, risk_ranked_candidates)

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
            if rid not in candidate_by_id:
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
    curated = take(risk_ranked_ids, predicate=None, count=k, score_lookup=final_score_by_id)

    # Trending walks the global-popularity ranking first and falls back to
    # CF-ranked recipes if popularity is sparse (new install with few
    # interactions). dict.fromkeys preserves order while deduping the two
    # lists, so the fallback never re-iterates a recipe trending already saw.
    trending_source = [
        rid
        for rid in dict.fromkeys(trending_ranked_ids + risk_ranked_ids)
        if rid in candidate_by_id
    ]
    trending = take(trending_source, predicate=None, count=k, score_lookup=final_score_by_id)

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
        [rid for rid in flavor_scores_by_id.keys() if rid in candidate_by_id],
        key=lambda rid: (flavor_scores_by_id[rid], final_score_by_id.get(rid, -999.0)),
        reverse=True,
    )
    flavor = take(
        flavor_ranked_ids,
        predicate=is_flavorful,
        count=k,
        score_lookup=final_score_by_id,
    )

    healthy = take(risk_ranked_ids, predicate=is_healthy, count=k, score_lookup=final_score_by_id)
    quick = take(risk_ranked_ids, predicate=is_quick, count=k, score_lookup=final_score_by_id)
    cookbook_recommendations = compute_cookbook_recommendations(
        supabase=supabase,
        user_id=user_id,
        cookbook_rows=cookbook_rows,
        score_by_id=score_by_id,
        precomputed_candidates=rescored_precomputed_candidates,
        recipes_meta=recipes_meta,
        restrictions=restrictions,
        personal_signals=personal_signals,
        population_signals=population_signals,
        recent_context=recent_context,
        limit=COOKBOOK_RECOMMENDATION_LIMIT,
    )

    if upload:
        curated_candidates = [candidate_by_id[rid] for rid, _ in curated if rid in candidate_by_id]
        payload = {
            "user_id": user_id,
            "recommended_recipe_ids": [rid for rid, _ in curated],
            "match_scores": normalize_match_scores([s for _, s in curated]),
            "ingredient_risk_scores": [candidate.ingredient_risk_score for candidate in curated_candidates],
            "symptom_risk_scores": [candidate.symptom_risk_score for candidate in curated_candidates],
            "combined_risk_scores": [candidate.combined_risk_score for candidate in curated_candidates],
            "final_scores": [candidate.final_score for candidate in curated_candidates],
            "trending_recipe_ids": [rid for rid, _ in trending],
            "trending_match_scores": normalize_match_scores([s for _, s in trending]),
            "flavor_recipe_ids": [rid for rid, _ in flavor],
            "flavor_match_scores": normalize_match_scores([s for _, s in flavor]),
            "healthy_recipe_ids": [rid for rid, _ in healthy],
            "healthy_match_scores": normalize_match_scores([s for _, s in healthy]),
            "quick_recipe_ids": [rid for rid, _ in quick],
            "quick_match_scores": normalize_match_scores([s for _, s in quick]),
            "cookbook_recipe_ids": [item["recipe_id"] for item in cookbook_recommendations],
            "cookbook_recipe_sources": [item["recipe_source"] for item in cookbook_recommendations],
            "cookbook_match_scores": [item["score"] for item in cookbook_recommendations],
            "cookbook_reasons": [item["reason"] for item in cookbook_recommendations],
            "updated_at": datetime.now(timezone.utc).isoformat(),
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
