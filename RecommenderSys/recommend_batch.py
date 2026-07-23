"""
Batch Script to Train Recommender and Sync Recommendations with Supabase.

Steps:
1. Load credentials and establish connection to Supabase.
2. Fetch logs from `recipe_interactions` table.
3. Convert categorical interaction logs to numerical ratings.
4. Train hybrid LightFM with user/item features (or matrix-factorization fallback).
5. Persist hybrid item state, learned active-user state, metadata, and boundary.
6. Replace each active user's bounded preference-candidate generation.
"""

import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
import pandas as pd
from datetime import datetime, timezone
import numpy as np

# Ensure RecommenderSys is in python search path
sys.path.append(str(Path(__file__).resolve().parent))

try:
    from supabase import Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv")
    sys.exit(1)

try:
    from lightfm import LightFM
    from lightfm.data import Dataset as LightFMDataset
except ImportError:
    LightFM = None
    LightFMDataset = None

from src.matrix_factorization import MatrixFactorizationCF
from lightfm_features import build_item_feature_rows, build_user_feature_rows
from recommender_common import (
    ARTIFACT_PATH,
    FLAVOR_SEED_KEYWORDS,
    RECIPE_CATALOG,
    get_artifact_bucket,
    get_artifact_storage_path,
    load_supabase_client,
    normalize_match_scores,
    process_interactions_to_ratings,
)


PREFERENCE_MODEL_NAME_OVERRIDE = os.getenv("RECOMMENDER_PREFERENCE_MODEL_NAME")
CANDIDATE_STORE_LIMIT = int(os.getenv("RECOMMENDER_CANDIDATE_STORE_LIMIT", "500"))
LIGHTFM_FACTORS = int(os.getenv("RECOMMENDER_LIGHTFM_FACTORS", "32"))
LIGHTFM_EPOCHS = int(os.getenv("RECOMMENDER_LIGHTFM_EPOCHS", "20"))
LIGHTFM_THREADS = int(os.getenv("RECOMMENDER_LIGHTFM_THREADS", "2"))
LIGHTFM_ARTIFACT_VERSION = 2
HISTORICAL_POSITIVE_MIN_RATING = float(
    os.getenv("RECOMMENDER_HISTORICAL_POSITIVE_MIN_RATING", "4.0")
)


@dataclass
class LightFMTrainingResult:
    model: object
    user_id_map: dict
    item_id_map: dict
    user_features: object
    item_features: object
    model_name: str = "lightfm_preference"


def fetch_all_rows(
    supabase: Client,
    table_name: str,
    columns: str,
    order_by: str = "id",
    page_size: int | None = None,
) -> list[dict]:
    """Fetch all rows from a Supabase table using range pagination with retry logic."""
    import time
    page_size = page_size or int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000"))
    rows: list[dict] = []
    start = 0

    while True:
        end = start + page_size - 1
        
        max_retries = 5
        retry_delay = 1.0
        response = None
        
        for attempt in range(max_retries):
            try:
                response = (
                    supabase.table(table_name)
                    .select(columns)
                    .order(order_by)
                    .range(start, end)
                    .execute()
                )
                break
            except Exception as exc:
                print(f"[Warning] Supabase fetch failed (attempt {attempt + 1}/{max_retries}) for {table_name}: {exc}")
                if attempt == max_retries - 1:
                    raise exc
                time.sleep(retry_delay)
                retry_delay *= 2.0

        page = response.data or []
        rows.extend(page)

        if len(page) < page_size:
            break

        start += page_size
        if len(rows) % 10000 == 0:
            print(f"  fetched {len(rows):,} rows from {table_name}...")

    if len(rows) > 0 and len(rows) % 10000 != 0:
        print(f"  fetched {len(rows):,} total rows from {table_name}.")

    return rows


def fetch_interactions(supabase: Client) -> pd.DataFrame:
    """Fetch user-recipe interaction logs from the Supabase database."""
    print("Fetching active user interactions from Supabase...")
    
    try:
        data = fetch_all_rows(
            supabase,
            "recipe_interactions",
            "user_id, recipe_id, interaction_type, created_at",
        )
        if not data:
            return pd.DataFrame(
                columns=["user_id", "recipe_id", "interaction_type", "created_at"]
            )
        return pd.DataFrame(data)
    except Exception as e:
        print(f"[Database Error] Query Error: {e}")
        return pd.DataFrame(
            columns=["user_id", "recipe_id", "interaction_type", "created_at"]
        )


def fetch_historical_interactions(supabase: Client) -> pd.DataFrame:
    """Fetch historical Food.com interactions from the Supabase database."""
    print("Fetching historical interactions from Supabase...")
    
    try:
        data = fetch_all_rows(supabase, "historical_interactions", "user_id, recipe_id, rating")
        if not data:
            return pd.DataFrame(columns=["user_id", "recipe_id", "rating"])
        df = pd.DataFrame(data)
        # Prefix historical user IDs to prevent collision with active UUIDs
        df["user_id"] = "hist_" + df["user_id"].astype(str)
        df["recipe_id"] = df["recipe_id"].astype(str)
        return df
    except Exception as e:
        print(f"[Database Error] Historical Query Error: {e}")
        return pd.DataFrame(columns=["user_id", "recipe_id", "rating"])


def fetch_optional_feature_rows(
    supabase: Client,
    table_name: str,
    columns: str,
    order_by: str,
) -> list[dict]:
    """Read optional user metadata without making preference training brittle."""
    try:
        return fetch_all_rows(
            supabase,
            table_name,
            columns,
            order_by=order_by,
        )
    except Exception as exc:
        print(f"[Warning] Could not load optional LightFM features from {table_name}: {exc}")
        return []


def interactions_through_training_boundary(
    interactions: pd.DataFrame,
    trained_at: str,
) -> pd.DataFrame:
    """Exclude rows that arrived after the artifact's online-update boundary."""
    if interactions.empty or "created_at" not in interactions.columns:
        return interactions
    cutoff = pd.to_datetime(trained_at, utc=True, errors="coerce")
    if pd.isna(cutoff):
        return interactions
    created_at = pd.to_datetime(interactions["created_at"], utc=True, errors="coerce")
    return interactions.loc[created_at.isna() | (created_at <= cutoff)].copy()


def home_excluded_recipe_ids(
    interactions: pd.DataFrame,
    user_id: str,
) -> set[str]:
    """Return the saved/liked recipes Home should not rediscover."""
    if interactions.empty:
        return set()
    interaction_types = interactions["interaction_type"].astype(str).str.lower()
    user_ids = interactions["user_id"].astype(str)
    excluded = interactions.loc[
        (user_ids == str(user_id))
        & interaction_types.isin({"liked", "saved", "save"})
    ]
    return set(excluded["recipe_id"].astype(str))


def upload_artifact_to_storage(
    supabase: Client,
    artifact_path: Path = ARTIFACT_PATH,
) -> bool:
    """Upload the trained CF artifact to private Supabase Storage for online serving."""
    if not artifact_path.exists():
        print(f"[Warning] Artifact does not exist, skipping upload: {artifact_path}")
        return False

    bucket = get_artifact_bucket()
    storage_path = get_artifact_storage_path()

    try:
        with artifact_path.open("rb") as file:
            supabase.storage.from_(bucket).upload(
                storage_path,
                file,
                file_options={
                    "content-type": "application/octet-stream",
                    "upsert": "true",
                },
            )
        print(f"Uploaded CF artifact to Supabase Storage: {bucket}/{storage_path}")
        return True
    except Exception as e:
        if "Bucket not found" not in str(e):
            print(f"[Warning] Failed to upload CF artifact to Supabase Storage: {e}")
            return False

        try:
            print(f"Storage bucket {bucket} not found. Creating private bucket...")
            supabase.storage.create_bucket(bucket, options={"public": False})
            with artifact_path.open("rb") as file:
                supabase.storage.from_(bucket).upload(
                    storage_path,
                    file,
                    file_options={
                        "content-type": "application/octet-stream",
                        "upsert": "true",
                    },
                )
            print(f"Uploaded CF artifact to Supabase Storage: {bucket}/{storage_path}")
            return True
        except Exception as retry_error:
            print(f"[Warning] Failed to create/upload CF artifact bucket: {retry_error}")
            return False


def preference_model_generation_name(base_name: str, trained_at: str) -> str:
    """Create the exact candidate/artifact generation key used by serving."""
    normalized_base = str(base_name).strip()
    if not normalized_base:
        raise ValueError("preference model base name cannot be blank")
    generation_token = "".join(
        character
        for character in str(trained_at)
        if character.isalnum()
    )
    if not generation_token:
        raise ValueError("trained_at must provide a generation token")
    return f"{normalized_base}@{generation_token}"


def create_artifact_staging_path(
    live_artifact_path: Path = ARTIFACT_PATH,
) -> Path:
    """Reserve a same-directory path so final promotion is an atomic replace."""
    live_artifact_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        prefix=f".{live_artifact_path.stem}.",
        suffix=".npz",
        dir=live_artifact_path.parent,
        delete=False,
    ) as temporary_file:
        staging_path = Path(temporary_file.name)
    # Model writers create the archive themselves. Removing the zero-byte
    # reservation also means a failed training call cannot look publishable.
    staging_path.unlink()
    return staging_path


def discard_staged_artifact(staging_path: Path) -> None:
    try:
        staging_path.unlink(missing_ok=True)
    except OSError as exc:
        print(f"[Warning] Could not remove staged artifact {staging_path}: {exc}")


def promote_staged_artifact(
    staging_path: Path,
    live_artifact_path: Path = ARTIFACT_PATH,
) -> bool:
    """Atomically expose a fully published artifact to local serving."""
    if not staging_path.exists():
        print(f"[Error] Staged artifact does not exist: {staging_path}")
        return False
    try:
        staging_path.replace(live_artifact_path)
        return True
    except OSError as exc:
        print(f"[Error] Failed to promote local preference artifact: {exc}")
        return False


def replace_candidate_rows(
    supabase: Client,
    candidate_rows: list[dict],
    active_users: list[str],
    model_name: str,
    chunk_size: int = 500,
    user_chunk_size: int = 200,
) -> bool:
    """Replace one model generation for the supplied active users.

    Upserts alone leave recipes that fell out of the new top-N candidate set
    behind. Delete the prior generation for the exact users/model first, then
    insert the newly generated rows.
    """
    user_ids = list(dict.fromkeys(str(user_id) for user_id in active_users))
    if not user_ids:
        return True
    if not str(model_name).strip():
        raise ValueError("model_name is required when replacing candidate rows.")
    if any(str(row.get("model_name")) != str(model_name) for row in candidate_rows):
        raise ValueError(
            "Every candidate row must match the model generation being replaced."
        )

    print(
        f"Replacing precomputed {model_name} candidates for "
        f"{len(user_ids):,} active users..."
    )
    for start in range(0, len(user_ids), user_chunk_size):
        user_chunk = user_ids[start : start + user_chunk_size]
        try:
            (
                supabase.table("user_candidate_recipes")
                .delete()
                .eq("model_name", model_name)
                .in_("user_id", user_chunk)
                .execute()
            )
        except Exception as exc:
            print(
                "[Warning] Failed to remove stale candidate rows for users "
                f"{start}-{start + len(user_chunk)}: {exc}"
            )
            return False

    if not candidate_rows:
        return True

    print(f"Uploading {len(candidate_rows):,} precomputed candidate rows to Supabase...")
    for start in range(0, len(candidate_rows), chunk_size):
        chunk = candidate_rows[start : start + chunk_size]
        try:
            supabase.table("user_candidate_recipes").upsert(
                chunk,
                on_conflict="user_id,recipe_id,model_name",
            ).execute()
        except Exception as exc:
            print(f"[Warning] Failed to upload candidate rows {start}-{start + len(chunk)}: {exc}")
            return False
    return True


def positive_lightfm_ratings(
    ratings: pd.DataFrame,
    recipe_catalog: list[str],
    historical_min_rating: float = HISTORICAL_POSITIVE_MIN_RATING,
) -> pd.DataFrame:
    """Return valid implicit positives for WARP preference training.

    App engagement weights remain positive implicit events. Food.com rows are
    explicit 1-5 ratings, so only ratings at or above the configured threshold
    are allowed to become WARP positives.
    """
    if ratings.empty:
        return ratings.copy()

    recipe_ids = ratings["recipe_id"].astype(str)
    user_ids = ratings["user_id"].astype(str)
    numeric_ratings = pd.to_numeric(ratings["rating"], errors="coerce")
    is_historical = user_ids.str.startswith("hist_")
    threshold = max(0.0, float(historical_min_rating))
    keep = (
        numeric_ratings.notna()
        & (numeric_ratings > 0)
        & recipe_ids.isin({str(recipe_id) for recipe_id in recipe_catalog})
        & (~is_historical | (numeric_ratings >= threshold))
    )
    result = ratings.loc[keep].copy()
    result["user_id"] = user_ids.loc[result.index]
    result["recipe_id"] = recipe_ids.loc[result.index]
    result["rating"] = numeric_ratings.loc[result.index].astype(float)
    return result


def zero_cold_identity_features(
    feature_matrix,
    entity_id_map: dict,
    feature_name_map: dict,
    warm_entity_ids: set[str],
):
    """Remove random identity embeddings for entities with no positive rows.

    LightFM's Dataset includes identity columns by default. A catalog item or
    active user with no positive interaction never trains that identity
    embedding, so retaining it injects random initialization into cold-start
    predictions. Side-feature columns remain untouched.
    """
    warm_ids = {str(entity_id) for entity_id in warm_entity_ids}
    result = feature_matrix.tolil(copy=True)
    for entity_id, row_index in entity_id_map.items():
        if str(entity_id) in warm_ids:
            continue
        feature_index = feature_name_map.get(entity_id)
        if feature_index is None:
            feature_index = feature_name_map.get(str(entity_id))
        if feature_index is not None:
            result[int(row_index), int(feature_index)] = 0.0
    result = result.tocsr()
    result.eliminate_zeros()
    return result


def save_lightfm_item_artifact(
    training: LightFMTrainingResult,
    recipe_catalog: list[str],
    active_users: list[str],
    trained_at: str,
    model_name: str,
    artifact_path: Path = ARTIFACT_PATH,
) -> None:
    model = training.model
    recipe_ids = []
    item_indices = []
    for recipe_id in recipe_catalog:
        item_idx = training.item_id_map.get(str(recipe_id))
        if item_idx is None:
            continue
        recipe_ids.append(str(recipe_id))
        item_indices.append(item_idx)

    if not item_indices:
        raise RuntimeError("LightFM trained without any recipe items in the catalog.")

    all_item_biases, all_item_factors = model.get_item_representations(
        training.item_features
    )
    all_user_biases, all_user_factors = model.get_user_representations(
        training.user_features
    )

    learned_user_ids: list[str] = []
    learned_user_indices: list[int] = []
    for user_id in active_users:
        user_idx = training.user_id_map.get(str(user_id))
        if user_idx is None:
            continue
        learned_user_ids.append(str(user_id))
        learned_user_indices.append(user_idx)

    item_indices_array = np.array(item_indices, dtype=np.int32)
    user_indices_array = np.array(learned_user_indices, dtype=np.int32)
    latent_dimensions = int(all_item_factors.shape[1])

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        artifact_path,
        artifact_version=np.array([LIGHTFM_ARTIFACT_VERSION], dtype=np.int64),
        recipe_ids=np.array(recipe_ids, dtype=object),
        item_factors=all_item_factors[item_indices_array].astype(float),
        item_biases=all_item_biases[item_indices_array].astype(float),
        learned_user_ids=np.array(learned_user_ids, dtype=object),
        learned_user_factors=all_user_factors[user_indices_array].astype(float),
        learned_user_biases=all_user_biases[user_indices_array].astype(float),
        global_mean=np.array([0.0], dtype=np.float64),
        n_factors=np.array([latent_dimensions], dtype=np.int64),
        backend=np.array(["lightfm"], dtype=object),
        trained_at=np.array([trained_at], dtype=object),
        model_name=np.array([model_name], dtype=object),
    )


def train_lightfm_preference_model(
    ratings: pd.DataFrame,
    recipe_catalog: list[str],
    active_users: list[str],
    recipes_data: list[dict] | None = None,
    restrictions: list[dict] | None = None,
    ingredient_risks: list[dict] | None = None,
    ibs_ingredient_risks: list[dict] | None = None,
) -> LightFMTrainingResult | None:
    if LightFM is None or LightFMDataset is None:
        return None

    print("Training LightFM preference model...")
    ratings = ratings.copy()
    ratings["user_id"] = ratings["user_id"].astype(str)
    ratings["recipe_id"] = ratings["recipe_id"].astype(str)

    all_items = [str(recipe_id) for recipe_id in recipe_catalog]

    # WARP treats every non-zero interaction entry as a positive example.
    # A zero sample weight (for example `dismissed`) does not turn that entry
    # into an explicit negative, so omit it from the positive matrix. Historical
    # Food.com rows are explicit ratings and must also pass the liked threshold.
    positive_ratings = positive_lightfm_ratings(ratings, all_items)
    if positive_ratings.empty:
        return None
    all_users = sorted(
        set(positive_ratings["user_id"].astype(str)).union(
            str(uid) for uid in active_users
        )
    )

    item_feature_rows = build_item_feature_rows(recipes_data or [], all_items)
    user_feature_rows = build_user_feature_rows(
        user_ids=all_users,
        active_user_ids=active_users,
        ratings=positive_ratings,
        item_feature_rows=item_feature_rows,
        restrictions=restrictions or [],
        ingredient_risks=ingredient_risks or [],
        ibs_ingredient_risks=ibs_ingredient_risks or [],
    )
    user_feature_names = sorted(
        {
            feature_name
            for feature_row in user_feature_rows.values()
            for feature_name in feature_row
        }
    )
    item_feature_names = sorted(
        {
            feature_name
            for feature_row in item_feature_rows.values()
            for feature_name in feature_row
        }
    )

    dataset = LightFMDataset()
    dataset.fit(
        users=all_users,
        items=all_items,
        user_features=user_feature_names,
        item_features=item_feature_names,
    )
    (
        user_id_map,
        user_feature_map,
        item_id_map,
        item_feature_map,
    ) = dataset.mapping()
    interactions, weights = dataset.build_interactions(
        (
            (str(row["user_id"]), str(row["recipe_id"]), float(row["rating"]))
            for _, row in positive_ratings.iterrows()
        )
    )

    if interactions.nnz == 0:
        return None

    user_features = dataset.build_user_features(
        (
            (user_id, feature_weights)
            for user_id, feature_weights in user_feature_rows.items()
        ),
        normalize=False,
    )
    item_features = dataset.build_item_features(
        (
            (recipe_id, feature_weights)
            for recipe_id, feature_weights in item_feature_rows.items()
        ),
        normalize=False,
    )
    user_features = zero_cold_identity_features(
        user_features,
        user_id_map,
        user_feature_map,
        set(positive_ratings["user_id"].astype(str)),
    )
    item_features = zero_cold_identity_features(
        item_features,
        item_id_map,
        item_feature_map,
        set(positive_ratings["recipe_id"].astype(str)),
    )

    model = LightFM(
        no_components=LIGHTFM_FACTORS,
        loss=os.getenv("RECOMMENDER_LIGHTFM_LOSS", "warp"),
        random_state=42,
    )
    try:
        model.fit(
            interactions,
            sample_weight=weights,
            user_features=user_features,
            item_features=item_features,
            epochs=LIGHTFM_EPOCHS,
            num_threads=LIGHTFM_THREADS,
        )
    except Exception as exc:
        print(f"[Warning] LightFM training failed: {exc}")
        return None

    print(
        "  LightFM matrices: "
        f"interactions={interactions.shape}, "
        f"user_features={user_features.shape}, "
        f"item_features={item_features.shape}"
    )
    return LightFMTrainingResult(
        model=model,
        user_id_map=user_id_map,
        item_id_map=item_id_map,
        user_features=user_features,
        item_features=item_features,
    )


def lightfm_predictions_for_user(
    training: LightFMTrainingResult,
    user_id: str,
    recipe_catalog: list[str],
) -> list[tuple[str, float]]:
    model = training.model
    user_idx = training.user_id_map.get(str(user_id))
    item_pairs = [
        (str(recipe_id), training.item_id_map[str(recipe_id)])
        for recipe_id in recipe_catalog
        if str(recipe_id) in training.item_id_map
    ]
    if not item_pairs:
        return []

    item_indices = np.array([idx for _, idx in item_pairs], dtype=np.int32)
    if user_idx is None:
        item_biases, _item_factors = model.get_item_representations(
            training.item_features
        )
        scores = item_biases[item_indices]
    else:
        scores = model.predict(
            int(user_idx),
            item_indices,
            user_features=training.user_features,
            item_features=training.item_features,
            num_threads=LIGHTFM_THREADS,
        )

    predictions = [
        (recipe_id, float(score))
        for (recipe_id, _idx), score in zip(item_pairs, scores)
    ]
    predictions.sort(key=lambda item: item[1], reverse=True)
    return predictions


def postprocess_artifact_with_metadata(
    artifact_path: Path,
    recipes_data: list[dict],
    trained_at: str | None = None,
    model_name: str | None = None,
) -> None:
    if not artifact_path.exists():
        print(f"[Warning] Artifact not found for postprocessing: {artifact_path}")
        return

    print("Post-processing CF artifact with recipe metadata and flavor centroid...")
    
    # 1. Load the existing npz file
    artifact = dict(np.load(artifact_path, allow_pickle=True))
    
    # Ensure recipe_ids, item_factors exist in the artifact
    if "recipe_ids" not in artifact or "item_factors" not in artifact:
        print("[Warning] Missing recipe_ids or item_factors in artifact. Skipping post-processing.")
        return
        
    recipe_ids_in_artifact = artifact["recipe_ids"].astype(str)
    item_factors = artifact["item_factors"].astype(float)
    recipe_index = {rid: idx for idx, rid in enumerate(recipe_ids_in_artifact)}
    
    # 2. Build metadata arrays matching the catalog in recipes_data
    meta_recipe_ids = []
    meta_names = []
    meta_minutes = []
    meta_minutes_present = []
    meta_n_steps = []
    meta_n_steps_present = []
    meta_n_ingredients = []
    meta_n_ingredients_present = []
    meta_nutrition = []
    meta_nutrition_present = []
    meta_ingredients = []
    meta_ingredients_present = []
    meta_is_ibs_friendly = []
    
    for row in recipes_data:
        rid = str(row["id"])
        meta_recipe_ids.append(rid)
        meta_names.append(str(row.get("name") or ""))
        raw_minutes = row.get("minutes")
        minutes_present = raw_minutes is not None and pd.notna(raw_minutes)
        meta_minutes.append(int(raw_minutes) if minutes_present else 0)
        meta_minutes_present.append(int(minutes_present))

        raw_n_steps = row.get("n_steps")
        steps_present = raw_n_steps is not None and pd.notna(raw_n_steps)
        meta_n_steps.append(int(raw_n_steps) if steps_present else 0)
        meta_n_steps_present.append(int(steps_present))

        raw_ingredients = row.get("ingredients")
        ingredients = raw_ingredients if isinstance(raw_ingredients, list) else []
        ingredients = [
            str(ingredient).strip()
            for ingredient in ingredients
            if str(ingredient).strip()
        ]
        ingredients_present = bool(ingredients)
        meta_ingredients_present.append(int(ingredients_present))

        raw_n_ingredients = row.get("n_ingredients")
        ingredient_count_present = (
            raw_n_ingredients is not None and pd.notna(raw_n_ingredients)
        ) or ingredients_present
        meta_n_ingredients.append(
            int(raw_n_ingredients)
            if raw_n_ingredients is not None and pd.notna(raw_n_ingredients)
            else len(ingredients)
        )
        meta_n_ingredients_present.append(int(ingredient_count_present))

        # nutrition is double precision[] (typically 7 floats)
        raw_nutrition = row.get("nutrition")
        nutrition_values = (
            list(raw_nutrition[:7])
            if isinstance(raw_nutrition, (list, tuple))
            else []
        )
        nutrition_present = len(nutrition_values) == 7
        parsed_nutrition: list[float] = []
        for value in nutrition_values:
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                numeric_value = 0.0
                nutrition_present = False
            if not np.isfinite(numeric_value) or numeric_value < 0:
                numeric_value = 0.0
                nutrition_present = False
            parsed_nutrition.append(numeric_value)
        parsed_nutrition.extend([0.0] * (7 - len(parsed_nutrition)))
        meta_nutrition.append(parsed_nutrition)
        meta_nutrition_present.append(int(nutrition_present))
        # ingredients list of strings -> serialize to pipe-separated string
        meta_ingredients.append("|".join(str(ing) for ing in ingredients))
        ibs_friendly = row.get("is_ibs_friendly")
        meta_is_ibs_friendly.append(-1 if ibs_friendly is None else int(bool(ibs_friendly)))
        
    # 3. Compute flavor centroid
    seed_ids = []
    for row in recipes_data:
        ingredients = row.get("ingredients") or []
        text = " ".join(str(item).lower() for item in ingredients)
        if any(kw in text for kw in FLAVOR_SEED_KEYWORDS):
            seed_ids.append(str(row["id"]))
            
    vectors = []
    for sid in seed_ids:
        idx = recipe_index.get(sid)
        if idx is not None:
            vectors.append(item_factors[idx])
            
    if vectors:
        flavor_centroid = np.mean(np.array(vectors), axis=0)
        print(f"  computed flavor centroid from {len(vectors)} matching seed recipes (out of {len(seed_ids)} seeds).")
    else:
        # Fallback to zero vector if no seeds match
        flavor_centroid = np.zeros(item_factors.shape[1])
        print("  [Warning] No seed recipes matched the artifact. Flavor centroid initialized to zero.")
        
    # 4. Add the new arrays to the artifact dictionary
    artifact["meta_recipe_ids"] = np.array(meta_recipe_ids, dtype=object)
    artifact["meta_names"] = np.array(meta_names, dtype=object)
    artifact["meta_minutes"] = np.array(meta_minutes, dtype=np.int32)
    artifact["meta_minutes_present"] = np.array(
        meta_minutes_present,
        dtype=np.int8,
    )
    artifact["meta_n_steps"] = np.array(meta_n_steps, dtype=np.int32)
    artifact["meta_n_steps_present"] = np.array(
        meta_n_steps_present,
        dtype=np.int8,
    )
    artifact["meta_n_ingredients"] = np.array(meta_n_ingredients, dtype=np.int32)
    artifact["meta_n_ingredients_present"] = np.array(
        meta_n_ingredients_present,
        dtype=np.int8,
    )
    artifact["meta_nutrition"] = np.array(meta_nutrition, dtype=np.float32)
    artifact["meta_nutrition_present"] = np.array(
        meta_nutrition_present,
        dtype=np.int8,
    )
    artifact["meta_ingredients"] = np.array(meta_ingredients, dtype=object)
    artifact["meta_ingredients_present"] = np.array(
        meta_ingredients_present,
        dtype=np.int8,
    )
    artifact["meta_is_ibs_friendly"] = np.array(
        meta_is_ibs_friendly,
        dtype=np.int8,
    )
    artifact["flavor_centroid"] = flavor_centroid
    # MatrixFactorizationCF writes the legacy factor arrays itself. Promote
    # that fallback artifact to the same generation-aware serving contract as
    # LightFM so online events use the correct post-training boundary and the
    # candidate query selects the matching model.
    artifact["artifact_version"] = np.array(
        [LIGHTFM_ARTIFACT_VERSION],
        dtype=np.int64,
    )
    if trained_at is not None:
        artifact["trained_at"] = np.array([trained_at], dtype=object)
    if model_name is not None:
        artifact["model_name"] = np.array([model_name], dtype=object)
    
    # 5. Save back to the npz file
    np.savez_compressed(artifact_path, **artifact)
    print(f"Successfully saved metadata and flavor centroid to artifact ({artifact_path})")


def compute_recommendations():
    supabase = load_supabase_client()
    
    # 1. Fetch dynamic recipe catalog from Supabase
    print("Fetching recipe catalog from Supabase...")
    try:
        recipes_data = fetch_all_rows(
            supabase,
            "recipes",
            (
                "id, name, minutes, n_steps, n_ingredients, ingredients, "
                "nutrition, is_ibs_friendly"
            ),
        )
        recipe_catalog = [str(r["id"]) for r in recipes_data]
        print(f"Loaded {len(recipe_catalog):,} recipes from Supabase.")
    except Exception as e:
        print(f"[Error] Failed to fetch recipes from database: {e}")
        recipes_data = []
        recipe_catalog = []
        
    if not recipe_catalog:
        print("[Warning] No recipes found in database 'recipes' table. Using local catalog fallback.")
        recipe_catalog = RECIPE_CATALOG

    # Interactions written after this boundary are treated as online updates.
    # Capturing it before the paginated read avoids missing an interaction that
    # lands while the batch model is training.
    trained_at = datetime.now(timezone.utc).isoformat()

    # 2. Fetch active interactions
    raw_interactions = fetch_interactions(supabase)
    raw_interactions = interactions_through_training_boundary(
        raw_interactions,
        trained_at,
    )
    # Fetch historical interactions
    historical_interactions = fetch_historical_interactions(supabase)
    
    # 3. Get active profiles
    try:
        profiles = fetch_all_rows(supabase, "profiles", "id")
        active_users = [str(p["id"]) for p in profiles]
        print(f"Loaded {len(active_users):,} active profiles from Supabase.")
    except Exception as e:
        print(f"[Error] Failed to fetch user profiles: {e}")
        active_users = []
        
    if not active_users:
        print("[Error] No active users found in 'profiles' table. Cannot generate recommendations.")
        return

    restrictions = fetch_optional_feature_rows(
        supabase,
        "user_restrictions",
        "user_id, ingredient_name, normalized_name, restriction_type, severity, is_strict",
        order_by="id",
    )
    ingredient_risks = fetch_optional_feature_rows(
        supabase,
        "user_ingredient_risks",
        "user_id, ingredient_name, normalized_name, risk_score, confidence, status",
        order_by="user_id",
    )
    ibs_ingredient_risks = fetch_optional_feature_rows(
        supabase,
        "user_ibs_ingredient_risks",
        "user_id, ingredient_name, trigger_group, grade, confidence",
        order_by="user_id",
    )

    # Process active logs into numerical ratings
    active_ratings = process_interactions_to_ratings(raw_interactions)
    
    # Combine active and historical interactions
    if not historical_interactions.empty:
        if not active_ratings.empty:
            active_ratings["recipe_id"] = active_ratings["recipe_id"].astype(str)
            active_ratings["user_id"] = active_ratings["user_id"].astype(str)
            combined_ratings = pd.concat([active_ratings, historical_interactions], ignore_index=True)
        else:
            combined_ratings = historical_interactions
    else:
        combined_ratings = active_ratings

    if combined_ratings.empty:
        print("[Warning] No user ratings or historical interactions found. Seeding default popular recipes as recommendations...")
        default_recs = recipe_catalog[:6]
        generated_at = datetime.now(timezone.utc).isoformat()
        
        print(f"Upserting default recommendations for {len(active_users)} profiles...")
        for uid in active_users:
            payload = {
                "user_id": uid,
                "recommended_recipe_ids": default_recs,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            try:
                supabase.table("user_recommendations").upsert(payload).execute()
            except Exception as e:
                print(f"[Error] Failed to upload fallback recommendations for user {uid}: {e}")
        fallback_candidates = []
        fallback_model_name = (
            PREFERENCE_MODEL_NAME_OVERRIDE or "popularity_fallback"
        )
        for uid in active_users:
            for rank, recipe_id in enumerate(recipe_catalog[:CANDIDATE_STORE_LIMIT]):
                try:
                    recipe_id_int = int(recipe_id)
                except (TypeError, ValueError):
                    continue
                fallback_candidates.append({
                    "user_id": uid,
                    "recipe_id": recipe_id_int,
                    "preference_score": float(CANDIDATE_STORE_LIMIT - rank),
                    "model_name": fallback_model_name,
                    "generated_at": generated_at,
                })
        candidates_replaced = replace_candidate_rows(
            supabase,
            fallback_candidates,
            active_users,
            fallback_model_name,
        )
        if not candidates_replaced:
            print("[Error] Fallback candidate replacement did not complete.")
            return
        print("[Success] Completed fallback recommendations upsert.")
        return

    print(f"Processed {len(combined_ratings)} total ratings (active + historical).")
    combined_ratings["recipe_id"] = combined_ratings["recipe_id"].astype(str)
    combined_ratings["user_id"] = combined_ratings["user_id"].astype(str)
    if not active_ratings.empty:
        active_ratings["recipe_id"] = active_ratings["recipe_id"].astype(str)
        active_ratings["user_id"] = active_ratings["user_id"].astype(str)

    # 4. Train LightFM preference model when available, with the existing
    # matrix-factorization model as a fallback for environments where LightFM
    # is not installed or cannot compile.
    lightfm_result = train_lightfm_preference_model(
        combined_ratings,
        recipe_catalog,
        active_users,
        recipes_data=recipes_data,
        restrictions=restrictions,
        ingredient_risks=ingredient_risks,
        ibs_ingredient_risks=ibs_ingredient_risks,
    )
    use_lightfm = lightfm_result is not None
    if use_lightfm:
        candidate_model_name = preference_model_generation_name(
            PREFERENCE_MODEL_NAME_OVERRIDE or lightfm_result.model_name,
            trained_at,
        )
        staged_artifact_path = create_artifact_staging_path()
        try:
            save_lightfm_item_artifact(
                lightfm_result,
                recipe_catalog,
                [str(user_id) for user_id in active_users],
                trained_at,
                candidate_model_name,
                staged_artifact_path,
            )
        except Exception:
            discard_staged_artifact(staged_artifact_path)
            raise
        print("Prepared staged LightFM user/item artifact.")
    else:
        if LightFM is None:
            print("[Warning] LightFM is not installed. Falling back to SVD Matrix Factorization.")
        else:
            print("[Warning] LightFM training produced no interactions. Falling back to SVD Matrix Factorization.")
        candidate_model_name = preference_model_generation_name(
            PREFERENCE_MODEL_NAME_OVERRIDE or "cf_item_factors",
            trained_at,
        )
        catalog_padding = pd.DataFrame({
            "user_id": ["__catalog_pad__"] * len(recipe_catalog),
            "recipe_id": recipe_catalog,
            "rating": [3.0] * len(recipe_catalog)
        })
        padded_ratings = pd.concat([combined_ratings, catalog_padding], ignore_index=True)
        preference_model = MatrixFactorizationCF(n_factors=10, n_epochs=30, rating_scale=(0, 5))
        preference_model.fit(padded_ratings)
        staged_artifact_path = create_artifact_staging_path()
        try:
            preference_model.save_item_factor_artifact(staged_artifact_path)
        except Exception:
            discard_staged_artifact(staged_artifact_path)
            raise
        print("Prepared staged CF item-factor artifact.")

    try:
        postprocess_artifact_with_metadata(
            staged_artifact_path,
            recipes_data,
            trained_at=trained_at,
            model_name=candidate_model_name,
        )
    except Exception:
        discard_staged_artifact(staged_artifact_path)
        raise
    print(f"Generating recommendations for {len(active_users)} active users...")
    
    recommendation_payloads = []
    candidate_payloads = []
    generated_at = datetime.now(timezone.utc).isoformat()
    for user_id in active_users:
        # Home is a discovery surface: keep viewed/started/completed recipes
        # eligible, but do not rediscover recipes the user intentionally kept.
        interacted_recipes = home_excluded_recipe_ids(
            raw_interactions,
            str(user_id),
        )
        
        if use_lightfm:
            predictions = [
                (recipe_id, score)
                for recipe_id, score in lightfm_predictions_for_user(
                    lightfm_result,
                    user_id,
                    recipe_catalog,
                )
                if recipe_id not in interacted_recipes
            ]
        else:
            predictions = []
            for recipe_id in recipe_catalog:
                if recipe_id not in interacted_recipes:
                    score = preference_model.predict(user_id, recipe_id)
                    predictions.append((recipe_id, score))
            predictions.sort(key=lambda x: x[1], reverse=True)
        
        top_candidates = predictions[:CANDIDATE_STORE_LIMIT]
        for recipe_id, score in top_candidates:
            try:
                recipe_id_int = int(recipe_id)
            except (TypeError, ValueError):
                continue
            candidate_payloads.append({
                "user_id": user_id,
                "recipe_id": recipe_id_int,
                "preference_score": float(score),
                "model_name": candidate_model_name,
                "generated_at": generated_at,
            })

        # Take top 6 recipe IDs for the legacy homepage row. The online service
        # performs the full health-risk rerank from user_candidate_recipes.
        top_predictions = top_candidates[:6]
        top_k = [p[0] for p in top_predictions]
        top_scores = [p[1] for p in top_predictions]
        
        # If user has seen almost everything, fill back up with general items
        if len(top_k) < 6:
            remaining = [r for r in recipe_catalog if r not in top_k and r not in interacted_recipes]
            top_k.extend(remaining[:(6 - len(top_k))])
            top_scores.extend([3.0] * (len(top_k) - len(top_scores)))
            
        # If still empty (e.g. user interacted with everything), fall back to general catalog
        if not top_k:
            top_k = recipe_catalog[:6]
            top_scores = [3.0] * len(top_k)
            
        recommendation_payloads.append({
            "user_id": user_id,
            "recommended_recipe_ids": top_k,
            "match_scores": normalize_match_scores(top_scores),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        
    candidates_replaced = replace_candidate_rows(
        supabase,
        candidate_payloads,
        active_users,
        candidate_model_name,
    )
    if not candidates_replaced:
        discard_staged_artifact(staged_artifact_path)
        print("[Error] Candidate replacement did not complete.")
        return

    # Candidates are staged under their unique generation first. Only publish
    # the artifact pointer after every candidate write succeeds; if upload
    # fails, the previous artifact continues querying its previous generation.
    if not upload_artifact_to_storage(supabase, staged_artifact_path):
        discard_staged_artifact(staged_artifact_path)
        print("[Error] Preference artifact publication did not complete.")
        return

    # The remote object and its candidate generation now match. Only now may a
    # co-located serving process observe the new file; same-directory replace
    # avoids partial archive reads.
    if not promote_staged_artifact(staged_artifact_path, ARTIFACT_PATH):
        discard_staged_artifact(staged_artifact_path)
        print(
            "[Error] Remote preference artifact was published, but the local "
            "serving cache could not be promoted."
        )
        return

    # Bulk upload/upsert into the legacy user_recommendations table only after
    # the matching candidate/artifact generation is safely published.
    print(f"Uploading {len(recommendation_payloads)} recommendations to Supabase...")
    for payload in recommendation_payloads:
        try:
            supabase.table("user_recommendations").upsert(payload).execute()
        except Exception as e:
            print(f"[Error] Error uploading for user {payload['user_id']}: {e}")
            
    print("[Success] Recommendation sync completed successfully.")


if __name__ == "__main__":
    compute_recommendations()
