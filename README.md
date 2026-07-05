# Tamar

IBS-friendly recipe recommendation project for a university recommender systems course.

## Repo Structure

Use this section as the starting map for the repository. For deeper module behavior, follow the linked docs instead of guessing from filenames alone.

### Main Documentation

| Area | Source |
| --- | --- |
| Recommender architecture, risk scoring, model roles, and algorithm design | [docs/IBS_Recommender_Online_LightFM_Design.md](docs/IBS_Recommender_Online_LightFM_Design.md) |
| IBS product relevance plan and implementation notes | [docs/ibs/IBS_RELEVANCE_PLAN.md](docs/ibs/IBS_RELEVANCE_PLAN.md) |
| Local setup for the website plus Python recommender service | [docs/LOCAL_SETUP_WITH_RECOMMENDER.md](docs/LOCAL_SETUP_WITH_RECOMMENDER.md) |
| Recipe image strategy, image cache, category fallbacks, and Pexels behavior | [docs/RECIPE_IMAGES_PLAN.md](docs/RECIPE_IMAGES_PLAN.md) |
| Contribution and design-alignment rules | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Project purpose and AI collaboration context | [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) |
| Google/Gemini API key setup for AI features | [docs/create_api_key.md](docs/create_api_key.md) |
| Earlier recommender brainstorming summary and supporting charts | [docs/brainstorms/IBS_Recommender_Brainstorm_Summary.md](docs/brainstorms/IBS_Recommender_Brainstorm_Summary.md) |

### Top-Level Folders

| Path | Purpose |
| --- | --- |
| `src/` | React/Vite frontend app. Contains pages, components, client-side Supabase helpers, recipe display logic, and UI state. |
| `api/` | Serverless-style TypeScript API handlers used by deployment and mirrored locally by Vite middleware where needed. |
| `RecommenderSys/` | Python recommender system, data seeding, model training, fast recommendation refresh, and recommender service. |
| `supabase/` | Supabase schema and migrations for auth-adjacent app data, recipes, interactions, images, recommendations, and artifact storage. |
| `docs/` | Human-readable design, setup, image, and project context documentation. |
| `public/` | Static browser assets served directly by Vite. |
| `.agents/skills/` | Project-local Codex skills that tell AI agents how to stay aligned with Tamar-specific design and database expectations. |
| `.github/` | GitHub workflow and pull request metadata. |
| `dist/` | Generated frontend build output. Do not edit by hand. |
| `node_modules/` | Installed frontend dependencies. Do not edit by hand. |

### Frontend App

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Top-level routing. Connects public/auth-gated routes to pages. |
| `src/main.tsx` | React entrypoint. Mounts the app. |
| `src/pages/Landing.tsx` | Public landing page. |
| `src/pages/Home.tsx` | Main recipe homepage with hero, recommendation rows, onboarding/taste feedback, saved-state actions, and image-fill queueing. |
| `src/pages/RecipeDetail.tsx` | Recipe detail view with ingredients, steps, and interaction logging. |
| `src/pages/CookBook.tsx` | Cooklist-based cookbook view for saved recipes. |
| `src/pages/Index.tsx` | Shell for secondary tools/screens such as chat, diary, and analysis. |
| `src/components/AuthProvider.tsx` | Supabase auth session provider and profile synchronization. |
| `src/components/AuthDialog.tsx` | Sign-in/sign-up UI. |
| `src/components/Navbar.tsx` | Main navigation and authenticated user controls. |
| `src/components/ImageWithSkeleton.tsx` | Shared image rendering with loading skeleton/fallback handling. |
| `src/components/*Screen.tsx` | Tool/demo screens used inside the app shell. |
| `src/components/ui/` | shadcn/Radix-style reusable UI primitives. Usually treat as design-system components. |
| `src/assets/` | Bundled local images used by static/demo UI sections. |

### Frontend Data And Client Logic

| Path | Purpose |
| --- | --- |
| `src/lib/supabase.ts` | Browser Supabase client setup from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `src/lib/recipes.ts` | Recipe fetching, mapping, deterministic match display, image fallback/category logic, and recipe image selection. See [docs/RECIPE_IMAGES_PLAN.md](docs/RECIPE_IMAGES_PLAN.md). |
| `src/lib/recipeInteractions.ts` | Reads/writes recipe interactions, saved recipes, onboarding feedback counts, and cooklist membership helpers. |
| `src/lib/diary.ts` | Reads and writes Diary meals/check-ins, expands chat check-in foods, and includes started/completed recipe activity. |
| `src/lib/coldStart.ts` | Legacy/static cold-start recipe vector definitions and helper behavior. |
| `src/lib/utils.ts` | Shared frontend utility helpers. |

### API Layer

| Path | Purpose |
| --- | --- |
| `api/refresh-recommendations.ts` | Authenticated bridge from the frontend to the Python recommender service. |
| `api/meal-log.ts` | Authenticated bridge for Diary meal logging; calls the recommender service when configured and otherwise stores the meal row. |
| `api/health-report.ts` | Authenticated bridge for Diary symptom/check-in logging; calls the recommender service when configured and otherwise stores the check-in row. |
| `api/fill-recipe-images.ts` | Authenticated image-cache filler. Searches Pexels, writes `recipe_images`, and avoids repeated cached images where possible. See [docs/RECIPE_IMAGES_PLAN.md](docs/RECIPE_IMAGES_PLAN.md). |
| `api/generate.ts` | AI generation endpoint. See [docs/create_api_key.md](docs/create_api_key.md) for key setup. |
| `vite.config.ts` | Vite config plus local dev middleware that mirrors key API routes for local testing. |

### Recommender System

| Path | Purpose |
| --- | --- |
| `RecommenderSys/recommend_batch.py` | Batch training flow that reads Supabase data, trains LightFM preference candidates when available, falls back to matrix-factorization CF, saves the item-factor artifact, and uploads candidates. |
| `RecommenderSys/recommend_fast.py` | Fast per-user recommendation refresh using saved/precomputed preference candidates, hard filters, ingredient risk, symptom risk, and final reranking. |
| `RecommenderSys/risk_scoring.py` | Shared health-risk scoring, strict restriction filtering, IBS priors, optional symptom-model scoring, and final reranking helpers. |
| `RecommenderSys/health_events.py` | Meal-log, health-report, exposure, restriction, recipe-ingredient sync, and personalized ingredient-risk update helpers. |
| `RecommenderSys/train_symptom_model.py` | Offline symptom-risk model training from meal logs and health reports. Uses XGBoost when available. |
| `RecommenderSys/recommender_service.py` | FastAPI service used by the frontend/API bridge for online refreshes plus meal, health, and restriction endpoints. |
| `RecommenderSys/recommender_common.py` | Shared recommender constants, category logic, and utilities. |
| `RecommenderSys/seed_database.py` | Seeds Supabase with Food.com data or fallback mock recipe/interactions. |
| `RecommenderSys/cold_start_active_learning.py` | Experimental/legacy cold-start active-learning module. |
| `RecommenderSys/src/` | Baseline recommender implementations and evaluation helpers used for coursework/reference. |
| `RecommenderSys/IBS_models/fodmap_mapping.csv` | IBS/FODMAP-related ingredient mapping data. |
| `RecommenderSys/requirements.txt` | Python dependencies for recommender training/service workflows. |

The recommender architecture source of truth is [docs/IBS_Recommender_Online_LightFM_Design.md](docs/IBS_Recommender_Online_LightFM_Design.md). Before changing algorithms, scoring, risk logic, interaction weights, or recommender database shape, read that document.

### Supabase Data Model

| Path | Purpose |
| --- | --- |
| `supabase/schema.sql` | Snapshot-style schema for important app tables and policies. |
| `supabase/migrations/20260524000000_create_user_recommendations.sql` | Creates stored recommendation rows per user. |
| `supabase/migrations/20260524000001_create_recipes.sql` | Creates `recipes` and historical interaction tables. |
| `supabase/migrations/20260524000002_create_recipe_images.sql` | Creates `recipe_images` cache table. |
| `supabase/migrations/20260524000003_add_historical_interactions_unique_key.sql` | Deduplicates and constrains historical interactions. |
| `supabase/migrations/20260524000004_create_recommender_artifacts_bucket.sql` | Creates private storage for recommender artifacts. |
| `supabase/migrations/20260524000005_allow_liked_recipe_interactions.sql` | Extends allowed recipe interaction types. |
| `supabase/migrations/20260601000000_add_category_recommendation_columns.sql` | Adds category-specific recommendation columns. |
| `supabase/migrations/20260602000000_add_recommendation_category_rows.sql` | Adds category recommendation row support. |
| `supabase/migrations/20260702000000_create_non_nhanes_recommender_tables.sql` | Adds non-NHANES recommender tables for ingredients, restrictions, meal logs, health reports, exposures, risks, candidates, and model predictions. |
| `supabase/migrations/20260705000000_create_cooklists.sql` | Adds user cooklists and cooklist recipe memberships with a default Liked list. |
| `supabase/migrations/20260706000000_add_meal_images_and_personal_cooklist_recipes.sql` | Adds optional meal-log images and personal recipe metadata for cooklist recipes. |
| `supabase/migrations/20260706000001_create_user_uploads_bucket.sql` | Creates the Supabase Storage bucket and object policies for user-uploaded meal and personal recipe images. |
| `supabase/migrations/20260707000000_add_cookbook_recommendation_columns.sql` | Adds stored cookbook-only recommendation arrays to `user_recommendations`. |

Use the project Supabase skill and the design document before changing schema, RLS, recommendation storage, or API-facing tables.

### Where To Start Before Editing

| Task type | Start here |
| --- | --- |
| Run the app locally | [docs/LOCAL_SETUP_WITH_RECOMMENDER.md](docs/LOCAL_SETUP_WITH_RECOMMENDER.md) |
| Change recipe images | [docs/RECIPE_IMAGES_PLAN.md](docs/RECIPE_IMAGES_PLAN.md), then `src/lib/recipes.ts` and `api/fill-recipe-images.ts` |
| Change recommendation logic or risk scoring | [docs/IBS_Recommender_Online_LightFM_Design.md](docs/IBS_Recommender_Online_LightFM_Design.md), then `RecommenderSys/` and related API/Supabase files |
| Make the app more IBS-specific | [docs/ibs/IBS_RELEVANCE_PLAN.md](docs/ibs/IBS_RELEVANCE_PLAN.md), then the recommender design doc if scoring or schema changes |
| Change saved recipes or interaction behavior | `src/lib/recipeInteractions.ts`, `src/pages/Home.tsx`, `src/pages/RecipeDetail.tsx`, and the design doc if recommendation signals change |
| Change auth behavior | `src/components/AuthProvider.tsx`, `src/components/AuthDialog.tsx`, `src/lib/supabase.ts`, and Supabase policies if data access changes |
| Change UI pages/components | `src/pages/`, `src/components/`, and `src/components/ui/` |
| Change deployment/local dev API behavior | `api/`, `vite.config.ts`, and [docs/LOCAL_SETUP_WITH_RECOMMENDER.md](docs/LOCAL_SETUP_WITH_RECOMMENDER.md) |

## Authentication and Database Setup

This app uses Supabase for user accounts, Google/Facebook OAuth, and recipe interaction history.

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Fill in:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

5. In Supabase Authentication, enable email/password, Google, and Facebook providers.
6. Add your local URL, usually `http://127.0.0.1:8080` or `http://localhost:8080`, to the allowed redirect URLs.

Recipe interactions are stored in `recipe_interactions` so they can later become recommendation signals for the "Curated for You" section. Cookbook organization lives in `cooklists` and `cooklist_recipes`; adding a catalog recipe to the default Liked cooklist also records a `saved` interaction. Personal recipes can be stored in cooklists without creating catalog recommendation events. CookBook sidebar recommendations are stored separately on `user_recommendations` and are limited to recipes already in the user's cooklists.

## Design Alignment

The revised implementation design is the source of truth for recommender architecture and risk-scoring behavior:

[docs/IBS_Recommender_Online_LightFM_Design.md](docs/IBS_Recommender_Online_LightFM_Design.md)

Any change that affects recommender logic, model training, recommendation APIs, risk scoring, meal/symptom logging, or related database schema must either follow that document or update it in the same change. See [CONTRIBUTING.md](CONTRIBUTING.md).

Agent/LLM contributors should also use the project skill at [.agents/skills/tamar-design-alignment/SKILL.md](.agents/skills/tamar-design-alignment/SKILL.md) before changing recommender-related behavior.
