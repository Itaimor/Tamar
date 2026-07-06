import { supabase } from "@/lib/supabase";
import { TamarTreeState, fetchTamarTreeState } from "@/lib/tamarTree";

export type InsightPageKey = "analysis" | "diary" | "cookbook";

export type InsightActivity = {
  latestMealLoggedAt: string | null;
  latestHealthReportedAt: string | null;
  latestIbsCheckinAt: string | null;
  cookbookRecipeCount: number;
  latestCookbookSavedAt: string | null;
  tamarTree: TamarTreeState | null;
};

export type InsightLocalActivity = {
  analysisVisitedAt: string | null;
  diaryVisitedAt: string | null;
  cookbookVisitedAt: string | null;
};

export type InsightCard = {
  id:
    | "start-log"
    | "log-meal"
    | "log-feeling"
    | "analysis"
    | "cookbook"
    | "browse-recipes"
    | "steady-diary"
    | "tamar-water"
    | "tamar-compost"
    | "tamar-full-care"
    | "tamar-danger"
    | "tamar-dead";
  title: string;
  body: string;
  path: string;
  issuedAt: string | null;
  priority: number;
};

const emptyActivity: InsightActivity = {
  latestMealLoggedAt: null,
  latestHealthReportedAt: null,
  latestIbsCheckinAt: null,
  cookbookRecipeCount: 0,
  latestCookbookSavedAt: null,
  tamarTree: null,
};

const staleDays = {
  meal: 3,
  feeling: 5,
  analysis: 7,
  cookbook: 14,
};

const dayMs = 24 * 60 * 60 * 1000;
const firstIssuedAt = "1970-01-01T00:00:00.000Z";

const pageVisitKey = (userId: string, page: InsightPageKey) => `tamar:insights:pageVisit:${userId}:${page}`;
const lastReadKey = (userId: string) => `tamar:insights:lastReadAt:${userId}`;

const safeStorageGet = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Insight state is nice-to-have; the menu still works without persistent storage.
  }
};

const readLatestTimestamp = async (
  label: string,
  query: PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>,
  field: string,
) => {
  const { data, error } = await query;
  if (error) {
    console.warn(`Insight data unavailable from ${label}:`, error.message || error);
    return null;
  }

  const value = data?.[0]?.[field];
  return typeof value === "string" && value ? value : null;
};

export const fetchInsightActivity = async (userId: string): Promise<InsightActivity> => {
  if (!supabase) return emptyActivity;

  const [latestMealLoggedAt, latestHealthReportedAt, latestIbsCheckinAt, cookbookResult, tamarTree] = await Promise.all([
    readLatestTimestamp(
      "meal_logs",
      supabase
        .from("meal_logs")
        .select("logged_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(1),
      "logged_at",
    ),
    readLatestTimestamp(
      "health_reports",
      supabase
        .from("health_reports")
        .select("reported_at")
        .eq("user_id", userId)
        .order("reported_at", { ascending: false })
        .limit(1),
      "reported_at",
    ),
    readLatestTimestamp(
      "user_ibs_checkins",
      supabase
        .from("user_ibs_checkins")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1),
      "created_at",
    ),
    supabase
      .from("cooklist_recipes")
      .select("created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    fetchTamarTreeState(userId),
  ]);

  if (cookbookResult.error) {
    console.warn("Insight data unavailable from cooklist_recipes:", cookbookResult.error.message || cookbookResult.error);
  }

  return {
    latestMealLoggedAt,
    latestHealthReportedAt,
    latestIbsCheckinAt,
    cookbookRecipeCount: cookbookResult.error ? 0 : cookbookResult.count || 0,
    latestCookbookSavedAt:
      typeof cookbookResult.data?.[0]?.created_at === "string" ? cookbookResult.data[0].created_at : null,
    tamarTree,
  };
};

export const getInsightLocalActivity = (userId: string): InsightLocalActivity => ({
  analysisVisitedAt: safeStorageGet(pageVisitKey(userId, "analysis")),
  diaryVisitedAt: safeStorageGet(pageVisitKey(userId, "diary")),
  cookbookVisitedAt: safeStorageGet(pageVisitKey(userId, "cookbook")),
});

export const recordInsightPageVisit = (userId: string, page: InsightPageKey, visitedAt = new Date()) => {
  safeStorageSet(pageVisitKey(userId, page), visitedAt.toISOString());
};

export const getInsightsLastReadAt = (userId: string) => safeStorageGet(lastReadKey(userId));

export const markInsightsRead = (userId: string, readAt = new Date()) => {
  const value = readAt.toISOString();
  safeStorageSet(lastReadKey(userId), value);
  return value;
};

const parseTime = (value: string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const mostRecent = (...values: Array<string | null | undefined>) => {
  const valid = values
    .map((value) => ({ value: value || null, time: parseTime(value) }))
    .filter((item): item is { value: string; time: number } => item.value !== null && item.time !== null);

  valid.sort((a, b) => b.time - a.time);
  return valid[0]?.value || null;
};

const issueAfterDays = (value: string | null, days: number, now: Date) => {
  const time = parseTime(value);
  if (time === null) return firstIssuedAt;

  const issuedTime = time + days * dayMs;
  return issuedTime <= now.getTime() ? new Date(issuedTime).toISOString() : null;
};

const daysSinceLabel = (value: string | null, now: Date) => {
  const time = parseTime(value);
  if (time === null) return null;

  const days = Math.max(1, Math.floor((now.getTime() - time) / dayMs));
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export const buildInsightCards = ({
  remote = emptyActivity,
  local,
  now = new Date(),
}: {
  remote?: InsightActivity;
  local: InsightLocalActivity;
  now?: Date;
}): InsightCard[] => {
  const latestFeelingAt = mostRecent(remote.latestHealthReportedAt, remote.latestIbsCheckinAt);
  const latestAnyLogAt = mostRecent(remote.latestMealLoggedAt, latestFeelingAt);
  const cards: InsightCard[] = [];
  const tree = remote.tamarTree;

  if (tree?.status === "dead") {
    cards.push({
      id: "tamar-dead",
      title: "Replant your Tamar",
      body: "A week passed without care. Start a new sapling when you are ready.",
      path: "/app?tab=diary",
      issuedAt: tree.diedAt || firstIssuedAt,
      priority: 130,
    });
  } else if (tree && tree.daysUntilDeath <= 2 && (!tree.wateredToday || !tree.compostedToday)) {
    cards.push({
      id: "tamar-danger",
      title: tree.daysUntilDeath <= 1 ? "Tamar needs care today" : "Tamar is close to drying out",
      body:
        tree.daysUntilDeath <= 1
          ? "Water or compost the tree today so this run does not die."
          : `${tree.daysUntilDeath} days left before Tamar dies without care.`,
      path: "/app?tab=diary",
      issuedAt: firstIssuedAt,
      priority: 125,
    });
  }

  if (tree?.status === "alive" && tree.wateredToday && !tree.compostedToday) {
    cards.push({
      id: "tamar-compost",
      title: "Compost your Tamar",
      body: "You logged food today. Add how you feel to give the tree a growth day.",
      path: "/app?tab=diary",
      issuedAt: firstIssuedAt,
      priority: 112,
    });
  }

  if (tree?.status === "alive" && tree.compostedToday && !tree.wateredToday) {
    cards.push({
      id: "tamar-water",
      title: "Water your Tamar",
      body: "You checked in today. Add what you ate to give the tree a growth day.",
      path: "/app?tab=diary",
      issuedAt: firstIssuedAt,
      priority: 112,
    });
  }

  if (tree?.status === "alive" && !tree.wateredToday && !tree.compostedToday && latestAnyLogAt) {
    cards.push({
      id: "tamar-full-care",
      title: "Care for today's Tamar",
      body: "A food log or how-you-feel note will keep the tree alive. Both together make it grow.",
      path: "/app?tab=diary",
      issuedAt: null,
      priority: 35,
    });
  }

  if (!latestAnyLogAt) {
    cards.push({
      id: "start-log",
      title: "Start with today's log",
      body: "Tamar needs one meal or how-you-feel note before patterns can mean much.",
      path: "/app?tab=diary",
      issuedAt: firstIssuedAt,
      priority: 100,
    });
  }

  const mealIssuedAt = latestAnyLogAt ? issueAfterDays(remote.latestMealLoggedAt, staleDays.meal, now) : null;
  if (mealIssuedAt) {
    const label = daysSinceLabel(remote.latestMealLoggedAt, now);
    cards.push({
      id: "log-meal",
      title: "Log your latest meal",
      body: label
        ? `Your last meal entry was ${label}. Add what you ate so Tamar has fresh context.`
        : "Add a meal so Tamar can connect food history with how you feel.",
      path: "/app?tab=diary",
      issuedAt: mealIssuedAt,
      priority: 95,
    });
  }

  const feelingIssuedAt = latestAnyLogAt ? issueAfterDays(latestFeelingAt, staleDays.feeling, now) : null;
  if (feelingIssuedAt) {
    const label = daysSinceLabel(latestFeelingAt, now);
    cards.push({
      id: "log-feeling",
      title: "Add a how-you-feel note",
      body: label
        ? `Your last check-in was ${label}. A quick note keeps good and rough days visible.`
        : "Pair a quick symptom or no-symptom note with your recent meals.",
      path: "/app?tab=diary",
      issuedAt: feelingIssuedAt,
      priority: 90,
    });
  }

  const analysisIssuedAt = issueAfterDays(local.analysisVisitedAt, staleDays.analysis, now);
  if (analysisIssuedAt) {
    cards.push({
      id: "analysis",
      title: local.analysisVisitedAt ? "Review updated patterns" : "Open Analysis",
      body: latestAnyLogAt
        ? "See what Tamar can explain from your recent meals and check-ins."
        : "Analysis will show what Tamar needs next once you have a little history.",
      path: "/app?tab=analysis",
      issuedAt: analysisIssuedAt,
      priority: local.analysisVisitedAt ? 72 : 82,
    });
  }

  const cookbookIssuedAt =
    remote.cookbookRecipeCount > 0 ? issueAfterDays(local.cookbookVisitedAt, staleDays.cookbook, now) : null;
  if (cookbookIssuedAt) {
    cards.push({
      id: "cookbook",
      title: "Revisit saved meals",
      body:
        remote.cookbookRecipeCount === 1
          ? "You have one saved recipe ready when planning feels easier from a known option."
          : `You have ${remote.cookbookRecipeCount} saved recipes ready for calmer meal planning.`,
      path: "/cookbook",
      issuedAt: cookbookIssuedAt,
      priority: 62,
    });
  }

  if (cards.length < 3 && latestAnyLogAt) {
    cards.push({
      id: "analysis",
      title: "Review food patterns",
      body: "Your latest logs can be easier to read from the Analysis page.",
      path: "/app?tab=analysis",
      issuedAt: null,
      priority: 30,
    });
  }

  if (cards.length < 3) {
    cards.push({
      id: "steady-diary",
      title: "Keep the Diary fresh",
      body: "Add only the meal, symptom, or note that changed since the last entry.",
      path: "/app?tab=diary",
      issuedAt: null,
      priority: 20,
    });
  }

  if (cards.length < 3) {
    cards.push({
      id: remote.cookbookRecipeCount > 0 ? "cookbook" : "browse-recipes",
      title: remote.cookbookRecipeCount > 0 ? "Plan from saved meals" : "Find a gentle recipe",
      body:
        remote.cookbookRecipeCount > 0
          ? "Your CookBook can turn known options into lower-effort planning."
          : "Browse recommendations and save anything you want nearby later.",
      path: remote.cookbookRecipeCount > 0 ? "/cookbook" : "/",
      issuedAt: null,
      priority: 10,
    });
  }

  const seenIds = new Set<string>();
  return cards
    .sort((a, b) => b.priority - a.priority)
    .filter((card) => {
      if (seenIds.has(card.id)) return false;
      seenIds.add(card.id);
      return true;
    })
    .slice(0, 3);
};

export const getUnreadInsightCount = (cards: InsightCard[], lastReadAt: string | null) => {
  const lastReadTime = parseTime(lastReadAt) || 0;

  return cards.filter((card) => {
    const issuedTime = parseTime(card.issuedAt);
    return issuedTime !== null && issuedTime > lastReadTime;
  }).length;
};

export const getInsightPageFromLocation = (pathname: string, search: string): InsightPageKey | null => {
  if (pathname === "/cookbook") return "cookbook";
  if (pathname !== "/app") return null;

  const tab = new URLSearchParams(search).get("tab");
  if (tab === "analysis") return "analysis";
  if (tab === "diary" || tab === "history") return "diary";
  return null;
};
