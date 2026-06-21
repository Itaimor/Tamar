import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createClient } from "@supabase/supabase-js";

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
    plugins: [react(), localRecommendationRefreshPlugin(env), localRecipeImageFillPlugin(env), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
