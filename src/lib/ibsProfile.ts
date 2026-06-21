import { supabase } from "@/lib/supabase";
import {
  IbsCheckInResult,
  buildColdStartRiskRows,
  buildIbsEvidenceTable,
  computeUpdatedIbsRiskRows,
  validateIbsCheckInResult,
} from "@/lib/ibsRisk";

export const fetchIbsOnboardingCompleted = async (userId: string) => {
  if (!supabase) return true;

  const { data, error } = await supabase
    .from("user_ibs_profiles")
    .select("onboarding_completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching IBS onboarding profile:", error);
    throw error;
  }

  return Boolean(data?.onboarding_completed_at);
};

export const saveIbsColdStartProfile = async (
  userId: string,
  answers: Record<string, number | null>,
) => {
  if (!supabase) return;

  const now = new Date().toISOString();
  const rows = buildColdStartRiskRows(answers, now).map((row) => ({
    user_id: userId,
    ...row,
  }));

  const { error: riskError } = await supabase
    .from("user_ibs_ingredient_risks")
    .upsert(rows, { onConflict: "user_id,ingredient_name" });

  if (riskError) {
    console.error("Error saving IBS cold-start risks:", riskError);
    throw riskError;
  }

  const { error: profileError } = await supabase.from("user_ibs_profiles").upsert({
    user_id: userId,
    onboarding_completed_at: now,
    updated_at: now,
  });

  if (profileError) {
    console.error("Error saving IBS profile:", profileError);
    throw profileError;
  }
};

export const applyIbsCheckInToProfile = async (userId: string, rawResult: unknown) => {
  if (!supabase) {
    return { updatedCount: 0, topIngredients: [] as string[] };
  }

  const result = validateIbsCheckInResult(rawResult);
  if (!result?.complete) {
    return { updatedCount: 0, topIngredients: [] as string[] };
  }

  const evidenceRows = buildIbsEvidenceTable(result);
  if (evidenceRows.length === 0) {
    return { updatedCount: 0, topIngredients: [] as string[] };
  }

  const ingredientNames = evidenceRows.map((row) => row.ingredientName);
  const { data: existingRows, error: fetchError } = await supabase
    .from("user_ibs_ingredient_risks")
    .select("ingredient_name,grade,confidence,evidence_count")
    .eq("user_id", userId)
    .in("ingredient_name", ingredientNames);

  if (fetchError) {
    console.error("Error fetching IBS risk rows:", fetchError);
    throw fetchError;
  }

  const updatedRows = computeUpdatedIbsRiskRows(
    evidenceRows,
    existingRows || [],
    result.feeling.severity,
  ).map((row) => ({ user_id: userId, ...row }));

  const { error: upsertError } = await supabase
    .from("user_ibs_ingredient_risks")
    .upsert(updatedRows, { onConflict: "user_id,ingredient_name" });

  if (upsertError) {
    console.error("Error updating IBS risk rows:", upsertError);
    throw upsertError;
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("user_ibs_profiles").upsert({
    user_id: userId,
    last_checkin_at: now,
    updated_at: now,
  });

  if (profileError) {
    console.error("Error updating IBS profile check-in timestamp:", profileError);
    throw profileError;
  }

  const checkinPayload = {
    user_id: userId,
    severity: result.feeling.severity,
    symptoms: result.feeling.symptoms,
    summary: result.feeling.summary,
    food_windows: result.food_windows,
    matched_ingredients: evidenceRows.map((row) => row.ingredientName),
    evidence: evidenceRows,
  };

  const { error: checkinError } = await supabase.from("user_ibs_checkins").insert(checkinPayload);
  if (checkinError) {
    console.error("Error saving IBS check-in log:", checkinError);
    throw checkinError;
  }

  return {
    updatedCount: updatedRows.length,
    topIngredients: evidenceRows.slice(0, 4).map((row) => row.ingredientName),
  };
};

export const summarizeIbsCheckIn = (result: IbsCheckInResult, topIngredients: string[]) => {
  const severityPercent = Math.round(result.feeling.severity * 100);
  const watchList = topIngredients.length > 0 ? topIngredients.join(", ") : "no IBS-table ingredients matched";

  return [
    `Saved this IBS check-in with symptom intensity ${severityPercent}/100.`,
    `Possible watch-list ingredients from this entry: ${watchList}.`,
    "This is a tracking signal, not a diagnosis.",
  ].join("\n");
};

