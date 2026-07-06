import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | undefined>;
  body?: Record<string, unknown> | string;
};

type ApiResponse = {
  status: (code: number) => {
    json: (body: Record<string, unknown>) => void;
  };
};

export type FoodImageAnalysisContext = "meal_log" | "personal_recipe";

export type FoodImageAnalysisResult = {
  is_food: boolean;
  food_name: string;
  visible_ingredients: string[];
  possible_hidden_ingredients: string[];
  portion_guess: string;
  confidence: number;
  questions: string[];
  notes: string;
};

type JsonResult = {
  status: number;
  body: Record<string, unknown>;
};

type AnalyzeRequestInput = {
  method?: string;
  authorization?: string;
  body?: Record<string, unknown> | string;
  env?: Record<string, string | undefined>;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const parseBody = (body: Record<string, unknown> | string | undefined): Record<string, unknown> => {
  if (!body) return {};
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const parseJsonObject = (text: string) => {
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

const clampConfidence = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
};

const cleanString = (value: unknown, maxLength = 180) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const cleanStringList = (value: unknown, maxItems: number) =>
  (Array.isArray(value) ? value : [])
    .map((item) => cleanString(item, 80))
    .filter(Boolean)
    .slice(0, maxItems);

const normalizeAnalysis = (raw: any): FoodImageAnalysisResult => ({
  is_food: Boolean(raw?.is_food),
  food_name: cleanString(raw?.food_name, 120),
  visible_ingredients: cleanStringList(raw?.visible_ingredients, 10),
  possible_hidden_ingredients: cleanStringList(raw?.possible_hidden_ingredients, 8),
  portion_guess: cleanString(raw?.portion_guess, 80),
  confidence: clampConfidence(raw?.confidence),
  questions: cleanStringList(raw?.questions, 3),
  notes: cleanString(raw?.notes, 220),
});

const extractBearerToken = (authorization = "") => {
  const header = String(authorization || "");
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
};

const uploadedImageBelongsToUser = (imageUrl: string, supabaseUrl: string, userId: string) => {
  try {
    const parsedImageUrl = new URL(imageUrl);
    const parsedSupabaseUrl = new URL(supabaseUrl);
    if (parsedImageUrl.origin !== parsedSupabaseUrl.origin) return false;

    const segments = parsedImageUrl.pathname.split("/").map(decodeURIComponent);
    const bucketIndex = segments.findIndex((segment, index) =>
      segment === "public" && segments[index + 1] === "user-uploads"
    );

    return bucketIndex >= 0 && segments[bucketIndex + 2] === userId;
  } catch {
    return false;
  }
};

const fetchImageData = async (imageUrl: string) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Could not read that image.");
  }

  const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Use a JPG, PNG, or WebP image for photo analysis.");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 6 MB.");
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 6 MB.");
  }

  return {
    data: imageBuffer.toString("base64"),
    mimeType: contentType,
  };
};

const buildFoodImagePrompt = (context: FoodImageAnalysisContext) => `
You are helping Tamar prefill a private food diary entry from a user-uploaded food photo.

Return JSON only. No markdown. No extra prose.

Required shape:
{
  "is_food": true,
  "food_name": "short plain meal name",
  "visible_ingredients": ["ingredient or visible food"],
  "possible_hidden_ingredients": ["ingredient that might be present but is not visible"],
  "portion_guess": "short rough visual portion, or empty string",
  "confidence": 0.0,
  "questions": ["short clarification question"],
  "notes": "short note about uncertainty"
}

Rules:
- Identify only what is visible or highly plausible from the image.
- Do not make nutrition, calorie, medical, or IBS safety claims.
- Keep food_name useful as a diary title, for example "rice bowl with chicken" or "toast with eggs".
- If the image is not food, set is_food false, food_name empty, confidence 0, and explain briefly in notes.
- Put hidden items such as onion, garlic, oil, sauces, dairy, or sweeteners in possible_hidden_ingredients only when they are plausible, not certain.
- Use questions for details the user should confirm, especially sauces, hidden ingredients, or portion size.
- Confidence should reflect visual certainty, not whether the meal is healthy.
- This context is "${context}". For personal_recipe, still analyze the food only if visible; do not invent full recipe steps.
`;

const analyzeImageWithGemini = async ({
  apiKey,
  modelName,
  imageUrl,
  context,
}: {
  apiKey: string;
  modelName: string;
  imageUrl: string;
  context: FoodImageAnalysisContext;
}) => {
  const image = await fetchImageData(imageUrl);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const result = await model.generateContent([
    { text: buildFoodImagePrompt(context) },
    { inlineData: image },
  ]);

  return normalizeAnalysis(parseJsonObject(result.response.text()));
};

export const handleAnalyzeFoodImageRequest = async ({
  method,
  authorization,
  body,
  env = process.env,
}: AnalyzeRequestInput): Promise<JsonResult> => {
  if (method !== "POST") {
    return { status: 405, body: { error: "Method Not Allowed" } };
  }

  const apiKey = env.GEMINI_TAMAR_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: "GEMINI API is not defined." } };
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 500, body: { error: "Supabase server credentials are not configured." } };
  }

  const token = extractBearerToken(authorization);
  if (!token) {
    return { status: 401, body: { error: "Missing authorization token." } };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { status: 401, body: { error: "Invalid authorization token." } };
  }

  const parsedBody = parseBody(body);
  const imageUrl = cleanString(parsedBody.image_url, 1200);
  const context = parsedBody.context === "personal_recipe" ? "personal_recipe" : "meal_log";

  if (!imageUrl) {
    return { status: 400, body: { error: "image_url is required." } };
  }

  if (!uploadedImageBelongsToUser(imageUrl, supabaseUrl, data.user.id)) {
    return { status: 403, body: { error: "Image must come from your Tamar uploads." } };
  }

  try {
    const analysis = await analyzeImageWithGemini({
      apiKey,
      modelName: env.GEMINI_FOOD_IMAGE_MODEL || "gemini-3.1-flash-lite",
      imageUrl,
      context,
    });
    return { status: 200, body: { analysis } };
  } catch (error: any) {
    console.error("Food image analysis error:", error);
    return { status: 500, body: { error: error.message || "Failed to analyze that image." } };
  }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const result = await handleAnalyzeFoodImageRequest({
    method: req.method,
    authorization: req.headers.authorization,
    body: req.body,
  });

  return res.status(result.status).json(result.body);
}
