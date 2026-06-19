---
name: tamar-design-alignment
description: "Use when changing or reviewing anything in the Tamar recommender project that may affect recommendation architecture, LightFM preference modeling, interaction weights, NHANES risk propagation, IBS population priors, personalized ingredient risk, symptom attribution, XGBoost risk prediction, final scoring, recommendation APIs, meal/symptom logging, Supabase schema or migrations, or related UI flows. Ensures code and docs stay aligned with the revised implementation design."
---

# Tamar Design Alignment

The source of truth for recommender architecture is:

`docs/IBS_Recommender_Online_LightFM_Design.md`

Before making or reviewing a relevant change, read the design document sections that apply to the task.

## Required Rule

Do not leave the implementation and design document inconsistent.

Every relevant change must do one of these:

1. Keep the code/schema/UI behavior aligned with the current design.
2. Update `docs/IBS_Recommender_Online_LightFM_Design.md` in the same change to reflect the new intended design.

If the user asks for a change that conflicts with the design, either:

- change the implementation to follow the design, or
- update the design document and then implement the new behavior.

## Areas To Check

Check design alignment especially for:

- LightFM preference model and interaction weights
- `recipe_interactions` event types
- hard filters for allergies and strict restrictions
- IBS-based population priors
- NHANES item-item similarity and risk propagation
- personalized ingredient risk, confidence, and symptom attribution
- XGBoost feature construction and symptom-risk prediction
- `combined_risk_score`, `final_ingredient_risk`, and final ranking formulas
- Supabase tables, migrations, and recommendation-related API behavior
- meal logs, health reports, and ingredient exposure records

## Current High-Level Design

- LightFM predicts preference and generates candidates.
- Allergies and strict restrictions are hard filters before scoring.
- Personalized ingredient risk is based on direct user meal/symptom evidence.
- NHANES is a risk propagation layer only; it creates suspected risks for related unseen or weak-evidence items.
- XGBoost predicts recipe/context symptom risk; it does not replace ingredient risk.
- Final ranking penalizes preference by combined health risk.

## Recommended Workflow

1. Identify whether the task affects recommender behavior or data flow.
2. Read the relevant design sections.
3. Inspect the existing implementation before editing.
4. Make the smallest consistent change.
5. If the change intentionally changes the design, update the design document.
6. In the final response, mention whether the design document was already aligned or was updated.
