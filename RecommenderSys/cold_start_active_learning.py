"""
Cold-Start Active Learning module for Recipe Recommendations (using Food.com dataset structure).

This module implements a hybrid active learning backend:
1. Feature engineering on recipe metadata (complexity, sparsity, nutrition).
2. Clustering using K-Means to identify K distinct culinary profiles.
3. Medoid selection using distance-to-centroid and global popularity constraints.
4. User vector initialization by projecting user feedback into the latent feature space.
"""

import ast
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


def preprocess_recipe_features(recipes_df: pd.DataFrame) -> pd.DataFrame:
    """
    Extracts and clean features from the Food.com recipes dataset to represent the item space.
    
    Features targeted:
      - Prep Time & Complexity: `minutes` and `n_steps`
      - Resource Sparsity: `n_ingredients`
      - Nutritional Profile: `nutrition` array (7-element string representation of a list).
        Format: [calories, total fat (PDV), sugar (PDV), sodium (PDV), protein (PDV), saturated fat (PDV), carbs (PDV)]
        We extract calories, protein, and carbohydrates to derive macro-nutrient ratios.
    """
    df = recipes_df.copy()
    
    # Parse the stringified nutrition list
    def parse_nutrition(x):
        try:
            if isinstance(x, str):
                val = ast.literal_eval(x)
            else:
                val = x
            if isinstance(val, list) and len(val) >= 7:
                return val[0], val[4], val[6] # calories, protein, carbs
        except Exception:
            pass
        return 0.0, 0.0, 0.0

    parsed = df["nutrition"].apply(parse_nutrition)
    df["calories"] = [p[0] for p in parsed]
    df["protein_pdv"] = [p[1] for p in parsed]
    df["carbs_pdv"] = [p[2] for p in parsed]

    # Handle zeros to avoid division-by-zero errors when calculating macro ratios
    epsilon = 1e-5
    df["protein_to_carb_ratio"] = df["protein_pdv"] / (df["carbs_pdv"] + epsilon)
    df["protein_to_calorie_ratio"] = df["protein_pdv"] / (df["calories"] + epsilon)

    # Fill NaNs/Infs that might result from raw data anomalies
    df.replace([np.inf, -np.inf], 0, inplace=True)
    df.fillna(0, inplace=True)

    # Feature List for clustering
    feature_cols = [
        "minutes",
        "n_steps",
        "n_ingredients",
        "calories",
        "protein_pdv",
        "carbs_pdv",
        "protein_to_carb_ratio",
        "protein_to_calorie_ratio"
    ]
    
    return df[["id", "name"] + feature_cols]


def cluster_item_space(features_df: pd.DataFrame, n_clusters: int = 5) -> tuple[pd.DataFrame, KMeans, StandardScaler]:
    """
    Applies K-Means clustering on the scaled item feature vectors to partition the recipe space.
    """
    feature_cols = [c for c in features_df.columns if c not in ["id", "name"]]
    
    # Scale features for clustering
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features_df[feature_cols])
    
    # Fit K-Means
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    clusters = kmeans.fit_predict(scaled_features)
    
    clustered_df = features_df.copy()
    clustered_df["cluster"] = clusters
    
    # Store scaled coordinates in the DataFrame for distance calculations
    for idx, col in enumerate(feature_cols):
        clustered_df[f"scaled_{col}"] = scaled_features[:, idx]
        
    return clustered_df, kmeans, scaler


def select_cluster_medoids(
    clustered_df: pd.DataFrame, 
    interactions_df: pd.DataFrame, 
    kmeans_model: KMeans,
    popularity_percentile: float = 0.5
) -> pd.DataFrame:
    """
    Mathematically determines the 'Medoid' recipe for each cluster.
    
    Constraints:
      1. Closest to the cluster centroid (in scaled feature space).
      2. Satisfies global popularity threshold: high review count and low rating variance.
    """
    # 1. Calculate popularity metrics per recipe
    stats = interactions_df.groupby("recipe_id").agg(
        review_count=("rating", "count"),
        rating_var=("rating", "var"),
        rating_mean=("rating", "mean")
    ).reset_index()
    
    # Fill NaN variance with 0 (e.g. for recipes with only 1 rating)
    stats["rating_var"] = stats["rating_var"].fillna(0)
    
    # Merge popularity metrics back to recipes
    merged = clustered_df.merge(stats, left_on="id", right_on="recipe_id", how="left")
    merged["review_count"] = merged["review_count"].fillna(0)
    merged["rating_var"] = merged["rating_var"].fillna(0)
    merged["rating_mean"] = merged["rating_mean"].fillna(0)

    # Popularity threshold (e.g., must be in the top 50% of review counts)
    min_reviews = merged["review_count"].quantile(popularity_percentile)
    
    # Find the feature column names that are scaled
    scaled_cols = [c for c in clustered_df.columns if c.startswith("scaled_")]
    centroids = kmeans_model.cluster_centers_
    
    medoids = []
    
    for cluster_id in range(kmeans_model.n_clusters):
        cluster_recipes = merged[merged["cluster"] == cluster_id]
        
        # Filter by popularity (review count threshold)
        popular_cluster_recipes = cluster_recipes[cluster_recipes["review_count"] >= min_reviews]
        
        # If the filtered list is empty, fall back to the entire cluster to avoid crashes
        if popular_cluster_recipes.empty:
            popular_cluster_recipes = cluster_recipes
            
        # Extract scaled coordinates
        recipe_coords = popular_cluster_recipes[scaled_cols].values
        centroid = centroids[cluster_id]
        
        # Compute Euclidean distance to cluster centroid: sqrt(sum((x - c)^2))
        distances = np.linalg.norm(recipe_coords - centroid, axis=1)
        
        # We want to select the recipe closest to the centroid, but we also balance it with rating variance.
        # Score = distance + alpha * normalized_rating_variance
        # Standardize distance and variance to bring them to the same scale
        std_distances = (distances - np.mean(distances)) / (np.std(distances) + 1e-9)
        std_variance = (popular_cluster_recipes["rating_var"].values - popular_cluster_recipes["rating_var"].mean()) / (popular_cluster_recipes["rating_var"].std() + 1e-9)
        
        # Medoid Selection Score (lower is better: close to centroid, low rating variance)
        score = std_distances + 0.5 * std_variance
        best_idx = np.argmin(score)
        
        medoid_recipe = popular_cluster_recipes.iloc[best_idx]
        medoids.append(medoid_recipe)
        
    return pd.DataFrame(medoids)


def bootstrap_user_vector(
    user_feedback: dict[int, float], 
    clustered_df: pd.DataFrame
) -> np.ndarray:
    """
    Projects user feedback on medoid items into the latent item space.
    
    Mathematical Formulation:
      U_new = sum_i( w_i * V_i )
      where:
        - V_i is the scaled feature vector of recipe i
        - w_i is the user's feedback weight. 
          For Like/Dislike (binary): Like = +1.0, Dislike = -1.0
          For continuous ratings (1-5): normalized around user/global mean (rating - 3.0)
          
    This projects the user's preferences directly into the latent dimensions representing
    complexity, preparation speed, and nutritional profiles.
    """
    scaled_cols = [c for c in clustered_df.columns if c.startswith("scaled_")]
    latent_dim = len(scaled_cols)
    
    user_vector = np.zeros(latent_dim)
    total_weight = 0.0
    
    for recipe_id, score in user_feedback.items():
        recipe_row = clustered_df[clustered_df["id"] == recipe_id]
        if recipe_row.empty:
            continue
            
        vector = recipe_row[scaled_cols].values[0]
        
        # Project interaction score (centering around 0 to denote neutral)
        # e.g., if rating is 1-5, weight = rating - 3.0. If binary feedback, score is direct (+1 / -1)
        weight = score
        user_vector += weight * vector
        total_weight += abs(weight)
        
    if total_weight > 0:
        user_vector /= total_weight # Normalize the vector
        
    return user_vector


def get_recommendations_for_user_vector(
    user_vector: np.ndarray, 
    clustered_df: pd.DataFrame, 
    k: int = 5,
    exclude_ids: list[int] = None
) -> list[tuple[int, str, float]]:
    """
    Finds top-K recipes closest to the user's bootstrapped latent vector using cosine similarity.
    """
    if exclude_ids is None:
        exclude_ids = []
        
    scaled_cols = [c for c in clustered_df.columns if c.startswith("scaled_")]
    all_recipes = clustered_df[~clustered_df["id"].isin(exclude_ids)].copy()
    
    vectors = all_recipes[scaled_cols].values
    
    # Calculate cosine similarity: (A . B) / (||A|| * ||B||)
    u_norm = np.linalg.norm(user_vector)
    if u_norm == 0:
        # If user has neutral vector, return popular recipes or random
        return [(row["id"], row["name"], 0.0) for _, row in all_recipes.head(k).iterrows()]
        
    v_norms = np.linalg.norm(vectors, axis=1)
    v_norms[v_norms == 0] = 1e-9 # avoid division by zero
    
    dot_products = np.dot(vectors, user_vector)
    similarities = dot_products / (u_norm * v_norms)
    
    all_recipes["similarity"] = similarities
    top_recipes = all_recipes.sort_values(by="similarity", ascending=False).head(k)
    
    return [(int(row["id"]), str(row["name"]), float(row["similarity"])) for _, row in top_recipes.iterrows()]


# --- Self-Testing / Executable Demo ---
if __name__ == "__main__":
    print("Initializing Active Learning Demo with Mock Food.com Dataset...")
    
    # Generate mock recipe data to mimic the columns of RAW_recipes.csv
    np.random.seed(42)
    mock_recipes = pd.DataFrame({
        "id": range(1, 101),
        "name": [f"Recipe {i}" for i in range(1, 101)],
        "minutes": np.random.exponential(scale=30, size=100) + 5,
        "n_steps": np.random.randint(3, 20, size=100),
        "n_ingredients": np.random.randint(2, 15, size=100),
        "nutrition": [
            str([
                float(np.random.randint(100, 800)),  # calories
                float(np.random.randint(5, 50)),     # total fat
                float(np.random.randint(2, 40)),     # sugar
                float(np.random.randint(10, 80)),    # sodium
                float(np.random.randint(2, 35)),     # protein
                float(np.random.randint(5, 45)),     # sat fat
                float(np.random.randint(10, 100))    # carbs
            ]) for _ in range(100)
        ]
    })
    
    # Generate mock interaction data to mimic RAW_interactions.csv
    mock_interactions = pd.DataFrame({
        "user_id": np.random.randint(1000, 1050, size=500),
        "recipe_id": np.random.randint(1, 101, size=500),
        "rating": np.random.choice([1.0, 2.0, 3.0, 4.0, 5.0], size=500, p=[0.05, 0.05, 0.1, 0.3, 0.5])
    })

    print("Step 1: Running Preprocessing and Feature Extraction...")
    features_df = preprocess_recipe_features(mock_recipes)
    print(features_df.head(2))
    
    print("\nStep 2: Clustering Recipe Space into K=5 Culinary Profiles...")
    clustered_df, kmeans_model, scaler = cluster_item_space(features_df, n_clusters=5)
    print(clustered_df[["id", "name", "cluster"]].head(5))
    
    print("\nStep 3: Calculating Medoids with Popularity Filters...")
    medoids = select_cluster_medoids(clustered_df, mock_interactions, kmeans_model, popularity_percentile=0.3)
    print("\nSelected Medoids for Onboarding Interface:")
    for idx, row in medoids.iterrows():
        print(f"Cluster {row['cluster']} Medoid: ID={row['id']}, Name={row['name']}")
        
    # Simulate a user session
    print("\nStep 4: Simulating New User Interactions on Medoids...")
    # User likes cluster 1 medoid (+1.0) and dislikes cluster 3 medoid (-1.0)
    user_medoid_likes = {
        int(medoids.iloc[1]["id"]): 1.0,
        int(medoids.iloc[3]["id"]): -1.0
    }
    print(f"User Feedback: {user_medoid_likes}")
    
    user_vector = bootstrap_user_vector(user_medoid_likes, clustered_df)
    print(f"Bootstrapped User Latent Profile Vector:\n{user_vector}")
    
    print("\nStep 5: Generating Recommendations Based on Bootstrapped Vector...")
    recs = get_recommendations_for_user_vector(user_vector, clustered_df, k=3, exclude_ids=list(user_medoid_likes.keys()))
    for recipe_id, name, score in recs:
        print(f"  Match Score: {score:.3f} | ID: {recipe_id} | Name: {name}")
    
    print("\nActive Learning Demo Completed Successfully!")
