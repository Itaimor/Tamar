---
name: tamar-design-alignment
description: "Use when changing, reviewing, or orienting within the Tamar project, especially work that may affect repository structure, recommendation architecture, LightFM preference modeling, interaction weights, IBS population priors, personalized ingredient risk, symptom attribution, XGBoost risk prediction, final scoring, recommendation APIs, meal/symptom logging, Supabase schema or migrations, recipe image behavior, or related UI flows. Ensures code and docs stay aligned with the README repo map and revised implementation design."
---

# Tamar Design Alignment

Start repo orientation from:

`README.md` -> `Repo Structure`

That README section is the project map. Use it to identify the relevant module, then open the linked module documentation before changing behavior.

The source of truth for recommender architecture is:

`docs/IBS_Recommender_Online_LightFM_Design.md`

The source of truth for recipe image behavior is:

`docs/RECIPE_IMAGES_PLAN.md`

Before making or reviewing a relevant change, read the README repo structure section and then the design/module document sections that apply to the task.

## Required Rule

Do not leave the implementation and design document inconsistent.

Every relevant change must do one of these:

1. Keep the code/schema/UI behavior aligned with the current README/module docs.
2. Update the relevant docs in the same change to reflect the new intended behavior.

If the user asks for a change that conflicts with the design, either:

- change the implementation to follow the design, or
- update the design document and then implement the new behavior.

## Areas To Check

Check design alignment especially for:

- repo structure and module ownership documented in `README.md`
- LightFM preference model and interaction weights
- `recipe_interactions` event types
- hard filters for allergies and strict restrictions
- IBS-based population priors
- personalized ingredient risk, confidence, and symptom attribution
- XGBoost feature construction and symptom-risk prediction
- `combined_risk_score`, `final_ingredient_risk`, and final ranking formulas
- Supabase tables, migrations, and recommendation-related API behavior
- meal logs, health reports, and ingredient exposure records
- recipe image cache, fallback categories, and duplicate-image handling

## Current High-Level Design

- LightFM predicts preference and generates candidates.
- Allergies and strict restrictions are hard filters before scoring.
- Personalized ingredient risk is based on direct user meal/symptom evidence.
- IBS population priors initialize suspected risk for weak-evidence items.
- XGBoost predicts recipe/context symptom risk; it does not replace ingredient risk.
- Final ranking penalizes preference by combined health risk.

## Recommended Workflow

1. Read `README.md`, especially `Repo Structure`, to locate the relevant modules and linked docs.
2. Identify whether the task affects recommender behavior, image behavior, Supabase data flow, UI flows, or general repo documentation.
3. Read the relevant linked doc:
   - recommender/risk/scoring: `docs/IBS_Recommender_Online_LightFM_Design.md`
   - images: `docs/RECIPE_IMAGES_PLAN.md`
   - local setup/API service flow: `docs/LOCAL_SETUP_WITH_RECOMMENDER.md`
   - contribution rules: `CONTRIBUTING.md`
4. Inspect the existing implementation before editing.
5. Make the smallest consistent change.
6. If the change intentionally changes module behavior or ownership, update the relevant docs in the same change.
7. In the final response, mention whether the relevant docs were already aligned or were updated.
