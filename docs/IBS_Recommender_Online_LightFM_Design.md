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

The current app includes an IBS profile layer plus the first risk-aware recommender backend implementation.

Implemented scope:

- Maintain a code-side IBS ingredient catalog and aliases in `src/lib/ibsIngredients.ts`.
- Show a first-run step-by-step website tour that spotlights Home, CookBook, Chat, Analysis, Diary, search, and quick food logging before optional personalization setup.
- Allow users to skip the first-run tutorial/setup without saving synthetic recipe dislikes or IBS questionnaire answers; skipped users continue with general recommendations until they explicitly retrain taste.
- Ask a visible IBS cold-start questionnaire in `src/components/IbsOnboardingCard.tsx`.
- Persist personal IBS ingredient grades in `public.user_ibs_ingredient_risks`.
- Persist IBS onboarding/check-in state in `public.user_ibs_profiles`.
- Persist completed `How I Feel` check-ins in `public.user_ibs_checkins`.
- Mirror foods collected by completed `How I Feel` chat check-ins into the Diary/`meal_logs` flow.
- Route recommended-recipe eating evidence through a chat-guided recipe feedback flow before writing recipe-backed `meal_logs`.
- Allow the chat to answer recommendation requests by reading the same `user_recommendations.recommended_recipe_ids` row that powers Home's `Curated for You` section, refreshing through `/api/refresh-recommendations` when the user is signed in.
- Add structured retrieval-augmented chat context for signed-in users by retrieving recent meals, symptom check-ins, restrictions, personalized ingredient signals, recent recipe activity, and current Curated for You recipes before Gemini answers general chat.
- Add the `How I Feel` chat flow before `Analyze my Lunch`.
- Add recommender tables for ingredients, restrictions, meal logs, health reports, exposures, personalized ingredient risks, candidate recipes, model predictions, and IBS population priors.
- Store offline preference candidates in `public.user_candidate_recipes`.
- Apply strict allergies/restrictions as online hard filters before scoring.
- Rerank online recommendations with `final_score = preference_score - lambda * combined_risk_score`.
- Compute `combined_risk_score` from personalized/population ingredient risk plus XGBoost-compatible symptom risk.
- Support immediate meal-log and health-report updates through the Python recommender service.
- Support optional offline symptom-risk model training in `RecommenderSys/train_symptom_model.py`.
- Show a user-facing Diary page for logging meals and how the user feels.
- Allow the Diary to search saved cookbook meals, recent meal history while logging, and the visible Recent diary timeline, and to add food-history entries from Recent diary into cooklists.
- Show a user-facing Analysis page that summarizes possible trigger foods, easier foods, recent meal/symptom patterns, and next-step suggestions from the same risk and logging tables; its next-step cards may use lightweight content-based matching over already recommended recipes to suggest a recipe experiment.
- Allow meal logs created from the Diary, chat food logging, or recipe-feedback chat to carry an optional uploaded image stored in Supabase Storage and referenced by `image_url`.
- Allow Gemini-assisted food-photo analysis in Chat `Log Food`, the Diary meal form, and the CookBook personal-recipe form. Dedicated "from image" actions may prefill a meal/recipe title, visible-food notes, ingredient notes, and clarification prompts, but normal image upload fields remain image attachments. The user must confirm or edit the result before it is saved as `meal_logs` evidence or private personal recipe content.
- Allow users to add personal, non-catalog recipes to cooklists from the CookBook page, Diary, or Tamar chat.
- Show cookbook-only recommendations in the CookBook page from recipes already saved in the user's cooklists, using risk-reranked catalog recipes plus heuristic personal-recipe ranking.

Out of scope for this implemented phase:

- Do not redesign chatbot/check-in interview logic.
- Do not alter recipe image behavior.

The recommender layer consumes `public.user_ibs_ingredient_risks` as one direct personal ingredient-risk signal and also writes the longer-term `public.user_ingredient_risks` table from meal/health attribution.

## 1.2 Diary Page MVP

The Diary page is the user-facing entry point for food and symptom history.

It lets signed-in users:

1. Save a meal with time, optional portion, optional calories/protein/fat, optional uploaded image, and notes. A separate `Add meal from image` action may upload a photo, attach it to the draft, and use Gemini to suggest a plain meal name and visible-food notes before the user saves. Nutrition values are editable tracking data; catalog-backed meals may prefill from Food.com recipe nutrition, and free-text/photo-assisted meals may use Gemini estimates before the user saves.
2. Save a how-you-feel check-in with time, symptom type, severity, no-symptom state, and notes.
3. See foods captured through the chat-based IBS check-in.
4. See started/completed recipe activity as food-history context.
5. Edit or remove user-owned meal-log rows from the visible diary timeline.
6. Review a combined meal/check-in timeline grouped by day.
7. Search saved cookbook meals, recent meal history while logging, and the visible Recent diary timeline.
8. Add food-history entries from the recent diary timeline into a cooklist.
9. See simple counts for today's meals, today's check-ins, and rougher notes saved.
10. See and care for the user's Tamar tree. Meal logs water the tree, how-you-feel check-ins compost it, and a day with both can grow it once.

Writes go through frontend API bridges:

```text
POST /api/meal-log
POST /api/health-report
POST /api/analyze-food-image
POST /api/estimate-meal-nutrition
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

The Tamar tree habit loop reads existing logging tables and writes only gamification state:

```text
user_tamar_tree_runs
user_tamar_tree_reward_events
```

Tree state is an engagement overlay. It does not create health conclusions, ingredient exposure records, risk scores, recipe interactions, or recommendation inputs. A food log is water, a manual or chat how-you-feel check-in is compost, and both on the same local calendar day produce at most one tree level. Food-only or feeling-only days keep the tree alive but do not increase level. After seven consecutive local calendar dates with no water and no compost, the current tree dies; replanting creates a new sapling while preserving prior run records for Analysis.

When a `meal_logs.image_url` is present, the Diary may show it as meal context. The normal Diary image field is an attachment field only. Before saving a new meal, the separate `Add meal from image` action may send a user-owned uploaded image to Gemini through `/api/analyze-food-image` and return conservative suggestions such as a meal title, visible ingredients, plausible hidden ingredients, confidence, and clarification questions. These suggestions are draft UI state only. They do not create ingredient exposure records, symptom attribution, or recommender scoring changes by themselves. The only durable learning signal is the confirmed `meal_logs` row that the user saves or confirms in chat. `/api/estimate-meal-nutrition` is separate from image recognition: it returns editable calories, protein, and fat for tracking, using catalog recipe nutrition when possible and Gemini estimates otherwise.

Chat uses the same distinction:

1. In `Log Food`, an attached photo is interpreted as food evidence to draft a meal log. If the user replies yes, Tamar logs the suggested meal name; if the user edits or types another name, Tamar logs the user's text with the image attached.
2. In `Add Recipe`, an attached photo is treated as the personal recipe image by default. It is not automatically logged as eaten.
3. In recommended-recipe feedback, an attached photo is meal context for the confirmed catalog recipe, not a separate recipe-recognition signal.

The CookBook personal-recipe form reserves its normal image field for the saved recipe image. A separate `Add recipe from image` action can upload a photo, attach it to the draft, and send it through `/api/analyze-food-image`. Its suggestion may draft a private personal recipe title and ingredient notes, but it does not create a meal log, does not create a catalog recipe, and does not insert `recipe_interactions`.

Existing chat check-ins are shown by expanding `user_ibs_checkins.food_windows` into chat-sourced food entries. Future completed chat check-ins also write `meal_logs` rows for the collected foods so backend learning can use them.

Recommended recipes should become eating evidence only after the user explicitly confirms through chat that they ate the recipe. That flow writes a recipe-backed `meal_logs` row and then asks for preference and general feeling feedback. Recipe `viewed`, `saved`, or unconfirmed `started` interactions are not enough to create a meal log.

User-owned `meal_logs` entries are editable and removable from the Diary timeline. Chat-derived food entries and recipe-interaction entries remain read-only context unless they have a corresponding `meal_logs` row.

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
user_recommendations
recipes
```

It does not write new health conclusions and does not change recommendation scores directly. Recommendation scoring remains owned by the backend risk/reranking flow. The Analysis page may use the current `user_recommendations` recipe arrays as a bounded candidate pool for explanation-only content-based experiment suggestions.

Current Analysis sections:

- **Foods to watch**: ingredients with higher current risk scores, labeled with friendly language such as `Strong signal`, `Worth watching`, or `Early clue`.
- **Foods that seem easier**: ingredients with lower current risk scores and some supporting exposure/check-in history.
- **Recent pattern**: weekly view of meals logged and average symptom level.
- **Nutrition over seven days**: daily calories, protein, and fat from saved meal-log nutrition, with user-selectable metric lines. This is tracking information, not a health conclusion.
- **Tamar Record**: current tree level, streaks, best run, reward count, and replant history from tree gamification tables. This is motivational progress only.
- **What to test next**: lightweight suggestions such as logging a good-day check-in, testing one ingredient with/without a similar meal, using an easier food as a meal anchor, or trying a recipe whose name/ingredients/description are content-similar to foods that have looked easier while avoiding the strongest watchlist ingredients.

Content-based Analysis suggestions are not a second production recommender. They use a local vector-space recipe similarity algorithm over already-generated recommendation candidates to choose an experiment card and link to the recipe detail page when possible.

### 1.3.1 Analysis Content-Based Recipe Experiment Algorithm

The `What to test next` recipe experiment is a recommender-systems feature inside Analysis. It is intentionally explanation-oriented and bounded by the production recommendation output.

Purpose:

```text
Given foods that have looked easier for the user lately, suggest one already-recommended recipe
that is text-similar to those easier foods while avoiding the user's strongest watchlist ingredients.
```

This algorithm is implemented in `src/lib/analysis.ts` as `buildContentBasedRecipeSuggestion`.

Candidate pool:

```text
candidate_recipes =
  recipes referenced by the current user's user_recommendations arrays
```

It does not search the full recipe catalog and does not create a separate production ranking. Home and Chat recommendations remain owned by the LightFM/risk-reranking pipeline.

User profile vector:

```text
profile_tokens =
  weighted tokens from foods that seem easier
  + lower-weight tokens from recent meal names
```

Recipe vector:

```text
recipe_tokens =
  2.0 * tokens(recipe title)
  + 2.5 * tokens(recipe ingredients)
  + 0.75 * tokens(recipe description)
```

Tokenization:

1. Normalize text to lowercase.
2. Replace punctuation with spaces.
3. Split on whitespace and hyphens.
4. Drop short tokens and common stop words such as `and`, `the`, `recipe`, `fresh`, `quick`, `cup`, and `tbsp`.
5. Accumulate weighted term counts in a sparse token map.

Similarity score:

```text
similarity(profile, recipe) =
  cosine(profile_token_vector, recipe_token_vector)
```

Watchlist penalty:

```text
watch_penalty =
  max(watchlist_ingredient_score * 0.85)
  for watchlist ingredients found in the recipe text

final_analysis_score =
  similarity * (1 - watch_penalty)
```

Filtering and tie-breaking:

1. Exclude recipes the user has already logged as recipe-backed meals.
2. Exclude recipes with zero text similarity.
3. Sort by `final_analysis_score`.
4. Break ties by raw similarity, then recipe name.
5. Show the top recipe as a lightweight experiment suggestion.

The result is displayed as a plain-language experiment, for example:

```text
Try Chicken Rice Bowl as a familiar-feeling test.
```

The UI should not expose raw vector scores, cosine similarity, or algorithm terms to the user.

TF-IDF note:

The current implementation is a weighted term-frequency cosine similarity model. It is TF-style content-based recommendation, but it is not strict TF-IDF because it does not yet compute inverse document frequency across the candidate corpus. If the course write-up or future implementation requires true TF-IDF, add:

```text
tfidf(token, document) =
  tf(token, document) * log((N + 1) / (df(token) + 1))
```

where `N` is the number of candidate recipe documents and `df(token)` is the number of candidate recipe documents containing the token. The rest of the design can remain the same: use cosine similarity over TF-IDF vectors, then apply the watchlist penalty and candidate filters.

Design boundaries:

- This algorithm reads Analysis data and current recommendation candidates.
- It may create only explanation UI.
- It must not write health conclusions.
- It must not update ingredient risk.
- It must not change Home ranking, Chat recommendation ranking, `user_recommendations`, LightFM training data, XGBoost labels/features, or final risk-reranking.

The navbar Insights popover is a lightweight navigation layer over the same user activity. It may prompt the user to log a stale meal, add a how-you-feel note, care for a Tamar tree that needs water/compost, replant a dead Tamar, revisit Analysis, or return to saved CookBook meals based on recent meal/check-in timestamps, tree state, and local page-visit recency. Opening the popover marks those navigation nudges as seen for the signed-in user and clears the notification badge; it does not write health conclusions or change recommendation scores.

Language rules:

- Do not say the user is definitely sensitive, allergic, or intolerant unless the user explicitly stored a strict restriction/allergy.
- Prefer pattern language: `may be worth watching`, `early clue`, `seems easier`, `Tamar is still learning`.
- Avoid model-heavy terms in the UI such as `confidence`, `positive evidence`, `negative evidence`, or `risk model`.
- Clearly frame the page as pattern tracking, not diagnosis.

## 1.4 Tamar Tree Habit Loop

The Tamar tree is a companion/habit layer for logging consistency. It is not a recommender feature, symptom model feature, medical inference, or ingredient-risk signal.

Placement:

1. Diary shows the full tree and care state above the meal/check-in forms.
2. Navbar shows a compact tree badge with today's missing care action.
3. Insights may nudge the user to water, compost, rescue, or replant the tree.
4. Analysis shows Tamar Record as historical engagement progress.

Care rules:

1. A confirmed `meal_logs` row waters the tree for the row's local calendar date.
2. A confirmed `health_reports` row or completed `user_ibs_checkins` row composts the tree for the row's local calendar date.
3. A day grows the tree at most once, and only if that same local date has both water and compost.
4. Food-only or feeling-only days count as care and prevent death, but do not increase tree level.
5. Seven consecutive local dates with no water and no compost kill the current tree run.
6. Once dead, that run does not revive from later logs. Replanting starts a new current run while preserving prior run history.
7. If the user replants after already logging today, today's existing care can count for the new sapling.

Reward rules:

1. Water and compost create small care animations.
2. A full-care growth day creates a growth reward and increments streak/level.
3. Levels 1-7 should visibly change often.
4. After level 7, deterministic cosmetic rewards occur at least every 2 levels, medium moments every 5 levels, and larger world changes every 10 levels.
5. Major world zones unlock at level 100 (clouds), 200 (atmosphere/space), and 300 (UFO easter egg).
6. Rewards must be cosmetic and deterministic, not randomized or tied to symptom outcomes.

Data ownership:

```text
user_tamar_tree_runs
--------------------
id
user_id
is_current
status
level
growth_days
current_streak
longest_streak
best_level
last_watered_date
last_composted_date
last_care_date
last_growth_date
planted_at
died_at
updated_at

user_tamar_tree_reward_events
-----------------------------
id
user_id
run_id
event_key
event_type
care_date
level
title
body
created_at
```

These tables are user-owned and protected by RLS. They are allowed to support UI status, records, and idempotent reward events only. They must not be joined into final ranking, risk scoring, LightFM inputs, XGBoost labels/features, ingredient attribution, or diagnosis-like copy.

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

Cookbook organization is separate from preference events:

```text
cooklists
---------
id
user_id
name
is_default
created_at
updated_at

cooklist_recipes
----------------
id
cooklist_id
user_id
recipe_id
recipe_title
recipe_source
image_url
description
ingredients
instructions
created_at
```

Every user can have many cooklists. The default cooklist is named `Liked`; clicking the recipe plus button for an unsaved recipe adds the recipe there and records a `saved` interaction. Clicking plus for a recipe that is already in the cookbook opens a cooklist picker. Cooklist membership changes do not create additional recommendation event types; the existing `saved` interaction remains the recommender signal for a recipe that is anywhere in the cookbook.

Users can rename or delete non-default cooklists from the CookBook page. Deleting a cooklist removes its memberships; if a catalog recipe is no longer present in any cooklist afterward, the corresponding `saved` interaction is removed so recommendation signals stay aligned with the current cookbook.

Cooklists can also contain personal recipes entered by the user. Personal recipes use `recipe_source = 'personal'`, a generated text `recipe_id`, and optional image, ingredient, and instruction notes stored directly on `cooklist_recipes`. They are private cookbook content and are not treated as catalog recipes, LightFM items, or catalog recommendation candidates unless a later import/promote flow explicitly converts them into catalog recipes. Personal recipes may still appear in the cookbook-only recommendation sidebar through heuristic ranking based on recency, cooklist frequency, and ingredient-risk signals from their stored notes.

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
5. The chat `Log Food` flow, which can attach an optional uploaded image.

The Diary manual meal form can be prefilled from the user's cookbook or from recently logged meals. Cookbook personal recipes are logged by food name, image, and notes only; catalog cookbook recipes may also carry their numeric `recipe_id` when that id matches the `recipes` table.

After a Diary meal is logged, the app may ask whether to add it to the CookBook if the same catalog recipe or same-titled personal recipe is not already present. Recent Diary food entries can also be added to cooklists later. Catalog-backed entries use `setRecipeCooklists` and create/refresh the `saved` preference interaction; non-catalog meal/chat-food entries become private personal cooklist recipes and are not recommendation candidates.

Users can edit or delete meal-log rows they own from the Diary timeline. Editing a meal name away from its catalog recipe title should clear the stale `recipe_id`; deleting a meal log removes that diary evidence but does not create or remove recipe preference events.

Used by:

```text
Exposure tracking
Ingredient risk learning
Health risk model
Diary food-history timeline
Analysis meal-pattern summaries
Tamar tree watering state
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
calories
protein_g
fat_g
nutrition_source
nutrition_confidence
image_url
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
Tamar tree compost state
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
3. Completed check-ins compost the Tamar tree, while the mirrored food rows may also water it.

If a chat-sourced food already has a matching `meal_logs` row near the same time, the Diary shows the meal log and suppresses the duplicate chat-derived food entry.

---

# 4. Core Architecture

The implemented system contains four active models/components:

1. **LightFM Preference Model**
2. **IBS-Based Population Risk Priors**
3. **Personalized Ingredient Risk Model**
4. **XGBoost Symptom Risk Model**

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

The current implementation uses IBS-specific priors plus direct personal evidence.

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

# 7. Ingredient Risk Blend

```text
final_ingredient_risk =
personal/population blend
```

Where:

- direct personal evidence comes from `user_ingredient_risks` and `user_ibs_ingredient_risks`
- IBS population priors come from `ibs_population_ingredient_priors` and fallback catalog heuristics
- allergies and strict restrictions remain hard filters before risk scoring

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

### Step 4 - Blend With Priors

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

### Step 9 - Store Home Recommendation Rows

The implemented fast refresh does not only return one list. It upserts one
`user_recommendations` row containing the main Home recommendation row plus
the additional Home category rows:

```text
recommended_recipe_ids / match_scores
trending_recipe_ids / trending_match_scores
flavor_recipe_ids / flavor_match_scores
healthy_recipe_ids / healthy_match_scores
quick_recipe_ids / quick_match_scores
```

All Home rows use the same authenticated refresh request and the same
health-safety layer. Allergies and strict restrictions are hard filters before
any Home row is filled. Personalized ingredient risk, IBS population priors,
symptom risk, `combined_risk_score`, and `final_score` are computed once over
the candidate pool, then the category rows select from that risk-reranked pool.

Current category logic:

- `Curated for You`: the top risk-reranked personalized candidates.
- `Trending in Your Area`: positive recent `recipe_interactions` over the last
  seven days (`liked`, `saved`, `started`, `completed`), with the risk-reranked
  personalized list as a fallback when recent popularity is sparse.
- `Bursting with Flavor`: recipes ranked by cosine similarity to a bold-flavor
  seed centroid in LightFM item-embedding space, then filtered by explicit
  flavor ingredient keywords.
- `Healthy & Mindful`: risk-reranked candidates filtered by nutrition thresholds
  for calories and total fat.
- `Quick & Satisfying`: risk-reranked candidates filtered by cooking time.

The refresh walks rows in this order:

```text
curated -> trending -> flavor -> healthy -> quick
```

It greedily deduplicates across rows. Once a recipe has been assigned to an
earlier Home row, it is skipped by later rows. Recipes the user already saved or
liked are also excluded from Home rows, because Home is meant to discover
catalog recipes outside the user's current cookbook.

The `*_match_scores` arrays are display confidence values normalized from the
row's selected scores. They must stay index-aligned with their sibling recipe id
arrays and are not model-training labels.

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

### 14.1.1 user_recommendations Cookbook Columns

The `user_recommendations` row stores Home recommendation arrays and the CookBook sidebar arrays:

```text
recommended_recipe_ids
match_scores
ingredient_risk_scores
symptom_risk_scores
combined_risk_scores
final_scores
trending_recipe_ids
trending_match_scores
flavor_recipe_ids
flavor_match_scores
healthy_recipe_ids
healthy_match_scores
quick_recipe_ids
quick_match_scores
cookbook_recipe_ids
cookbook_recipe_sources
cookbook_match_scores
cookbook_reasons
```

The Home arrays (`recommended_recipe_ids`, category recipe ids, and their score arrays) are catalog recommendations from the broader recipe database and continue to exclude recipes the user already intentionally saved or liked. The cookbook arrays are different: their candidate pool is only the user's current `cooklist_recipes` rows.

The first four risk/score arrays (`ingredient_risk_scores`, `symptom_risk_scores`, `combined_risk_scores`, and `final_scores`) describe the displayed `recommended_recipe_ids` list. Category rows store their own display match-score arrays, but they do not currently persist per-item ingredient/symptom/final-score diagnostics for each category.

Catalog cookbook candidates reuse the online preference/risk path: fetch preference scores, apply strict restrictions, compute ingredient/symptom risk, and rerank by final score. Personal cookbook candidates are not LightFM/catalog items; they are mixed into the cookbook sidebar with a bounded heuristic score from recency, cooklist frequency, and ingredient-risk heuristics over their stored ingredient notes.

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

## 15.2.1 Food Image Analysis Endpoint

Example:

```text
POST /api/analyze-food-image
```

Flow:

```text
1. Authenticate the user in the frontend API bridge.
2. Require `image_url` to point at the signed-in user's own `user-uploads` Supabase Storage path.
3. Fetch only supported food-photo image formats and send the image to Gemini.
4. Return conservative JSON: is_food, food_name, visible_ingredients, possible_hidden_ingredients, portion_guess, confidence, questions, and notes.
5. Do not write database rows, ingredient exposure records, risk scores, recipe interactions, or cookbook rows from this endpoint.
6. Let Chat, Diary, or CookBook show the suggestion as editable draft state only when the user chooses a dedicated photo-analysis action. A later confirmed `/api/meal-log` write is the only meal evidence; a later confirmed CookBook save creates only private personal recipe content.
```

The endpoint is intentionally separate from `/api/meal-log`. This keeps image recognition reversible and user-confirmed, which matters because food photos often hide sauces, oils, onion, garlic, dairy, sweeteners, and portion details.

---

## 15.2.1 Meal Nutrition Estimate Endpoint

Frontend bridge:

```text
POST /api/estimate-meal-nutrition
```

Flow:

```text
1. Authenticate the user in the frontend API bridge.
2. If a catalog `recipe_id` is present and the recipe has Food.com nutrition, return calories, protein, and fat from the recipe nutrition array.
3. Otherwise send the editable food name, portion, notes, and any photo-derived ingredient hints to Gemini.
4. Return conservative JSON: calories, protein_g, fat_g, source, confidence, notes, and questions.
5. Do not write meal logs, ingredient exposure records, risk scores, recipe interactions, or cookbook rows from this endpoint.
6. Let the Diary show the returned values as editable draft nutrition. A later confirmed `/api/meal-log` write stores the final values on `meal_logs`.
```

Nutrition estimates are tracking aids. They are not medical, weight-loss, IBS safety, or diagnosis outputs.

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

## 15.6 Personal Recipe To Cooklist Flow

Example:

```text
CookBook form or chat chip: Add Recipe
```

Flow:

```text
1. User provides a recipe title and optionally a target cooklist, uploaded image, ingredients, and instructions. In the CookBook page, the normal image field attaches a recipe image, while the separate `Add recipe from image` action may upload a photo and use Gemini's draft title/ingredients before editing and saving.
2. If the target cooklist does not exist, create it; otherwise use the selected/mentioned cooklist.
3. Insert a `cooklist_recipes` row with `recipe_source = 'personal'` and a generated text recipe id.
4. Do not insert a `recipe_interactions` row for the personal recipe.
5. Do not include the personal recipe in LightFM training or catalog candidate generation.
6. The personal recipe may appear in the CookBook sidebar recommendation list through heuristic scoring over its saved metadata; this does not promote it to a catalog recipe.
```

The CookBook page supports searching across saved recipe names, descriptions, and personal ingredient notes. The Diary page uses the same cooklist storage helpers to add food-history entries to existing or newly created cooklists.

---

## 15.7 Chat-Guided Recommended Recipe Feedback Flow

Example:

```text
Recipe card play button
```

Flow:

```text
1. Open the Tamar chat panel for the selected recipe.
2. Ask whether the user ate the recipe and wants to log it.
3. If the user says no, stop without writing meal or health evidence.
4. If the user says yes, call POST /api/meal-log with recipe_id, food_name, logged_at, and optional image_url.
5. Record a completed recipe interaction for preference/history context.
6. Ask whether the user liked the recipe and record liked or dismissed when clear.
7. Ask how the user is feeling in general.
8. Save the response through POST /api/health-report as either no-symptom feedback or digestive-discomfort feedback with notes.
```

The arrow/details control on a recipe card should only reveal recipe metadata such as ingredients and prep time. It should not log a meal. Logging a recommended recipe as eaten requires explicit chat confirmation.

After chat logs a food or confirms a recommended recipe as eaten, Tamar asks whether to add it to the CookBook when it is not already saved. If the user says yes, Tamar asks for a cooklist name and creates that cooklist when needed. Catalog recipes are saved as catalog cooklist rows and preserve recommendation signals; free-text chat foods are saved as private personal recipes.

---

## 15.8 Chat Recommendation Request Flow

Example:

```text
Chat chip or user message: Recommend Me
```

Flow:

```text
1. If the user is signed in, call POST /api/refresh-recommendations with the user id.
2. Read the user's `user_recommendations.recommended_recipe_ids` and `match_scores` row.
3. Fetch the recipe rows for those ids using the same recipe mapping path as Home.
4. Format the top recipes as a concise chat response.
5. If no personalized row is available, fall back to general default recipes.
```

The chat recommendation response is a presentation layer over the existing Curated for You output. It must not create a separate ranking algorithm or call Gemini to invent catalog recommendations. Eating a recommended recipe still requires the chat-guided feedback flow in section 15.7 before writing meal or health evidence.

---

## 15.9 General Chat RAG Context

General Tamar chat uses a bounded structured retrieval context when the user is signed in and sends a valid Supabase session token to `/api/generate`.

Retrieved context comes from existing app tables only:

```text
meal_logs
health_reports
user_ibs_checkins
user_restrictions
user_ingredient_risks
user_ibs_ingredient_risks
user_recommendations
recipe_interactions
recipes
```

The retrieved block is compact, recent, and private to the authenticated user. It is injected into Gemini's system instruction as context for explanation and personalization. It does not write data, does not create new recommendations, and does not change recommender scores.

Rules:

```text
1. Use retrieved context only when relevant to the user's message.
2. Keep all health wording in pattern-tracking language, not diagnosis.
3. Do not expose raw ids, table names, prompts, or model internals to the user.
4. Do not invent catalog recommendations. Recommendation requests remain owned by section 15.8.
5. If context is missing or incomplete, say so briefly instead of fabricating user history.
```

This is the first Tamar RAG layer. It is intentionally structured retrieval over app data rather than an embedding/vector knowledge base. A later vetted IBS education corpus may add semantic retrieval, but the recommender remains the source of truth for ranked recipes.

---

## 15.10 CookBook Sidebar Recommendation Flow

Example:

```text
CookBook page: From Your CookBook
```

Flow:

```text
1. If the user is signed in, call POST /api/refresh-recommendations.
2. The recommender service refreshes Home recommendation arrays and cookbook-only arrays in the same `user_recommendations` row.
3. Catalog cookbook recipes are candidate-limited to the user's `cooklist_recipes` rows, then reranked with preference, hard restriction, ingredient-risk, and symptom-risk signals.
4. Personal cookbook recipes are not sent through LightFM; they receive heuristic scores from saved metadata.
5. The CookBook page reads `cookbook_recipe_ids`, `cookbook_recipe_sources`, `cookbook_match_scores`, and `cookbook_reasons`.
6. If the stored cookbook arrays are absent, stale, or unavailable, the page falls back to a local ranking over the already loaded `cooklist_recipes` rows so the sidebar can still recommend from the user's cookbook.
7. The page renders five compact recommendations in a right sidebar on desktop and above cooklist sections on mobile.
```

This flow deliberately differs from Home's `Curated for You`: Home recommends unsaved catalog recipes from the broader candidate pool, while the CookBook sidebar recommends only recipes already inside the user's cookbook.

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

Evaluate preference, health, and explanation-oriented experiment suggestions separately.

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

## 17.4 Analysis Content-Based Experiment Metrics

The Analysis `What to test next` recipe card is evaluated as an explanation-oriented content-based suggestion, not as the main production recommender.

Offline checks:

```text
Candidate-pool validity
Already-logged recipe exclusion rate
Watchlist-ingredient penalty correctness
Similarity sanity checks
Duplicate suggestion rate
Recipe-link validity
```

Candidate-pool validity verifies that suggested recipes come only from the user's existing recommendation candidate arrays. This keeps the algorithm subordinate to the LightFM/risk-reranking pipeline.

Similarity sanity checks compare the chosen recipe against easier-food and recent-meal tokens. For the current weighted term-frequency implementation, the selected recipe should have positive cosine similarity with the user's Analysis profile. If future work upgrades this to TF-IDF, the same checks should be run over TF-IDF vectors.

User-facing product checks:

```text
Click-through on experiment recipe cards
Whether users log the suggested experiment recipe
Whether users complete a follow-up how-you-feel note
Whether the suggestion copy is understandable and non-diagnostic
```

This feature should not be judged by global Precision@K alone because it intentionally suggests a small, explainable food experiment rather than optimizing the full recipe feed.

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

Final Ranked Recommendations
    ->
Bounded Analysis Candidate Pool
    ->
Weighted Token / TF-Style Content Similarity
    ->
Watchlist Ingredient Penalty
    ->
What To Test Next Recipe Experiment
```

This architecture is fast online because expensive model training and candidate generation happen offline, while the live system only performs filtering, risk scoring, and reranking on a small candidate set.

