# Contributing

## Revised Design Alignment

All project changes must stay aligned with the revised implementation design:

[docs/IBS_Recommender_Online_LightFM_Design.md](docs/IBS_Recommender_Online_LightFM_Design.md)

Before changing recommender logic, database schema, model training, recommendation APIs, risk scoring, meal/symptom logging, or related UI flows, read the design document and check whether the change still follows it.

Every change should do one of these:

1. **Match the design document.**
   The code, schema, and behavior implement the current design.

2. **Update the design document in the same change.**
   If the implementation intentionally changes the architecture, scoring flow, model roles, database tables, or assumptions, update the design document so it remains the source of truth.

If code and design disagree, do not leave them inconsistent. Either change the code to match the design, or change the design to reflect the new intended behavior.

## Areas That Require Extra Care

Check the design document especially when changing:

- LightFM preference modeling or interaction weights
- allergy and hard-filter behavior
- personalized ingredient-risk calculations
- NHANES risk propagation
- XGBoost symptom-risk features or prediction flow
- final scoring formulas
- Supabase tables or migrations related to recommendations
- meal logs, health reports, or symptom attribution
- recommendation endpoint behavior

## Pull Request Rule

Each pull request should include a short note saying either:

```text
Design alignment: no design-doc update needed because this change follows the current design.
```

or:

```text
Design alignment: updated docs/IBS_Recommender_Online_LightFM_Design.md to match this change.
```
