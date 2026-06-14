import json
import numpy as np
import pandas as pd
from pathlib import Path

# Cosine similarity helper
def cosine_similarity_matrix(matrix):
    # matrix: M x K
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1e-12 # avoid division by zero
    normalized_matrix = matrix / norms
    similarity = np.dot(normalized_matrix, normalized_matrix.T)
    return similarity


def get_fodmap_info(food_desc):
    """
    Applies a rule-based mapping to classify USDA food descriptions into FODMAP categories and severities.
    """
    desc = food_desc.lower()
    
    # GOS (Beans, lentils, nuts)
    if any(x in desc for x in ['bean', 'pinto', 'refried', 'lentil', 'chickpea', 'almond', 'cashew']):
        severity = 'Medium' if 'almond' in desc else 'High'
        return 'GOS', severity
        
    # Lactose (Milk, yogurt, ice cream, soft dairy)
    elif any(x in desc for x in ['milk', 'yogurt', 'ice cream', 'pudding', 'cafe con leche', 'sour cream', 'cream']):
        # Hard cheeses are low in lactose
        if any(x in desc for x in ['hard cheese', 'cheddar', 'parmesan', 'swiss cheese', 'mozzarella', 'natural cheese']):
            return 'Low FODMAP', 'Low'
        elif any(x in desc for x in ['sour cream', 'processed cheese']):
            return 'Lactose', 'Medium'
        else:
            return 'Lactose', 'High'
            
    # Fructans (Wheat products, onions, garlic)
    elif any(x in desc for x in ['wheat', 'bread', 'biscuit', 'roll', 'bun', 'spaghetti', 'macaroni', 'noodles', 'pie', 'cake', 'cookie', 'doughnut', 'gravy', 'pot pie', 'onion', 'garlic']):
        return 'Fructans', 'High'
        
    # Excess Fructose (Apples, pears, honey, HFCS-sweetened sodas/sauces)
    elif any(x in desc for x in ['apple', 'pear', 'mango', 'honey', 'juice drink', 'soda', 'soft drink', 'cola', 'catsup', 'ketchup', 'jelly', 'syrup']):
        return 'Excess Fructose', 'High'
        
    # Polyols (Avocado, sweetpotato, stone fruits, corn)
    elif any(x in desc for x in ['avocado', 'guacamole', 'sweetpotato', 'blackberry', 'cherry', 'plum', 'prune', 'apricot', 'peach', 'watermelon', 'corn']):
        severity = 'High' if any(x in desc for x in ['avocado', 'guacamole']) else 'Medium'
        return 'Polyols', severity
        
    # Low FODMAP (Water, coffee, tea, rice, clean meats, eggs, butter, specific fruits/veggies, corn tortillas)
    elif any(x in desc for x in ['water', 'coffee', 'tea', 'rice', 'beef', 'chicken', 'pork', 'turkey', 'fish', 'salmon', 'tuna', 'egg', 'butter', 'oil', 'lettuce', 'spinach', 'carrot', 'strawberry', 'banana', 'orange', 'potato', 'tortilla']):
        return 'Low FODMAP', 'Low'
        
    else:
        return 'Unknown', 'Unknown'


def main():
    print("=== IaCF Phase 2 Pipeline ===")
    
    # Setup paths
    base_dir = Path(__file__).resolve().parent
    models_dir = base_dir / "models"
    raw_csv_path = base_dir / "data" / "NHANES_csv" / "nhanes_merged_diet_symptoms.csv"
    
    # Load Phase 1 outputs
    print("Loading Phase 1 outputs...")
    loadings_df = pd.read_csv(models_dir / "factor_loadings_k15.csv")
    
    # Clean up column index for loadings
    if 'factor_id' in loadings_df.columns:
        loadings_df = loadings_df.rename(columns={'factor_id': 'food_group'}).set_index('food_group')
    elif 'food_group' in loadings_df.columns:
        loadings_df = loadings_df.set_index('food_group')
    else:
        # If the first column has no name or another name
        first_col = loadings_df.columns[0]
        loadings_df = loadings_df.rename(columns={first_col: 'food_group'}).set_index('food_group')
        
    user_factors_df = pd.read_csv(models_dir / "user_factors_k15.csv", index_col="seqn")
    symptom_assoc_df = pd.read_csv(models_dir / "symptom_associations_k15.csv")
    
    vocabulary = list(loadings_df.index)
    user_ids = list(user_factors_df.index)
    W = user_factors_df.values # M x 15
    H = loadings_df.values.T   # 15 x P
    
    print(f"  Loaded {len(vocabulary)} food groups and {len(user_ids)} users.")
    
    # --- STEP 1: Factor Labeling ---
    print("\nStep 1: Generating factor labels...")
    factor_labels_dict = {
        "factor_0": "Fruit, Yogurt & Red Wine",
        "factor_1": "Caffeine, Soda & Quick Meals",
        "factor_2": "Chicken, Rice & Bottled Water",
        "factor_3": "Alcoholic Beverages & Snacks",
        "factor_4": "Unsweetened Tea, Rice & Poultry",
        "factor_5": "Fruit Juice, Pasta & Salty Snacks",
        "factor_6": "Corn Tortillas, Beans & Eggs",
        "factor_7": "Mashed Potatoes, Gravy & Poultry",
        "factor_8": "Apple Juice, Rice & Chicken",
        "factor_9": "Chicken Pot Pie & Coffee",
        "factor_10": "Cafe con Leche & Dairy Products",
        "factor_11": "Noodle Soups & Dairy",
        "factor_12": "Cheeseburgers, French Fries & Cola",
        "factor_13": "Chicken Soup, Citrus & Tortillas",
        "factor_14": "Orange Juice, Bananas & Ice Cream"
    }
    
    # Load factor details to fetch top foods for Step 1 outputs
    with open(models_dir / "factor_details_k15.json", "r", encoding="utf-8") as f:
        factor_details = json.load(f)
        
    labels_json_data = {}
    labels_csv_data = []
    
    for f in factor_details:
        f_id = f['factor_id']
        f_key = f"factor_{f_id}"
        label = factor_labels_dict[f_key]
        top_foods = [food['food_group'] for food in f['top_foods'][:20]]
        
        labels_json_data[f_key] = {
            "label": label,
            "top_foods": top_foods
        }
        
        labels_csv_data.append({
            "factor_id": f_id,
            "label": label,
            "top_foods": "; ".join(top_foods)
        })
        
    # Persist factor labels
    with open(models_dir / "factor_labels.json", "w", encoding="utf-8") as f:
        json.dump(labels_json_data, f, indent=2)
        
    pd.DataFrame(labels_csv_data).to_csv(models_dir / "factor_labels.csv", index=False)
    print("  Factor labels saved.")
    
    # --- STEP 2: FODMAP Overlay Layer ---
    print("\nStep 2: Generating FODMAP mapping overlay...")
    fodmap_records = []
    for fg in vocabulary:
        # Extract name from string (e.g., "111 - Milk, cow's...")
        food_name = fg.split(" - ", 1)[1] if " - " in fg else fg
        cat, sev = get_fodmap_info(food_name)
        fodmap_records.append({
            "food_group": fg,
            "fodmap_category": cat,
            "fodmap_severity": sev
        })
        
    fodmap_df = pd.DataFrame(fodmap_records)
    fodmap_df.to_csv(models_dir / "fodmap_mapping.csv", index=False)
    print("  FODMAP mapping saved.")
    
    # --- STEP 3: Factor FODMAP Composition ---
    print("\nStep 3: Calculating Factor FODMAP composition profiles...")
    fodmap_profiles = []
    
    for f_idx in range(15):
        f_key = f"factor_{f_idx}"
        label = factor_labels_dict[f_key]
        loadings = H[f_idx] # loading values for each food group (length 163)
        
        total_loadings = np.sum(loadings)
        if total_loadings == 0:
            total_loadings = 1e-12
            
        composition = {
            "Fructans": 0.0,
            "GOS": 0.0,
            "Lactose": 0.0,
            "Excess Fructose": 0.0,
            "Polyols": 0.0,
            "Low FODMAP": 0.0,
            "Unknown": 0.0
        }
        
        for fg_idx, fg in enumerate(vocabulary):
            cat = fodmap_df.loc[fodmap_df['food_group'] == fg, 'fodmap_category'].values[0]
            if cat in composition:
                composition[cat] += loadings[fg_idx]
                
        # Convert to weighted percentages
        weighted_percentages = {cat: float((val / total_loadings) * 100) for cat, val in composition.items()}
        
        profile_row = {
            "factor_id": f_idx,
            "label": label,
            **weighted_percentages
        }
        fodmap_profiles.append(profile_row)
        
    fodmap_profile_df = pd.DataFrame(fodmap_profiles)
    fodmap_profile_df.to_csv(models_dir / "factor_fodmap_profile.csv", index=False)
    
    with open(models_dir / "factor_fodmap_profile.json", "w", encoding="utf-8") as f:
        json.dump(fodmap_profiles, f, indent=2)
    print("  Factor FODMAP profiles saved.")
    
    # --- STEP 4: User Embedding Layer ---
    print("\nStep 4: Creating User Embedding Layer...")
    # Export user factors as parquet
    user_factors_df.to_parquet(models_dir / "user_embeddings.parquet")
    print("  Saved user_embeddings.parquet.")
    
    # Create Cosine Similarity Matrix
    print("  Computing cosine similarity index for retrieval...")
    sim_matrix = cosine_similarity_matrix(W) # M x M similarity matrix
    
    # Nearest neighbor helper
    def find_similar_users(target_seqn, n=20):
        if target_seqn not in user_ids:
            return []
        idx = user_ids.index(target_seqn)
        sim_scores = sim_matrix[idx]
        
        # Sort indices in descending order
        sorted_indices = np.argsort(sim_scores)[::-1]
        
        similar_users = []
        for i in sorted_indices:
            other_seqn = user_ids[i]
            if other_seqn == target_seqn:
                continue # skip self
            similar_users.append((int(other_seqn), float(sim_scores[i])))
            if len(similar_users) == n:
                break
        return similar_users
        
    # --- STEP 5: Recommendation Candidate Generation ---
    print("\nStep 5: Implementing Recommendation Candidate Generator...")
    # Load user consumption matrix from raw CSV to check what they have already eaten
    print("  Loading participant consumption profiles...")
    raw_df = pd.read_csv(raw_csv_path)
    raw_df['prefix_3'] = raw_df['food_code'].astype(str).str.zfill(8).str[:3]
    
    # Map prefix_3 to the vocabulary's resolved labels
    prefix_to_desc = {}
    for fg in vocabulary:
        prefix = fg.split(" - ", 1)[0]
        prefix_to_desc[prefix] = fg
        
    raw_df['food_group_resolved'] = raw_df['prefix_3'].map(prefix_to_desc)
    
    # Create binary consumption matrix (user x food)
    # Drop rows that did not resolve to vocabulary groups
    valid_raw_df = raw_df.dropna(subset=['food_group_resolved'])
    user_food_binary = valid_raw_df.groupby(['seqn', 'food_group_resolved']).size().unstack(fill_value=0)
    user_food_binary = (user_food_binary > 0).astype(int)
    # Reindex columns and rows to match deterministic vocabulary and user list
    user_food_binary = user_food_binary.reindex(index=user_ids, columns=vocabulary, fill_value=0)
    
    def generate_recommendations(target_seqn):
        # 1. Find Top 50 nearest users
        neighbors = find_similar_users(target_seqn, n=50)
        if not neighbors:
            return []
            
        # 2. Get consumed foods of U to exclude
        u_consumed = user_food_binary.loc[target_seqn].values
        
        # 3. Calculate candidate scores
        # Score = sum_{V in neighbors} similarity(U, V) * consumed_binary(V, f)
        candidate_scores = np.zeros(len(vocabulary))
        for other_seqn, sim in neighbors:
            v_consumed = user_food_binary.loc[other_seqn].values
            candidate_scores += sim * v_consumed
            
        # 4. Remove foods already consumed by U
        candidate_scores[u_consumed == 1] = 0.0
        
        # Rank candidates
        ranked_indices = np.argsort(candidate_scores)[::-1]
        
        recommendations = []
        for idx in ranked_indices:
            score = candidate_scores[idx]
            if score == 0:
                break # no more items consumed by neighbors
            recommendations.append({
                "food_group": vocabulary[idx],
                "score": float(score)
            })
            if len(recommendations) == 20:
                break
        return recommendations

    # --- STEP 6: Symptom-Aware Risk Layer ---
    print("\nStep 6: Creating Symptom-Aware Risk Layer...")
    # Pull diarrhea and constipation logistic regression coefficients for all factors
    diarrhea_assoc = symptom_assoc_df[symptom_assoc_df['symptom'] == 'diarrhea']
    constipation_assoc = symptom_assoc_df[symptom_assoc_df['symptom'] == 'constipation']
    
    beta_diarrhea = np.zeros(15)
    beta_constipation = np.zeros(15)
    
    for f_idx in range(15):
        beta_diarrhea[f_idx] = diarrhea_assoc.loc[diarrhea_assoc['factor_id'] == f_idx, 'logistic_coefficient'].values[0]
        beta_constipation[f_idx] = constipation_assoc.loc[constipation_assoc['factor_id'] == f_idx, 'logistic_coefficient'].values[0]
        
    # Compute raw risks for each food: Sum_j H[j, i] * beta_j
    raw_risk_d = np.dot(H.T, beta_diarrhea)    # length 163
    raw_risk_c = np.dot(H.T, beta_constipation) # length 163
    
    # Normalize to 0-100
    min_d, max_d = np.min(raw_risk_d), np.max(raw_risk_d)
    min_c, max_c = np.min(raw_risk_c), np.max(raw_risk_c)
    
    # Handle edge case where max == min
    denom_d = (max_d - min_d) if (max_d - min_d) != 0 else 1e-12
    denom_c = (max_c - min_c) if (max_c - min_c) != 0 else 1e-12
    
    risk_scores_d = np.round(((raw_risk_d - min_d) / denom_d) * 100).astype(int)
    risk_scores_c = np.round(((raw_risk_c - min_c) / denom_c) * 100).astype(int)
    
    risk_df = pd.DataFrame({
        "food_group": vocabulary,
        "risk_diarrhea": risk_scores_d,
        "risk_constipation": risk_scores_c
    })
    risk_df.to_csv(models_dir / "food_risk_scores.csv", index=False)
    print("  Food risk scores saved.")
    
    # --- STEP 7: Explainable Recommendation Output ---
    print("\nStep 7: Compiling explainable recommendations for sample users...")
    
    # Let's run for the first 5 users in user_factors_k15.csv
    sample_users = user_ids[:5]
    explanations_output = {}
    
    for seqn in sample_users:
        recs = generate_recommendations(seqn)
        user_recs_list = []
        
        for r in recs:
            fg = r['food_group']
            # Find associated NMF factor (one with highest loading)
            fg_idx = vocabulary.index(fg)
            loadings_for_food = H[:, fg_idx]
            assoc_factor_idx = np.argmax(loadings_for_food)
            assoc_factor_label = factor_labels_dict[f"factor_{assoc_factor_idx}"]
            
            # Retrieve symptom association details
            d_coef = beta_diarrhea[assoc_factor_idx]
            c_coef = beta_constipation[assoc_factor_idx]
            
            # Textual association strength
            if d_coef > 0.05:
                symptom_assoc_text = "associated with increased risk of diarrhea"
            elif d_coef < -0.05:
                symptom_assoc_text = "associated with decreased risk of diarrhea (protective)"
            else:
                symptom_assoc_text = "not strongly associated with diarrhea"
                
            # FODMAP Info
            fodmap_row = fodmap_df.loc[fodmap_df['food_group'] == fg]
            f_cat = fodmap_row['fodmap_category'].values[0]
            f_sev = fodmap_row['fodmap_severity'].values[0]
            
            # Risk scores
            risk_row = risk_df.loc[risk_df['food_group'] == fg]
            r_d = int(risk_row['risk_diarrhea'].values[0])
            r_c = int(risk_row['risk_constipation'].values[0])
            
            explanation_text = (
                f"Recommended because it is consumed frequently by users with eating patterns similar to yours. "
                f"It is strongly associated with the '{assoc_factor_label}' dietary pattern, which is {symptom_assoc_text}. "
                f"It has a {f_sev} severity {f_cat} FODMAP profile, and an estimated diarrhea risk score of {r_d}/100 "
                f"and constipation risk score of {r_c}/100."
            )
            
            user_recs_list.append({
                "food_group": fg,
                "collaborative_score": r['score'],
                "associated_factor": {
                    "factor_id": int(assoc_factor_idx),
                    "label": assoc_factor_label,
                    "loading_weight": float(loadings_for_food[assoc_factor_idx])
                },
                "fodmap_profile": {
                    "category": f_cat,
                    "severity": f_sev
                },
                "symptom_risk": {
                    "risk_diarrhea": r_d,
                    "risk_constipation": r_c
                },
                "explanation": explanation_text
            })
            
        explanations_output[str(seqn)] = user_recs_list
        
    with open(models_dir / "recommendation_explanations.json", "w", encoding="utf-8") as f:
        json.dump(explanations_output, f, indent=2)
    print("  Recommendation explanations JSON saved.")
    
    print("\nPhase 2 completed successfully!")


if __name__ == "__main__":
    main()
