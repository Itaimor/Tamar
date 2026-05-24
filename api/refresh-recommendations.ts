import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
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

  if (!recommenderUrl) {
    return res.status(202).json({ ok: false, skipped: true, reason: "Recommender service is not configured." });
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

  try {
    const response = await fetch(`${recommenderUrl.replace(/\/$/, "")}/recommend-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(recommenderSecret ? { "x-recommender-secret": recommenderSecret } : {}),
      },
      body: JSON.stringify({ user_id: data.user.id, k: 6 }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json(body);
    }

    return res.status(200).json(body);
  } catch (error: any) {
    console.error("Recommendation refresh failed:", error);
    return res.status(502).json({ error: error.message || "Recommendation refresh failed." });
  }
}
