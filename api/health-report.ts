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

const clamp01 = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
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
  const noSymptoms = Boolean(body.no_symptoms);
  const payload = {
    user_id: data.user.id,
    symptom_type: noSymptoms ? "none" : String(body.symptom_type || "digestive_discomfort"),
    severity: noSymptoms ? 0 : clamp01(body.severity),
    reported_at: body.reported_at || new Date().toISOString(),
    no_symptoms: noSymptoms,
    notes: body.notes || null,
  };

  if (recommenderUrl) {
    try {
      const response = await fetch(`${recommenderUrl.replace(/\/$/, "")}/health-report`, {
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
      console.warn("Recommender health-report endpoint unavailable; storing check-in only.", error);
    }
  }

  const { data: healthReport, error: insertError } = await supabase
    .from("health_reports")
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({
    ok: true,
    health_report: healthReport,
    attributed_exposure_count: 0,
    updated_risk_count: 0,
    fallback: true,
  });
}
