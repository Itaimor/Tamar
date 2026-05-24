import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
    plugins: [react(), localRecommendationRefreshPlugin(env), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
