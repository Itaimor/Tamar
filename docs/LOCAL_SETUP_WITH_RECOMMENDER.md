# Local Setup With Recommender System

This guide starts from a clean git clone and gets the Tamar website running locally with the collaborative-filtering recommender flow enabled.

## What Runs Locally

You will run two processes:

1. The React/Vite website on `http://127.0.0.1:8080`
2. The Python recommender service on `http://127.0.0.1:8000`

The website calls `/api/refresh-recommendations`. In local development, Vite forwards that request to the Python service. The Python service reads Supabase data, uses the saved CF artifact, and writes fresh rows to `user_recommendations`.

The big training script is not run on every click. `recommend_batch.py` trains/saves the artifact. `recommend_fast.py` uses that saved artifact to refresh one user's recommendations quickly.

## Prerequisites

Install these first:

- Git
- Node.js LTS, which includes `npm`
- Python 3.11 or 3.12
- A Supabase project

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

RECOMMENDER_SERVICE_URL=http://127.0.0.1:8000
RECOMMENDER_SERVICE_SECRET=dev-secret

SUPABASE_RECOMMENDER_BUCKET=recommender-artifacts
SUPABASE_RECOMMENDER_ARTIFACT=cf_item_factors.npz
RECOMMENDER_ARTIFACT_CACHE_TTL_SECONDS=600
```

Notes:

- `VITE_SUPABASE_PUBLISHABLE_KEY` is safe for the browser.
- `SUPABASE_SERVICE_ROLE_KEY` is private. Do not expose it in client-side code or commit it.
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
```

You should end up with these important tables:

- `recipes`
- `historical_interactions`
- `recipe_interactions`
- `user_recommendations`
- `recipe_images`

And this private Storage bucket:

- `recommender-artifacts`

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

## 7. Train And Upload The CF Artifact

Run this when you want to build the model artifact from Supabase data:

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe recommend_batch.py
cd ..
```

This does four things:

1. Fetches `recipes`, `recipe_interactions`, and `historical_interactions` from Supabase.
2. Trains the matrix factorization model.
3. Saves `RecommenderSys/artifacts/cf_item_factors.npz`.
4. Uploads that artifact to the private Supabase Storage bucket.

You do not need to rerun this every time a user clicks/views/saves. Rerun it only when you want to retrain the global model.

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
4. The Python service loads the saved `.npz` artifact.
5. It builds a temporary user vector from that user's latest interactions.
6. It scores recipes and writes the top results to `user_recommendations`.
7. The homepage reads `user_recommendations` for `Curated for You`.

Views help shape the recommendations, but viewed recipes are not forcibly removed from Curated. Saved recipes are excluded because they are already in the user's cookbook.

## 13. Deploying Later

For production:

- Deploy the React app and `api/refresh-recommendations.ts` to Vercel.
- Deploy `RecommenderSys/recommender_service.py` separately on Render, Railway, Fly.io, Cloud Run, or another Python host.
- Keep the artifact in the private Supabase Storage bucket.
- Set the same `RECOMMENDER_SERVICE_SECRET` in Vercel and in the Python service host.

Vercel should use:

```text
Root Directory: Tamar
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

The Python service should start with:

```bash
uvicorn recommender_service:app --host 0.0.0.0 --port $PORT
```
