# Project Summary

## Datasets Used

- **Food.com recipes and interactions** — main recipe catalog and historical user-item interaction source for collaborative filtering. Available on [Kaggle Food.com Dataset](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions). Local seeding flow is implemented in [RecommenderSys/seed_database.py](RecommenderSys/seed_database.py), and baseline dataset loading/evaluation helpers live in [RecommenderSys/src/](RecommenderSys/src/).
- **Food.com nutrition fields** — catalog nutrition arrays used when estimating meal calories, protein, and fat for recipe-backed diary entries.
- **IBS and FODMAP ingredient knowledge** — local ingredient mappings and trigger candidates stored in [RecommenderSys/IBS_models/fodmap_mapping.csv](RecommenderSys/IBS_models/fodmap_mapping.csv) and app-side matching helpers in [src/lib/ibsIngredients.ts](src/lib/ibsIngredients.ts).
- **User-generated Tamar data** — stored in Supabase (recipe interactions, cooklists, meal logs, symptom reports, IBS check-ins, restrictions, personal ingredient risk, tree progress, and recommendation rows).
- **Gemini-assisted image and text inputs** — food photos and free-text meal descriptions used to draft meal or personal recipe details (persisted only after user confirmation).

Additional data-related information:
- NHANES-style sensitivity co-occurrence was considered during design but is intentionally deferred and is not part of the current scoring implementation.

&nbsp;<br>

## Technologies and Frameworks

### Frontend

- **React & TypeScript** — for modular SPA component architecture and type safety.
- **Vite** — for fast local development server and optimized production build bundling.
- **Tailwind CSS & shadcn/Radix UI** — for design system tokens, accessible primitives, and UI styling.
- **React Router & React Query** — for client-side routing, data fetching, and state caching.
- **Recharts, Framer Motion & Lucide Icons** — for UI analytics visualizations, micro-animations, and icons.

### Backend

- **TypeScript API Handlers (`api/`)** — for serverless request routing and bridging client requests to Supabase and Gemini.
- **FastAPI & Uvicorn** — for hosting Python recommendation endpoints and model inference microservice.

### Algorithmic

- **LightFM** — for hybrid implicit matrix factorization recommendation.
- **XGBoost & scikit-learn** — for symptom risk prediction and content-based recipe features.
- **NumPy, pandas, SciPy** — for matrix operations, feature extraction, and dataset preparation.

### Data Platforms

- **Supabase (PostgreSQL & RLS)** — for relational data storage, authentication, and Row Level Security policies.
- **Supabase Storage** — for storing recommender model artifacts and user meal image uploads.

### AI

- **Google Gemini (`@google/generative-ai`)** — for food-photo analysis, automated nutrition estimation, and Tamar conversational Assistant.

&nbsp;<br>

## Main Algorithms

A brief summary of the key algorithms and features developed:

- **LightFM preference model** — learns implicit preference from Food.com history and app interactions (viewed, saved, started, completed, liked, dismissed).
- **Matrix-factorization fallback** — keeps candidate generation usable when LightFM is unavailable in the local environment.
- **Strict restriction filtering** — allergies and hard restrictions remove unsafe recipes before scoring.
- **Personalized ingredient risk** — meal logs and symptom reports create exposure evidence and update per-user ingredient risk.
- **IBS population priors** — IBS/FODMAP ingredient knowledge provides risk defaults when a user has little direct evidence.
- **XGBoost-compatible symptom risk** — optional offline model training estimates digestive symptom risk from recipe, user, and context features.
- **Final reranking** — candidate recipes are ranked with `final_score = preference_score - lambda * combined_risk_score`.
- **Analysis content-based experiment suggestion** — a bounded weighted term-frequency cosine similarity model suggests one already-recommended recipe to test, while penalizing strong watchlist ingredients.
- **CookBook recommendation heuristic** — catalog cookbook recipes reuse the risk-reranking path, while private personal recipes are ranked with bounded recency, cooklist, and ingredient-note heuristics.

&nbsp;<br>

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

- **Cursor & VS Code** — used for UI development, API implementation, and algorithmic module integration.
- **ChatGPT / Codex** — used for algorithmic modules design review, refactoring, and documentation alignment.
- **Supabase SQL Editor** — used to apply schema migrations and inspect database state.
- **Local Terminals** — concurrent processes for Vite dev server and Python FastAPI recommender service.

&nbsp;<br>

## Development Evolution

- **Milestone 1:** Built a React recipe app with authentication, recipe browsing, saved state, and basic recommendation display.
- **Milestone 2:** Added Supabase schema, recipe interaction tracking, stored recommendation rows, and cooklists.
- **Milestone 3:** Added the Python recommender flow with Food.com seeding, batch training, LightFM candidate generation, and a matrix-factorization fallback.
- **Milestone 4:** Added IBS-aware modeling: ingredient restrictions, meal logs, health reports, personalized risk, IBS priors, and risk-reranked recommendations.
- **Milestone 5:** Added Diary and Analysis so users can log food, track symptoms, inspect patterns, and receive safer experiment suggestions.
- **Milestone 6:** Added Gemini-assisted chat, food-photo analysis, editable nutrition estimates, personal cookbook recipes, and the Tamar tree habit loop.
- **Milestone 7:** Added freemium gates, cookbook-only recommendations, QA documentation, and final submission assets.

&nbsp;<br>

## Evaluation

The project separates recommendation quality from health-risk and product-quality checks:

- **Offline Recommendation Metrics**: Evaluated with RMSE and Precision@K using baseline helpers in [RecommenderSys/src/evaluate.py](RecommenderSys/src/evaluate.py), as well as Precision@K, Recall@K, NDCG@K, and MAP@K.
- **Symptom Risk Metrics**: Evaluated with AUC, F1, precision, recall, and log loss on labeled meal/symptom history.
- **Combined Ranking Quality**: Measured via average predicted risk in top-K recommendations, count of high-risk items shown, and preference retention among low-risk candidates.
- **Experiment Model Validity**: Verified via candidate-pool validity, duplicate rate, watchlist penalty correctness, and user comprehension.
- **Automated & Manual Testing**: Covered by Vitest test suites under [src/test/](src/test/) and end-to-end user journey validation in [docs/QA_PLAN.md](docs/QA_PLAN.md).

&nbsp;<br>

## Main Features

- **Core Recommendation Engine**: Hybrid LightFM collaborative filtering combined with IBS-aware personalized ingredient risk reranking (`final_score = preference - lambda * risk`).
- **Cold-Start Onboarding**: Interactive preference and dietary restriction onboarding for initial user profile bootstrapping.
- **Food & Symptom Diary**: Meal logging, symptom tracking, calorie/macro breakdowns, and photo-based meal input via Gemini.
- **IBS Pattern Analysis**: Interactive triggers vs. easy food analysis, watchlist penalties, and candidate recipe experiment suggestions.
- **Tamar AI Assistant**: Context-aware chat with recipe suggestions, food logging, and diet feedback.
- **Tamar Tree Companion**: Gamified habit progress loop rewarding consistent meal/symptom tracking.
- **Freemium Monetization Model**: Sapling tier vs. Canopy+ premium feature gating.

&nbsp;<br>

## Open Issues, Limitations, and Future Work

- **NHANES Risk Propagation**: Co-occurrence risk propagation was designed but intentionally deferred.
- **Symptom Risk Training Data**: XGBoost symptom model performance requires consistent long-term meal/symptom logs per user.
- **AI Photo Input Verification**: Gemini food-photo recognition serves as editable draft state to mitigate hidden allergen risk.
- **Live Payments Integration**: Canopy+ checkout flow is prototyped in UI without active payment gateway hooks.
- **Production Infrastructure**: Deployment requires split hosting for static/API edge handlers and Python compute microservice.

&nbsp;<br>

## Additional Comments

Tamar is strictly designed as a nutritional pattern tracking and recommendation system, not a medical diagnostic tool. UI language uses non-diagnostic terms like "worth watching" and "seems easier". The system maintains clear separation between recommendation scoring, risk estimation, and habit mechanics to ensure gamification features do not distort health recommendations.

