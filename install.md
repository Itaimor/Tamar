# Installation Guide

## Prerequisites

You will need:

- Git.
- Node.js LTS with `npm`.
- Python 3.11 or 3.12.
- A Supabase project with access to the SQL editor and Storage.
- A Google Gemini API key for chat, food-photo analysis, and nutrition estimates.
- Optional: a Pexels API key for filling the recipe image cache.

On Windows, if PowerShell cannot find `npm`, temporarily add Node to the shell path:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm --version
```

## Installation Steps

1. Clone the repository and enter the project folder.

```powershell
git clone <repo-url> Tamar
cd Tamar
```

2. Install frontend dependencies.

```powershell
npm install
```

3. Create and activate the Python environment for the recommender service.

```powershell
cd ..
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\Tamar\RecommenderSys\requirements.txt
cd .\Tamar
```

If `py` is unavailable, use `python -m venv ..\.venv` instead.

4. Copy the environment template.

```powershell
Copy-Item .env.example .env.local
```

5. Fill `.env.local`.

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
GEMINI_TAMAR_API_KEY=your-server-only-gemini-api-key

RECOMMENDER_SERVICE_URL=http://127.0.0.1:8000
RECOMMENDER_SERVICE_SECRET=dev-secret

SUPABASE_RECOMMENDER_BUCKET=recommender-artifacts
SUPABASE_RECOMMENDER_ARTIFACT=cf_item_factors.npz
RECOMMENDER_ARTIFACT_CACHE_TTL_SECONDS=600

PEXELS_API_KEY=optional-pexels-key
```

Keep `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_TAMAR_API_KEY`, and `RECOMMENDER_SERVICE_SECRET` private. Do not expose them in browser code or commit them.

6. Apply Supabase migrations.

Run the SQL files in `supabase/migrations/` in filename order. The important resulting tables and buckets include `recipes`, `historical_interactions`, `recipe_interactions`, `cooklists`, `cooklist_recipes`, `meal_logs`, `health_reports`, `user_recommendations`, `recipe_images`, `user_ingredient_risks`, `user_ibs_ingredient_risks`, `user_tamar_tree_runs`, `user_tamar_tree_reward_events`, `user-uploads`, and `recommender-artifacts`.

7. Seed recipe data for local testing.

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe seed_database.py 1000
cd ..
```

The seeder uses Food.com data when available and otherwise creates demo data for sanity checks.

8. Train and upload the collaborative-filtering artifact.

```powershell
cd RecommenderSys
..\..\.venv\Scripts\python.exe recommend_batch.py
cd ..
```

This reads Supabase data, trains LightFM when available, falls back to matrix factorization when needed, writes `RecommenderSys/artifacts/cf_item_factors.npz`, and uploads the artifact to Supabase Storage.

9. Start the Python recommender service in one terminal.

```powershell
cd <path-to-your-clone>\Tamar\RecommenderSys
..\..\.venv\Scripts\python.exe -m uvicorn recommender_service:app --host 127.0.0.1 --port 8000
```

10. Start the React/Vite app in another terminal.

```powershell
cd <path-to-your-clone>\Tamar
npm run dev
```

Open `http://127.0.0.1:8080` or the URL printed by Vite.

## Post-Install / Verification

Check the Python service:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

Expected response:

```json
{"ok":true}
```

Check the frontend:

```powershell
npm run test
npm run build
```

Then sign in, open the homepage, view or save a recipe, log a meal or how-you-feel entry, and refresh recommendations. A healthy local loop stores interactions in Supabase, calls `/api/refresh-recommendations`, updates `user_recommendations`, and renders the `Curated for You` row.

For the full local flow, see [docs/LOCAL_SETUP_WITH_RECOMMENDER.md](docs/LOCAL_SETUP_WITH_RECOMMENDER.md).

## Troubleshooting

- If recommendation refresh returns `401`, make sure `RECOMMENDER_SERVICE_SECRET` has the same value in `.env.local` and in the Python service process, then restart both.
- If Supabase queries fail, verify `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, migrations, RLS policies, and Storage buckets.
- If chat or image analysis fails, verify `GEMINI_TAMAR_API_KEY` and keep it server-side only.
- If image uploads fail, confirm the `user-uploads` bucket and object policies from the migrations.
- If recipe images are missing, the app can still render fallback images. Configure `PEXELS_API_KEY` only if you want to fill the `recipe_images` cache.
