# IBS-Aware Food Recommendation System — Revised Implementation Design

# 1. Project Goal

The goal is to build a food recommendation system for users with IBS, food sensitivities, and dietary restrictions.

The system should balance two separate objectives:

1. **Preference** — recommend foods the user is likely to view, start, save, complete, or like.
2. **Health risk reduction** — avoid foods that are likely to cause symptoms such as stomach pain, bloating, diarrhea, constipation, or discomfort.

The final recommendation score is:

```text
final_score = preference_score - λ * combined_risk_score
```

Where:

- `preference_score` estimates how much the user will like the recipe.
- `combined_risk_score` estimates how likely the recipe is to cause symptoms.
- `λ` controls how strongly risk is penalized.

Allergies and strict restrictions are handled before scoring as hard filters.

---

# 2. Data Sources

## 2.1 Food.com Reviews and Interactions

Used for:

- Preference learning
- Collaborative filtering
- Candidate generation

Relevant data:

- Recipes
- Ingredients
- Ratings
- Reviews
- User interactions

Main question answered:

```text
Will the user like this recipe?
```

---

## 2.2 IBS-Specific Population Risk Evidence

Used for:

- IBS-specific population risk priors
- Common IBS trigger patterns
- Correlations between digestive symptom profiles, sensitivities, and food-related outcomes

The `population_risk_score` should be based primarily on IBS-specific evidence, such as IBS nutrition research, FODMAP guidance, clinical trigger patterns, and any available IBS-focused symptom/food datasets.

Main question answered:

```text
Given a user's health profile, which foods or ingredients should start with elevated suspected risk?
```

Example:

```text
Users with a certain digestive symptom profile
may have higher risk for certain food categories or ingredients.
```

This creates initial suspected risk scores before the system has enough personal data about the user.

---

## 2.3 NHANES Sensitivity Co-Occurrence Data

NHANES is used as an additional population dataset to infer related sensitivities.

If a user is known to be sensitive to one food, ingredient, or food group, NHANES-style collaborative filtering can help estimate what other sensitivities may be likely based on patterns across similar people.

Main question answered:

```text
Given one known sensitivity, what other sensitivities commonly appear in similar users?
```

Example:

```text
If users with sensitivity A often also report sensitivity B,
then sensitivity B can receive a higher starting suspected risk.
```

This does not replace IBS-specific population risk evidence.

It adds a second population signal based on sensitivity co-occurrence.

---

# 3. User Input Types

The system receives three main types of input.

---

## 3.1 Interest Signals

These are preference signals.

Examples:

- Viewed
- Started
- Saved
- Completed
- Liked
- Dismissed

Used by:

```text
Preference model
```

Example table:

```text
recipe_interactions
-------------------
id
user_id
recipe_id
recipe_title
interaction_type
created_at
```

Current interaction weights:

```text
viewed    = 1.5
started   = 3.5
liked     = 4.5
saved     = 5.0
completed = 5.0
dismissed = 0.0
```

These weights can be tuned.

---

## 3.2 Meal Logs

Meal logs describe what the user actually ate.

Examples:

```text
Pizza
Pasta
Chicken and rice
Greek yogurt
```

Used by:

```text
Exposure tracking
Ingredient risk learning
Health risk model
```

Example table:

```text
meal_logs
---------
id
user_id
recipe_id
food_name
logged_at
portion_size
portion_unit
created_at
```

A meal log creates ingredient exposure records:

```text
User consumed ingredient X at time T.
```

---

## 3.3 Health Reports

Health reports describe symptoms after eating.

Examples:

- Stomach pain
- Bloating
- Constipation
- Diarrhea
- Nausea
- Discomfort

Example table:

```text
health_reports
--------------
id
user_id
reported_at
symptom_type
severity
notes
created_at
```

Used by:

```text
Symptom attribution
Ingredient risk updates
XGBoost training data
```

---

# 4. Core Architecture

The system contains five major models/components:

1. **LightFM Preference Model**
2. **IBS-Based Population Risk Priors**
3. **NHANES-Based Risk Propagation Layer**
4. **Personalized Ingredient Risk Model**
5. **XGBoost Symptom Risk Model**

---

# 5. LightFM Preference Model

## 5.1 Purpose

The LightFM model predicts:

```text
Will the user like this recipe?
```

It is used for:

- Collaborative filtering
- Candidate generation
- Preference scoring

Output:

```text
preference_score(user, recipe)
```

---

## 5.2 Why LightFM?

LightFM is a good fit because it supports both:

1. **Collaborative filtering**
2. **User and item features**

This matters because your project has recipe metadata and user metadata.

LightFM is the chosen preference model for this design because it can learn from interaction history while also using richer information, such as:

### Item features

```text
recipe ingredients
recipe tags
food category
calories
protein
fat
carbs
```

### User features

```text
diet type
liked ingredients
disliked ingredients
known sensitivities
IBS subtype
```

This makes it stronger for cold start because new users and new recipes can still be represented through their features.

---

## 5.3 Handling App Interaction Types

The app records recipe interactions in `recipe_interactions`.

LightFM should use these events as one weighted implicit interaction matrix.

Example:

```text
viewed    = 1.5
started   = 3.5
liked     = 4.5
saved     = 5.0
completed = 5.0
dismissed = 0.0
```

Each user-recipe pair receives the strongest observed interaction weight, and LightFM learns from that weighted interaction signal.

This keeps the online system simple while still allowing the model to learn from different strengths of engagement.

---

## 5.4 Preference Training Data

Training data comes from:

1. Food.com interactions
2. App user interactions

Example training table:

```text
preference_training_data
------------------------
user_id
recipe_id
interaction_weight
```

Example:

```text
User 12 saved recipe 88
→ weight = 5.0

User 12 completed recipe 101
→ weight = 5.0
```

---

## 5.5 LightFM Output

For each user-recipe pair, LightFM outputs:

```text
preference_score
```

This score should not be used alone.

A highly preferred food may still be ranked low if it has high predicted health risk.

---

# 6. IBS-Based Population Risk Priors

## 6.1 Purpose

IBS-specific evidence is used to estimate population-level relationships between:

- IBS symptom profiles
- Sensitivities
- Food categories and ingredients
- Known IBS trigger patterns

The goal is to initialize suspected risks for users before they have enough personal data.

NHANES sensitivity co-occurrence inference is handled as a separate population signal. Its output can raise or lower the starting `population_risk_score`, but it is documented separately because it answers a different question: what other sensitivities may be likely given a known sensitivity?

---

## 6.2 Example

A new user reports:

```text
IBS-like symptoms
Known lactose sensitivity
Frequent bloating
```

The system can use IBS-based population-level priors to initialize:

```text
milk risk = high
cream risk = high
ice cream risk = high
rice risk = low
```

These are not final conclusions.

They are starting points.

---

## 6.3 How Priors Are Used

Each ingredient starts with an IBS-based population prior:

```text
population_risk_score
```

Example:

| Ingredient | Population Risk |
|-----------|----------------:|
| Garlic | 0.70 |
| Onion | 0.75 |
| Milk | 0.65 |
| Rice | 0.10 |

When personal user data accumulates:

```text
personal evidence becomes more important than IBS-based population priors
```

---

# 7. NHANES-Based Risk Propagation Layer

## 7.1 Purpose

The NHANES-based risk propagation layer helps infer **suspected** risks for foods or ingredients the user has not personally tested yet.

It does not replace:

- LightFM preference scoring
- XGBoost symptom risk prediction
- The personalized ingredient-risk table

It is not the final symptom predictor.

Its job is to propagate risk from known or high-confidence user reactions to related foods, ingredients, allergen groups, food categories, or FODMAP-like groups.

---

## 7.2 How It Works

Use NHANES Questionnaire Data to build population-level relationships between:

- Food categories
- Ingredients
- Sensitivities
- Symptom profiles
- Allergen groups
- FODMAP-like groups

Convert these relationships into an item-item similarity matrix.

The items can be:

- Ingredients
- Food categories
- Allergen groups
- FODMAP-like groups

When a user reacts badly to ingredient `A`, use the NHANES similarity matrix to increase suspected risk for related ingredient `B`.

This creates propagated risk only.

It should be marked as suspected risk, not confirmed personal sensitivity.

---

## 7.3 Propagation Scope

Risk should not be propagated to every ingredient in the database.

For each ingredient or item with direct user evidence, propagate only to a small set of related neighbors:

```text
top 10-20 most similar items
```

The propagation should also require minimum thresholds, for example:

```text
similarity_score >= 0.30
support_count >= minimum support threshold
source item confidence >= 0.50
```

Use one-hop propagation only:

```text
direct personal evidence -> related suspected item
```

Do not recursively propagate from already-propagated risk:

```text
allowed:
garlic personal risk -> onion suspected risk

not allowed:
garlic personal risk -> onion suspected risk -> wheat suspected risk
```

This prevents suspected risk from spreading too broadly across unrelated foods.

---

## 7.4 Example

User reaction:

```text
garlic risk = 0.90
garlic confidence = 0.85
```

NHANES similarity:

```text
garlic -> onion = 0.80
garlic -> wheat = 0.30
```

Then:

```text
onion becomes strongly suspected
wheat becomes weakly suspected
```

But neither onion nor wheat becomes:

```text
known_bad
```

until the user has direct personal evidence.

---

## 7.5 Similarity Table

```text
nhanes_item_similarity
----------------------
item_a
item_b
similarity_score
support_count
relationship_type
source
created_at
```

`relationship_type` can describe the type of population relationship, for example:

```text
co_sensitivity
shared_symptom_profile
food_category_similarity
fodmap_group_similarity
```

---

## 7.6 Propagated Risk Formula

For a candidate ingredient or item `j`:

```text
propagated_risk(j) =
sum_i risk(i) * similarity(i,j) * confidence(i)
/
sum_i similarity(i,j) * confidence(i)
```

Where:

- `i` = ingredients/items the user has evidence for
- `j` = candidate ingredient/item
- `risk(i)` = user's current risk score for item `i`
- `confidence(i)` = confidence in the user's risk score for item `i`
- `similarity(i,j)` = NHANES-derived item-item similarity

Low `support_count` should reduce confidence in the propagated score.

---

## 7.7 Combining Ingredient Risk Signals

For each ingredient:

```text
final_ingredient_risk =
alpha * personal_risk
+ beta * nhanes_propagated_risk
+ gamma * population_prior
```

For ingredients the user has personally tested:

```text
personal_risk should dominate
```

For ingredients the user has never tested:

```text
nhanes_propagated_risk and population_prior should dominate
```

This combined ingredient risk can then be averaged across a recipe's ingredients and used as the ingredient-risk component of `combined_risk_score`.

---

## 7.8 Safety Rules

- NHANES propagation must never override allergy hard filters.
- NHANES propagation must never mark an ingredient as `known_bad`.
- It may only mark ingredients as `suspected_bad` or `suspected_good`.
- Propagation should be limited to top-N similar items, not the full ingredient catalog.
- Propagation should use one-hop neighbors only.
- Low `support_count` should reduce confidence.
- Propagated risk should be lower confidence than direct user evidence.

---

# 8. Personalized Ingredient Risk Model

## 8.1 Purpose

The personalized ingredient risk model learns:

```text
How does this specific user react to this ingredient?
```

Example table:

```text
user_ingredient_risks
---------------------
user_id
ingredient_id
exposure_count
positive_evidence
negative_evidence
risk_score
confidence
status
updated_at
```

Possible statuses:

```text
known_bad
suspected_bad
unknown
suspected_good
known_good
```

---

## 8.2 Risk and Confidence

Do not store only good/bad labels.

Store:

```text
risk_score ∈ [0,1]
confidence ∈ [0,1]
```

Example:

| Ingredient | Risk | Confidence | Meaning |
|-----------|-----:|-----------:|---------|
| Garlic | 0.85 | 0.90 | probably bad |
| Apple | 0.60 | 0.20 | weak suspicion |
| Rice | 0.05 | 0.95 | probably safe |

This distinction is important.

---

## 8.3 Updating Ingredient Risks

When the user logs a meal and later reports symptoms, ingredients in recent meals receive positive evidence.

When the user explicitly reports no symptoms, ingredients receive negative evidence.

A simple Bayesian-style estimate:

```text
risk_score =
(positive_evidence + prior_positive)
/
(positive_evidence + negative_evidence + prior_total)
```

This prevents overreacting to one event.

---

# 9. Symptom Attribution

## 9.1 Problem

If the user reports symptoms, the system must decide which recent foods may have contributed.

Example:

```text
Monday 20:00 — pizza
Tuesday 13:00 — chicken and rice
Tuesday 22:00 — stomach pain
```

The system should not assign full blame to one food.

Instead, it distributes responsibility across recent meals.

---

## 9.2 Temporal Window

Look back over a fixed window, for example:

```text
previous 48 hours
```

Weights can be assigned by recency:

```text
0–6 hours     = high weight
6–24 hours    = medium weight
24–48 hours   = low weight
```

Or by decay function:

```text
weight = exp(-time_difference / τ)
```

---

## 9.3 Ingredient-Level Attribution

If the user ate:

```text
Pizza → symptoms
Pasta → symptoms
```

Shared ingredients might be:

```text
wheat
garlic
tomato
```

The system increases suspicion for shared ingredients.

It does **not** immediately conclude:

```text
gluten is the cause
```

because pizza and pasta may share several ingredients and food properties.

---

# 10. XGBoost Symptom Risk Model

## 10.1 Purpose

The purpose of XGBoost is to estimate **health risk**, not recipe preference.

LightFM answers:

```text
Will this user probably like this recipe?
```

XGBoost answers:

```text
If this user eats this recipe in the current context, how likely are symptoms?
```

This gives the system a separate risk score that can be subtracted from the preference score during final ranking. A recipe can therefore be highly preferred by LightFM but still ranked lower if XGBoost predicts a high symptom risk.

The XGBoost model predicts:

```text
P(symptoms | user, recipe, context)
```

Output:

```text
xgboost_risk ∈ [0,1]
```

---

## 10.2 Why XGBoost?

XGBoost is suitable because symptom reactions are often non-linear.

Examples:

```text
garlic + onion may be worse than either alone
lactose + high fat may be worse than lactose alone
large portion + high FODMAP may increase risk
```

XGBoost can learn these interactions automatically.

---

## 10.3 Features for XGBoost

### Recipe features

```text
contains_garlic
contains_onion
contains_wheat
contains_lactose
contains_fructans
contains_polyols
calories
fat
fiber
protein
carbs
portion_size
```

### User features

```text
IBS subtype
known sensitivities
personal ingredient risk scores
personal ingredient confidence scores
```

### Context features

```text
recent meals
recent symptom history
recent FODMAP load
time of day
```

---

## 10.4 Training Labels

Possible label:

```text
symptoms_after_meal = 1
```

if symptoms were reported after eating within the attribution window.

Possible negative label:

```text
symptoms_after_meal = 0
```

if the user explicitly reported no symptoms.

Do not always assume no report means no symptoms.

---

# 11. Final Risk Score

For each candidate recipe, combine:

1. XGBoost risk
2. Final ingredient risk

`final_ingredient_risk` already combines:

- Direct personal ingredient evidence
- NHANES-propagated suspected risk
- IBS-based population prior

Example:

```text
combined_risk_score =
0.6 * xgboost_risk
+ 0.4 * recipe_final_ingredient_risk
```

The weights can be tuned.

Early users may rely more on IBS-based population priors.

Experienced users may rely more on personal evidence.

Allergy and restriction data is used before this score is computed.

If a recipe contains an ingredient that matches a user's allergy or strict restriction, the recipe is removed by hard filtering and does not receive a final score.

The allergy/sensitivity datasets are still important because they help:

1. Normalize ingredient names and aliases.
2. Map recipe ingredients to known allergens or sensitivity groups.
3. Populate `user_restrictions` for hard filtering.
4. Create ingredient/category flags for XGBoost, such as `contains_lactose`, `contains_wheat`, or `contains_nuts`.
5. Initialize IBS-based `population_risk_score` values for non-allergy sensitivities.

Strict allergies are not treated as a soft risk penalty.

They are treated as:

```text
exclude recipe before ranking
```

Non-allergy sensitivities can contribute to the risk score through XGBoost features, personalized ingredient risks, NHANES-propagated suspected risks, and IBS-based population priors.

---

# 12. Fast Online Recommendation System

The system must be fast online.

The key principle:

```text
Do expensive work offline.
Do only filtering and reranking online.
```

Do not train models or score every recipe during a user request.

---

## 12.1 Offline / Scheduled Jobs

Run periodically, for example once per day or every few hours.

Offline jobs:

1. Train or update LightFM preference model.
2. Train or update XGBoost risk model.
3. Build or update the NHANES item-item similarity matrix.
4. Generate top candidate recipes per user.
5. Store candidate recipes in Supabase.
6. Store model artifacts.

Example table:

```text
user_candidate_recipes
----------------------
user_id
recipe_id
preference_score
model_name
generated_at
```

For each user, store:

```text
top 300–1000 candidate recipes
```

Example:

```text
User 17:
recipe 101, preference_score 0.92
recipe 550, preference_score 0.89
recipe 203, preference_score 0.86
...
```

---

## 12.2 Online Request Flow

When the user opens the app and asks for recommendations:

### Step 1 - Fetch Precomputed LightFM Candidates

```sql
SELECT recipe_id, preference_score
FROM user_candidate_recipes
WHERE user_id = :user_id
ORDER BY preference_score DESC
LIMIT 500;
```

Now the system works on 500 recipes instead of the full recipe database.

---

### Step 2 - Apply Hard Filters

Remove recipes containing:

- Allergens
- Strict sensitivities
- Forbidden ingredients
- Diet violations

Relevant tables:

```text
user_restrictions
recipe_ingredients
```

Hard filtering should happen before risk scoring.

---

### Step 3 - Compute Personalized Ingredient Risk

For each candidate recipe:

```text
personalized_ingredient_risk =
weighted average of direct user risk scores for recipe ingredients
```

Direct personal evidence comes from meal logs, symptom reports, and no-symptom reports.

---

### Step 4 - Apply NHANES Risk Propagation

For unseen or weak-evidence ingredients, use `nhanes_item_similarity` to propagate suspected risk from ingredients the user has stronger evidence for.

Only use top-N one-hop neighbors that pass similarity, support, and source-confidence thresholds.

```text
nhanes_propagated_risk =
risk propagated from similar known-risk ingredients
```

This updates suspected ingredient risk only.

It does not mark ingredients as `known_bad`.

---

### Step 5 - Compute XGBoost Symptom Risk

For remaining candidates, build feature rows and run batch prediction:

```text
xgboost.predict(candidate_feature_matrix)
```

This is fast because the matrix contains only a few hundred recipes.

---

### Step 6 - Combine Risk Scores

```text
combined_risk_score =
0.6 * xgboost_risk
+ 0.4 * recipe_final_ingredient_risk
```

---

### Step 7 - Rerank

```text
final_score = preference_score - lambda * combined_risk_score
```

---

### Step 8 - Return Top K Recommendations

Return the top K recipes.

Example:

```text
top 10 recommendations
```

---

## 12.3 Why This Is Fast

The online system does not:

- Train LightFM
- Train XGBoost
- Score all recipes
- Run expensive full-database candidate search

It only:

1. Fetches precomputed candidates.
2. Applies hard filters.
3. Applies NHANES risk propagation for a few hundred candidates.
4. Scores a few hundred candidates.
5. Reranks them.

This is realistic and scalable.

---

# 13. Immediate vs Offline Updates

## 13.1 Immediate Online Updates

These should affect recommendations immediately:

### User adds allergy

Update hard filters immediately.

```text
Do not wait for retraining.
```

### User logs meal

Create exposure records immediately.

### User reports symptoms

Update personalized ingredient risks immediately.

### User views/starts/saves/completes/likes/dismisses a recipe

Store the interaction immediately.

---

## 13.2 Offline Updates

These do not need to happen immediately:

- Retraining LightFM
- Retraining XGBoost
- Regenerating all user candidates

Run these periodically.

Important design principle:

```text
Global models update slowly.
Personal risk table updates quickly.
```

---

# 14. Database Tables

Recommended core Supabase tables:

```text
users
user_profiles
recipes
ingredients
recipe_ingredients
recipe_interactions
meal_logs
health_reports
user_ingredient_exposures
user_ingredient_risks
user_restrictions
nhanes_item_similarity
user_candidate_recipes
model_predictions
```

---

## 14.1 user_candidate_recipes

Stores precomputed recommendations from LightFM.

```text
user_id
recipe_id
preference_score
model_name
generated_at
```

Index:

```text
(user_id, preference_score)
```

---

## 14.2 user_restrictions

Stores allergies and strict restrictions.

```text
user_id
ingredient_id
restriction_type
severity
created_at
```

Used for hard filtering.

---

## 14.3 user_ingredient_risks

Stores personalized risk estimates.

```text
user_id
ingredient_id
exposure_count
positive_evidence
negative_evidence
risk_score
confidence
status
updated_at
```

---

## 14.4 recipe_ingredients

Maps recipes to ingredients.

```text
recipe_id
ingredient_id
amount
unit
confidence
```

Indexes:

```text
recipe_id
ingredient_id
```

---

## 14.5 nhanes_item_similarity

Stores NHANES-derived item-item relationships for risk propagation.

```text
item_a
item_b
similarity_score
support_count
relationship_type
source
created_at
```

Indexes:

```text
item_a
item_b
```

---

# 15. Backend Implementation Flow

Recommended architecture:

```text
Frontend
    ↓
Backend API
    ↓
Supabase
    ↓
Python model service
```

Possible stack:

```text
FastAPI
Supabase PostgreSQL
Python model service
Scheduled training jobs
```

---

## 15.1 Recommendation Endpoint

Example endpoint:

```text
GET /recommendations?user_id=17
```

Flow:

```text
1. Fetch precomputed LightFM candidates.
2. Apply hard filters.
3. Compute personalized ingredient risk.
4. Apply NHANES risk propagation for unseen or weak-evidence ingredients.
5. Compute XGBoost symptom risk.
6. Combine risk scores.
7. Rerank by final_score = preference_score - lambda * combined_risk_score.
8. Return top K recipes.
```

---

## 15.2 Meal Logging Endpoint

Example:

```text
POST /meal-log
```

Flow:

```text
1. Store meal log.
2. Extract recipe ingredients.
3. Create user ingredient exposure records.
```

---

## 15.3 Health Report Endpoint

Example:

```text
POST /health-report
```

Flow:

```text
1. Store health report.
2. Look back at recent meal logs.
3. Apply temporal attribution.
4. Update user ingredient risk table.
5. Store training example for future XGBoost training.
```

---

## 15.4 Interaction Endpoint

Example:

```text
POST /interaction
```

Flow:

```text
1. Store viewed/started/saved/completed/liked/dismissed interactions.
2. Use it in the next LightFM training run.
```

---

# 16. Model Training Flow

## 16.1 LightFM Training

Input:

```text
recipe_interactions
recipe features
user features
```

Output:

```text
preference model
top candidates per user
```

Training frequency:

```text
daily or every few hours
```

---

## 16.2 XGBoost Training

Input:

```text
meal_logs
health_reports
recipe features
user features
ingredient risk features
```

Output:

```text
symptom risk model
```

Training frequency:

```text
daily or weekly
```

---

## 16.3 Personalized Risk Updates

Input:

```text
meal logs
health reports
```

Output:

```text
updated user_ingredient_risks
```

Frequency:

```text
immediate
```

---

# 17. Evaluation

Evaluate preference and health separately.

---

## 17.1 Preference Metrics

Use:

```text
Precision@K
Recall@K
NDCG@K
MAP@K
```

These measure whether the system recommends foods the user likes.

---

## 17.2 Health Risk Metrics

Use:

```text
AUC
F1
Precision
Recall
Log Loss
```

These measure whether the system predicts symptoms correctly.

---

## 17.3 Combined Product Metrics

Use:

```text
Average predicted risk in top-K recommendations
Number of high-risk recipes shown
Preference score among low-risk recommendations
Symptom reports after recommended foods
```

The system should not maximize engagement alone.

It should recommend foods that are both liked and lower-risk.

---

# 18. Final Architecture Summary

```text
Food.com Interactions
    ->
LightFM
    ->
Precomputed Candidate Recipes
    ->
Online Hard Filtering

IBS-Specific Population Risk Evidence
    ->
IBS-Based Population Risk Priors

NHANES Questionnaire Data
    ->
Item-Item Similarity / Co-Sensitivity Matrix
    ->
Risk Propagation Layer
    ->
Suspected Ingredient Risks

User Meal Logs
    ->
Ingredient Exposure Records

User Health Reports
    ->
Personalized Ingredient Risk Updates

Candidate Recipes
    ->
XGBoost Symptom Risk Prediction
    ->
Combined Risk Score

Preference Score - lambda * Risk Score
    ->
Final Ranked Recommendations
```

This architecture is fast online because expensive model training and candidate generation happen offline, while the live system only performs filtering, risk scoring, and reranking on a small candidate set.

