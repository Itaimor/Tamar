"""
Batch Script to Train Recommender and Sync Recommendations with Supabase.

Steps:
1. Load credentials and establish connection to Supabase.
2. Fetch logs from `recipe_interactions` table.
3. Convert categorical interaction logs to numerical ratings.
4. Train Collaborative Filtering (SVD / Matrix Factorization).
5. For each user, predict rankings across the full recipe catalog from Supabase.
6. Bulk upsert recommendations to `user_recommendations` in Supabase.
"""

import os
import sys
from pathlib import Path
import pandas as pd
from datetime import datetime
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
        data = fetch_all_rows(supabase, "recipe_interactions", "user_id, recipe_id, interaction_type")
        if not data:
            return pd.DataFrame(columns=["user_id", "recipe_id", "interaction_type"])
        return pd.DataFrame(data)
    except Exception as e:
        print(f"[Database Error] Query Error: {e}")
        return pd.DataFrame(columns=["user_id", "recipe_id", "interaction_type"])


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


def upload_artifact_to_storage(supabase: Client, artifact_path: Path = ARTIFACT_PATH) -> None:
    """Upload the trained CF artifact to private Supabase Storage for online serving."""
    if not artifact_path.exists():
        print(f"[Warning] Artifact does not exist, skipping upload: {artifact_path}")
        return

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
    except Exception as e:
        if "Bucket not found" not in str(e):
            print(f"[Warning] Failed to upload CF artifact to Supabase Storage: {e}")
            return

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
        except Exception as retry_error:
            print(f"[Warning] Failed to create/upload CF artifact bucket: {retry_error}")


def upload_candidate_rows(supabase: Client, candidate_rows: list[dict], chunk_size: int = 500) -> None:
    if not candidate_rows:
        return

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
            return


def save_lightfm_item_artifact(
    model,
    recipe_catalog: list[str],
    item_id_map: dict,
    artifact_path: Path = ARTIFACT_PATH,
) -> None:
    recipe_ids = []
    item_indices = []
    for recipe_id in recipe_catalog:
        item_idx = item_id_map.get(str(recipe_id))
        if item_idx is None:
            continue
        recipe_ids.append(str(recipe_id))
        item_indices.append(item_idx)

    if not item_indices:
        raise RuntimeError("LightFM trained without any recipe items in the catalog.")

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        artifact_path,
        recipe_ids=np.array(recipe_ids, dtype=object),
        item_factors=model.item_embeddings[np.array(item_indices)].astype(float),
        item_biases=model.item_biases[np.array(item_indices)].astype(float),
        global_mean=np.array([0.0], dtype=np.float64),
        n_factors=np.array([model.no_components], dtype=np.int64),
        backend=np.array(["lightfm"], dtype=object),
    )


def train_lightfm_preference_model(
    ratings: pd.DataFrame,
    recipe_catalog: list[str],
    active_users: list[str],
) -> tuple[object, dict, dict, str] | None:
    if LightFM is None or LightFMDataset is None:
        return None

    print("Training LightFM preference model...")
    ratings = ratings.copy()
    ratings["user_id"] = ratings["user_id"].astype(str)
    ratings["recipe_id"] = ratings["recipe_id"].astype(str)

    all_users = sorted(set(ratings["user_id"].astype(str)).union(str(uid) for uid in active_users))
    all_items = [str(recipe_id) for recipe_id in recipe_catalog]
    all_item_set = set(all_items)

    dataset = LightFMDataset()
    dataset.fit(users=all_users, items=all_items)
    interactions, weights = dataset.build_interactions(
        (
            (str(row["user_id"]), str(row["recipe_id"]), float(row["rating"]))
            for _, row in ratings.iterrows()
            if str(row["recipe_id"]) in all_item_set
        )
    )

    if interactions.nnz == 0:
        return None

    model = LightFM(
        no_components=LIGHTFM_FACTORS,
        loss=os.getenv("RECOMMENDER_LIGHTFM_LOSS", "warp"),
        random_state=42,
    )
    try:
        model.fit(
            interactions,
            sample_weight=weights,
            epochs=LIGHTFM_EPOCHS,
            num_threads=LIGHTFM_THREADS,
        )
    except Exception as exc:
        print(f"[Warning] LightFM training failed: {exc}")
        return None

    user_id_map, _user_feature_map, item_id_map, _item_feature_map = dataset.mapping()
    return model, user_id_map, item_id_map, "lightfm_preference"


def lightfm_predictions_for_user(
    model,
    user_id: str,
    recipe_catalog: list[str],
    user_id_map: dict,
    item_id_map: dict,
) -> list[tuple[str, float]]:
    user_idx = user_id_map.get(str(user_id))
    item_pairs = [
        (str(recipe_id), item_id_map[str(recipe_id)])
        for recipe_id in recipe_catalog
        if str(recipe_id) in item_id_map
    ]
    if not item_pairs:
        return []

    item_indices = np.array([idx for _, idx in item_pairs], dtype=np.int32)
    if user_idx is None:
        scores = model.item_biases[item_indices]
    else:
        scores = model.predict(
            int(user_idx),
            item_indices,
            num_threads=LIGHTFM_THREADS,
        )

    predictions = [
        (recipe_id, float(score))
        for (recipe_id, _idx), score in zip(item_pairs, scores)
    ]
    predictions.sort(key=lambda item: item[1], reverse=True)
    return predictions


def postprocess_artifact_with_metadata(artifact_path: Path, recipes_data: list[dict]) -> None:
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
    meta_minutes = []
    meta_nutrition = []
    meta_ingredients = []
    
    for row in recipes_data:
        rid = str(row["id"])
        meta_recipe_ids.append(rid)
        meta_minutes.append(int(row.get("minutes") or 0))
        # nutrition is double precision[] (typically 7 floats)
        nut = row.get("nutrition") or []
        if len(nut) < 7:
            nut = nut + [0.0] * (7 - len(nut))
        meta_nutrition.append([float(n) for n in nut[:7]])
        # ingredients list of strings -> serialize to pipe-separated string
        ings = row.get("ingredients") or []
        meta_ingredients.append("|".join(str(ing) for ing in ings))
        
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
    artifact["meta_minutes"] = np.array(meta_minutes, dtype=np.int32)
    artifact["meta_nutrition"] = np.array(meta_nutrition, dtype=np.float32)
    artifact["meta_ingredients"] = np.array(meta_ingredients, dtype=object)
    artifact["flavor_centroid"] = flavor_centroid
    
    # 5. Save back to the npz file
    np.savez_compressed(artifact_path, **artifact)
    print(f"Successfully saved metadata and flavor centroid to artifact ({artifact_path})")


def compute_recommendations():
    supabase = load_supabase_client()
    
    # 1. Fetch dynamic recipe catalog from Supabase
    print("Fetching recipe catalog from Supabase...")
    try:
        recipes_data = fetch_all_rows(supabase, "recipes", "id, minutes, nutrition, ingredients")
        recipe_catalog = [str(r["id"]) for r in recipes_data]
        print(f"Loaded {len(recipe_catalog):,} recipes from Supabase.")
    except Exception as e:
        print(f"[Error] Failed to fetch recipes from database: {e}")
        recipe_catalog = []
        
    if not recipe_catalog:
        print("[Warning] No recipes found in database 'recipes' table. Using local catalog fallback.")
        recipe_catalog = RECIPE_CATALOG

    # 2. Fetch active interactions
    raw_interactions = fetch_interactions(supabase)
    # Fetch historical interactions
    historical_interactions = fetch_historical_interactions(supabase)
    
    # 3. Get active profiles
    try:
        profiles = fetch_all_rows(supabase, "profiles", "id")
        active_users = [p["id"] for p in profiles]
        print(f"Loaded {len(active_users):,} active profiles from Supabase.")
    except Exception as e:
        print(f"[Error] Failed to fetch user profiles: {e}")
        active_users = []
        
    if not active_users:
        print("[Error] No active users found in 'profiles' table. Cannot generate recommendations.")
        return

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
        generated_at = datetime.utcnow().isoformat()
        
        print(f"Upserting default recommendations for {len(active_users)} profiles...")
        for uid in active_users:
            payload = {
                "user_id": uid,
                "recommended_recipe_ids": default_recs,
                "updated_at": datetime.utcnow().isoformat()
            }
            try:
                supabase.table("user_recommendations").upsert(payload).execute()
            except Exception as e:
                print(f"[Error] Failed to upload fallback recommendations for user {uid}: {e}")
        fallback_candidates = []
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
                    "model_name": PREFERENCE_MODEL_NAME_OVERRIDE or "popularity_fallback",
                    "generated_at": generated_at,
                })
        upload_candidate_rows(supabase, fallback_candidates)
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
    lightfm_result = train_lightfm_preference_model(combined_ratings, recipe_catalog, active_users)
    use_lightfm = lightfm_result is not None
    if use_lightfm:
        preference_model, lightfm_user_map, lightfm_item_map, default_model_name = lightfm_result
        candidate_model_name = PREFERENCE_MODEL_NAME_OVERRIDE or default_model_name
        save_lightfm_item_artifact(preference_model, recipe_catalog, lightfm_item_map, ARTIFACT_PATH)
        print(f"Saved trained LightFM item factors to {ARTIFACT_PATH}")
    else:
        if LightFM is None:
            print("[Warning] LightFM is not installed. Falling back to SVD Matrix Factorization.")
        else:
            print("[Warning] LightFM training produced no interactions. Falling back to SVD Matrix Factorization.")
        candidate_model_name = PREFERENCE_MODEL_NAME_OVERRIDE or "cf_item_factors"
        catalog_padding = pd.DataFrame({
            "user_id": ["__catalog_pad__"] * len(recipe_catalog),
            "recipe_id": recipe_catalog,
            "rating": [3.0] * len(recipe_catalog)
        })
        padded_ratings = pd.concat([combined_ratings, catalog_padding], ignore_index=True)
        preference_model = MatrixFactorizationCF(n_factors=10, n_epochs=30, rating_scale=(0, 5))
        preference_model.fit(padded_ratings)
        preference_model.save_item_factor_artifact(ARTIFACT_PATH)
        print(f"Saved trained CF item factors to {ARTIFACT_PATH}")

    postprocess_artifact_with_metadata(ARTIFACT_PATH, recipes_data)
    upload_artifact_to_storage(supabase, ARTIFACT_PATH)
    
    print(f"Generating recommendations for {len(active_users)} active users...")
    
    recommendation_payloads = []
    candidate_payloads = []
    generated_at = datetime.utcnow().isoformat()
    for user_id in active_users:
        # Get recipes already interacted with by this user (from active ratings)
        interacted_recipes = set()
        if not active_ratings.empty:
            interacted_recipes = set(active_ratings[active_ratings["user_id"] == user_id]["recipe_id"].unique())
        
        if use_lightfm:
            predictions = [
                (recipe_id, score)
                for recipe_id, score in lightfm_predictions_for_user(
                    preference_model,
                    user_id,
                    recipe_catalog,
                    lightfm_user_map,
                    lightfm_item_map,
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
            "updated_at": datetime.utcnow().isoformat()
        })
        
    # Bulk upload/upsert into user_recommendations table
    print(f"Uploading {len(recommendation_payloads)} recommendations to Supabase...")
    for payload in recommendation_payloads:
        try:
            supabase.table("user_recommendations").upsert(payload).execute()
        except Exception as e:
            print(f"[Error] Error uploading for user {payload['user_id']}: {e}")

    upload_candidate_rows(supabase, candidate_payloads)
            
    print("[Success] Recommendation sync completed successfully.")


if __name__ == "__main__":
    compute_recommendations()
