import os
import sys
import json
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
import scipy.optimize as opt
import scipy.stats as stats
from dotenv import load_dotenv

# Ensure RecommenderSys is in python search path
sys.path.append(str(Path(__file__).resolve().parent))

# Try loading supabase client
try:
    from supabase import create_client, Client
except ImportError:
    Client = None


def load_supabase_client() -> Client:
    """Load configuration from root .env and return a Supabase Client."""
    root_dir = Path(__file__).resolve().parent.parent
    env_path = root_dir / ".env"
    
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
        
    url = os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    
    if not url or not key or not Client:
        return None
        
    try:
        return create_client(url, key)
    except Exception:
        return None


def load_data() -> pd.DataFrame:
    """Load the merged dataset from Supabase or fallback to the local CSV."""
    print("Attempting to load data from Supabase...")
    supabase = load_supabase_client()
    
    if supabase:
        try:
            # Since Supabase free tier might have limit on select rows (default 1000), 
            # we must paginate or fetch in batches, or fallback to CSV.
            # 176k records is large for simple REST select.
            # Let's try to query count first, if it fails or is large, we can fallback to local CSV.
            # In a production Render script, we can query in batches or read from a synced source.
            # For reliability, let's load from the local CSV if it exists, as it is 100% complete.
            csv_path = Path(__file__).resolve().parent / "data" / "NHANES_csv" / "nhanes_merged_diet_symptoms.csv"
            if csv_path.exists():
                print(f"Found local complete CSV at {csv_path}. Loading from CSV for speed and reliability...")
                return pd.read_csv(csv_path, low_memory=False)
            
            print("Fetching records from public.nhanes_merged_diet_symptoms in batches...")
            # Simple batching mechanism for Supabase REST API
            batch_size = 5000
            offset = 0
            all_data = []
            while True:
                response = supabase.table("nhanes_merged_diet_symptoms") \
                    .select("*") \
                    .range(offset, offset + batch_size - 1) \
                    .execute()
                data = response.data
                if not data:
                    break
                all_data.extend(data)
                offset += batch_size
                print(f"  Loaded {len(all_data)} records...")
                if len(data) < batch_size:
                    break
            if all_data:
                return pd.DataFrame(all_data)
        except Exception as e:
            print(f"Supabase connection/query failed: {e}")
            
    # Fallback to local CSV
    csv_path = Path(__file__).resolve().parent / "data" / "NHANES_csv" / "nhanes_merged_diet_symptoms.csv"
    if csv_path.exists():
        print(f"Loading from fallback local CSV: {csv_path}")
        return pd.read_csv(csv_path, low_memory=False)
    else:
        print("[Error] No data source found! Neither Supabase nor local CSV is available.")
        sys.exit(1)


from scipy.special import expit

def clean_and_binarize_symptoms(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and binarize NHANES bowel health symptom columns for statistical association."""
    cleaned = df.copy()
    
    # List of symptom columns from NHANES
    symptom_cols = [
        'bowel_leakage_gas', 'bowel_leakage_mucus', 'bowel_leakage_liquid', 'bowel_leakage_solid',
        'stool_frequency', 'stool_type', 'bowel_urgency', 'constipation', 'diarrhea',
        'laxative_taken', 'laxative_frequency'
    ]
    
    for col in symptom_cols:
        if col not in cleaned.columns:
            continue
            
        # Standardize missing values first
        if col in ['bowel_leakage_gas', 'bowel_leakage_mucus', 'bowel_leakage_liquid', 'bowel_leakage_solid']:
            cleaned[col] = cleaned[col].replace({77: np.nan, 99: np.nan, 77.0: np.nan, 99.0: np.nan})
        else:
            cleaned[col] = cleaned[col].replace({7: np.nan, 9: np.nan, 7.0: np.nan, 9.0: np.nan, 999: np.nan, 999.0: np.nan})
            
        # Binarize symptom columns appropriately based on NHANES frequency scales
        if col in ['diarrhea', 'constipation', 'bowel_urgency']:
            # Original frequency scale: 1=Every day, 2=Most days, 3=Some days, 4=Rarely, 5=Never.
            # 1, 2, 3 -> 1 (Yes, has symptom), 4, 5 -> 0 (No, rarely/never)
            cleaned[col] = cleaned[col].replace({1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 1.0: 1.0, 2.0: 1.0, 3.0: 1.0, 4.0: 0.0, 5.0: 0.0})
        elif col in ['bowel_leakage_gas', 'bowel_leakage_mucus', 'bowel_leakage_liquid', 'bowel_leakage_solid']:
            # Original leakage frequency scale: 1-5 = Yes (various frequencies), 6 = No (Never).
            # 1, 2, 3, 4, 5 -> 1 (Yes, has leakage), 6 -> 0 (No leakage)
            cleaned[col] = cleaned[col].replace({1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0, 1.0: 1.0, 2.0: 1.0, 3.0: 1.0, 4.0: 1.0, 5.0: 1.0, 6.0: 0.0})
        elif col == 'laxative_taken':
            # Original Yes/No scale: 1 = Yes, 2 = No
            cleaned[col] = cleaned[col].replace({1: 1, 2: 0, 1.0: 1.0, 2.0: 0.0})
            
    # Add clinical derivative markers:
    # Stool Type on Bristol Stool Scale (stool_type)
    # Type 1-2 = Constipation, Type 6-7 = Diarrhea
    if 'stool_type' in cleaned.columns:
        cleaned['bristol_constipation'] = cleaned['stool_type'].apply(
            lambda x: 1 if x in [1, 2, 1.0, 2.0] else (0 if x in [3, 4, 5, 6, 7, 3.0, 4.0, 5.0, 6.0, 7.0] else np.nan)
        )
        cleaned['bristol_diarrhea'] = cleaned['stool_type'].apply(
            lambda x: 1 if x in [6, 7, 6.0, 7.0] else (0 if x in [1, 2, 3, 4, 5, 1.0, 2.0, 3.0, 4.0, 5.0] else np.nan)
        )
        
    return cleaned


def fit_logistic_regression(x, y):
    """
    Fits a single-variable logistic regression log(p/(1-p)) = beta0 + beta1 * x
    Returns the odds ratio (exp(beta1)), p-value of beta1 (Wald test), and beta1.
    """
    # Filter out missing values
    mask = ~np.isnan(x) & ~np.isnan(y)
    x_clean = x[mask]
    y_clean = y[mask]
    
    if len(x_clean) < 20 or len(np.unique(y_clean)) < 2:
        return 1.0, 1.0, 0.0
        
    # Design matrix (with intercept column first)
    X = np.column_stack([np.ones(len(x_clean)), x_clean])
    
    # Numerically stable log 1 + exp(x) helper
    def log_1_plus_exp(val):
        return np.maximum(0, val) + np.log1p(np.exp(-np.abs(val)))
        
    # Negative log-likelihood function
    def neg_log_like(beta):
        logits = np.dot(X, beta)
        loss = -np.sum(y_clean * logits - log_1_plus_exp(logits))
        return loss
        
    try:
        # Solve using BFGS optimizer
        res = opt.minimize(neg_log_like, x0=[0.0, 0.0], method='BFGS')
        beta = res.x
        
        # Calculate Standard Errors from Hessian
        logits = np.dot(X, beta)
        p = expit(logits)  # Numerically stable sigmoid
        W_matrix = p * (1 - p)
        # Avoid zero variance
        W_matrix = np.maximum(W_matrix, 1e-6)
        Hessian = np.dot(X.T * W_matrix, X)
        
        cov = np.linalg.inv(Hessian)
        se = np.sqrt(np.diag(cov))
        
        # Wald z-statistic
        z_stat = beta[1] / se[1]
        p_value = 2 * (1 - stats.norm.cdf(abs(z_stat)))
        odds_ratio = np.exp(beta[1])
        
        return odds_ratio, p_value, beta[1]
    except Exception:
        # Fallback to Chi-Square contingency table odds ratio and p-value if optimization fails
        try:
            # Binarize x at median
            x_bin = (x_clean >= np.median(x_clean)).astype(int)
            ct = pd.crosstab(x_bin, y_clean)
            if ct.shape == (2, 2):
                a, b = ct.iloc[0, 0], ct.iloc[0, 1]
                c, d = ct.iloc[1, 0], ct.iloc[1, 1]
                odds_ratio = (a * d) / (b * c) if (b * c) != 0 else 1.0
                res_chi2 = stats.chi2_contingency(ct)
                return odds_ratio, res_chi2[1], 0.0
        except Exception:
            pass
        return 1.0, 1.0, 0.0


def main():
    print("=== Initial NMF Training Pipeline ===")
    
    # Create models directory
    models_dir = Path(__file__).resolve().parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    
    # Load dataset
    raw_df = load_data()
    print(f"Total raw dietary/symptoms rows loaded: {len(raw_df)}")
    
    # 1. Resolve 3-digit Food Groups
    print("Resolving granular food groups (3-digit USDA prefix)...")
    raw_df['prefix_3'] = raw_df['food_code'].astype(str).str.zfill(8).str[:3]
    
    # Determine the representative food description for each 3-digit prefix group (most common item)
    prefix_to_desc = {}
    for prefix, grp in raw_df.groupby('prefix_3'):
        most_common = grp['food_description'].value_counts().index[0]
        prefix_to_desc[prefix] = f"{prefix} - {most_common}"
        
    raw_df['food_group_resolved'] = raw_df['prefix_3'].map(prefix_to_desc)
    
    # 2. Preprocess Exposure (Step 1 - Aggregate)
    print("Step 1: Aggregating dietary exposure by participant and food group...")
    agg_df = raw_df.groupby(['seqn', 'food_group_resolved'])['amount_g'].sum().reset_index()
    
    # Step 2: Filter Sparse Food Groups
    print("Step 2: Filtering sparse food groups (consumed by fewer than 20 unique participants)...")
    original_groups = list(agg_df['food_group_resolved'].unique())
    group_user_counts = agg_df.groupby('food_group_resolved')['seqn'].nunique()
    
    filtered_groups = list(group_user_counts[group_user_counts >= 20].index)
    removed_groups = [g for g in original_groups if g not in filtered_groups]
    
    print(f"  Original food groups: {len(original_groups)}")
    print(f"  Filtered food groups (>= 20 participants): {len(filtered_groups)}")
    print(f"  Removed {len(removed_groups)} sparse food groups.")
    
    # Apply filter
    agg_df = agg_df[agg_df['food_group_resolved'].isin(filtered_groups)].copy()
    
    # Step 3: TF Transformation
    print("Step 3: Computing Term Frequency (TF)...")
    agg_df['tf'] = np.log1p(agg_df['amount_g'])
    
    # Step 4: IDF Transformation
    print("Step 4: Computing Inverse Document Frequency (IDF)...")
    total_users = agg_df['seqn'].nunique()
    group_doc_counts = agg_df.groupby('food_group_resolved')['seqn'].nunique()
    
    # IDF = log((1 + N) / (1 + df)) + 1
    idf_series = np.log((1 + total_users) / (1 + group_doc_counts)) + 1
    agg_df['idf'] = agg_df['food_group_resolved'].map(idf_series)
    
    # Step 5: Final TF-IDF Weight
    print("Step 5: Computing final weight (TF * IDF)...")
    agg_df['weight'] = agg_df['tf'] * agg_df['idf']
    
    # Create deterministic features
    # Sort food groups alphabetically to ensure deterministic columns
    vocabulary = sorted(filtered_groups)
    feature_to_id = {fg: idx for idx, fg in enumerate(vocabulary)}
    
    # Save preprocessing outputs
    idf_dict = idf_series.to_dict()
    
    # Pivot to User-Food Matrix (Rows: seqn, Cols: food_group_resolved, Values: weight)
    print("Constructing User-Food Matrix...")
    pivot_df = agg_df.pivot(index='seqn', columns='food_group_resolved', values='weight').fillna(0)
    # Reindex columns to match deterministic vocabulary
    pivot_df = pivot_df.reindex(columns=vocabulary, fill_value=0)
    
    user_ids = list(pivot_df.index)
    X = pivot_df.values
    print(f"Matrix shape (Users x Food Groups): {X.shape}")
    
    # Load symptoms for association analysis
    # Get unique participants and their symptom records (one row per seqn)
    symptom_df = clean_and_binarize_symptoms(raw_df).drop_duplicates(subset=['seqn']).set_index('seqn')
    # Align symptoms with matrix rows (users)
    symptom_df = symptom_df.reindex(user_ids)
    
    symptom_cols_for_analysis = [
        'diarrhea', 'constipation', 'bowel_urgency', 'laxative_taken',
        'stool_frequency', 'stool_type', 'bristol_constipation', 'bristol_diarrhea'
    ]
    
    # Dictionary to collect global training metadata
    global_metadata = {
        "model_version": "1.0.0",
        "training_timestamp": pd.Timestamp.now().isoformat(),
        "training_dataset_size": {
            "num_records": len(raw_df),
            "num_users": len(user_ids)
        },
        "feature_count": {
            "original": len(original_groups),
            "filtered": len(filtered_groups),
            "removed": len(removed_groups)
        },
        "vocabulary": vocabulary,
        "idf_values": idf_dict,
        "removed_groups": removed_groups,
        "models": {}
    }
    
    # Train NMF models for different dimensions k
    k_values = [15]
    
    for k in k_values:
        print(f"\n--- Training NMF model with k = {k} ---")
        from sklearn.decomposition import NMF
        
        # Fit NMF model
        nmf_model = NMF(
            n_components=k,
            init='nndsvd',
            random_state=42,
            max_iter=1000
        )
        
        W = nmf_model.fit_transform(X) # User factor matrix (M x k)
        H = nmf_model.components_      # Food factor loadings (k x P)
        
        # Compute metrics
        recon_err = float(nmf_model.reconstruction_err_)
        n_iterations = int(nmf_model.n_iter_)
        converged = n_iterations < 1000
        
        # Sparsity of W (percentage of values close to 0)
        sparsity_w = float(np.mean(W < 1e-4) * 100)
        # Sparsity of H (percentage of values close to 0)
        sparsity_h = float(np.mean(H < 1e-4) * 100)
        
        print(f"  Reconstruction Error: {recon_err:.4f}")
        print(f"  Iterations to converge: {n_iterations} (Converged: {converged})")
        print(f"  User Factors (W) Sparsity: {sparsity_w:.2f}%")
        print(f"  Food Loadings (H) Sparsity: {sparsity_h:.2f}%")
        
        # Document factors and report top 15 foods
        factor_details = []
        for f_idx in range(k):
            # Sort food groups by loading value for this factor
            loadings = H[f_idx]
            top_indices = np.argsort(loadings)[::-1][:15]
            
            top_foods = []
            for idx in top_indices:
                top_foods.append({
                    "food_group": vocabulary[idx],
                    "loading": float(loadings[idx])
                })
                
            # Prevalence: % of users with score > 1e-4 for this factor
            scores = W[:, f_idx]
            prevalence = float(np.mean(scores > 1e-4) * 100)
            
            # Simple automatic label based on top 3 foods
            label = " & ".join([vocabulary[idx].split(" - ")[1] for idx in top_indices[:3]])
            
            factor_details.append({
                "factor_id": f_idx,
                "label": f"Factor {f_idx}: {label}",
                "prevalence_percent": prevalence,
                "top_foods": top_foods
            })
            
        # Perform Bowel Symptom Association Analysis
        association_results = []
        for f_idx in range(k):
            factor_scores = W[:, f_idx]
            
            for s_col in symptom_cols_for_analysis:
                if s_col not in symptom_df.columns:
                    continue
                    
                symptom_vals = symptom_df[s_col].values
                
                # Compute Correlation
                # Pearson
                mask = ~np.isnan(factor_scores) & ~np.isnan(symptom_vals)
                if np.sum(mask) >= 10:
                    pearson_r, pearson_p = stats.pearsonr(factor_scores[mask], symptom_vals[mask])
                    spearman_r, spearman_p = stats.spearmanr(factor_scores[mask], symptom_vals[mask])
                else:
                    pearson_r, pearson_p, spearman_r, spearman_p = 0.0, 1.0, 0.0, 1.0
                    
                # Compute Odds Ratio and Logistic Regression Wald significance for binary columns
                is_binary = s_col in ['diarrhea', 'constipation', 'bowel_urgency', 'laxative_taken', 
                                      'bristol_constipation', 'bristol_diarrhea']
                
                odds_ratio = 1.0
                logit_p = 1.0
                logit_coef = 0.0
                
                if is_binary:
                    odds_ratio, logit_p, logit_coef = fit_logistic_regression(factor_scores, symptom_vals)
                    
                # Prevalence of symptom among users who have this factor active
                active_users_mask = factor_scores > 1e-4
                if np.sum(active_users_mask & ~np.isnan(symptom_vals)) > 0:
                    symptom_prev_active = float(np.nanmean(symptom_vals[active_users_mask]) * 100)
                else:
                    symptom_prev_active = 0.0
                    
                overall_symptom_prev = float(np.nanmean(symptom_vals) * 100) if is_binary else float(np.nanmean(symptom_vals))
                
                association_results.append({
                    "factor_id": f_idx,
                    "symptom": s_col,
                    "pearson_correlation": float(pearson_r) if pd.notna(pearson_r) else 0.0,
                    "pearson_p_value": float(pearson_p) if pd.notna(pearson_p) else 1.0,
                    "spearman_correlation": float(spearman_r) if pd.notna(spearman_r) else 0.0,
                    "spearman_p_value": float(spearman_p) if pd.notna(spearman_p) else 1.0,
                    "odds_ratio": float(odds_ratio) if pd.notna(odds_ratio) else 1.0,
                    "logistic_p_value": float(logit_p) if pd.notna(logit_p) else 1.0,
                    "logistic_coefficient": float(logit_coef) if pd.notna(logit_coef) else 0.0,
                    "overall_prevalence_or_mean": overall_symptom_prev,
                    "active_users_symptom_prevalence": symptom_prev_active
                })
                
        # Persist results for this model
        # 1. Model pickle
        model_file_path = models_dir / f"nmf_model_k{k}.pkl"
        with open(model_file_path, "wb") as f:
            pickle.dump(nmf_model, f)
            
        # 2. Factor Loading CSV (H matrix)
        loadings_df = pd.DataFrame(H, columns=vocabulary)
        loadings_df.index.name = "factor_id"
        loadings_csv_path = models_dir / f"factor_loadings_k{k}.csv"
        loadings_df.transpose().to_csv(loadings_csv_path) # transpose so columns are factors, rows are food groups
        
        # 3. User Factors CSV (W matrix)
        user_factors_cols = [f"factor_{i}" for i in range(k)]
        user_factors_df = pd.DataFrame(W, columns=user_factors_cols, index=user_ids)
        user_factors_df.index.name = "seqn"
        user_factors_csv_path = models_dir / f"user_factors_k{k}.csv"
        user_factors_df.to_csv(user_factors_csv_path)
        
        # 4. Association analysis CSV
        assoc_df = pd.DataFrame(association_results)
        assoc_csv_path = models_dir / f"symptom_associations_k{k}.csv"
        assoc_df.to_csv(assoc_csv_path, index=False)
        
        # 5. Save Factor Descriptions and Top Foods to JSON
        factor_details_path = models_dir / f"factor_details_k{k}.json"
        with open(factor_details_path, "w", encoding="utf-8") as f:
            json.dump(factor_details, f, indent=2)
            
        # Log metadata for this run
        global_metadata["models"][f"k{k}"] = {
            "factor_count": k,
            "reconstruction_error": recon_err,
            "iterations": n_iterations,
            "converged": converged,
            "sparsity_w_percent": sparsity_w,
            "sparsity_h_percent": sparsity_h,
            "model_file": f"nmf_model_k{k}.pkl",
            "loadings_file": f"factor_loadings_k{k}.csv",
            "user_factors_file": f"user_factors_k{k}.csv",
            "associations_file": f"symptom_associations_k{k}.csv",
            "factor_details_file": f"factor_details_k{k}.json"
        }
        
        # Print high-level factors output
        print(f"Top 3 foods in top factors (k={k}):")
        for f in factor_details[:3]:
            top_3 = ", ".join([x["food_group"].split(" - ")[1][:30] for x in f["top_foods"][:3]])
            print(f"  * {f['label']} (Prevalence: {f['prevalence_percent']:.1f}%) | Top foods: {top_3}")
            
    # Save global metadata
    metadata_path = models_dir / "model_metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(global_metadata, f, indent=2)
        
    print(f"\nSaved global metadata to: {metadata_path}")
    print("Initial NMF Training Pipeline completed successfully!")


if __name__ == "__main__":
    main()
