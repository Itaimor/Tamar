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

## 1.1 Implemented IBS And Recommender Phase

The current app includes an IBS profile layer plus the first non-NHANES recommender backend implementation.

Implemented scope:

- Maintain a code-side IBS ingredient catalog and aliases in `src/lib/ibsIngredients.ts`.
- Ask a visible IBS cold-start questionnaire in `src/components/IbsOnboardingCard.tsx`.
- Persist personal IBS ingredient grades in `public.user_ibs_ingredient_risks`.
- Persist IBS onboarding/check-in state in `public.user_ibs_profiles`.
- Persist completed `How I Feel` check-ins in `public.user_ibs_checkins`.
- Mirror foods collected by completed `How I Feel` chat check-ins into the Diary/`meal_logs` flow.
- Route recommended-recipe eating evidence through a chat-guided recipe feedback flow before writing recipe-backed `meal_logs`.
- Add the `How I Feel` chat flow before `Analyze my Lunch`.
- Add non-NHANES recommender tables for ingredients, restrictions, meal logs, health reports, exposures, personalized ingredient risks, candidate recipes, model predictions, and IBS population priors.
- Store offline preference candidates in `public.user_candidate_recipes`.
- Apply strict allergies/restrictions as online hard filters before scoring.
- Rerank online recommendations with `final_score = preference_score - lambda * combined_risk_score`.
- Compute `combined_risk_score` from personalized/population ingredient risk plus XGBoost-compatible symptom risk.
- Support immediate meal-log and health-report updates through the Python recommender service.
- Support optional offline symptom-risk model training in `RecommenderSys/train_symptom_model.py`.
- Show a user-facing Diary page for logging meals and how the user feels.
- Show a user-facing Analysis page that summarizes possible trigger foods, easier foods, recent meal/symptom patterns, and next-step suggestions from the same risk and logging tables.

Out of scope for this implemented phase:

- Do not implement NHANES-based risk propagation yet.
- Do not redesign chatbot/check-in interview logic.
- Do not alter recipe image behavior.

The recommender layer consumes `public.user_ibs_ingredient_risks` as one direct personal ingredient-risk signal and also writes the longer-term `public.user_ingredient_risks` table from meal/health attribution.

## 1.2 Diary Page MVP

The Diary page is the user-facing entry point for food and symptom history.

It lets signed-in users:

1. Save a meal with time, optional portion, and notes.
2. Save a how-you-feel check-in with time, symptom type, severity, no-symptom state, and notes.
3. See foods captured through the chat-based IBS check-in.
4. See started/completed recipe activity as food-history context.
5. Review a combined meal/check-in timeline grouped by day.
6. See simple counts for today's meals, today's check-ins, and rougher notes saved.

Writes go through frontend API bridges:

```text
POST /api/meal-log
POST /api/health-report
```

When the Python recommender service is configured, those bridges call:

```text
POST /meal-log
POST /health-report
```

That service creates meal logs, ingredient exposures, health reports, and personal ingredient-risk updates. If the service is not available in local development, the API/client fallback stores the visible `meal_logs` or `health_reports` row so the Diary and Analysis MVP still work from Supabase.

The Diary timeline reads from:

```text
meal_logs
health_reports
user_ibs_checkins
recipe_interactions
```

Existing chat check-ins are shown by expanding `user_ibs_checkins.food_windows` into chat-sourced food entries. Future completed chat check-ins also write `meal_logs` rows for the collected foods so backend learning can use them.

Recommended recipes should become eating evidence only after the user explicitly confirms through chat that they ate the recipe. That flow writes a recipe-backed `meal_logs` row and then asks for preference and general feeling feedback. Recipe `viewed`, `saved`, or unconfirmed `started` interactions are not enough to create a meal log.

Diary language should stay friendly and plain. Avoid model-heavy wording and present the page as tracking, not diagnosis.

## 1.3 Analysis Page MVP

The Analysis page is a read-only user-facing explanation layer for the recommender health data.

It should help the user understand:

1. Which ingredients Tamar is currently watching.
2. Which foods seem to go more smoothly lately.
3. How recent meal logs and symptom notes are trending.
4. What small experiment or logging habit would make the next recommendation refresh smarter.

The page reads from:

```text
user_ingredient_risks
user_ibs_ingredient_risks
user_ingredient_exposures
meal_logs
health_reports
user_ibs_checkins
```

It does not write new health conclusions and does not change recommendation scores directly. Recommendation scoring remains owned by the backend risk/reranking flow.

Current Analysis sections:

- **Foods to watch**: ingredients with higher current risk scores, labeled with friendly language such as `Strong signal`, `Worth watching`, or `Early clue`.
- **Foods that seem easier**: ingredients with lower current risk scores and some supporting exposure/check-in history.
- **Recent pattern**: weekly view of meals logged and average symptom level.
- **What to test next**: lightweight suggestions such as logging a good-day check-in, testing one ingredient with/without a similar meal, or using an easier food as a meal anchor.

Language rules:

- Do not say the user is definitely sensitive, allergic, or intolerant unless the user explicitly stored a strict restriction/allergy.
- Prefer pattern language: `may be worth watching`, `early clue`, `seems easier`, `Tamar is still learning`.
- Avoid model-heavy terms in the UI such as `confidence`, `positive evidence`, `negative evidence`, or `risk model`.
- Clearly frame the page as pattern tracking, not diagnosis.

Current concrete tables:

```text
user_ibs_profiles
-----------------
user_id
onboarding_completed_at
last_checkin_at
created_at
updated_at

user_ibs_ingredient_risks
-------------------------
user_id
ingredient_name
trigger_group
grade
confidence
evidence_count
last_evidence_at
created_at
updated_at

user_ibs_checkins
-----------------
id
user_id
severity
symptoms
summary
food_windows
matched_ingredients
evidence
created_at
```

`grade` is the current implemented equivalent of the future personalized ingredient `risk_score`.

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

## 2.3 Deferred NHANES Sensitivity Co-Occurrence Data

NHANES is not implemented in the current recommender backend.

It remains a deferred research path because the dataset may not contain the ingredient/sensitivity relationships needed for reliable risk propagation.

If later validation shows that NHANES has useful co-occurrence signal, it can be added as an additional population dataset to infer related sensitivities.

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

If implemented later, this must not replace IBS-specific population risk evidence.

It would add a second population signal based on sensitivity co-occurrence.

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
Diary food-history timeline for started/completed recipes
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

Diary treats `started` and `completed` interactions as food-history context. `viewed`, `saved`, `liked`, and `dismissed` remain preference signals, not evidence that the user ate the food.

For recommended recipes, the play/start action should open a chat-guided feedback flow instead of silently logging a meal. The flow asks whether the user wants to log the recipe as eaten. If the user confirms, the app writes a recipe-backed `meal_logs` row and records a `completed` interaction. The chat then asks whether the user liked the recipe and records a `liked` or `dismissed` interaction when the answer is clear. Finally, it asks how the user is feeling in general and writes a `health_reports` row. This keeps actual eating evidence explicit while still collecting preference and symptom context from the same moment.

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

Meal logs can be created from:

1. The Diary page manual meal form.
2. Completed chat-based `How I Feel` check-ins, where each collected food-window item is converted into a meal log.
3. The recommender service when a recipe-backed meal is logged.
4. The chat-guided recommended-recipe feedback flow after the user confirms they ate the recipe.

Used by:

```text
Exposure tracking
Ingredient risk learning
Health risk model
Diary food-history timeline
Analysis meal-pattern summaries
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
notes
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
Diary check-in timeline
Analysis symptom-pattern summaries
```

The Diary page creates `health_reports` through `/api/health-report`. The chat-based `How I Feel` flow stores its structured result in `user_ibs_checkins`; the Diary also reads that table so chat check-ins appear next to manual check-ins.

---

## 3.4 Chat IBS Check-Ins As Diary Input

The chat `How I Feel` flow asks for symptoms plus foods eaten in three windows:

```text
0-8 hours
9-16 hours
17-24 hours
```

Completed chat check-ins are stored in:

```text
user_ibs_checkins
```

The Diary uses those saved `food_windows` in two ways:

1. Existing check-ins are expanded into chat-sourced food entries for the timeline.
2. Future completed check-ins also write the collected foods into `meal_logs` so exposure tracking and backend learning can use them.

If a chat-sourced food already has a matching `meal_logs` row near the same time, the Diary shows the meal log and suppresses the duplicate chat-derived food entry.

---

# 4. Core Architecture

The implemented non-NHANES system contains four active models/components:

1. **LightFM Preference Model**
2. **IBS-Based Population Risk Priors**
3. **Personalized Ingredient Risk Model**
4. **XGBoost Symptom Risk Model**

The NHANES-based risk propagation layer is intentionally deferred and should not be assumed available in scoring.

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

Implementation note:

`RecommenderSys/recommend_batch.py` now attempts LightFM training first and stores the resulting preference candidates in `public.user_candidate_recipes`. If LightFM is unavailable or fails to train in the current environment, the batch job falls back to the existing matrix-factorization CF artifact so the rest of the recommender pipeline remains usable.

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

NHANES sensitivity co-occurrence inference is deferred. Current implementation uses IBS-specific priors plus direct personal evidence only.

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

# 7. Deferred NHANES-Based Risk Propagation Layer

NHANES propagation is not part of the current implementation.

Reason:

```text
NHANES may not contain the ingredient-level sensitivity/co-occurrence signal
needed for reliable IBS risk propagation.
```

Current scoring therefore excludes NHANES entirely:

```text
final_ingredient_risk =
personal/population blend only
```

Where:

- direct personal evidence comes from `user_ingredient_risks` and `user_ibs_ingredient_risks`
- IBS population priors come from `ibs_population_ingredient_priors` and fallback catalog heuristics
- allergies and strict restrictions remain hard filters before risk scoring

No `nhanes_item_similarity` table is created by the current migration.

If NHANES is validated later, the old propagation ideas can be revisited as a separate design change. Until then, code should not call or depend on NHANES-derived relationships.

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

Non-allergy sensitivities can contribute to the risk score through XGBoost features, personalized ingredient risks, and IBS-based population priors.

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
3. Generate top candidate recipes per user.
4. Store candidate recipes in Supabase.
5. Store model artifacts.

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

### Step 4 - Skip Deferred NHANES Propagation

The current implementation does not use NHANES propagation.

For unseen or weak-evidence ingredients, the online scorer currently falls back to IBS population priors and conservative ingredient-keyword heuristics.

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
3. Scores ingredient and symptom risk for a few hundred candidates.
4. Reranks them.

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
user_ibs_checkins
user_ingredient_exposures
user_ingredient_risks
user_restrictions
user_candidate_recipes
model_predictions
ibs_population_ingredient_priors
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

Implementation note:

The current app stores the implemented phase in `public.user_ibs_ingredient_risks`. Its `grade` column is the user-specific IBS risk estimate in `[0, 1]`, and its `confidence` and `evidence_count` columns support later ranking/model consumption. The generic `user_ingredient_risks` shape below remains the long-term recommender design target.

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

## 14.5 ibs_population_ingredient_priors

Stores IBS population-level ingredient priors used when direct personal evidence is absent or low confidence.

```text
ingredient_name
normalized_name
trigger_group
population_risk_score
confidence
source_notes
created_at
updated_at
```

Indexes:

```text
normalized_name
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
4. Blend direct personal risk with IBS population priors for unseen or weak-evidence ingredients.
5. Compute XGBoost-compatible symptom risk.
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

Frontend bridge:

```text
POST /api/meal-log
```

Flow:

```text
1. Authenticate the user in the frontend API bridge.
2. If the Python recommender service is configured, call POST /meal-log.
3. Store the meal log.
4. Extract recipe ingredients when recipe_id is present, otherwise use the food name as the exposure label.
5. Create user ingredient exposure records.
6. If the service is unavailable during local development, store the visible meal_logs row as a fallback.
```

---

## 15.3 Health Report Endpoint

Example:

```text
POST /health-report
```

Frontend bridge:

```text
POST /api/health-report
```

Flow:

```text
1. Authenticate the user in the frontend API bridge.
2. If the Python recommender service is configured, call POST /health-report.
3. Store health report.
4. Look back at recent meal logs.
5. Apply temporal attribution.
6. Update user ingredient risk table.
7. Store training example for future XGBoost training.
8. If the service is unavailable during local development, store the visible health_reports row as a fallback.
```

---

## 15.4 Chat Check-In To Diary Flow

Example:

```text
Chat chip: How I Feel
```

Flow:

```text
1. The chat interviewer collects symptom state and three food windows.
2. Save the structured check-in in user_ibs_checkins.
3. Update user_ibs_ingredient_risks when collected foods match the IBS ingredient catalog.
4. Save each collected food-window item into meal_logs with an approximate time for that window.
5. The Diary reads both user_ibs_checkins and meal_logs.
6. The Diary avoids showing duplicate chat-food entries when the corresponding meal log is present.
```

This flow preserves the existing chatbot interview behavior while making chat-logged foods visible in the same Diary page as manual logs.

---

## 15.5 Interaction Endpoint

Example:

```text
POST /interaction
```

Flow:

```text
1. Store viewed/started/saved/completed/liked/dismissed interactions.
2. Use it in the next LightFM training run.
3. Show started/completed recipes in the Diary timeline as food-history context.
```

---

## 15.6 Chat-Guided Recommended Recipe Feedback Flow

Example:

```text
Recipe card play button
```

Flow:

```text
1. Open the Tamar chat panel for the selected recipe.
2. Ask whether the user ate the recipe and wants to log it.
3. If the user says no, stop without writing meal or health evidence.
4. If the user says yes, call POST /api/meal-log with recipe_id, food_name, and logged_at.
5. Record a completed recipe interaction for preference/history context.
6. Ask whether the user liked the recipe and record liked or dismissed when clear.
7. Ask how the user is feeling in general.
8. Save the response through POST /api/health-report as either no-symptom feedback or digestive-discomfort feedback with notes.
```

The arrow/details control on a recipe card should only reveal recipe metadata such as ingredients and prep time. It should not log a meal. Logging a recommended recipe as eaten requires explicit chat confirmation.

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

NHANES propagation is deferred and not part of the active scoring path.

This architecture is fast online because expensive model training and candidate generation happen offline, while the live system only performs filtering, risk scoring, and reranking on a small candidate set.

