# Installation Guide

## Hosted Or Local

If you only want to use Tamar, open the hosted online version shared by the project team. It already has the required server-side services and credentials configured, so you do not need your own Gemini or Supabase keys.

This guide is for running the full project locally. Local AI features, including chat, food-photo analysis, and nutrition estimates, require your own Gemini API key. Account and recommendation features require your own Supabase project. Without a Gemini key, the non-AI parts of the local app may still load, but the AI-assisted features will not work.

## Prerequisites

You will need:

- Git.
- Node.js LTS with `npm`.
- Python 3.13 (the repository pins the current patch in `.python-version`).
- A Supabase project with access to the SQL editor and Storage.
- A Google Gemini API key for chat, food-photo analysis, and nutrition estimates.
- Optional: a Pexels API key for filling the recipe image cache.

On Windows, full local model training may also require Microsoft C++ build tools. The hosted or serving-only setup can use the smaller dependency set described in the detailed local setup guide.

On Windows, if PowerShell cannot find `npm`, temporarily add Node to the shell path:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm --version
```

## Installation Steps

1. Clone the repository and enter the project folder.

```bash
git clone <repo-url> Tamar
cd Tamar
```

2. Install frontend dependencies.

```bash
npm install
```

3. Create and activate the Python environment for the recommender service inside the project root.

**On macOS / Linux (Bash / Zsh):**
```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r RecommenderSys/requirements.txt
```

**On Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r RecommenderSys\requirements.txt
```

4. Copy the environment template.

**On macOS / Linux:**
```bash
cp .env.example .env.local
```

**On Windows:**
```powershell
Copy-Item .env.example .env.local
```

5. Fill `.env.local`. Keep the recommender defaults from the template unless you intentionally want to tune them.

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
GEMINI_TAMAR_API_KEY=your-server-only-gemini-api-key

RECOMMENDER_SERVICE_URL=http://127.0.0.1:8000
RECOMMENDER_SERVICE_SECRET=dev-secret

PEXELS_API_KEY=optional-pexels-key
```

The copied template also contains artifact and model settings used by the Python workflows. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_TAMAR_API_KEY`, and `RECOMMENDER_SERVICE_SECRET` private. Do not expose them in browser code or commit them.

To get your own Gemini key:

1. Open [Google AI Studio](https://aistudio.google.com/) and sign in.
2. Select **Get API key**, then create a key in a new or existing Google Cloud project.
3. In `.env.local`, replace `your-server-only-gemini-api-key` with the key you copied:

```env
GEMINI_TAMAR_API_KEY=your-actual-key
```

Keep the key server-side: do not rename it with a `VITE_` prefix, share it, or commit `.env.local`. Restart the Vite dev server (`npm run dev`) after adding or changing the key. See [the Gemini API setup guide](docs/create_api_key.md) for detailed verification and troubleshooting.

6. Apply Supabase migrations.

Run every SQL file in `supabase/migrations/` in filename order. Together they create the recipe and interaction data, user restrictions, diary and analysis data, recommendations, cooklists, Tamar tree state, Storage buckets, and supporting policies used by the current app. Do not use `supabase/schema.sql` as a replacement for the full sequence.

In Supabase Authentication, enable the sign-in providers you intend to use and add the local Vite URL to the allowed redirect URLs.

7. Seed recipe data for local testing.

**On macOS / Linux:**
```bash
cd RecommenderSys
../.venv/bin/python seed_database.py 1000
cd ..
```

**On Windows:**
```powershell
cd RecommenderSys
..\.venv\Scripts\python.exe seed_database.py 1000
cd ..
```

The seeder uses Food.com data when available and otherwise creates demo data for sanity checks.

8. Train and upload the collaborative-filtering artifact.

**On macOS / Linux:**
```bash
cd RecommenderSys
../.venv/bin/python recommend_batch.py
cd ..
```

**On Windows:**
```powershell
cd RecommenderSys
..\.venv\Scripts\python.exe recommend_batch.py
cd ..
```

This reads Supabase data, trains the configured preference model, prepares recommendation candidates, and publishes the resulting artifact to Supabase Storage. Optional symptom-risk training and model-tuning details are covered in the full local setup guide.

9. Start the Python recommender service in one terminal.

**On macOS / Linux:**
```bash
cd RecommenderSys
../.venv/bin/python -m uvicorn recommender_service:app --host 127.0.0.1 --port 8000
```

**On Windows:**
```powershell
cd RecommenderSys
..\.venv\Scripts\python.exe -m uvicorn recommender_service:app --host 127.0.0.1 --port 8000
```

10. Start the React/Vite app in another terminal.

```bash
npm run dev
```

Open `http://127.0.0.1:8080` or the URL printed by Vite.

After signing in, open `http://127.0.0.1:8080/app?tab=chat` and send a simple message. A normal Tamar response confirms that the local chatbot route can read your Gemini key. If it fails, restart the Vite server and check the Gemini troubleshooting steps below.

## Post-Install / Verification

Check the Python service:

**On macOS / Linux:**
```bash
curl http://127.0.0.1:8000/health
```

**On Windows:**
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

Expected response:

```json
{"ok":true}
```

Check the frontend:

```bash
npm run test
npm run build
```

Then sign in, open the homepage, view or save a recipe, log a meal or how-you-feel entry, add a strict food restriction, and refresh recommendations. A healthy local loop stores the user-owned data in Supabase, refreshes `user_recommendations`, and keeps restricted recipes out of recommendation surfaces.

For the full local flow, see [docs/LOCAL_SETUP_WITH_RECOMMENDER.md](docs/LOCAL_SETUP_WITH_RECOMMENDER.md).

## Troubleshooting

- If recommendation refresh returns `401`, make sure `RECOMMENDER_SERVICE_SECRET` has the same value in `.env.local` and in the Python service process, then restart both.
- If Supabase queries fail, verify `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, migrations, RLS policies, and Storage buckets.
- If chat or image analysis fails, verify `GEMINI_TAMAR_API_KEY` and keep it server-side only.
- If image uploads fail, confirm the `user-uploads` bucket and object policies from the migrations.
- If recipe images are missing, the app can still render fallback images. Configure `PEXELS_API_KEY` only if you want to fill the `recipe_images` cache.

