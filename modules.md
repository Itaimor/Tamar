# Modules Description

## User Interface

- Technology: React, TypeScript, Vite, Tailwind CSS, shadcn/Radix UI, React Router, Recharts, Framer Motion, and Lucide icons.
- Responsibilities: Render all user-facing pages, collect authentication input, show recommendations, manage recipe details, support cooklists, log meals and symptoms, present Analysis insights, and host the Tamar chat and tree experiences.
- Interactions:
  - Calls Supabase through client helpers in `src/lib/`.
  - Calls API handlers under `api/` for recommendation refresh, Gemini analysis, meal logging, health reports, nutrition estimates, and image-cache fill.
  - Reads `user_recommendations`, recipes, cooklists, diary data, and tree state for display.
- Source code: [src/](src/)

## Authentication and Client Data Layer

- Technology: Supabase Auth, Supabase JavaScript client, React context, and TypeScript helper modules.
- Responsibilities: Manage signed-in sessions, synchronize user profile state, read and write user-owned app data, and keep browser code limited to publishable credentials.
- Interactions:
  - `AuthProvider` and `AuthDialog` handle sessions and sign-in/sign-up UI.
  - `src/lib/supabase.ts` creates the browser client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
  - Recipe, diary, cooklist, freemium, analysis, and tree helpers use Supabase tables protected by RLS.
- Source code: [src/components/AuthProvider.tsx](src/components/AuthProvider.tsx), [src/components/AuthDialog.tsx](src/components/AuthDialog.tsx), [src/lib/](src/lib/)

## API Gateway and Local Backend Bridge

- Technology: TypeScript API handlers and Vite local middleware.
- Responsibilities: Authenticate frontend requests, keep private keys server-side, call Gemini when needed, call the Python recommender service when configured, and provide local fallbacks for visible diary data.
- Interactions:
  - `/api/refresh-recommendations` calls the Python recommender refresh flow.
  - `/api/meal-log` and `/api/health-report` bridge user logging to the recommender service.
  - `/api/analyze-food-image`, `/api/estimate-meal-nutrition`, and `/api/generate` call Gemini-backed features.
  - `vite.config.ts` mirrors selected API routes during local development.
- Source code: [api/](api/), [vite.config.ts](vite.config.ts)

## Recommendation Engine

- Technology: Python, FastAPI, LightFM, NumPy, pandas, SciPy, scikit-learn, XGBoost, Supabase Python client, and Uvicorn.
- Responsibilities: Train preference candidates, refresh per-user recommendations, enforce hard restrictions, compute risk-aware scores, and persist recommendation arrays.
- Interactions:
  - Batch training reads `recipes`, `recipe_interactions`, and `historical_interactions`.
  - Fast refresh reads the saved collaborative-filtering artifact and user history.
  - Results are written to `user_recommendations` for Home, Chat, and CookBook.
- Source code: [RecommenderSys/recommend_batch.py](RecommenderSys/recommend_batch.py), [RecommenderSys/recommend_fast.py](RecommenderSys/recommend_fast.py), [RecommenderSys/recommender_service.py](RecommenderSys/recommender_service.py)

## Health Risk and Symptom Attribution

- Technology: Python scoring helpers, Supabase tables, XGBoost-compatible feature construction, and IBS/FODMAP ingredient mappings.
- Responsibilities: Convert confirmed meals and symptom reports into ingredient exposure evidence, update personalized ingredient risk, blend risk components, and rerank candidate recipes.
- Interactions:
  - Meal logs create ingredient exposure rows.
  - Health reports look back over recent meals and update per-user ingredient risk.
  - Strict allergies and restrictions are hard filters before final scoring.
  - Optional symptom models produce risk estimates that are combined with ingredient risk.
- Source code: [RecommenderSys/risk_scoring.py](RecommenderSys/risk_scoring.py), [RecommenderSys/health_events.py](RecommenderSys/health_events.py), [RecommenderSys/train_symptom_model.py](RecommenderSys/train_symptom_model.py), [RecommenderSys/IBS_models/fodmap_mapping.csv](RecommenderSys/IBS_models/fodmap_mapping.csv)

## Diary, Analysis, and Tamar Tree

- Technology: React components, Supabase data helpers, Recharts, and deterministic tree-state logic.
- Responsibilities: Let users log meals and feelings, add or remove strict forbidden foods, review personal history, inspect pattern summaries and current safety filters, see possible trigger/easier foods, receive bounded recipe experiment suggestions, and maintain the Tamar tree habit loop.
- Interactions:
  - Diary writes meal logs and health reports through API bridges.
  - Diary manages the signed-in user's RLS-protected `user_restrictions`; Analysis presents the same rows read-only.
  - Analysis reads meal, symptom, restriction, risk, recommendation, and recipe data without writing health conclusions.
  - Tamar tree reads food/check-in activity and writes only gamification state.
- Source code: [src/lib/diary.ts](src/lib/diary.ts), [src/lib/analysis.ts](src/lib/analysis.ts), [src/lib/recommendationSafety.ts](src/lib/recommendationSafety.ts), [src/lib/tamarTree.ts](src/lib/tamarTree.ts), [src/components/AnalysisScreen.tsx](src/components/AnalysisScreen.tsx), [src/components/ForbiddenFoodsPanel.tsx](src/components/ForbiddenFoodsPanel.tsx), [src/components/TamarTreePanel.tsx](src/components/TamarTreePanel.tsx)

## Chat, Image Analysis, and Nutrition Estimates

- Technology: Google Gemini, TypeScript API handlers, per-account browser storage, Supabase Storage, and structured app-data retrieval.
- Responsibilities: Provide Tamar chat, retain a bounded recent transcript across refreshes on the same device, retrieve bounded private context for signed-in users, analyze food photos as editable drafts, estimate nutrition values, and guide recipe feedback after a user confirms they ate a recommendation.
- Interactions:
  - Chat recommendation requests present the same `user_recommendations` output used by Home.
  - Chat transcript storage is scoped by authenticated user id and keeps at most 80 visible messages.
  - Food-photo analysis returns suggestions but does not write durable learning evidence by itself.
  - Nutrition estimates are editable tracking values, not medical conclusions.
- Source code: [src/components/ChatScreen.tsx](src/components/ChatScreen.tsx), [src/components/ChatSessionProvider.tsx](src/components/ChatSessionProvider.tsx), [src/lib/chatHistory.ts](src/lib/chatHistory.ts), [api/generate.ts](api/generate.ts), [api/chat-rag-context.ts](api/chat-rag-context.ts), [api/analyze-food-image.ts](api/analyze-food-image.ts), [api/estimate-meal-nutrition.ts](api/estimate-meal-nutrition.ts)

## Data Ingestion and Storage

- Technology: Supabase PostgreSQL, Supabase Storage, SQL migrations, Python seeding scripts, and optional Pexels image lookup.
- Responsibilities: Define project tables and policies, seed or import recipe data, store private recommender artifacts, store user uploads, and maintain a cache of recipe images.
- Interactions:
  - Migration files create recipe, interaction, recommender, diary, cooklist, upload, and tree tables.
  - `seed_database.py` imports Food.com data or creates fallback demo records.
  - `fill-recipe-images` populates `recipe_images` while avoiding repeated cached images where possible.
- Source code: [supabase/](supabase/), [RecommenderSys/seed_database.py](RecommenderSys/seed_database.py), [api/fill-recipe-images.ts](api/fill-recipe-images.ts)

## Testing and Quality Assurance

- Technology: Vitest, Testing Library, ESLint, and manual QA documentation.
- Responsibilities: Validate helper logic, tree behavior, freemium access, analysis suggestions, recipe image helpers, IBS risk matching, and end-to-end user journeys.
- Interactions:
  - Automated tests run with `npm run test`.
  - Production-readiness checks should also run `npm run build`.
  - Manual QA covers auth, recommendations, diary, analysis, chat, freemium, phone behavior, uploads, and tree flows.
- Source code: [src/test/](src/test/), [docs/QA_PLAN.md](docs/QA_PLAN.md), [vitest.config.ts](vitest.config.ts)
