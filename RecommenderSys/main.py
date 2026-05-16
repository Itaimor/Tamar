"""End-to-end CF pipeline: load → train 3 models → show sample → compare.

Run:  python main.py
"""
from sklearn.model_selection import train_test_split

from src.data_loader import load_food_com, build_user_item_matrix, print_stats
from src.item_based_cf import ItemBasedCF
from src.user_based_cf import UserBasedCF
from src.matrix_factorization import MatrixFactorizationCF
from src.evaluate import compare_methods


def main():
    print("Loading Food.com (subsampling)...")
    interactions, recipes = load_food_com(top_recipes=5_000, min_ratings_per_user=5)
    print_stats(interactions)

    print("\nSplitting train/test (80/20)...")
    train_df, test_df = train_test_split(interactions, test_size=0.2, random_state=42)
    train_matrix = build_user_item_matrix(train_df)
    print(f"Train matrix: {train_matrix.shape}")

    print("\nTraining Item-Based CF...")
    item_cf = ItemBasedCF().fit(train_matrix)

    print("Training User-Based CF...")
    user_cf = UserBasedCF(neighborhood_size=50).fit(train_matrix)

    print("Training Matrix Factorization (Surprise SVD)...")
    mf = MatrixFactorizationCF(n_factors=50, n_epochs=20).fit(train_df)

    sample_user = train_matrix.index[0]
    print(f"\nSample recommendations for user {sample_user}:")
    recipe_names = recipes.set_index("id")["name"].to_dict()

    for name, model in [("Item-Based", item_cf), ("User-Based", user_cf), ("MF (SVD)", mf)]:
        top = model.recommend(sample_user, k=5)
        print(f"\n  {name}:")
        for rid, score in top.items():
            print(f"    {score:.3f}  {recipe_names.get(rid, '?')}")

    print("\nComparing methods on the test set...")
    results = compare_methods(
        models={"Item-Based": item_cf, "User-Based": user_cf, "MF (SVD)": mf},
        test_df=test_df,
        candidate_recipes=train_matrix.columns,
        rmse_sample=2_000,
        precision_users=100,
        k=10,
    )
    print("\n=== Results ===")
    print(results)


if __name__ == "__main__":
    main()
