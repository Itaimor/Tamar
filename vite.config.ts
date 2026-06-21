import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const parseJsonBody = (req: any) =>
  new Promise<any>((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });

type IbsCheckInMessage = {
  role: "user" | "assistant";
  text: string;
};

const parseGeminiJsonObject = (text: string) => {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace >= firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;

  return JSON.parse(jsonText);
};

const buildIbsCheckInPrompt = (messages: IbsCheckInMessage[]) => `
You are Tamar's IBS check-in interviewer.

Goal:
Collect enough information for a structured IBS symptom and food-window check-in.

You must return JSON only. No markdown. No extra prose.

Required output shape:
{
  "assistant_message": "short user-facing message",
  "result": {
    "complete": false,
    "feeling": {
      "severity": 0,
      "symptoms": [],
      "summary": "",
      "confidence": 0
    },
    "food_windows": {
      "hours_0_8": [],
      "hours_9_16": [],
      "hours_17_24": []
    },
    "missing_fields": ["feeling", "hours_0_8", "hours_9_16", "hours_17_24"]
  }
}

Rules:
- Ask one concise follow-up question at a time when information is missing.
- Vary wording naturally, but stay focused.
- Required fields are: how the user feels, foods eaten in the last 0-8 hours, 9-16 hours ago, and 17-24 hours ago.
- Severity is 0 to 1. 0 means no digestive symptoms. 1 means very bad symptoms.
- Whenever you ask for severity, explicitly say "0 means no symptoms/good, 1 means very severe/bad".
- Mention symptoms only if the user reports them.
- Split foods into plain food strings. Do not invent ingredients or foods.
- If the user says they do not remember a window, keep it empty and list it in missing_fields.
- Set complete true only when feeling and all three food windows have usable answers.
- Never diagnose. Use "track", "possible", and "pattern" language.
- Do not call the user Tamar. Tamar is the assistant name.
- If result.complete is true, do not ask whether to save. The app will save automatically. Say the check-in has enough information and is ready.
- assistant_message should either ask for missing information or briefly say the check-in has enough information.

Conversation:
${messages.map((message) => `${message.role}: ${message.text}`).join("\n")}
`;

const localIbsCheckInPlugin = (env: Record<string, string>) => ({
  name: "local-ibs-check-in",
  configureServer(server: any) {
    server.middlewares.use("/api/ibs-check-in", async (req: any, res: any) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }

      const apiKey = process.env.GEMINI_TAMAR_API_KEY || env.GEMINI_TAMAR_API_KEY;
      if (!apiKey) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "GEMINI API is not defined." }));
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const safeMessages: IbsCheckInMessage[] = (Array.isArray(body.messages) ? body.messages : [])
          .filter((message: any) => message && (message.role === "user" || message.role === "assistant") && typeof message.text === "string")
          .map((message: any) => ({ role: message.role, text: message.text.slice(0, 1200) }))
          .slice(-12);

        if (safeMessages.length === 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "messages are required." }));
          return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-3.1-flash-lite",
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
          },
        });

        const result = await model.generateContent(buildIbsCheckInPrompt(safeMessages));
        const parsed = parseGeminiJsonObject(result.response.text());

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(parsed));
      } catch (error: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message || "Failed to run IBS check-in." }));
      }
    });
  },
});

const localRecommendationRefreshPlugin = (env: Record<string, string>) => ({
  name: "local-recommendation-refresh",
  configureServer(server: any) {
    server.middlewares.use("/api/refresh-recommendations", async (req: any, res: any) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }

      const recommenderUrl = process.env.RECOMMENDER_SERVICE_URL || env.RECOMMENDER_SERVICE_URL || "http://127.0.0.1:8000";
      if (!recommenderUrl) {
        res.statusCode = 202;
        res.end(JSON.stringify({ ok: false, skipped: true, reason: "Recommender service is not configured." }));
        return;
      }

      const body = await parseJsonBody(req);
      if (!body.user_id) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Missing user_id for local recommendation refresh." }));
        return;
      }

      try {
        const recommenderSecret = process.env.RECOMMENDER_SERVICE_SECRET || env.RECOMMENDER_SERVICE_SECRET || "dev-secret";
        const response = await fetch(`${recommenderUrl.replace(/\/$/, "")}/recommend-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-recommender-secret": recommenderSecret,
          },
          body: JSON.stringify({ user_id: body.user_id, k: 6 }),
        });

        const responseBody = await response.text();
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json");
        res.end(responseBody);
      } catch (error: any) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: error.message || "Recommendation refresh failed." }));
      }
    });
  },
});

const PEXELS_CANDIDATES_PER_RECIPE = 8;

const searchPexelsImages = async (query: string, apiKey: string) => {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(`${query} recipe food`)}&per_page=${PEXELS_CANDIDATES_PER_RECIPE}&orientation=landscape`,
    {
      headers: {
        Authorization: apiKey,
      },
    },
  );

  if (!response.ok) return null;

  const body = await response.json();
  return (body.photos || [])
    .map((photo: any) => photo.src?.large2x || photo.src?.large || photo.src?.medium)
    .filter(Boolean);
};

const chooseDistinctImage = (recipeId: number, imageUrls: string[], usedImageUrls: Set<string>) => {
  if (imageUrls.length === 0) return null;

  const startIndex = Math.abs(recipeId) % imageUrls.length;
  for (let offset = 0; offset < imageUrls.length; offset += 1) {
    const imageUrl = imageUrls[(startIndex + offset) % imageUrls.length];
    if (!usedImageUrls.has(imageUrl)) {
      usedImageUrls.add(imageUrl);
      return imageUrl;
    }
  }

  const fallbackUrl = imageUrls[startIndex];
  usedImageUrls.add(fallbackUrl);
  return fallbackUrl;
};

const localRecipeImageFillPlugin = (env: Record<string, string>) => ({
  name: "local-recipe-image-fill",
  configureServer(server: any) {
    server.middlewares.use("/api/fill-recipe-images", async (req: any, res: any) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      const pexelsApiKey = process.env.PEXELS_API_KEY || env.PEXELS_API_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Supabase server credentials are not configured." }));
        return;
      }

      if (!pexelsApiKey) {
        res.statusCode = 202;
        res.end(JSON.stringify({ ok: false, skipped: true, reason: "PEXELS_API_KEY is not configured." }));
        return;
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
      if (!token) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Missing authorization token." }));
        return;
      }

      const body = await parseJsonBody(req);
      const recipeIds = Array.isArray(body.recipe_ids)
        ? [...new Set(body.recipe_ids.map((id: string | number) => Number(id)).filter(Number.isFinite))].slice(0, 12)
        : [];

      if (recipeIds.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "recipe_ids must contain at least one recipe id." }));
        return;
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Invalid authorization token." }));
        return;
      }

      const { data: existingImages, error: existingError } = await supabase
        .from("recipe_images")
        .select("recipe_id,image_url,source_tier")
        .in("recipe_id", recipeIds);

      if (existingError) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: existingError.message }));
        return;
      }

      const existingById = new Map((existingImages || []).map((item: any) => [Number(item.recipe_id), item]));
      const autoImageCounts = new Map<string, number>();
      for (const item of existingImages || []) {
        if (item.source_tier === "pexels-auto" && item.image_url) {
          autoImageCounts.set(item.image_url, (autoImageCounts.get(item.image_url) || 0) + 1);
        }
      }

      const refreshIds = recipeIds.filter((id: number) => {
        const existing = existingById.get(id);
        if (!existing) return true;
        return existing.source_tier === "pexels-auto" && existing.image_url && (autoImageCounts.get(existing.image_url) || 0) > 1;
      });

      if (refreshIds.length === 0) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, inserted: 0, refreshed: 0, skipped: recipeIds.length }));
        return;
      }

      const { data: recipes, error: recipesError } = await supabase
        .from("recipes")
        .select("id,name")
        .in("id", refreshIds);

      if (recipesError) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: recipesError.message }));
        return;
      }

      const usedImageUrls = new Set(
        (existingImages || [])
          .filter((item: any) => !refreshIds.includes(Number(item.recipe_id)))
          .map((item: any) => item.image_url)
          .filter(Boolean),
      );

      const recipesById = new Map((recipes || []).map((recipe: any) => [Number(recipe.id), recipe]));
      const rows = [];
      for (const recipeId of refreshIds) {
        const recipe = recipesById.get(recipeId);
        if (!recipe) continue;

        const imageUrls = await searchPexelsImages(recipe.name, pexelsApiKey);
        const imageUrl = imageUrls ? chooseDistinctImage(recipeId, imageUrls, usedImageUrls) : null;
        if (imageUrl) {
          rows.push({
            recipe_id: recipeId,
            image_url: imageUrl,
            source_tier: "pexels-auto",
          });
        }
      }

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from("recipe_images")
          .upsert(rows, { onConflict: "recipe_id" });

        if (insertError) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: insertError.message }));
          return;
        }
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const refreshed = rows.filter((row) => existingById.has(row.recipe_id)).length;
      res.end(JSON.stringify({
        ok: true,
        inserted: rows.length - refreshed,
        refreshed,
        searched: recipes?.length || 0,
      }));
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), localRecommendationRefreshPlugin(env), localRecipeImageFillPlugin(env), localIbsCheckInPlugin(env), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
