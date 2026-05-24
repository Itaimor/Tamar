"""
Batch Script to Train Recommender and Sync Recommendations with Supabase.

Steps:
1. Load credentials and establish connection to Supabase.
2. Fetch logs from `recipe_interactions` table.
3. Convert categorical interaction logs to numerical ratings.
4. Train Collaborative Filtering (SVD / Matrix Factorization).
5. For each user, predict rankings across the recipe catalog (IDs 1-30).
6. Bulk upsert recommendations to `user_recommendations` in Supabase.
"""

import os
import sys
from pathlib import Path
import pandas as pd
import numpy as np
from datetime import datetime

# Ensure RecommenderSys is in python search path
sys.path.append(str(Path(__file__).resolve().parent))

try:
    from supabase import Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv")
    sys.exit(1)

# Import our colleague's Matrix Factorization model
from src.matrix_factorization import MatrixFactorizationCF
from cold_start_active_learning import preprocess_recipe_features, cluster_item_space, select_cluster_medoids
from recommender_common import (
    ARTIFACT_PATH,
    RECIPE_CATALOG,
    get_artifact_bucket,
    get_artifact_storage_path,
    load_supabase_client,
    normalize_match_scores,
    process_interactions_to_ratings,
)


def fetch_all_rows(
    supabase: Client,
    table_name: str,
    columns: str,
    page_size: int | None = None,
) -> list[dict]:
    """Fetch all rows from a Supabase table using range pagination."""
    page_size = page_size or int(os.getenv("SUPABASE_FETCH_PAGE_SIZE", "1000"))
    rows: list[dict] = []
    start = 0

    while True:
        end = start + page_size - 1
        response = (
            supabase.table(table_name)
            .select(columns)
            .range(start, end)
            .execute()
        )

        page = response.data or []
        rows.extend(page)

        if len(page) < page_size:
            break

        start += page_size
        if len(rows) % (page_size * 25) == 0:
            print(f"  fetched {len(rows):,} rows from {table_name}...")

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


def compute_recommendations():
    supabase = load_supabase_client()
    
    # 1. Fetch dynamic recipe catalog from Supabase
    print("Fetching recipe catalog from Supabase...")
    try:
        recipes_data = fetch_all_rows(supabase, "recipes", "id")
        recipe_catalog = [str(r["id"]) for r in recipes_data]
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
        print("[Success] Completed fallback recommendations upsert.")
        return

    print(f"Processed {len(combined_ratings)} total ratings (active + historical).")
    
    # 4. Train SVD Collaborative Filtering Model
    print("Training SVD Matrix Factorization model...")
    combined_ratings["recipe_id"] = combined_ratings["recipe_id"].astype(str)
    
    # Pad ratings so SVD is aware of all active recipes in the catalog
    catalog_padding = pd.DataFrame({
        "user_id": ["__catalog_pad__"] * len(recipe_catalog),
        "recipe_id": recipe_catalog,
        "rating": [3.0] * len(recipe_catalog)
    })
    padded_ratings = pd.concat([combined_ratings, catalog_padding], ignore_index=True)
    
    model = MatrixFactorizationCF(n_factors=10, n_epochs=30, rating_scale=(0, 5))
    model.fit(padded_ratings)
    model.save_item_factor_artifact(ARTIFACT_PATH)
    print(f"Saved trained CF item factors to {ARTIFACT_PATH}")
    upload_artifact_to_storage(supabase, ARTIFACT_PATH)
    
    print(f"Generating recommendations for {len(active_users)} active users...")
    
    recommendation_payloads = []
    for user_id in active_users:
        # Get recipes already interacted with by this user (from active ratings)
        interacted_recipes = set()
        if not active_ratings.empty:
            interacted_recipes = set(active_ratings[active_ratings["user_id"] == user_id]["recipe_id"].unique())
        
        # Calculate predicted scores for all recipe IDs in our dynamic catalog
        predictions = []
        for recipe_id in recipe_catalog:
            # Recommend items they haven't completed or saved yet
            if recipe_id not in interacted_recipes:
                score = model.predict(user_id, recipe_id)
                predictions.append((recipe_id, score))
                
        # Sort by predicted rating in descending order
        predictions.sort(key=lambda x: x[1], reverse=True)
        
        # Take top 6 recipe IDs
        top_predictions = predictions[:6]
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
            
    print("[Success] Recommendation sync completed successfully.")


if __name__ == "__main__":
    compute_recommendations()
