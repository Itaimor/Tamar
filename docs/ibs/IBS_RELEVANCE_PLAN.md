# IBS Relevance Plan

## Purpose

This document defines how Tamar becomes clearly IBS-aware, not only a food-preference recommender.

The implementation goal is to add a practical personal IBS ingredient-risk layer:

1. Build an `ibs_ingredient_table` from reputable IBS/FODMAP trigger sources.
2. Initialize each user's ingredient grades from an IBS cold-start questionnaire.
3. Add a chat flow called `How I Feel`.
4. Convert symptom reports and recent meal information into ingredient-level risk evidence.
5. Update the user's personal IBS ingredient table only when the chat flow completes with enough information.

Ownership boundary:

- This task owns creation and maintenance of IBS ingredient tables and per-user IBS risk grades.
- This task does not change recommendation ranking.
- A teammate can later consume `user_ibs_ingredient_risks` from the recommender layer.

This is not medical diagnosis. UI copy must say Tamar is an AI assistant, not a doctor, and that users should consult a clinician/dietitian for medical decisions.

## Source Basis

The first implementation should use public, reputable dietary guidance rather than random food blogs.

Primary sources:

- NIDDK: `https://www.niddk.nih.gov/health-information/digestive-diseases/irritable-bowel-syndrome/eating-diet-nutrition`
- NHS: `https://www.nhs.uk/conditions/irritable-bowel-syndrome-ibs/diet-lifestyle-and-medicines/`
- Monash FODMAP: `https://www.monashfodmap.com/about-fodmap-and-ibs/`

Important source conclusions:

- IBS triggers vary by person.
- Low-FODMAP style tracking is useful for many IBS patients, but should not be framed as permanent restriction.
- Common risk groups include fructans/GOS, lactose, excess fructose, polyols, some high-fiber/gas-producing foods, fatty/spicy/processed foods, caffeine, alcohol, and fizzy drinks.
- The app should learn personal reactions over time instead of assuming every high-FODMAP ingredient is bad for every user.

## Current App Context

Current relevant code:

- `src/pages/Home.tsx` has the taste cold-start onboarding with Like/Dislike cards.
- `src/components/ChatScreen.tsx` has chat chips and message flow.
- `api/generate.ts` calls Gemini for general chat responses.
- `src/lib/recipeInteractions.ts` stores recipe interaction signals.
- `docs/IBS_Recommender_Online_LightFM_Design.md` already describes richer long-term architecture with meal logs, health reports, ingredient risks, symptom attribution, and risk-aware ranking.

Decision:

- Keep taste onboarding separate from IBS health onboarding.
- Add IBS-specific onboarding/profile data for personal trigger risk.
- Add chat-based symptom/meal logging as a first practical version of the design doc's `meal_logs`, `health_reports`, and `user_ingredient_risks`.
- Do not alter recommendation scoring in this task.

## Implemented Module Map

The first implementation is split this way:

- `src/lib/ibsIngredients.ts`
  - IBS-sensitive ingredient catalog and aliases.
  - Trigger groups from reputable IBS/FODMAP guidance.
  - Local text normalization and alias matching.
- `src/lib/ibsRisk.ts`
  - IBS cold-start questions.
  - Gemini check-in output validation.
  - Temporary evidence table construction.
  - Ingredient evidence and risk update formulas.
- `src/lib/ibsProfile.ts`
  - Supabase reads/writes for IBS onboarding status, per-user risk rows, and check-in logs.
- `src/components/IbsOnboardingCard.tsx`
  - Visible IBS cold-start questionnaire.
  - Initializes one personal row per IBS catalog ingredient.
- `src/components/ChatScreen.tsx`
  - Adds `How I Feel` before `Analyze my Lunch`.
  - Runs the structured IBS check-in flow.
- `api/ibs-check-in.ts`
  - Gemini interviewer endpoint that returns strict JSON.
- `vite.config.ts`
  - Local dev middleware for `/api/ibs-check-in`.
- `supabase/migrations/20260621000000_create_ibs_tables.sql`
  - Adds `user_ibs_profiles`, `user_ibs_ingredient_risks`, and `user_ibs_checkins`.

The global catalog currently lives in code so frontend parsing, cold-start initialization, and tests use the same source. Supabase persists the per-user IBS rows that other teammates can consume later.

## Data Model

### Global IBS Ingredient Table

Conceptual table:

```text
ibs_ingredient_table
--------------------
ingredient_name text
grade numeric
```

For implementation, the global source should be a constant/table of canonical ingredient names, with default grade `0`.

The user's personal table is the same ingredient list with user-specific grades.

Recommended practical Supabase shape:

```text
ibs_ingredients
---------------
id bigint primary key
ingredient_name text unique not null
aliases text[] default '{}'
trigger_group text not null
source_notes text
created_at timestamptz default now()
```

```text
user_ibs_ingredient_risks
-------------------------
user_id uuid not null
ingredient_name text not null
grade numeric not null default 0
confidence numeric not null default 0
evidence_count integer not null default 0
last_evidence_at timestamptz
updated_at timestamptz default now()
primary key (user_id, ingredient_name)
```

Why not store only one global `grade` column?

- The same ingredient can be safe for one user and bad for another.
- The global table defines candidate IBS-sensitive ingredients.
- The user table stores personal risk grades.

If we need a smaller first implementation, use a TypeScript constant plus one Supabase table:

```text
user_ibs_ingredient_risks(user_id, ingredient_name, grade, confidence, evidence_count, updated_at)
```

This is enough for the first demo.

## IBS Ingredient Table Construction

Build a seed list of a few hundred canonical ingredients and aliases from categories instead of hand-writing one enormous flat list.

Initial categories:

1. Fructans/GOS: garlic, onion, wheat, rye, barley, legumes, lentils, chickpeas, beans, cashews, pistachios, etc.
2. Lactose: milk, soft cheese, yogurt, custard, ice cream, cream, ricotta, cottage cheese, etc.
3. Excess fructose: apples, pears, mango, watermelon, honey, high-fructose corn syrup, fruit juice, dried fruit, etc.
4. Polyols: sorbitol, mannitol, xylitol, maltitol, apples, apricots, cherries, nectarines, peaches, plums, mushrooms, cauliflower, sugar-free gum/candy, etc.
5. Gas-producing/hard-to-digest vegetables: cabbage, broccoli, cauliflower, brussels sprouts, beans, onions.
6. IBS lifestyle/diet triggers: fatty foods, fried foods, spicy foods, processed foods, caffeine, coffee, alcohol, fizzy drinks.
7. Fiber-sensitive items: wholegrain bread, brown rice, nuts, seeds, high-fiber cereals. These are not always bad; they matter especially for diarrhea reports.

The ingredient table should include aliases:

```text
garlic: garlic, garlic powder, garlic salt, garlic oil
onion: onion, onions, onion powder, shallot, leek white, spring onion white
milk: milk, whole milk, skim milk, cow milk
wheat: wheat, wheat flour, flour, pasta, bread, breadcrumbs
```

Implementation detail:

- Put the seed in code first as `src/lib/ibsIngredients.ts`.
- Later, optionally migrate it to Supabase.
- The seed can contain `ingredient_name`, `aliases`, and `trigger_group`.
- The per-user grade starts at `0`.

## IBS Cold-Start Questionnaire

The current taste questionnaire asks whether the user likes recipe cards. The IBS questionnaire should ask about symptoms after food categories.

Recommended answer scale:

```text
0 = no issue / usually fine
1 = mild issue
2 = moderate issue
3 = strong issue
4 = not sure / unknown
```

Convert to initial risk:

```text
if answer is unknown:
  no update
else:
  base_risk = answer / 3
```

Clamp to `[0, 1]`.

Recommended questions:

1. "How do you usually feel after milk, soft cheese, yogurt, or ice cream?"
   - maps to lactose group
2. "How do you usually feel after wheat foods like bread, pasta, couscous, or regular flour?"
   - maps to wheat/fructans group
3. "How do you usually feel after onion, garlic, leeks, or shallots?"
   - maps to onion/garlic/fructans group
4. "How do you usually feel after beans, lentils, chickpeas, or peas?"
   - maps to GOS/legumes group
5. "How do you usually feel after apples, pears, mango, watermelon, honey, or fruit juice?"
   - maps to excess fructose group
6. "How do you usually feel after mushrooms, cauliflower, stone fruits, or sugar-free gum/candy?"
   - maps to polyols group
7. "How do you usually feel after fried, fatty, spicy, or highly processed foods?"
   - maps to lifestyle trigger group
8. "How do you usually feel after coffee, alcohol, or fizzy drinks?"
   - maps to beverage trigger group
9. "When your stomach is sensitive, do large high-fiber meals make symptoms worse?"
   - maps to high-fiber/gas-producing group

Cold-start update formula:

```text
for each mapped ingredient:
  new_grade = max(old_grade, base_risk * group_weight)
  confidence = max(old_confidence, 0.35)
```

Suggested `group_weight`:

```text
direct group examples = 1.0
aliases/related ingredients = 0.85
broad lifestyle category = 0.65
```

Reasoning:

- Direct answers should initialize meaningful risk.
- Related aliases should also move but slightly less.
- Broad categories should be weaker because "fatty foods" or "spicy foods" are not one exact ingredient.

## Chat Flow: "How I Feel"

Add a chip before `Analyze my Lunch`:

```text
How I Feel
```

Current chip order should become:

```text
How I Feel
Analyze my Lunch
Log Stress Level
View Weekly Risk
```

When the user clicks `How I Feel`, use app state to start a structured IBS check-in.

Gemini can be used as the conversational interviewer. Its job is to ask the user a small set of symptom and recent-food questions in natural, varied wording, gather enough answers, and return a structured result.

Gemini must not update the IBS table directly and must not decide final ingredient grades. Tamar code owns validation, ingredient matching, evidence scoring, and Supabase writes.

Recommended Gemini output contract:

```json
{
  "complete": true,
  "feeling": {
    "severity": 0.0,
    "symptoms": ["bloating"],
    "summary": "User reports mild bloating.",
    "confidence": 0.0
  },
  "food_windows": {
    "hours_0_8": ["pasta with tomato sauce", "garlic bread"],
    "hours_9_16": ["coffee", "yogurt"],
    "hours_17_24": ["rice and chicken"]
  },
  "missing_fields": []
}
```

Rules for the Gemini interviewer:

- Ask follow-up questions until `feeling`, `hours_0_8`, `hours_9_16`, and `hours_17_24` are known or the user clearly cannot answer.
- Use varied wording so the chat does not feel repetitive.
- Do not invent meals, ingredients, or symptoms.
- If the user gives partial information, return `complete: false` and list missing fields.
- Keep medical wording non-diagnostic.

Recommended flow:

### Step 1: Ask Symptom And Food Questions

Gemini should ask from a controlled question intent set, with varied wording.

Symptom intent examples:

- "How has your digestion felt today?"
- "How is your stomach feeling right now?"
- "Any bloating, pain, cramps, diarrhea, constipation, or discomfort today?"
- "Tell me how your gut has been feeling since your last meal."

Food-window intent examples:

- "What did you eat in the last 8 hours?"
- "What did you eat around 9-16 hours ago?"
- "What did you eat around 17-24 hours ago?"

The user answers in free text. Gemini keeps asking only for missing pieces.

### Step 2: Convert Answer To Symptom Severity

Preferred implementation:

- Gemini returns `feeling.severity` in `[0, 1]`.
- Tamar validates the value is numeric and clamped to `[0, 1]`.
- If Gemini output is invalid, abort the check-in without updating tables.

Recommended severity output:

```text
symptom_severity in [0, 1]
```

Higher is worse.

Deterministic fallback if Gemini is unavailable:

```text
start severity = 0

if text contains "fine", "good", "normal", "no symptoms":
  severity += 0.05
if text contains "mild", "a little", "slight":
  severity += 0.25
if text contains "bloated", "gas", "cramps", "pain", "diarrhea", "constipation", "nausea":
  severity += 0.35 per distinct symptom family, max +0.70
if text contains "bad", "strong", "severe", "terrible", "can't", "worse":
  severity += 0.25

severity = clamp(severity, 0, 1)
```

If model parsing fails in a production flow, prefer aborting safely over writing questionable health data.

### Step 3: Ask What The User Ate

The final structured output must contain three food lists:

```text
hours_0_8
hours_9_16
hours_17_24
```

The chat may collect them through several messages or one natural conversation. The important part is that the validated final object has all three lists.

### Step 4: Parse Meals Into Ingredients

After Gemini returns the three food lists, Tamar code parses food text into IBS ingredients. This local parser is where the ingredient table connects to the check-in.

For each time window list:

1. Split user text into foods/meals.
2. Extract candidate ingredients.
3. Normalize ingredient names and aliases.
4. Keep only ingredients that match the IBS ingredient table.

First implementation can use:

- exact/alias matching against `ibsIngredients`.
- optional Gemini food cleanup later if needed.

Do not let Gemini directly set ingredient grades. Gemini can say the user ate "garlic bread"; Tamar code maps that to `garlic` and `wheat`, then calculates evidence.

Temporary meal evidence table in memory:

```text
ingredient_name
count_8h
count_9_16h
count_17_24h
```

Example:

```text
pasta with tomato sauce and garlic bread
-> wheat, garlic, tomato
```

### Step 5: Compute New Evidence Per Ingredient

Time weights:

```text
0-8 hours    = 1.00
9-16 hours   = 0.65
17-24 hours  = 0.35
```

Why:

- Recent meals get stronger attribution.
- Older meals still matter but should not dominate.

Ingredient evidence formula:

```text
frequency_score =
  1.00 * count_8h
+ 0.65 * count_9_16h
+ 0.35 * count_17_24h

frequency_score = min(1, frequency_score / 3)

new_evidence_score =
  symptom_severity * frequency_score
```

Interpretation:

- If the user feels bad and garlic appears multiple times recently, garlic receives stronger risk evidence.
- If the user feels fine, ingredients eaten recently should receive weak "safe" evidence instead.

No-symptom evidence:

```text
if symptom_severity <= 0.20:
  new_evidence_score = 0
  negative_evidence_strength = frequency_score * (1 - symptom_severity)
```

This prevents the model from only learning bad reactions.

### Step 6: Update User IBS Table

Store for each user/ingredient:

```text
grade in [0, 1]
confidence in [0, 1]
evidence_count
```

Recommended update formula:

```text
learning_rate = min(0.35, 1 / (evidence_count + 2))

if symptom_severity > 0.20:
  updated_grade =
    old_grade * (1 - learning_rate)
    + new_evidence_score * learning_rate
else:
  safe_score = 0
  updated_grade =
    old_grade * (1 - learning_rate * negative_evidence_strength)
    + safe_score * (learning_rate * negative_evidence_strength)

updated_confidence =
  min(1, old_confidence + 0.08 + 0.04 * frequency_score)

updated_evidence_count =
  old_evidence_count + 1
```

Why this formula:

- Early evidence moves the grade noticeably.
- Later evidence moves it less, so one bad day cannot destroy a mature profile.
- Good/no-symptom reports can lower risk slowly.
- Confidence grows with repeated evidence.

Status labels for display:

```text
grade >= 0.75 and confidence >= 0.45 -> likely trigger
grade >= 0.45 -> watch list
grade <= 0.20 and confidence >= 0.45 -> usually tolerated
otherwise -> unknown
```

### Step 7: Abort/Incomplete Flow Rule

Only commit updates after all required information exists:

```text
symptom severity exists
0-8h meal list exists
9-16h meal list exists
17-24h meal list exists
at least one IBS ingredient matched
```

If the user stops early, closes chat, or gives insufficient data:

```text
do not update user_ibs_ingredient_risks
show gentle message: "No worries, I won't update your IBS profile until we have a complete check-in."
```

For first implementation, keep the in-progress check-in in React state only. If the page reloads, it is discarded.

## Downstream Recommendation Usage

This task should not rerank the recommender.

This task should:

- add profile data
- add symptom/meal check-in
- maintain `user_ibs_ingredient_risks`
- show the user that Tamar is learning possible IBS triggers
- possibly display "watch list" information in chat or future recipe detail UI

Later, the recommender owner can consume the table. A possible downstream formula is:

```text
recipe_ibs_risk =
average user grade for matched IBS ingredients in recipe

final_score =
preference_score - lambda * recipe_ibs_risk
```

If recommendation usage is implemented later, update `docs/IBS_Recommender_Online_LightFM_Design.md` in that teammate's change.

Current implementation status:

- IBS ingredient catalog and aliases are implemented in code.
- Visible IBS cold-start onboarding is implemented.
- Supabase migration for personal IBS tables is implemented.
- `How I Feel` chat check-in is implemented through a Gemini JSON interviewer.
- Tamar code validates Gemini output and owns all ingredient/risk math.
- Recommendation ranking remains unchanged.

Deployment TODO:

- `GEMINI_TAMAR_API_KEY` is configured locally in `.env.local` for development testing.
- Add `GEMINI_TAMAR_API_KEY` in Vercel server environment variables before testing `How I Feel` online.
- Until that Vercel key exists, online IBS cold-start can be tested, but online Gemini chat check-ins will fail at `/api/ibs-check-in`.

## Handoff Status As Of 2026-06-21

Completed and verified locally:

- Supabase migration `20260621000000_create_ibs_tables.sql` was applied to project `mmibbykyywwgcigvsrwe`.
- Cold-start IBS questionnaire saved successfully to Supabase.
- `user_ibs_profiles` receives `onboarding_completed_at`.
- `user_ibs_ingredient_risks` receives per-user ingredient rows with `grade`, `confidence`, and `evidence_count`.
- Local `GEMINI_TAMAR_API_KEY` was added to `.env.local`.
- `/api/ibs-check-in` was tested locally and returns structured Gemini JSON.
- The chat severity question now clarifies: `0 means no symptoms/good, 1 means very severe/bad`.
- `npm run test -- ibsRisk` passed.
- `npm run build` passed.

Still left:

- Add Vercel production env vars in the existing Vercel project:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `GEMINI_TAMAR_API_KEY`
- Redeploy the existing Vercel project.
- Test online `/` for IBS cold-start.
- Test online `/app?tab=chat` for `How I Feel`.
- Optional: seed the global `ibs_ingredients` Supabase table if a teammate wants to query the catalog from the database instead of code.
- Before final production/submission, consider rotating secrets that were shared during setup.

## Current Decisions

These are the proposed decisions unless changed by the user:

1. Use Supabase persistence for `user_ibs_ingredient_risks`.
2. Use a visible IBS cold-start onboarding flow.
3. Use Gemini as a structured IBS check-in interviewer.
4. Gemini returns `feeling` plus three food-window lists.
5. Tamar code validates Gemini output, parses foods into IBS ingredients, computes evidence, and updates ranks.
6. Do not update profile unless the full `How I Feel` flow completes.
7. Do not rerank recipes in this task.
8. Keep all medical wording careful and non-diagnostic.
