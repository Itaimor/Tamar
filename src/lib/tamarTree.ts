import { supabase } from "@/lib/supabase";

export type TamarCareType = "water" | "compost";
export type TamarTreeStatus = "alive" | "dead";
export type TamarTreeZone = "ground" | "oasis" | "canopy" | "clouds" | "space" | "ufo";
export type TamarRewardEventType =
  | "water"
  | "compost"
  | "growth"
  | "cosmetic"
  | "milestone"
  | "death"
  | "replant";

export type TamarRewardEvent = {
  id?: number;
  eventKey: string;
  eventType: TamarRewardEventType;
  title: string;
  body: string;
  careDate: string | null;
  level: number | null;
  createdAt?: string | null;
};

export type TamarTreeRunRow = {
  id: number;
  user_id: string;
  is_current: boolean;
  status: TamarTreeStatus;
  level: number;
  growth_days: number;
  current_streak: number;
  longest_streak: number;
  best_level: number;
  last_watered_date: string | null;
  last_composted_date: string | null;
  last_care_date: string | null;
  last_growth_date: string | null;
  planted_at: string;
  died_at: string | null;
  updated_at: string | null;
};

export type TamarTreeState = {
  runId: number | null;
  status: TamarTreeStatus;
  level: number;
  growthDays: number;
  currentStreak: number;
  longestStreak: number;
  bestLevel: number;
  bestRunLevel: number;
  bestRunStreak: number;
  totalRuns: number;
  totalRewardEvents: number;
  wateredToday: boolean;
  compostedToday: boolean;
  grownToday: boolean;
  daysSinceCare: number;
  daysUntilDeath: number;
  lastWateredDate: string | null;
  lastCompostedDate: string | null;
  lastCareDate: string | null;
  lastGrowthDate: string | null;
  plantedAt: string | null;
  diedAt: string | null;
  zone: TamarTreeZone;
  zoneLabel: string;
  nextRewardLevel: number | null;
  nextMilestoneLevel: number | null;
  careMessage: string;
  todayKey: string;
  migrationReady: boolean;
};

type CareCalendar = {
  waterDates: Set<string>;
  compostDates: Set<string>;
};

const dayMs = 24 * 60 * 60 * 1000;
const deathAfterMissedDays = 7;
const treeRunSelect =
  "id,user_id,is_current,status,level,growth_days,current_streak,longest_streak,best_level,last_watered_date,last_composted_date,last_care_date,last_growth_date,planted_at,died_at,updated_at";

const isMissingTreeTables = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "42P01" ||
    code === "42703" ||
    (typeof message === "string" &&
      (message.includes("user_tamar_tree_runs") || message.includes("user_tamar_tree_reward_events")))
  );
};

export const toLocalDateKey = (value: Date | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return toLocalDateKey(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const utcDayFromKey = (key: string) => {
  const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
};

export const daysBetweenDateKeys = (fromKey: string | null, toKey: string) => {
  if (!fromKey) return 0;
  const from = utcDayFromKey(fromKey);
  const to = utcDayFromKey(toKey);
  if (from === null || to === null) return 0;
  return Math.max(0, Math.round((to - from) / dayMs));
};

const previousDateKey = (key: string) => {
  const time = utcDayFromKey(key);
  if (time === null) return key;
  return toLocalDateKey(new Date(time - dayMs));
};

export const getTamarTreeZone = (level: number): TamarTreeZone => {
  if (level >= 300) return "ufo";
  if (level >= 200) return "space";
  if (level >= 100) return "clouds";
  if (level >= 30) return "canopy";
  if (level >= 7) return "oasis";
  return "ground";
};

export const getTamarTreeZoneLabel = (zone: TamarTreeZone) => {
  if (zone === "ufo") return "UFO grove";
  if (zone === "space") return "Atmosphere";
  if (zone === "clouds") return "Cloud canopy";
  if (zone === "canopy") return "Fruit canopy";
  if (zone === "oasis") return "Young oasis";
  return "Sapling ground";
};

export const getNextTamarRewardLevel = (level: number) => {
  if (level < 7) return level + 1;
  const nextEven = level % 2 === 0 ? level + 2 : level + 1;
  const nextFive = Math.ceil((level + 1) / 5) * 5;
  const nextTen = Math.ceil((level + 1) / 10) * 10;
  return Math.min(nextEven, nextFive, nextTen);
};

export const getNextTamarMilestoneLevel = (level: number) => {
  const milestones = [7, 30, 100, 200, 300];
  return milestones.find((milestone) => milestone > level) || null;
};

const careMessageForState = (state: {
  status: TamarTreeStatus;
  wateredToday: boolean;
  compostedToday: boolean;
  daysUntilDeath: number;
  level: number;
}) => {
  if (state.status === "dead") return "This Tamar has died. Replant to begin a new run.";
  if (state.wateredToday && state.compostedToday) return `Full care complete. Tamar reached level ${state.level}.`;
  if (state.wateredToday) return "Watered today. Add how you feel to turn care into growth.";
  if (state.compostedToday) return "Composted today. Add what you ate to turn care into growth.";
  if (state.daysUntilDeath <= 1) return "Tamar needs care today to survive.";
  if (state.daysUntilDeath <= 2) return `Tamar has ${state.daysUntilDeath} days before it dies.`;
  return "Water with food logs and feed with how-you-feel check-ins.";
};

const emptyCareCalendar = (): CareCalendar => ({
  waterDates: new Set<string>(),
  compostDates: new Set<string>(),
});

const addDate = (target: Set<string>, value: string | null | undefined) => {
  if (!value) return;
  target.add(toLocalDateKey(value));
};

export const buildCareCalendar = ({
  waterDates = [],
  compostDates = [],
}: {
  waterDates?: string[];
  compostDates?: string[];
}): CareCalendar => ({
  waterDates: new Set(waterDates.map((date) => (date.includes("T") ? toLocalDateKey(date) : date))),
  compostDates: new Set(compostDates.map((date) => (date.includes("T") ? toLocalDateKey(date) : date))),
});

const buildEphemeralState = (todayKey = toLocalDateKey()): TamarTreeState => ({
  runId: null,
  status: "alive",
  level: 0,
  growthDays: 0,
  currentStreak: 0,
  longestStreak: 0,
  bestLevel: 0,
  bestRunLevel: 0,
  bestRunStreak: 0,
  totalRuns: 0,
  totalRewardEvents: 0,
  wateredToday: false,
  compostedToday: false,
  grownToday: false,
  daysSinceCare: 0,
  daysUntilDeath: deathAfterMissedDays,
  lastWateredDate: null,
  lastCompostedDate: null,
  lastCareDate: null,
  lastGrowthDate: null,
  plantedAt: null,
  diedAt: null,
  zone: "ground",
  zoneLabel: getTamarTreeZoneLabel("ground"),
  nextRewardLevel: 1,
  nextMilestoneLevel: 7,
  careMessage: "Tamar is ready when the tree tables are available.",
  todayKey,
  migrationReady: false,
});

export const buildTamarTreeStateFromSnapshot = ({
  run,
  allRuns = [],
  careCalendar = emptyCareCalendar(),
  totalRewardEvents = 0,
  now = new Date(),
  migrationReady = true,
}: {
  run: TamarTreeRunRow | null;
  allRuns?: TamarTreeRunRow[];
  careCalendar?: CareCalendar;
  totalRewardEvents?: number;
  now?: Date;
  migrationReady?: boolean;
}): TamarTreeState => {
  const todayKey = toLocalDateKey(now);
  if (!run) return buildEphemeralState(todayKey);

  const wateredToday = careCalendar.waterDates.has(todayKey) || run.last_watered_date === todayKey;
  const compostedToday = careCalendar.compostDates.has(todayKey) || run.last_composted_date === todayKey;
  const grownToday = run.last_growth_date === todayKey;
  const careAnchor = run.last_care_date || toLocalDateKey(run.planted_at);
  const daysSinceCare = run.status === "dead" ? deathAfterMissedDays : daysBetweenDateKeys(careAnchor, todayKey);
  const status: TamarTreeStatus = run.status === "dead" || daysSinceCare >= deathAfterMissedDays ? "dead" : "alive";
  const daysUntilDeath = status === "dead" ? 0 : Math.max(0, deathAfterMissedDays - daysSinceCare);
  const zone = getTamarTreeZone(run.level);
  const bestRunLevel = Math.max(run.best_level, run.level, ...allRuns.map((item) => Math.max(item.best_level, item.level)));
  const bestRunStreak = Math.max(run.longest_streak, ...allRuns.map((item) => item.longest_streak));

  return {
    runId: run.id,
    status,
    level: run.level,
    growthDays: run.growth_days,
    currentStreak: status === "dead" ? 0 : run.current_streak,
    longestStreak: Math.max(run.longest_streak, bestRunStreak),
    bestLevel: Math.max(run.best_level, run.level),
    bestRunLevel,
    bestRunStreak,
    totalRuns: Math.max(1, allRuns.length),
    totalRewardEvents,
    wateredToday,
    compostedToday,
    grownToday,
    daysSinceCare,
    daysUntilDeath,
    lastWateredDate: run.last_watered_date,
    lastCompostedDate: run.last_composted_date,
    lastCareDate: run.last_care_date,
    lastGrowthDate: run.last_growth_date,
    plantedAt: run.planted_at,
    diedAt: run.died_at,
    zone,
    zoneLabel: getTamarTreeZoneLabel(zone),
    nextRewardLevel: getNextTamarRewardLevel(run.level),
    nextMilestoneLevel: getNextTamarMilestoneLevel(run.level),
    careMessage: careMessageForState({ status, wateredToday, compostedToday, daysUntilDeath, level: run.level }),
    todayKey,
    migrationReady,
  };
};

const fetchCareCalendar = async (userId: string, sinceDateKey?: string | null): Promise<CareCalendar> => {
  if (!supabase) return emptyCareCalendar();

  const waterDates = new Set<string>();
  const compostDates = new Set<string>();
  const sinceIso = sinceDateKey ? `${sinceDateKey}T00:00:00.000Z` : undefined;

  const mealQuery = supabase
    .from("meal_logs")
    .select("logged_at")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false })
    .limit(400);
  const reportQuery = supabase
    .from("health_reports")
    .select("reported_at")
    .eq("user_id", userId)
    .order("reported_at", { ascending: false })
    .limit(400);
  const checkinQuery = supabase
    .from("user_ibs_checkins")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);

  if (sinceIso) {
    mealQuery.gte("logged_at", sinceIso);
    reportQuery.gte("reported_at", sinceIso);
    checkinQuery.gte("created_at", sinceIso);
  }

  const [meals, reports, checkins] = await Promise.all([mealQuery, reportQuery, checkinQuery]);

  if (!meals.error) (meals.data || []).forEach((row) => addDate(waterDates, row.logged_at));
  if (!reports.error) (reports.data || []).forEach((row) => addDate(compostDates, row.reported_at));
  if (!checkins.error) (checkins.data || []).forEach((row) => addDate(compostDates, row.created_at));

  return { waterDates, compostDates };
};

const fetchRuns = async (userId: string) => {
  if (!supabase) return { runs: [] as TamarTreeRunRow[], missing: false };

  const { data, error } = await supabase
    .from("user_tamar_tree_runs")
    .select(treeRunSelect)
    .eq("user_id", userId)
    .order("planted_at", { ascending: false });

  if (error) {
    if (isMissingTreeTables(error)) return { runs: [] as TamarTreeRunRow[], missing: true };
    throw error;
  }

  return { runs: (data || []) as TamarTreeRunRow[], missing: false };
};

const insertRewardEvent = async (
  userId: string,
  runId: number,
  event: Omit<TamarRewardEvent, "id" | "createdAt">,
): Promise<TamarRewardEvent | null> => {
  if (!supabase) return null;

  const payload = {
    user_id: userId,
    run_id: runId,
    event_key: event.eventKey,
    event_type: event.eventType,
    title: event.title,
    body: event.body,
    care_date: event.careDate,
    level: event.level,
  };

  const { data, error } = await supabase
    .from("user_tamar_tree_reward_events")
    .insert(payload)
    .select("id,event_key,event_type,title,body,care_date,level,created_at")
    .single();

  if (error) {
    if (error.code === "23505" || isMissingTreeTables(error)) return null;
    throw error;
  }

  return data
    ? {
        id: data.id,
        eventKey: data.event_key,
        eventType: data.event_type,
        title: data.title,
        body: data.body,
        careDate: data.care_date,
        level: data.level,
        createdAt: data.created_at,
      }
    : null;
};

const fetchRewardEventCount = async (userId: string) => {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("user_tamar_tree_reward_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count || 0;
};

const createCurrentRun = async (userId: string, now = new Date()) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_tamar_tree_runs")
    .insert({
      user_id: userId,
      planted_at: now.toISOString(),
    })
    .select(treeRunSelect)
    .single();

  if (error) {
    if (isMissingTreeTables(error)) return null;
    throw error;
  }

  return data as TamarTreeRunRow;
};

const markRunDead = async (run: TamarTreeRunRow, now = new Date()) => {
  if (!supabase || run.status === "dead") return { run, events: [] as TamarRewardEvent[] };

  const diedAt = now.toISOString();
  const { data, error } = await supabase
    .from("user_tamar_tree_runs")
    .update({
      status: "dead",
      current_streak: 0,
      died_at: diedAt,
      updated_at: diedAt,
    })
    .eq("id", run.id)
    .eq("user_id", run.user_id)
    .select(treeRunSelect)
    .single();

  if (error) {
    if (isMissingTreeTables(error)) return { run, events: [] as TamarRewardEvent[] };
    throw error;
  }

  const event = await insertRewardEvent(run.user_id, run.id, {
    eventKey: `run:${run.id}:death`,
    eventType: "death",
    title: "Tamar died",
    body: "Seven days passed without water or compost. Replant when you are ready.",
    careDate: toLocalDateKey(now),
    level: run.level,
  });

  return { run: data as TamarTreeRunRow, events: event ? [event] : [] };
};

const ensureCurrentRun = async (userId: string, now = new Date()) => {
  const { runs, missing } = await fetchRuns(userId);
  if (missing) return { run: null, runs: [] as TamarTreeRunRow[], missing: true };

  const current = runs.find((run) => run.is_current) || null;
  if (current) return { run: current, runs, missing: false };

  const created = await createCurrentRun(userId, now);
  return {
    run: created,
    runs: created ? [created, ...runs] : runs,
    missing: false,
  };
};

export const fetchTamarTreeState = async (userId: string, now = new Date()): Promise<TamarTreeState> => {
  if (!supabase) return buildEphemeralState(toLocalDateKey(now));

  try {
    const ensured = await ensureCurrentRun(userId, now);
    if (ensured.missing || !ensured.run) return buildEphemeralState(toLocalDateKey(now));

    let run = ensured.run;
    const careCalendar = await fetchCareCalendar(userId, toLocalDateKey(run.planted_at));
    const initialState = buildTamarTreeStateFromSnapshot({
      run,
      allRuns: ensured.runs,
      careCalendar,
      totalRewardEvents: await fetchRewardEventCount(userId),
      now,
    });

    if (run.status === "alive" && initialState.status === "dead") {
      const deathResult = await markRunDead(run, now);
      run = deathResult.run;
      if (deathResult.events.length) emitTamarTreeRewards(deathResult.events);
    }

    return buildTamarTreeStateFromSnapshot({
      run,
      allRuns: ensured.runs.map((item) => (item.id === run.id ? run : item)),
      careCalendar,
      totalRewardEvents: await fetchRewardEventCount(userId),
      now,
    });
  } catch (error) {
    console.warn("Tamar tree state unavailable:", error);
    return buildEphemeralState(toLocalDateKey(now));
  }
};

const updateRunCare = async ({
  run,
  careType,
  careDate,
  nextLevel,
  nextGrowthDays,
  nextCurrentStreak,
  nextLongestStreak,
  nextLastGrowthDate,
  now,
}: {
  run: TamarTreeRunRow;
  careType: TamarCareType;
  careDate: string;
  nextLevel: number;
  nextGrowthDays: number;
  nextCurrentStreak: number;
  nextLongestStreak: number;
  nextLastGrowthDate: string | null;
  now: Date;
}) => {
  if (!supabase) return run;

  const payload: Record<string, unknown> = {
    level: nextLevel,
    growth_days: nextGrowthDays,
    current_streak: nextCurrentStreak,
    longest_streak: nextLongestStreak,
    best_level: Math.max(run.best_level, nextLevel),
    last_care_date: careDate,
    last_growth_date: nextLastGrowthDate,
    updated_at: now.toISOString(),
  };

  if (careType === "water") payload.last_watered_date = careDate;
  if (careType === "compost") payload.last_composted_date = careDate;

  const { data, error } = await supabase
    .from("user_tamar_tree_runs")
    .update(payload)
    .eq("id", run.id)
    .eq("user_id", run.user_id)
    .select(treeRunSelect)
    .single();

  if (error) {
    if (isMissingTreeTables(error)) return run;
    throw error;
  }

  return data as TamarTreeRunRow;
};

const careReward = (careType: TamarCareType, runId: number, careDate: string): Omit<TamarRewardEvent, "id" | "createdAt"> => {
  if (careType === "water") {
    return {
      eventKey: `run:${runId}:water:${careDate}`,
      eventType: "water",
      title: "Tamar was watered",
      body: "Food logged. The soil got a little shine.",
      careDate,
      level: null,
    };
  }

  return {
    eventKey: `run:${runId}:compost:${careDate}`,
    eventType: "compost",
    title: "Compost added",
    body: "How-you-feel logged. Tamar got richer soil.",
    careDate,
    level: null,
  };
};

export const getTamarRewardUnlocksForLevel = (
  runId: number,
  level: number,
  careDate: string,
): Array<Omit<TamarRewardEvent, "id" | "createdAt">> => {
  const rewards: Array<Omit<TamarRewardEvent, "id" | "createdAt">> = [
    {
      eventKey: `run:${runId}:growth:${careDate}`,
      eventType: "growth",
      title: `Tamar grew to level ${level}`,
      body: "Water and compost landed on the same day.",
      careDate,
      level,
    },
  ];

  const zone = getTamarTreeZone(level);
  if ([7, 30, 100, 200, 300].includes(level)) {
    rewards.push({
      eventKey: `run:${runId}:milestone:${level}`,
      eventType: "milestone",
      title: `${getTamarTreeZoneLabel(zone)} unlocked`,
      body:
        level >= 300
          ? "The grove reached the UFO layer."
          : level >= 200
            ? "Tamar pushed into the atmosphere."
            : level >= 100
              ? "Tamar reached the clouds."
              : level >= 30
                ? "Dates started to cluster in the canopy."
                : "The sapling became a young oasis tree.",
      careDate,
      level,
    });
  } else if (level <= 7 || level % 10 === 0 || level % 5 === 0 || level % 2 === 0) {
    rewards.push({
      eventKey: `run:${runId}:cosmetic:${level}`,
      eventType: "cosmetic",
      title: level % 10 === 0 ? "World detail unlocked" : level % 5 === 0 ? "New grove detail" : "Tiny upgrade",
      body:
        level <= 7
          ? "The sapling changed shape."
          : level % 10 === 0
            ? "The background climbed a little higher."
            : level % 5 === 0
              ? "New dates and fronds appeared."
              : "A small shimmer joined the tree.",
      careDate,
      level,
    });
  }

  return rewards;
};

export const syncTamarTreeAfterCare = async (
  userId: string,
  careType: TamarCareType,
  happenedAt: Date | string = new Date(),
): Promise<{ state: TamarTreeState; events: TamarRewardEvent[] }> => {
  const now = happenedAt instanceof Date ? happenedAt : new Date(happenedAt);
  const careDate = toLocalDateKey(now);

  try {
    const ensured = await ensureCurrentRun(userId, now);
    if (ensured.missing || !ensured.run) {
      return { state: buildEphemeralState(careDate), events: [] };
    }

    const preState = await fetchTamarTreeState(userId, now);
    let run = ensured.run;
    if (preState.status === "dead" || run.status === "dead") {
      return { state: preState, events: [] };
    }

    const careCalendar = await fetchCareCalendar(userId, toLocalDateKey(run.planted_at));
    const wateredToday = careType === "water" || careCalendar.waterDates.has(careDate) || run.last_watered_date === careDate;
    const compostedToday = careType === "compost" || careCalendar.compostDates.has(careDate) || run.last_composted_date === careDate;
    const shouldGrow = wateredToday && compostedToday && run.last_growth_date !== careDate;
    const nextStreak =
      shouldGrow
        ? run.last_growth_date === previousDateKey(careDate)
          ? run.current_streak + 1
          : 1
        : run.current_streak;
    const nextLevel = shouldGrow ? run.level + 1 : run.level;

    const events: TamarRewardEvent[] = [];
    const careEvent = await insertRewardEvent(userId, run.id, careReward(careType, run.id, careDate));
    if (careEvent) events.push(careEvent);

    run = await updateRunCare({
      run,
      careType,
      careDate,
      nextLevel,
      nextGrowthDays: shouldGrow ? run.growth_days + 1 : run.growth_days,
      nextCurrentStreak: nextStreak,
      nextLongestStreak: shouldGrow ? Math.max(run.longest_streak, nextStreak) : run.longest_streak,
      nextLastGrowthDate: shouldGrow ? careDate : run.last_growth_date,
      now,
    });

    if (shouldGrow) {
      for (const reward of getTamarRewardUnlocksForLevel(run.id, nextLevel, careDate)) {
        const inserted = await insertRewardEvent(userId, run.id, reward);
        if (inserted) events.push(inserted);
      }
    }

    if (events.length) emitTamarTreeRewards(events);

    return {
      state: await fetchTamarTreeState(userId, now),
      events,
    };
  } catch (error) {
    console.warn("Tamar tree sync skipped:", error);
    return { state: buildEphemeralState(careDate), events: [] };
  }
};

export const replantTamarTree = async (
  userId: string,
  now = new Date(),
): Promise<{ state: TamarTreeState; events: TamarRewardEvent[] }> => {
  if (!supabase) return { state: buildEphemeralState(toLocalDateKey(now)), events: [] };

  try {
    const ensured = await ensureCurrentRun(userId, now);
    if (ensured.missing) return { state: buildEphemeralState(toLocalDateKey(now)), events: [] };

    if (ensured.run) {
      await supabase
        .from("user_tamar_tree_runs")
        .update({ is_current: false, updated_at: now.toISOString() })
        .eq("id", ensured.run.id)
        .eq("user_id", userId);
    }

    const created = await createCurrentRun(userId, now);
    if (!created) return { state: buildEphemeralState(toLocalDateKey(now)), events: [] };

    const events: TamarRewardEvent[] = [];
    const replantEvent = await insertRewardEvent(userId, created.id, {
      eventKey: `run:${created.id}:replant`,
      eventType: "replant",
      title: "New Tamar planted",
      body: "A fresh sapling is ready for care.",
      careDate: toLocalDateKey(now),
      level: 0,
    });
    if (replantEvent) events.push(replantEvent);

    const careCalendar = await fetchCareCalendar(userId, toLocalDateKey(now));
    if (careCalendar.waterDates.has(toLocalDateKey(now))) {
      const waterResult = await syncTamarTreeAfterCare(userId, "water", now);
      events.push(...waterResult.events);
    }
    if (careCalendar.compostDates.has(toLocalDateKey(now))) {
      const compostResult = await syncTamarTreeAfterCare(userId, "compost", now);
      events.push(...compostResult.events);
    }

    if (events.length) emitTamarTreeRewards(events);
    return { state: await fetchTamarTreeState(userId, now), events };
  } catch (error) {
    console.warn("Could not replant Tamar:", error);
    return { state: await fetchTamarTreeState(userId, now), events: [] };
  }
};

export const emitTamarTreeRewards = (events: TamarRewardEvent[]) => {
  if (typeof window === "undefined" || events.length === 0) return;
  window.dispatchEvent(new CustomEvent("tamar:tree-rewards", { detail: events }));
  window.dispatchEvent(new CustomEvent("tamar:tree-updated"));
};
