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
from dotenv import load_dotenv

# Ensure RecommenderSys is in python search path
sys.path.append(str(Path(__file__).resolve().parent))

# Try loading supabase client
try:
    from supabase import create_client, Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv")
    sys.exit(1)

# Import our colleague's Matrix Factorization model
from src.matrix_factorization import MatrixFactorizationCF
from cold_start_active_learning import preprocess_recipe_features, cluster_item_space, select_cluster_medoids

# Catalog of our 30 local recipe IDs in the frontend
RECIPE_CATALOG = [str(i) for i in range(1, 31)]

# Mapping categorical interactions to numerical weights for training
INTERACTION_WEIGHTS = {
    "viewed": 1.5,
    "started": 3.5,
    "saved": 5.0,
    "completed": 5.0,
    "dismissed": 0.0
}


def load_supabase_client() -> Client:
    """Load configuration from root .env and return a Supabase Client."""
    # Find .env in project root (parent directory of RecommenderSys)
    root_dir = Path(__file__).resolve().parent.parent
    env_path = root_dir / ".env"
    
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
        
    url = os.getenv("VITE_SUPABASE_URL")
    # For server-side administrative writes, use the service_role key to bypass RLS.
    # Fallback to anon/publishable key if service_role is not available.
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("[Error] Supabase credentials missing in .env file.")
        print("Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.")
        sys.exit(1)
        
    return create_client(url, key)


def fetch_interactions(supabase: Client) -> pd.DataFrame:
    """Fetch user-recipe interaction logs from the Supabase database."""
    print("Fetching active user interactions from Supabase...")
    
    try:
        response = supabase.table("recipe_interactions").select("user_id, recipe_id, interaction_type").execute()
        data = response.data
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
        response = supabase.table("historical_interactions").select("user_id, recipe_id, rating").execute()
        data = response.data
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


def process_interactions_to_ratings(interactions_df: pd.DataFrame) -> pd.DataFrame:
    """Maps categorical interactions to numeric rating values and aggregates duplicates."""
    if interactions_df.empty:
        return pd.DataFrame(columns=["user_id", "recipe_id", "rating"])
        
    # Map interaction type to weights
    interactions_df["weight"] = interactions_df["interaction_type"].map(INTERACTION_WEIGHTS).fillna(1.0)
    
    # Aggregate multiple interactions by taking the maximum rating for a user-recipe pair
    ratings_df = interactions_df.groupby(["user_id", "recipe_id"])["weight"].max().reset_index()
    ratings_df.columns = ["user_id", "recipe_id", "rating"]
    
    return ratings_df


def compute_recommendations():
    supabase = load_supabase_client()
    
    # 1. Fetch dynamic recipe catalog from Supabase
    print("Fetching recipe catalog from Supabase...")
    try:
        recipes_response = supabase.table("recipes").select("id").execute()
        recipe_catalog = [str(r["id"]) for r in recipes_response.data]
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
        profiles = supabase.table("profiles").select("id").execute().data
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
        default_scores = [round(0.95 - i*0.05, 4) for i in range(len(default_recs))]
        
        print(f"Upserting default recommendations for {len(active_users)} profiles...")
        for uid in active_users:
            payload = {
                "user_id": uid,
                "recommended_recipe_ids": default_recs,
                "match_scores": default_scores,
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
        
        # Take top 6 recipe IDs with predictions
        top_k_preds = predictions[:6]
        
        # If user has seen almost everything, fill back up with general items
        if len(top_k_preds) < 6:
            seen_ids = {p[0] for p in top_k_preds}
            remaining = [r for r in recipe_catalog if r not in seen_ids and r not in interacted_recipes]
            for r in remaining[:(6 - len(top_k_preds))]:
                top_k_preds.append((r, 2.5))
            
        # If still empty (e.g. user interacted with everything), fall back to general catalog
        if not top_k_preds:
            top_k_preds = [(r, 2.5) for r in recipe_catalog[:6]]
            
        rec_ids = [p[0] for p in top_k_preds]
        # Normalize prediction ratings (0-5 scale) to percentage format (0.0-1.0 scale)
        rec_scores = [round(min(1.0, max(0.0, float(p[1]) / 5.0)), 4) for p in top_k_preds]
        
        recommendation_payloads.append({
            "user_id": user_id,
            "recommended_recipe_ids": rec_ids,
            "match_scores": rec_scores,
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
