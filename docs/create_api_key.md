# Gemini API Setup Guide

This guide sets up the server-side Gemini key used by Tamar's AI features:

- general chat through `api/generate.ts`
- structured IBS check-ins through `api/ibs-check-in.ts`
- food-photo analysis through `api/analyze-food-image.ts`
- meal nutrition estimates through `api/estimate-meal-nutrition.ts`

## Security

The Gemini key is a server secret.

- Do not commit it.
- Do not expose it in browser code.
- Do not prefix it with `VITE_`.
- Keep it in `.env.local` for local development and in server environment variables for deployment.

## Step 1: Generate Your API Key

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API key**.
4. Choose **Create API key in new project** or select an existing Google Cloud project.
5. Copy the key.

## Step 2: Configure Local Environment

Copy the example environment file if needed:

```powershell
Copy-Item .env.example .env.local
```

Add or update this server-only variable in `.env.local`:

```env
GEMINI_TAMAR_API_KEY=YOUR_PASTE_KEY_HERE
```

Restart the Vite dev server after changing `.env.local`.

## Step 3: Verify

Start the app:

```powershell
npm run dev
```

Then try one of the AI-backed flows:

- `/app?tab=chat` for general chat
- the `How I Feel` chat chip for IBS check-ins
- `Add meal from image` in Diary
- `Auto calculate` nutrition in Diary

If the key is missing, the relevant API route returns:

```json
{"error":"GEMINI API is not defined."}
```

## Optional: Quick Node Check

You can verify the key from the project stack with:

```powershell
node -e "import('@google/generative-ai').then(async ({GoogleGenerativeAI}) => { const key = process.env.GEMINI_TAMAR_API_KEY; if (!key) throw new Error('GEMINI_TAMAR_API_KEY is not set'); const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-3.1-flash-lite' }); const result = await model.generateContent('Reply with Success.'); console.log(result.response.text()); })"
```

In PowerShell, make sure the variable is available in the current shell first:

```powershell
$env:GEMINI_TAMAR_API_KEY = "YOUR_PASTE_KEY_HERE"
```

## Deployment

For Vercel or another serverless host, set `GEMINI_TAMAR_API_KEY` as a server environment variable. Do not create a public `VITE_GEMINI_TAMAR_API_KEY`.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `GEMINI API is not defined.` | `GEMINI_TAMAR_API_KEY` is missing from the server environment or the dev server was not restarted. |
| `403 Forbidden` | The key may be restricted by region, project, billing, or API settings. |
| `Model not found` | Check the model name configured in the API route or optional `GEMINI_FOOD_IMAGE_MODEL` / `GEMINI_NUTRITION_MODEL`. |
| Food image analysis fails | Confirm `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, and the `user-uploads` bucket are configured too. |
