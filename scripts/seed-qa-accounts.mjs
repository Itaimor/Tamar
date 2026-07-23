import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const parseEnvFile = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );

const env = { ...parseEnvFile(".env.local"), ...process.env };
const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
  throw new Error(
    "VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const password = env.QA_ACCOUNT_PASSWORD || `TamarQA!${randomBytes(9).toString("base64url")}9a`;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const isoDaysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const accountSpecs = [
  {
    key: "A1",
    email: "tamar.qa.a1.new.sapling@example.com",
    fullName: "QA A1 New Sapling",
    appMetadata: { qa_account: true, qa_persona: "A1" },
  },
  {
    key: "A2",
    email: "tamar.qa.a2.active.sapling@example.com",
    fullName: "QA A2 Active Sapling",
    appMetadata: {
      qa_account: true,
      qa_persona: "A2",
      qa_trial_started_at: isoDaysAgo(10),
    },
  },
  {
    key: "A3",
    email: "tamar.qa.a3.expired.sapling@example.com",
    fullName: "QA A3 Expired Sapling",
    appMetadata: {
      qa_account: true,
      qa_persona: "A3",
      qa_trial_started_at: isoDaysAgo(40),
    },
  },
  {
    key: "A4",
    email: "tamar.qa.a4.canopy@example.com",
    fullName: "QA A4 Canopy Plus",
    appMetadata: {
      qa_account: true,
      qa_persona: "A4",
      canopy_plus: true,
      tamar_plan: "canopy_plus",
    },
  },
  {
    key: "A5",
    email: "tamar.qa.a5.returning@example.com",
    fullName: "QA A5 Returning User",
    appMetadata: { qa_account: true, qa_persona: "A5" },
  },
  {
    key: "A6A",
    email: "tamar.qa.a6.privacy.one@example.com",
    fullName: "QA A6 Privacy One",
    appMetadata: { qa_account: true, qa_persona: "A6A" },
  },
  {
    key: "A6B",
    email: "tamar.qa.a6.privacy.two@example.com",
    fullName: "QA A6 Privacy Two",
    appMetadata: { qa_account: true, qa_persona: "A6B" },
  },
];

const fail = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const listAllUsers = async () => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    fail("List Auth users", error);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
};

const ensureUsers = async () => {
  const usersByEmail = new Map((await listAllUsers()).map((user) => [user.email?.toLowerCase(), user]));
  const result = new Map();

  for (const spec of accountSpecs) {
    const existing = usersByEmail.get(spec.email);
    const attributes = {
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: spec.fullName, qa_account: true, qa_persona: spec.key },
      app_metadata: spec.appMetadata,
    };

    const response = existing
      ? await supabase.auth.admin.updateUserById(existing.id, attributes)
      : await supabase.auth.admin.createUser(attributes);
    fail(`${existing ? "Update" : "Create"} ${spec.key}`, response.error);
    result.set(spec.key, response.data.user);
  }

  return result;
};

const ensureProfiles = async (users) => {
  const rows = accountSpecs.map((spec) => ({
    id: users.get(spec.key).id,
    email: spec.email,
    full_name: spec.fullName,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("profiles").upsert(rows, { onConflict: "id" });
  fail("Upsert QA profiles", error);
};

const fetchRecipes = async () => {
  const { data, error } = await supabase
    .from("recipes")
    .select("id,name")
    .order("id", { ascending: true })
    .limit(8);
  fail("Fetch recipe fixtures", error);
  return data || [];
};

const ensureCooklist = async (userId, name, isDefault) => {
  const { data: existing, error: readError } = await supabase
    .from("cooklists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  fail(`Read ${name} cooklist`, readError);
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("cooklists")
    .insert({ user_id: userId, name, is_default: isDefault })
    .select("id")
    .single();
  fail(`Create ${name} cooklist`, error);
  return data.id;
};

const seedReturningUser = async (user, recipes) => {
  const userId = user.id;
  const likedId = await ensureCooklist(userId, "Liked", true);
  const weeknightId = await ensureCooklist(userId, "Weeknight QA", false);
  const selected = recipes.slice(0, 4);

  if (selected.length) {
    const { data: current, error: currentError } = await supabase
      .from("cooklist_recipes")
      .select("recipe_id")
      .eq("user_id", userId);
    fail("Read returning-user cookbook", currentError);
    const saved = new Set((current || []).map((row) => row.recipe_id));
    const cookbookRows = selected.slice(0, 3).flatMap((recipe, index) => {
      const recipeId = String(recipe.id);
      if (saved.has(recipeId)) return [];
      return [{
        user_id: userId,
        cooklist_id: index < 2 ? likedId : weeknightId,
        recipe_id: recipeId,
        recipe_title: recipe.name,
        recipe_source: "catalog",
      }];
    });
    if (cookbookRows.length) {
      const { error } = await supabase.from("cooklist_recipes").insert(cookbookRows);
      fail("Seed returning-user cookbook", error);
    }

    const { data: interactions, error: interactionsReadError } = await supabase
      .from("recipe_interactions")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    fail("Read returning-user interactions", interactionsReadError);
    if (!interactions?.length) {
      const interactionTypes = ["saved", "liked", "started", "completed"];
      const { error } = await supabase.from("recipe_interactions").insert(
        selected.map((recipe, index) => ({
          user_id: userId,
          recipe_id: String(recipe.id),
          recipe_title: recipe.name,
          interaction_type: interactionTypes[index],
          created_at: isoDaysAgo(6 - index),
        })),
      );
      fail("Seed returning-user interactions", error);
    }

    const recipeIds = selected.map((recipe) => String(recipe.id));
    const scores = selected.map((_, index) => 0.94 - index * 0.06);
    const { error } = await supabase.from("user_recommendations").upsert({
      user_id: userId,
      recommended_recipe_ids: recipeIds,
      match_scores: scores,
      final_scores: scores,
      trending_recipe_ids: recipeIds.slice().reverse(),
      trending_match_scores: scores,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    fail("Seed returning-user recommendations", error);
  }

  const { data: meals, error: mealsReadError } = await supabase
    .from("meal_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("notes", "QA fixture: returning user")
    .limit(1);
  fail("Read returning-user meals", mealsReadError);
  if (!meals?.length) {
    const { error } = await supabase.from("meal_logs").insert([
      {
        user_id: userId,
        recipe_id: selected[0]?.id ?? null,
        food_name: selected[0]?.name ?? "QA oatmeal bowl",
        logged_at: isoDaysAgo(5),
        portion_size: 1,
        portion_unit: "serving",
        calories: 430,
        protein_g: 18,
        fat_g: 12,
        nutrition_source: "manual",
        nutrition_confidence: 1,
        notes: "QA fixture: returning user",
      },
      {
        user_id: userId,
        recipe_id: selected[1]?.id ?? null,
        food_name: selected[1]?.name ?? "QA rice bowl",
        logged_at: isoDaysAgo(3),
        portion_size: 1,
        portion_unit: "serving",
        calories: 520,
        protein_g: 24,
        fat_g: 14,
        nutrition_source: "manual",
        nutrition_confidence: 1,
        notes: "QA fixture: returning user",
      },
      {
        user_id: userId,
        recipe_id: selected[2]?.id ?? null,
        food_name: selected[2]?.name ?? "QA soup",
        logged_at: isoDaysAgo(1),
        portion_size: 1,
        portion_unit: "bowl",
        calories: 360,
        protein_g: 15,
        fat_g: 9,
        nutrition_source: "manual",
        nutrition_confidence: 1,
        notes: "QA fixture: returning user",
      },
    ]);
    fail("Seed returning-user meals", error);
  }

  const { data: reports, error: reportsReadError } = await supabase
    .from("health_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("notes", "QA fixture: returning user")
    .limit(1);
  fail("Read returning-user health reports", reportsReadError);
  if (!reports?.length) {
    const { error } = await supabase.from("health_reports").insert([
      {
        user_id: userId,
        reported_at: isoDaysAgo(4),
        symptom_type: "bloating",
        severity: 0.6,
        no_symptoms: false,
        notes: "QA fixture: returning user",
      },
      {
        user_id: userId,
        reported_at: isoDaysAgo(2),
        symptom_type: "comfortable",
        severity: 0,
        no_symptoms: true,
        notes: "QA fixture: returning user",
      },
      {
        user_id: userId,
        reported_at: isoDaysAgo(0),
        symptom_type: "abdominal discomfort",
        severity: 0.3,
        no_symptoms: false,
        notes: "QA fixture: returning user",
      },
    ]);
    fail("Seed returning-user health reports", error);
  }

  const { error: ibsProfileError } = await supabase.from("user_ibs_profiles").upsert({
    user_id: userId,
    onboarding_completed_at: isoDaysAgo(20),
    last_checkin_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  fail("Seed returning-user IBS profile", ibsProfileError);
};

const seedPrivacyUser = async (user, marker) => {
  const { data, error: readError } = await supabase
    .from("meal_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("notes", `QA privacy fixture: ${marker}`)
    .limit(1);
  fail(`Read privacy fixture ${marker}`, readError);
  if (data?.length) return;

  const { error } = await supabase.from("meal_logs").insert({
    user_id: user.id,
    food_name: `PRIVATE ${marker} meal — must only be visible to ${marker}`,
    logged_at: new Date().toISOString(),
    portion_size: 1,
    portion_unit: "serving",
    notes: `QA privacy fixture: ${marker}`,
  });
  fail(`Seed privacy fixture ${marker}`, error);
};

const verify = async (users) => {
  const listed = await listAllUsers();
  const qaUsers = listed.filter((user) => accountSpecs.some((spec) => spec.email === user.email));
  if (qaUsers.length !== accountSpecs.length) {
    throw new Error(`Expected ${accountSpecs.length} QA Auth users, found ${qaUsers.length}.`);
  }

  const ids = accountSpecs.map((spec) => users.get(spec.key).id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id")
    .in("id", ids);
  fail("Verify QA profiles", profilesError);
  if (profiles.length !== accountSpecs.length) {
    throw new Error(`Expected ${accountSpecs.length} QA profiles, found ${profiles.length}.`);
  }

  const a5 = users.get("A5");
  const { count: mealCount, error: mealError } = await supabase
    .from("meal_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", a5.id);
  fail("Verify returning-user meals", mealError);
  const { count: reportCount, error: reportError } = await supabase
    .from("health_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", a5.id);
  fail("Verify returning-user reports", reportError);
  if (!mealCount || !reportCount) throw new Error("A5 returning-user fixtures are incomplete.");

  return { qaUsers: qaUsers.length, a5Meals: mealCount, a5Reports: reportCount };
};

const verifyPrivacyRls = async (spec, expectedUserId, ownMarker, forbiddenMarker) => {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: spec.email,
    password,
  });
  fail(`Sign in ${spec.key} for RLS verification`, authError);
  if (authData.user?.id !== expectedUserId) {
    throw new Error(`${spec.key} signed in with an unexpected user ID.`);
  }

  const { data: meals, error: mealsError } = await client
    .from("meal_logs")
    .select("user_id,notes")
    .order("logged_at", { ascending: false });
  fail(`Read ${spec.key} meals through authenticated RLS`, mealsError);
  if (!meals?.some((row) => row.notes === `QA privacy fixture: ${ownMarker}`)) {
    throw new Error(`${spec.key} could not read its own privacy fixture.`);
  }
  if (
    meals.some(
      (row) =>
        row.user_id !== expectedUserId ||
        row.notes === `QA privacy fixture: ${forbiddenMarker}`,
    )
  ) {
    throw new Error(`${spec.key} could read data belonging to another user.`);
  }
  await client.auth.signOut();
  return meals.length;
};

const users = await ensureUsers();
await ensureProfiles(users);
const recipes = await fetchRecipes();
await seedReturningUser(users.get("A5"), recipes);
await seedPrivacyUser(users.get("A6A"), "A6A");
await seedPrivacyUser(users.get("A6B"), "A6B");
const verification = await verify(users);
const privacyVerification = {
  A6AVisibleMeals: await verifyPrivacyRls(
    accountSpecs.find((spec) => spec.key === "A6A"),
    users.get("A6A").id,
    "A6A",
    "A6B",
  ),
  A6BVisibleMeals: await verifyPrivacyRls(
    accountSpecs.find((spec) => spec.key === "A6B"),
    users.get("A6B").id,
    "A6B",
    "A6A",
  ),
};

console.log(JSON.stringify({
  password,
  accounts: accountSpecs.map(({ key, email }) => ({ key, email })),
  recipesAvailable: recipes.length,
  verification,
  privacyVerification,
}, null, 2));
