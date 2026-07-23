# Local Setup With Recommender System

This guide starts from a clean git clone and gets the Tamar website running locally with the hybrid preference and health-risk recommender flow enabled.

## What Runs Locally

You will run two processes:

1. The React/Vite website on `http://127.0.0.1:8080`
2. The Python recommender service on `http://127.0.0.1:8000`

The website calls `/api/refresh-recommendations`. In local development, Vite forwards that request to the Python service. The Python service reads Supabase data, uses the saved hybrid LightFM preference artifact and optional symptom-risk artifact, and writes fresh rows to `user_recommendations`.

The training scripts are not run on every click. `recommend_batch.py` trains/saves preference state and candidates, `train_symptom_model.py` trains symptom risk, and `recommend_fast.py` uses those saved artifacts to refresh one user's recommendations quickly.

## Prerequisites

Install these first:

- Git
- Node.js LTS, which includes `npm`
- Python 3.13 (the repository pins the current patch in `.python-version`)
- A Supabase project

The full training environment installs `lightfm-next`, the maintained
API-compatible LightFM distribution. It imports as `lightfm`, so the model code
continues to use the standard LightFM API. Linux wheels are available for the
pinned Python version. On Windows, running the batch trainer locally also
requires Microsoft Visual C++ 14 or newer because the package is compiled from
source there. The online service does not compile or import LightFM.

On Windows, if PowerShell cannot find npm, temporarily add Node to your shell path:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm --version
```

## 1. Clone And Enter The Project

```powershell
git clone <repo-url> Tamar
cd Tamar
```

All commands below assume your current directory is the `Tamar` folder unless stated otherwise.

## 2. Install Frontend Dependencies

```powershell
npm install
```

## 3. Create The Python Virtual Environment

From the parent folder of `Tamar`, create a shared virtual environment:

```powershell
cd ..
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\Tamar\RecommenderSys\requirements.txt
cd .\Tamar
```

If `py` is not available, use your full Python path instead:

```powershell
python -m venv ..\.venv
```

## 4. Configure Environment Variables

Copy the example file:

```powershell
Copy-Item .env.example .env.local
```

Fill in `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
GEMINI_TAMAR_API_KEY=your-server-only-gemini-api-key

RECOMMENDER_SERVICE_URL=http://127.0.0.1:8000
RECOMMENDER_SERVICE_SECRET=dev-secret

SUPABASE_RECOMMENDER_BUCKET=recommender-artifacts
SUPABASE_RECOMMENDER_ARTIFACT=cf_item_factors.npz
SUPABASE_SYMPTOM_MODEL_ARTIFACT=xgboost_symptom_model.pkl
RECOMMENDER_ARTIFACT_CACHE_TTL_SECONDS=600
RECOMMENDER_RECIPES_META_CACHE_MAX_ITEMS=2000
RECOMMENDER_SYMPTOM_ARTIFACT_CACHE_TTL_SECONDS=600
RECOMMENDER_HISTORICAL_POSITIVE_MIN_RATING=4
RECOMMENDER_ONLINE_VECTOR_WEIGHT=0.35
RECOMMENDER_ONLINE_VECTOR_FULL_STRENGTH=5
RECOMMENDER_ONLINE_SCORE_DELTA_LIMIT=1
RECOMMENDER_SYMPTOM_MIN_TRAINING_ROWS=100
RECOMMENDER_SYMPTOM_MIN_CLASS_ROWS=20
RECOMMENDER_SYMPTOM_MIN_USERS=5
```

Notes:

- `VITE_SUPABASE_PUBLISHABLE_KEY` is safe for the browser.
- `SUPABASE_SERVICE_ROLE_KEY` is private. Do not expose it in client-side code or commit it.
- `GEMINI_TAMAR_API_KEY` is private and server-only. Do not prefix it with `VITE_`.
- `RECOMMENDER_SERVICE_SECRET` must match between the Vite local API bridge and the Python service. Locally, `dev-secret` is fine.

## 5. Set Up Supabase Tables

In Supabase SQL Editor, run the SQL files in `supabase/migrations` in filename order:

```text
20260524000000_create_user_recommendations.sql
20260524000001_create_recipes.sql
20260524000002_create_recipe_images.sql
20260524000003_add_historical_interactions_unique_key.sql
20260524000004_create_recommender_artifacts_bucket.sql
20260524000005_allow_liked_recipe_interactions.sql
20260601000000_add_category_recommendation_columns.sql
20260602000000_add_recommendation_category_rows.sql
20260621000000_create_ibs_tables.sql
20260702000000_create_non_nhanes_recommender_tables.sql
20260705000000_create_cooklists.sql
20260706000000_add_meal_images_and_personal_cooklist_recipes.sql
20260706000001_create_user_uploads_bucket.sql
20260707000000_add_cookbook_recommendation_columns.sql
20260708000000_add_meal_log_nutrition.sql
20260709000000_create_tamar_tree_tables.sql
```

You should end up with these important tables:

- `recipes`
- `historical_interactions`
- `recipe_interactions`
- `cooklists`
- `cooklist_recipes`
- `meal_logs`
- `health_reports`
- `user_recommendations`
- `recipe_images`
- Storage bucket `user-uploads` for user-uploaded meal and personal recipe images
- `user_ibs_profiles`
- `user_ibs_ingredient_risks`
- `user_ibs_checkins`
- `user_tamar_tree_runs`
- `user_tamar_tree_reward_events`

And this private Storage bucket:

- `recommender-artifacts`

The `meal_logs` table should also include the optional nutrition tracking columns added by `20260708000000_add_meal_log_nutrition.sql`: `calories`, `protein_g`, `fat_g`, `nutrition_source`, and `nutrition_confidence`.

## 6. Seed Or Import Recipe Data

The recommender needs recipe rows in `recipes`, and it works best with historical Food.com rows in `historical_interactions`.

For a small local sanity check, run:

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe seed_database.py 1000
cd ..
```

That command tries to use the Food.com dataset if it is available/downloadable, then uploads a smaller subset to Supabase.

For the full project setup, import your larger Food.com recipe catalog and historical interactions into Supabase before training the artifact.

## 7. Train And Upload The Preference Artifact

Run this when you want to build the model artifact from Supabase data:

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe recommend_batch.py
cd ..
```

This does five things:

1. Fetches recipes, interactions, active profiles, restrictions, and ingredient-risk signals from Supabase.
2. Builds bounded item features from real recipe ingredients, nutrition, time, step count, ingredient count, and IBS-friendly state.
3. Builds active-user features from interaction-derived taste, restrictions, and ingredient-risk signals, then trains hybrid LightFM. If LightFM cannot run, the job falls back to matrix-factorization CF.
4. Saves `RecommenderSys/artifacts/cf_item_factors.npz`, including item factors, learned active-user factors for LightFM, recipe metadata, model identity, and the training boundary.
5. Stages each active user's candidates under a unique model-generation key,
   then publishes the matching artifact to the private Supabase Storage bucket
   only after all candidate writes succeed. A co-located local artifact cache
   is atomically promoted last.

You do not need to rerun this every time a user clicks/views/saves. Rerun it only when you want to retrain the global model.

`RECOMMENDER_PREFERENCE_MODEL_NAME`, when set, is a base label only; the batch
job appends the training timestamp to create the exact generation key. Serving
uses the artifact's exact key. The environment value is used directly only for
legacy artifacts that do not carry model metadata.

Food.com ratings below `RECOMMENDER_HISTORICAL_POSITIVE_MIN_RATING` (default `4`) are excluded from WARP's positive examples. App interaction weights still come from `recommender_common.py`; a dismissed event has zero weight and is not a positive example.

### Train the symptom-risk artifact

Once there are enough catalog-backed meal logs with explicit symptom and no-symptom outcomes, run:

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe train_symptom_model.py
cd ..
```

This builds the versioned XGBoost feature matrix from the corresponding catalog recipe's real ingredients, Food.com nutrition fields, minutes, ingredient/step counts, IBS trigger groups, and causal pre-meal context. It uses each explicit symptom/no-symptom report for at most one nearest preceding meal and waits for at least 100 independent outcomes, 20 examples per class, and five users by default. The artifact records the safe split and calibration diagnostics, then the production model is refit on all eligible rows. It uploads `xgboost_symptom_model.pkl` to the same private artifact bucket. If the training environment has no XGBoost package, the script uses its sklearn gradient-boosting fallback with the same feature contract.

## 8. Start The Python Recommender Service

Terminal 1:

```powershell
cd <path-to-your-clone>\Tamar\RecommenderSys
..\..\.venv\Scripts\python.exe -m uvicorn recommender_service:app --host 127.0.0.1 --port 8000
```

Check that it is alive:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

Expected response:

```json
{"ok":true}
```

## 9. Start The Website

Terminal 2:

```powershell
cd <path-to-your-clone>\Tamar
npm run dev
```

Open:

```text
http://127.0.0.1:8080
```

Sign in, view/save/start recipes, then refresh the homepage. The `Curated for You` row should be loaded from `user_recommendations`.

## 10. Verify The Recommender Refresh

Open the browser console. A successful refresh should show a log like:

```text
Loaded CF recommendations { userId: "...", recIds: [...], updatedAt: "..." }
```

You should not see:

```text
Recommendation refresh failed: 401
```

If you see `401`, the `RECOMMENDER_SERVICE_SECRET` in `.env.local` does not match what the Python service loaded. Restart both processes after editing `.env.local`.

## 11. Manually Refresh One User

You can test the fast recommender without the website:

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe recommend_fast.py <supabase-user-id>
cd ..
```

This reads that user's latest interactions, writes `user_recommendations`, and prints recipe IDs with scores.

## 12. How The Online Recommendation Loop Works

After setup, the loop is:

1. User views/saves/starts a recipe.
2. The app inserts a row into `recipe_interactions`.
3. Homepage refresh calls `/api/refresh-recommendations`.
4. The Python service loads the saved preference artifact and, when present, the symptom-risk artifact.
   The serving process caches only the float32 model arrays and fetches recipe
   metadata for the bounded candidate/cookbook IDs; it does not expand all
   embedded catalog metadata into RAM.
5. For LightFM, it starts with the learned batch user representation and blends in only positive interactions newer than the artifact's training boundary. The online influence scales with the amount of new evidence, up to the configured maximum.
6. It fetches the stored candidate set, fails closed on unavailable hard-restriction data, removes forbidden recipes before risk scoring, and evaluates the remaining candidates with real recipe metadata.
7. It writes the risk-reranked Home and CookBook arrays to `user_recommendations`.
8. The homepage reads `user_recommendations` for `Curated for You` and the category rows.

Views help shape the recommendations, but viewed recipes are not forcibly removed from Curated. Saved recipes are excluded because they are already in the user's cookbook.

## 13. Deploying Later

For production:

- Deploy the React app and `api/refresh-recommendations.ts` to Vercel.
- Deploy `RecommenderSys/recommender_service.py` separately on Render, Railway, Fly.io, Cloud Run, or another Python host.
- Keep both recommender artifacts in the private Supabase Storage bucket.
- Set the same `RECOMMENDER_SERVICE_SECRET` in Vercel and in the Python service host.

Vercel should use:

```text
Root Directory: Tamar
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### Render web service

The online service only reads trained artifacts, so keep it on the smaller
serving dependency set:

```text
Runtime: Python 3
Root Directory: RecommenderSys
Build Command: pip install -r requirements-service.txt
Start Command: uvicorn recommender_service:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

The repository `.python-version` pins Python `3.13.14`. If the existing Render
service has a `PYTHON_VERSION` environment variable, that variable takes
precedence; set it to `3.13.14` or remove it so the repository pin applies.

Configure these server-only variables on the Render web service:

```text
VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RECOMMENDER_SERVICE_SECRET
SUPABASE_RECOMMENDER_BUCKET
SUPABASE_RECOMMENDER_ARTIFACT
SUPABASE_SYMPTOM_MODEL_ARTIFACT
RECOMMENDER_ARTIFACT_CACHE_TTL_SECONDS
RECOMMENDER_RECIPES_META_CACHE_MAX_ITEMS
RECOMMENDER_SYMPTOM_ARTIFACT_CACHE_TTL_SECONDS
RECOMMENDER_ONLINE_VECTOR_WEIGHT
RECOMMENDER_ONLINE_VECTOR_FULL_STRENGTH
RECOMMENDER_ONLINE_SCORE_DELTA_LIMIT
```

`RECOMMENDER_SERVICE_SECRET` must have the same value on Render and on the
frontend host. Set the frontend host's `RECOMMENDER_SERVICE_URL` to the Render
service URL. Do not expose `SUPABASE_SERVICE_ROLE_KEY` or the service secret to
browser code.

### Render training job

Deploying or restarting the web service does not retrain the models. Run the
batch trainer once after deploying these changes, and schedule it whenever a
new global model should be published. A separate Render Cron Job is preferred
so the web service does not install compilation/training-only packages:

```text
Runtime: Python 3
Root Directory: RecommenderSys
Build Command: pip install -r requirements.txt
Command: python recommend_batch.py && python train_symptom_model.py
PYTHON_VERSION: 3.13.14
```

Give the training job the same Supabase and artifact environment variables as
the web service, plus any `RECOMMENDER_LIGHTFM_*`,
`RECOMMENDER_HISTORICAL_POSITIVE_MIN_RATING`, and
`RECOMMENDER_SYMPTOM_MIN_*` overrides. The job needs no persistent disk:
`recommend_batch.py` stages locally and publishes the completed preference
artifact to private Supabase Storage, while candidates are stored in Supabase.
`train_symptom_model.py` safely skips publication when its minimum data gates
are not met.

For the first production activation, the same commands can be run as a Render
one-off job using the training environment. Confirm the batch output says
`Prepared staged LightFM user/item artifact`; a warning about falling back to
SVD means the training dependencies were not installed correctly.

The Python web service starts with:

```bash
uvicorn recommender_service:app --host 0.0.0.0 --port $PORT
```
