import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  buildChatRagContext,
  buildTamarChatSystemInstruction,
  ChatRagAuthError,
  extractBearerToken,
} from "./api/chat-rag-context";
import { handleAnalyzeFoodImageRequest } from "./api/analyze-food-image";
import { handleEstimateMealNutritionRequest } from "./api/estimate-meal-nutrition";

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

const localGeneratePlugin = (env: Record<string, string>) => ({
  name: "local-generate-api",
  configureServer(server: any) {
    server.middlewares.use("/api/generate", async (req: any, res: any) => {
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
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Prompt is required in the request body." }));
          return;
        }

        const token = extractBearerToken(req.headers.authorization);
        const ragContext = token
          ? await buildChatRagContext(token, env).catch((error) => {
              if (error instanceof ChatRagAuthError) throw error;
              console.warn("Chat RAG context unavailable:", error);
              return { text: "" };
            })
          : { text: "" };

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-3.1-flash-lite",
          systemInstruction: {
            role: "system",
            parts: [{ text: buildTamarChatSystemInstruction(ragContext.text) }],
          },
        });

        const chat = model.startChat({
          history: Array.isArray(body.history) ? body.history : [],
        });

        const result = await chat.sendMessage(prompt);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ text: result.response.text() }));
      } catch (error: any) {
        res.statusCode = error instanceof ChatRagAuthError ? 401 : 500;
        res.end(JSON.stringify({ error: error.message || "Failed to generate content." }));
      }
    });
  },
});

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

const localFoodImageAnalysisPlugin = (env: Record<string, string>) => ({
  name: "local-food-image-analysis",
  configureServer(server: any) {
    server.middlewares.use("/api/analyze-food-image", async (req: any, res: any) => {
      const body = await parseJsonBody(req);
      const result = await handleAnalyzeFoodImageRequest({
        method: req.method,
        authorization: req.headers.authorization,
        body,
        env: { ...env, ...process.env },
      });

      res.statusCode = result.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result.body));
    });
  },
});

const localMealNutritionPlugin = (env: Record<string, string>) => ({
  name: "local-meal-nutrition",
  configureServer(server: any) {
    server.middlewares.use("/api/estimate-meal-nutrition", async (req: any, res: any) => {
      const body = await parseJsonBody(req);
      const result = await handleEstimateMealNutritionRequest({
        method: req.method,
        authorization: req.headers.authorization,
        body,
        env: { ...env, ...process.env },
      });

      res.statusCode = result.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result.body));
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

const localDiaryPlugin = (env: Record<string, string>) => ({
  name: "local-diary-api",
  configureServer(server: any) {
    const handleDiaryRequest = async (req: any, res: any, kind: "meal-log" | "health-report") => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Supabase server credentials are not configured." }));
        return;
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
      if (!token) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Missing authorization token." }));
        return;
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Invalid authorization token." }));
        return;
      }

      const body = await parseJsonBody(req);
      const recommenderUrl = process.env.RECOMMENDER_SERVICE_URL || env.RECOMMENDER_SERVICE_URL || "http://127.0.0.1:8000";
      const recommenderSecret = process.env.RECOMMENDER_SERVICE_SECRET || env.RECOMMENDER_SERVICE_SECRET || "dev-secret";
      const basePayload = { ...body, user_id: data.user.id };
      const payload = kind === "meal-log"
        ? {
            ...basePayload,
            food_name: String(body.food_name || "").trim(),
            logged_at: body.logged_at || new Date().toISOString(),
          }
        : {
            ...basePayload,
            symptom_type: body.no_symptoms ? "none" : body.symptom_type || "digestive_discomfort",
            severity: body.no_symptoms ? 0 : Math.max(0, Math.min(1, Number(body.severity) || 0)),
            reported_at: body.reported_at || new Date().toISOString(),
            no_symptoms: Boolean(body.no_symptoms),
          };

      if (kind === "meal-log" && !payload.food_name) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Food name is required." }));
        return;
      }

      try {
        const response = await fetch(`${recommenderUrl.replace(/\/$/, "")}/${kind}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-recommender-secret": recommenderSecret,
          },
          body: JSON.stringify(payload),
        });

        const responseBody = await response.text();
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json");
        res.end(responseBody);
        return;
      } catch {
        const table = kind === "meal-log" ? "meal_logs" : "health_reports";
        const fallbackPayload = kind === "meal-log"
          ? {
              user_id: data.user.id,
              food_name: payload.food_name,
              recipe_id: payload.recipe_id || null,
              logged_at: payload.logged_at,
              portion_size: payload.portion_size || null,
              portion_unit: payload.portion_unit || null,
              image_url: typeof payload.image_url === "string" && payload.image_url.trim() ? payload.image_url.trim() : null,
              notes: payload.notes || null,
              calories: payload.calories || null,
              protein_g: payload.protein_g || null,
              fat_g: payload.fat_g || null,
              nutrition_source: payload.nutrition_source || null,
              nutrition_confidence: payload.nutrition_confidence || null,
            }
          : {
              user_id: data.user.id,
              symptom_type: payload.symptom_type,
              severity: payload.severity,
              reported_at: payload.reported_at,
              no_symptoms: payload.no_symptoms,
              notes: payload.notes || null,
            };

        if (
          kind === "meal-log" &&
          fallbackPayload.recipe_id &&
          !fallbackPayload.calories &&
          !fallbackPayload.protein_g &&
          !fallbackPayload.fat_g
        ) {
          const { data: recipe } = await supabase
            .from("recipes")
            .select("nutrition")
            .eq("id", fallbackPayload.recipe_id)
            .maybeSingle();
          const nutrition = Array.isArray(recipe?.nutrition) ? recipe.nutrition : [];
          const calories = Number(nutrition[0]);
          const fat = Number(nutrition[1]);
          const protein = Number(nutrition[4]);
          fallbackPayload.calories = Number.isFinite(calories) && calories >= 0 ? calories : null;
          fallbackPayload.fat_g = Number.isFinite(fat) && fat >= 0 ? fat : null;
          fallbackPayload.protein_g = Number.isFinite(protein) && protein >= 0 ? protein : null;
          if (fallbackPayload.calories || fallbackPayload.protein_g || fallbackPayload.fat_g) {
            fallbackPayload.nutrition_source = "catalog_recipe";
            fallbackPayload.nutrition_confidence = 0.9;
          }
        }

        const { data: inserted, error: insertError } = await supabase
          .from(table)
          .insert(fallbackPayload)
          .select()
          .single();

        if (insertError) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: insertError.message }));
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(
          kind === "meal-log"
            ? { ok: true, meal_log: inserted, exposure_count: 0, fallback: true }
            : { ok: true, health_report: inserted, attributed_exposure_count: 0, updated_risk_count: 0, fallback: true },
        ));
      }
    };

    server.middlewares.use("/api/meal-log", (req: any, res: any) => {
      handleDiaryRequest(req, res, "meal-log");
    });
    server.middlewares.use("/api/health-report", (req: any, res: any) => {
      handleDiaryRequest(req, res, "health-report");
    });
  },
});

const PEXELS_CANDIDATES_PER_RECIPE = 8;

const NON_FOOD_IMAGE_TERMS = [
  "book",
  "books",
  "notebook",
  "journal",
  "magazine",
  "library",
  "paper",
  "pen",
  "pencil",
  "desk",
  "office",
  "laptop",
  "keyboard",
  "document",
];

const FOOD_IMAGE_TERMS = [
  "food",
  "meal",
  "dish",
  "recipe",
  "plate",
  "bowl",
  "drink",
  "smoothie",
  "juice",
  "fruit",
  "vegetable",
  "bread",
  "cake",
  "salad",
  "soup",
  "pasta",
  "rice",
  "chicken",
  "fish",
  "dessert",
  "breakfast",
  "pancake",
  "pancakes",
  "waffle",
  "waffles",
  "corn",
];

const NON_FOOD_IMAGE_URL_TERMS = [
  ...NON_FOOD_IMAGE_TERMS,
  "textbook",
  "reading",
  "school",
  "study",
];

const BLOCKED_NON_FOOD_IMAGE_SIGNATURES = new Set([
  "photo-1495446815901-a7297e633e8d",
  "photo-1497633762265-9d179a990aa6",
  "photo-1507842217343-583bb7270b66",
  "photo-1512820790803-83ca734da794",
  "photo-1516979187457-637abb4f9353",
  "photo-1524995997946-a1c2e315a42f",
  "photo-1528207776546-365bb710ee93",
  "photo-1544716278-ca5e3f4abd8c",
]);

const escapeImageRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getImageSignature = (imageUrl: string): string => {
  const unsplashPhotoId = imageUrl.match(/photo-[a-z0-9-]+/i)?.[0];
  if (unsplashPhotoId) return unsplashPhotoId.toLowerCase();

  try {
    const url = new URL(imageUrl);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return imageUrl.split("?")[0].toLowerCase();
  }
};

const hasNonFoodImageUrlTerm = (url: string): boolean => {
  const normalizedUrl = decodeURIComponent(url).toLowerCase();
  return NON_FOOD_IMAGE_URL_TERMS.some((term) =>
    new RegExp(`(^|[^a-z0-9])${escapeImageRegExp(term)}([^a-z0-9]|$)`).test(normalizedUrl),
  );
};

const isBlockedNonFoodImageUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return hasNonFoodImageUrlTerm(url) || BLOCKED_NON_FOOD_IMAGE_SIGNATURES.has(getImageSignature(url));
};

const isLikelyFoodPhoto = (photo: any) => {
  const alt = String(photo?.alt || "").toLowerCase();
  const imageUrls = [photo?.src?.large2x, photo?.src?.large, photo?.src?.medium].filter(Boolean);
  if (!alt) return false;
  if (imageUrls.some(isBlockedNonFoodImageUrl)) return false;
  if (NON_FOOD_IMAGE_TERMS.some((term) => alt.includes(term))) return false;
  return FOOD_IMAGE_TERMS.some((term) => alt.includes(term));
};

const searchPexelsImages = async (query: string, apiKey: string) => {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(`${query} prepared food plated dish`)}&per_page=${PEXELS_CANDIDATES_PER_RECIPE}&orientation=landscape`,
    {
      headers: {
        Authorization: apiKey,
      },
    },
  );

  if (!response.ok) return null;

  const body = await response.json();
  return (body.photos || [])
    .filter(isLikelyFoodPhoto)
    .map((photo: any) => photo.src?.large2x || photo.src?.large || photo.src?.medium)
    .filter(Boolean);
};

const chooseDistinctImage = (recipeId: number, imageUrls: string[], usedImageSignatures: Set<string>) => {
  if (imageUrls.length === 0) return null;

  const startIndex = Math.abs(recipeId) % imageUrls.length;
  for (let offset = 0; offset < imageUrls.length; offset += 1) {
    const imageUrl = imageUrls[(startIndex + offset) % imageUrls.length];
    const signature = getImageSignature(imageUrl);
    if (!isBlockedNonFoodImageUrl(imageUrl) && !usedImageSignatures.has(signature)) {
      usedImageSignatures.add(signature);
      return imageUrl;
    }
  }

  const fallbackUrl = imageUrls.find((url) => !isBlockedNonFoodImageUrl(url));
  if (!fallbackUrl) return null;

  usedImageSignatures.add(getImageSignature(fallbackUrl));
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
          const signature = getImageSignature(item.image_url);
          autoImageCounts.set(signature, (autoImageCounts.get(signature) || 0) + 1);
        }
      }

      const refreshIds = recipeIds.filter((id: number) => {
        const existing = existingById.get(id);
        if (!existing) return true;
        if (existing.source_tier !== "pexels-auto" || !existing.image_url) return false;
        const signature = getImageSignature(existing.image_url);
        return isBlockedNonFoodImageUrl(existing.image_url) || (autoImageCounts.get(signature) || 0) > 1;
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

      const usedImageSignatures = new Set(
        (existingImages || [])
          .filter((item: any) => !refreshIds.includes(Number(item.recipe_id)))
          .map((item: any) => item.image_url)
          .filter(Boolean)
          .map(getImageSignature),
      );

      const recipesById = new Map((recipes || []).map((recipe: any) => [Number(recipe.id), recipe]));
      const rows = [];
      for (const recipeId of refreshIds) {
        const recipe = recipesById.get(recipeId);
        if (!recipe) continue;

        const imageUrls = await searchPexelsImages(recipe.name, pexelsApiKey);
        const imageUrl = imageUrls ? chooseDistinctImage(recipeId, imageUrls, usedImageSignatures) : null;
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
    plugins: [react(), localRecommendationRefreshPlugin(env), localDiaryPlugin(env), localRecipeImageFillPlugin(env), localGeneratePlugin(env), localIbsCheckInPlugin(env), localFoodImageAnalysisPlugin(env), localMealNutritionPlugin(env), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
