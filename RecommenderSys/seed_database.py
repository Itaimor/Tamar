"""
Seeding script to process Food.com dataset (CSVs) and upload to Supabase.
Includes fallback mock generation if CSVs are not present.
"""

import os
import sys
import ast
import json
from pathlib import Path
import pandas as pd
import numpy as np
from dotenv import load_dotenv

# Ensure RecommenderSys is in python search path
sys.path.append(str(Path(__file__).resolve().parent))

# Try loading supabase client
try:
    from supabase import create_client, Client
except ImportError:
    print("Error: 'supabase' package is not installed. Please run: pip install supabase python-dotenv pandas numpy")
    sys.exit(1)


def load_supabase_client() -> Client:
    """Load configuration from root .env and return a Supabase Client."""
    root_dir = Path(__file__).resolve().parent.parent
    env_path = root_dir / ".env"
    
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
        
    url = os.getenv("VITE_SUPABASE_URL")
    # For server-side administrative writes, use the service_role key to bypass RLS.
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("[Error] Supabase credentials missing in .env file.")
        print("Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.")
        sys.exit(1)
        
    return create_client(url, key)


def safe_eval_list(val):
    """Safely parse a stringified list representation."""
    if not isinstance(val, str):
        return val if isinstance(val, list) else []
    try:
        parsed = ast.literal_eval(val)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    try:
        parsed = json.loads(val.replace("'", '"'))
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    return []


def generate_mock_data(n_recipes=50, n_users=20):
    """Generate high-quality mock data for testing/demo when raw CSVs are missing."""
    print(f"\n[Fallback] Generating {n_recipes} mock recipes and interactions for database seeding...")
    
    # Standard food vocabulary for mock title generation
    adjectives = ["Spicy", "Sweet", "Creamy", "Garlic", "Lemon", "Baked", "Roasted", "Crispy", "Healthy", "Zesty"]
    nouns = ["Chicken", "Salmon", "Pasta", "Salad", "Soup", "Rice Bowl", "Tacos", "Curry", "Steak", "Noodles"]
    ingredients_pool = {
        "chicken": ["chicken", "olive oil", "salt", "pepper", "garlic", "lemon"],
        "salmon": ["salmon", "dill", "lemon", "butter", "asparagus", "garlic"],
        "pasta": ["pasta", "tomato sauce", "garlic", "onions", "basil", "parmesan"],
        "salad": ["quinoa", "kale", "cucumber", "cherry tomatoes", "feta cheese", "olive oil"],
        "soup": ["broth", "carrots", "celery", "onion", "potatoes", "lentils"],
        "rice bowl": ["rice", "tofu", "broccoli", "soy sauce", "sesame seeds", "avocado"],
        "tacos": ["tortillas", "beef", "avocado", "cilantro", "lime", "salsa"],
        "curry": ["coconut milk", "curry paste", "chickpeas", "spinach", "ginger", "garlic"],
        "steak": ["beef steak", "rosemary", "garlic", "butter", "potatoes"],
        "noodles": ["ramen noodles", "egg", "green onions", "soy sauce", "mushrooms"]
    }
    
    recipes_list = []
    np.random.seed(42)
    
    for i in range(1, n_recipes + 1):
        adj = np.random.choice(adjectives)
        noun = np.random.choice(nouns)
        name = f"{adj} {noun}"
        
        # Get ingredients list based on noun
        ingredients = ingredients_pool.get(noun.lower(), ["salt", "pepper", "olive oil"])
        # Add random extra ingredients
        extra_ingredients = np.random.choice(["honey", "chili flakes", "spinach", "parmesan", "ginger", "cilantro"], size=2, replace=False)
        ingredients = list(set(ingredients + list(extra_ingredients)))
        
        # Nutrition: [calories, fat, sugar, sodium, protein, sat_fat, carbs]
        calories = float(np.random.randint(150, 750))
        fat = float(np.random.randint(5, 40))
        sugar = float(np.random.randint(0, 25))
        sodium = float(np.random.randint(5, 70))
        protein = float(np.random.randint(5, 45))
        sat_fat = float(np.random.randint(1, 20))
        carbs = float(np.random.randint(10, 90))
        nutrition = [calories, fat, sugar, sodium, protein, sat_fat, carbs]
        
        # Check if IBS friendly (e.g. no onions/garlic)
        is_ibs_friendly = not any(trigger in [ing.lower() for ing in ingredients] for trigger in ["garlic", "onion", "onions", "milk", "cheese", "wheat", "bread"])
        
        recipes_list.append({
            "id": int(i),
            "name": name,
            "minutes": int(np.random.exponential(scale=20) + 10),
            "n_steps": int(np.random.randint(3, 15)),
            "n_ingredients": len(ingredients),
            "ingredients": ingredients,
            "steps": [f"Step 1: Prep the ingredients.", f"Step 2: Cook the {noun}.", f"Step 3: Serve warm and enjoy!"],
            "nutrition": nutrition,
            "description": f"A simple and delicious recipe for {name}. Perfect for a quick meal.",
            "image_url": f"https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop" if i % 2 == 0 else "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop",
            "is_ibs_friendly": is_ibs_friendly
        })
        
    recipes_df = pd.DataFrame(recipes_list)
    
    # Generate historical interactions
    interactions_list = []
    for uid in range(1000, 1000 + n_users):
        # Each user rates 5 to 15 random recipes
        n_ratings = np.random.randint(5, 15)
        rated_recipes = np.random.choice(range(1, n_recipes + 1), size=n_ratings, replace=False)
        for r_id in rated_recipes:
            interactions_list.append({
                "user_id": int(uid),
                "recipe_id": int(r_id),
                "rating": float(np.random.choice([1.0, 2.0, 3.0, 4.0, 5.0], p=[0.05, 0.05, 0.1, 0.3, 0.5]))
            })
            
    interactions_df = pd.DataFrame(interactions_list)
    return recipes_df, interactions_df


def seed_database(top_recipes_limit=1000):
    supabase = load_supabase_client()
    
    # Path configurations
    data_dir = Path(__file__).resolve().parent / "data" / "raw"
    recipes_csv = data_dir / "RAW_recipes.csv"
    interactions_csv = data_dir / "RAW_interactions.csv"
    
    # 1. Download dataset if missing
    if not recipes_csv.exists() or not interactions_csv.exists():
        print(f"\n[Info] Food.com dataset CSV files not found at: {data_dir}")
        print("Attempting to download dataset using kagglehub...")
        try:
            import kagglehub
            import shutil
            
            download_path = Path(kagglehub.dataset_download("shuyangli94/food-com-recipes-and-user-interactions"))
            print(f"Dataset downloaded by kagglehub to: {download_path}")
            
            data_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy both files
            for filename in ["RAW_recipes.csv", "RAW_interactions.csv"]:
                src = download_path / filename
                dest = data_dir / filename
                if src.exists():
                    print(f"Copying {filename} to {dest}...")
                    shutil.copy(src, dest)
                else:
                    print(f"[Warning] Expected file {filename} not found in downloaded dataset.")
        except Exception as e:
            print(f"[Error] Failed to download or copy dataset using kagglehub: {e}")

    # 2. Load dataset (either real or fallback to mock)
    if not recipes_csv.exists() or not interactions_csv.exists():
        print("Falling back to generating mock data because raw CSVs are missing.")
        recipes_df, interactions_df = generate_mock_data(n_recipes=100, n_users=30)
    else:
        print("Found Food.com CSV files. Loading data...")
        raw_recipes = pd.read_csv(recipes_csv)
        raw_interactions = pd.read_csv(interactions_csv)
        
        print("Calculating most popular recipes for subsampling...")
        # Get top-N most reviewed recipes
        recipe_popularity = raw_interactions.groupby("recipe_id").size()
        top_recipe_ids = recipe_popularity.nlargest(top_recipes_limit).index
        
        # Filter datasets
        recipes_df = raw_recipes[raw_recipes["id"].isin(top_recipe_ids)].copy()
        interactions_df = raw_interactions[raw_interactions["recipe_id"].isin(top_recipe_ids)].copy()
        
        print(f"Subsampled to {len(recipes_df)} recipes and {len(interactions_df)} interactions.")
        
        # Parse arrays in recipes
        print("Formatting recipe fields (parsing arrays)...")
        recipes_df["ingredients"] = recipes_df["ingredients"].apply(safe_eval_list)
        recipes_df["steps"] = recipes_df["steps"].apply(safe_eval_list)
        recipes_df["nutrition"] = recipes_df["nutrition"].apply(safe_eval_list)
        
        # Determine IBS friendliness (basic keyword checklist for common triggers)
        # e.g., low FODMAP vs high FODMAP ingredients
        trigger_keywords = ["garlic", "onion", "milk", "cheese", "cream", "wheat", "bread", "bean", "lentil", "broccoli", "cauliflower", "apple", "pear"]
        
        def check_ibs_friendly(ingredients_list):
            for ing in ingredients_list:
                ing_lower = ing.lower()
                if any(trigger in ing_lower for trigger in trigger_keywords):
                    return False
            return True
            
        recipes_df["is_ibs_friendly"] = recipes_df["ingredients"].apply(check_ibs_friendly)
        
        # Assign Unsplash placeholder food images since Food.com has no images
        recipes_df["image_url"] = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop"

    # 1. Seeding Recipes
    print(f"Seeding {len(recipes_df)} recipes into public.recipes in Supabase...")
    # Convert dataframe to list of dicts
    recipes_to_insert = []
    for _, row in recipes_df.iterrows():
        recipes_to_insert.append({
            "id": int(row["id"]),
            "name": str(row["name"]).title(),
            "minutes": int(row["minutes"]) if not pd.isna(row["minutes"]) else 0,
            "n_steps": int(row["n_steps"]) if not pd.isna(row["n_steps"]) else 0,
            "n_ingredients": int(row["n_ingredients"]) if not pd.isna(row["n_ingredients"]) else 0,
            "ingredients": list(row["ingredients"]),
            "steps": list(row["steps"]),
            "nutrition": [float(n) for n in row["nutrition"]],
            "description": str(row["description"]) if not pd.isna(row["description"]) else "",
            "image_url": str(row["image_url"]),
            "is_ibs_friendly": bool(row["is_ibs_friendly"])
        })
        
    # Bulk insert recipes in chunks of 100
    chunk_size = 100
    for i in range(0, len(recipes_to_insert), chunk_size):
        chunk = recipes_to_insert[i:i + chunk_size]
        try:
            supabase.table("recipes").upsert(chunk).execute()
            print(f"  [Recipes] Seeded items {i+1} to {min(i+chunk_size, len(recipes_to_insert))}")
        except Exception as e:
            print(f"  [Error] Failed to seed recipes chunk {i}: {e}")
            
    # 2. Seeding Historical Interactions
    print(f"Seeding {len(interactions_df)} interactions into public.historical_interactions...")
    interactions_to_insert = []
    for _, row in interactions_df.iterrows():
        interactions_to_insert.append({
            "user_id": int(row["user_id"]),
            "recipe_id": int(row["recipe_id"]),
            "rating": float(row["rating"])
        })
        
    # Bulk insert interactions in chunks of 500
    chunk_size = 500
    for i in range(0, len(interactions_to_insert), chunk_size):
        chunk = interactions_to_insert[i:i + chunk_size]
        try:
            supabase.table("historical_interactions").upsert(chunk).execute()
            if i % 2500 == 0 or i + chunk_size >= len(interactions_to_insert):
                print(f"  [Interactions] Seeded items {i+1} to {min(i+chunk_size, len(interactions_to_insert))}")
        except Exception as e:
            print(f"  [Error] Failed to seed interactions chunk {i}: {e}")
            break # break early if we run into API limit errors
            
    print("\n[Success] Database seeding process completed!")


if __name__ == "__main__":
    # If running with real data, seed 1000 recipes.
    # We can pass an argument or default to 500 recipes for faster testing if needed.
    limit = 500
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except ValueError:
            pass
    seed_database(top_recipes_limit=limit)
