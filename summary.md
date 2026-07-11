# Project Summary

## Datasets Used

- **Food.com recipes and interactions** - the main recipe catalog and historical user-item interaction source for collaborative filtering. The local seeding flow is implemented in [RecommenderSys/seed_database.py](RecommenderSys/seed_database.py), and baseline dataset loading/evaluation helpers live in [RecommenderSys/src/](RecommenderSys/src/).
- **Food.com nutrition fields** - catalog nutrition arrays are used when estimating meal calories, protein, and fat for recipe-backed diary entries.
- **IBS and FODMAP ingredient knowledge** - local ingredient mappings and trigger candidates are stored in [RecommenderSys/IBS_models/fodmap_mapping.csv](RecommenderSys/IBS_models/fodmap_mapping.csv) and app-side matching helpers such as [src/lib/ibsIngredients.ts](src/lib/ibsIngredients.ts).
- **User-generated Tamar data** - Supabase stores recipe interactions, cooklists, meal logs, symptom reports, IBS check-ins, restrictions, personal ingredient risk, tree progress, and recommendation rows.
- **Gemini-assisted image and text inputs** - food photos and free-text meal descriptions can draft meal or personal recipe details, but the app only persists learning evidence after user confirmation.

NHANES-style sensitivity co-occurrence was considered during design but is intentionally deferred and is not part of the current scoring implementation.

## Technologies and Frameworks

- **Frontend** - React, TypeScript, Vite, Tailwind CSS, shadcn/Radix UI primitives, React Router, React Query, Recharts, Framer Motion, and Lucide icons.
- **Backend and API layer** - TypeScript API handlers under `api/`, local Vite middleware, Python FastAPI, and Uvicorn.
- **Recommendation and modeling** - LightFM, NumPy, pandas, SciPy, scikit-learn, XGBoost, and a matrix-factorization fallback.
- **Data platform** - Supabase Auth, PostgreSQL, Row Level Security policies, and Supabase Storage buckets for recommender artifacts and user uploads.
- **AI** - Google Gemini through `@google/generative-ai` for Tamar chat, food-photo analysis, and editable nutrition estimates.
- **Quality tools** - Vitest, Testing Library, ESLint, and the manual QA plan in [docs/QA_PLAN.md](docs/QA_PLAN.md).

## Main Algorithms

- **LightFM preference model** - learns implicit preference from Food.com history and app interactions such as viewed, saved, started, completed, liked, and dismissed recipes.
- **Matrix-factorization fallback** - keeps candidate generation usable when LightFM is unavailable in the local environment.
- **Strict restriction filtering** - allergies and hard restrictions remove unsafe recipes before scoring.
- **Personalized ingredient risk** - meal logs and symptom reports create exposure evidence and update per-user ingredient risk.
- **IBS population priors** - IBS/FODMAP ingredient knowledge provides risk defaults when a user has little direct evidence.
- **XGBoost-compatible symptom risk** - optional offline model training estimates digestive symptom risk from recipe, user, and context features.
- **Final reranking** - candidate recipes are ranked with `final_score = preference_score - lambda * combined_risk_score`.
- **Analysis content-based experiment suggestion** - a bounded weighted term-frequency cosine similarity model suggests one already-recommended recipe to test, while penalizing strong watchlist ingredients.
- **CookBook recommendation heuristic** - catalog cookbook recipes reuse the risk-reranking path, while private personal recipes are ranked with bounded recency, cooklist, and ingredient-note heuristics.

## System Architecture

Tamar uses a split architecture:

1. The React/Vite app renders Home, CookBook, Diary, Analysis, Chat, pricing, authentication, and recipe detail views.
2. Supabase handles authentication, user-owned app data, recipe/interactions data, uploaded images, stored recommendations, and model artifacts.
3. TypeScript API handlers authenticate frontend requests and bridge them to Supabase, Gemini, or the Python recommender service.
4. The Python FastAPI recommender service receives meal logs, health reports, and refresh requests.
5. Offline training scripts build preference candidates and optional symptom-risk models from Supabase data.
6. Online refresh uses precomputed candidates, hard filters, personalized risk, symptom risk, and final reranking, then writes `user_recommendations`.
7. The UI reads stored recommendations for Home, Chat recommendation answers, and CookBook sidebar suggestions.

This design keeps expensive training offline while the live app only filters and reranks a small candidate set.

## Development Environment

- **VS Code / Cursor** - used for frontend, API, and documentation work.
- **ChatGPT / Codex** - used for development assistance, recommender design review, and documentation alignment.
- **Supabase SQL Editor** - used to apply migrations and inspect project tables.
- **Local terminals** - one process for Vite and one process for the Python recommender service.

## Development Evolution

- **Milestone 1:** Built a React recipe app with authentication, recipe browsing, saved state, and basic recommendation display.
- **Milestone 2:** Added Supabase schema, recipe interaction tracking, stored recommendation rows, and cooklists.
- **Milestone 3:** Added the Python recommender flow with Food.com seeding, batch training, LightFM candidate generation, and a matrix-factorization fallback.
- **Milestone 4:** Added IBS-aware modeling: ingredient restrictions, meal logs, health reports, personalized risk, IBS priors, and risk-reranked recommendations.
- **Milestone 5:** Added Diary and Analysis so users can log food, track symptoms, inspect patterns, and receive safer experiment suggestions.
- **Milestone 6:** Added Gemini-assisted chat, food-photo analysis, editable nutrition estimates, personal cookbook recipes, and the Tamar tree habit loop.
- **Milestone 7:** Added freemium gates, cookbook-only recommendations, QA documentation, and final submission assets.

## Evaluation

The project separates recommendation quality from health-risk and product-quality checks:

- Preference models can be evaluated with RMSE and Precision@K using the baseline helpers in [RecommenderSys/src/evaluate.py](RecommenderSys/src/evaluate.py), plus Precision@K, Recall@K, NDCG@K, and MAP@K as described in the design document.
- Symptom-risk modeling can be evaluated with AUC, F1, precision, recall, and log loss when enough labeled meal/symptom data exists.
- Combined recommendation behavior should track average predicted risk in top-K recommendations, number of high-risk recipes shown, and preference score among lower-risk recipes.
- The Analysis recipe experiment is evaluated with candidate-pool validity, duplicate rate, watchlist penalty correctness, recipe-link validity, and user-facing comprehension.
- Frontend helper behavior is covered by Vitest tests under [src/test/](src/test/), while full app journeys are covered by [docs/QA_PLAN.md](docs/QA_PLAN.md).

## Main Features

- Personalized recipe recommendations that balance taste and IBS-related risk.
- Cold-start onboarding for taste and IBS ingredient sensitivity signals.
- Supabase authentication with email/password and OAuth provider support.
- Home recommendation rows, recipe detail pages, and saved recipe interactions.
- CookBook with cooklists, personal recipes, and cookbook-only suggestions.
- Diary for meals, symptom reports, nutrition tracking, and uploaded meal images.
- Analysis page for foods to watch, easier foods, recent trends, nutrition, Tamar Record, and bounded recipe experiments.
- Tamar chat with structured private context, recommendation presentation, food logging, and recipe feedback.
- Food-photo analysis and editable nutrition estimation through Gemini.
- Tamar tree companion that rewards consistent logging without affecting recommendation ranking.
- Sapling / Canopy+ freemium gates for selected premium features.

## Open Issues, Limitations, and Future Work

- NHANES-based risk propagation is intentionally deferred and should not be assumed in current results.
- XGBoost symptom-risk quality depends on having enough confirmed meal and symptom history.
- Gemini food-photo analysis can miss hidden ingredients; Tamar treats it as editable draft state only.
- Canopy+ checkout is represented in the UI but payment processing is not live.
- Production deployment requires hosting the frontend/API and Python recommender service separately.
- Further evaluation should add larger offline metrics runs, real user feedback loops, and stronger calibration checks for health-risk predictions.

## Additional Comments

Tamar is intentionally not a diagnosis tool. The product language uses pattern-tracking terms such as "worth watching" and "seems easier" rather than claiming that a user is sensitive or intolerant. The recommendation system is designed to keep preference learning, health-risk modeling, and motivational habit features separate so engagement mechanics do not leak into health conclusions.
