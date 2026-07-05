import { createClient } from "@supabase/supabase-js";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

type ApiResponse = {
  status: (code: number) => {
    json: (body: Record<string, unknown>) => void;
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recommenderUrl = process.env.RECOMMENDER_SERVICE_URL;
  const recommenderSecret = process.env.RECOMMENDER_SERVICE_SECRET;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Supabase server credentials are not configured." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid authorization token." });
  }

  const body = req.body || {};
  const foodName = String(body.food_name || "").trim();
  if (!foodName) {
    return res.status(400).json({ error: "Food name is required." });
  }

  const payload = {
    user_id: data.user.id,
    food_name: foodName,
    recipe_id: body.recipe_id || null,
    logged_at: body.logged_at || new Date().toISOString(),
    portion_size: body.portion_size || null,
    portion_unit: body.portion_unit || null,
    image_url: typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null,
    notes: body.notes || null,
  };

  if (recommenderUrl) {
    try {
      const response = await fetch(`${recommenderUrl.replace(/\/$/, "")}/meal-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(recommenderSecret ? { "x-recommender-secret": recommenderSecret } : {}),
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(responseBody);
      }
      return res.status(200).json(responseBody);
    } catch (error) {
      console.warn("Recommender meal-log endpoint unavailable; storing meal only.", error);
    }
  }

  const { data: mealLog, error: insertError } = await supabase
    .from("meal_logs")
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({ ok: true, meal_log: mealLog, exposure_count: 0, fallback: true });
}
