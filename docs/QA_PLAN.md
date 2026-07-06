# Tamar Website QA Plan

Last updated: 2026-07-06

This plan is written for testers who have not used Tamar before. It explains the product language, the routes to visit, the accounts and data needed, and the manual checks to run across desktop and phone.

## 1. Product Primer

Tamar is an IBS-aware recipe recommendation website. It combines recipe discovery, saved cooklists, meal logging, symptom check-ins, food-pattern analysis, chat-guided logging, and a motivational Tamar tree habit loop.

Important words:

- **Home**: The main recipe page. Shows recommendation rows such as Curated for You and other recipe rows.
- **CookBook**: The saved recipe area. Users can organize saved catalog recipes and personal recipes into cooklists.
- **Chat**: Tamar's chat assistant. It can recommend recipes, log food, add recipes, run How I Feel check-ins, and help log recipe feedback.
- **Diary**: The private food and symptom timeline. A meal waters the Tamar tree. A how-you-feel check-in composts it.
- **Analysis**: A private pattern view. It shows foods to watch, easier foods, recent meal and symptom trends, nutrition, testing suggestions, and the Tamar Record.
- **Sapling**: The default plan for signed-in users. It includes 30 days of premium feature access from account creation.
- **Canopy+**: The premium plan. Checkout is currently intentionally "coming soon".
- **Tamar tree**: A habit companion. Meal logs give water, how-you-feel check-ins give compost, and both on the same local date grow the tree at most once.

Health and safety rule for QA: Tamar should describe patterns, not diagnoses. It should not say the user is definitely allergic, intolerant, or sensitive unless the user explicitly stored that as a strict restriction or allergy.

## 2. Scope

This QA pass covers:

- Public landing and auth.
- Signed-in navigation.
- Home recommendations and first-run onboarding.
- Search and recipe detail pages.
- Saving recipes and cooklist management.
- CookBook recommendations and personal recipes.
- Chat flows.
- Diary meal logs, check-ins, image uploads, nutrition, and timeline editing.
- Analysis dashboard, chart states, next-step suggestions, and Tamar Record.
- Sapling, expired Sapling, and Canopy+ access behavior.
- Tamar tree progression from sapling to canopy and beyond.
- Phone and responsive testing.
- Accessibility, copy, privacy, error states, and basic performance.

For an all-features pass, no user-facing feature should be left as "assumed covered". If a feature cannot be tested because data, keys, devices, or developer access are missing, mark it as blocked in the feature inventory and include the blocker in the final QA summary.

Out of scope unless a developer is present:

- Deep model quality evaluation for LightFM or XGBoost.
- Medical correctness claims beyond copy safety and product behavior.
- Payment processor testing, because Canopy+ checkout is not live.

### 2.1 Complete Feature Inventory And Sign-Off

Use this as the master all-features checklist. Testers should mark every row as Pass, Fail, Blocked, or Not applicable, and attach bug IDs for failures.

| Feature area | Must test |
| --- | --- |
| Public landing | Hero image rotation, brand/header, sign-in CTA, sign-up CTA, benefit cards, responsive first viewport. |
| Authentication | Email sign-up, email sign-in, Google sign-in button, invalid credentials, missing Supabase config, sign-out, account dialog, plan label in account dialog. |
| App shell | Route guarding, loading state, not-found route, desktop navbar, mobile menu, active nav state, floating chat button, docked chat layout. |
| Search | Open/close modal, empty suggestions, name search, ingredient search, no-result state, result navigation, phone keyboard. |
| First-run guide | Home, CookBook, Chat, Analysis, Diary, Search, Quick Log spotlight steps; Next, Back, Skip, Start setup; resize and phone behavior. |
| Taste onboarding | Cold-start recipes, Like, Dislike, Skip, progress dots, busy state, saved `liked`/`dismissed` interactions, Retrain Taste. |
| IBS onboarding | All IBS question screens, option buttons, back button, progress bar, final save, migration-missing error, non-diagnostic copy. |
| Home recommendations | Curated for You, Trending in Your Area, Bursting with Flavor, Healthy & Mindful, Quick & Satisfying, loading skeletons, fallback recipes, gentle labels. |
| Recipe cards | Open detail, save to Liked, open cooklist picker, create cooklist, remove from all cooklists, play feedback, details overlay, desktop hover, phone touch. |
| Recipe images | Trusted cache behavior, curated fallback images, duplicate-image avoidance, blocked bad image slugs, skeletons, empty-plate fallback only when needed. |
| Recipe detail | Loading, valid recipe, invalid recipe, back button, viewed interaction, ingredients, directions, IBS-friendly badge, Log through chat. |
| CookBook lists | Default Liked list, create list, rename list, delete list, default-list protection, drag between lists, empty list states, search. |
| CookBook catalog recipes | Saved recipe display, catalog detail navigation, started interaction, cooklist membership picker, unsave behavior. |
| CookBook personal recipes | Manual personal recipe, selected cooklist, image attachment, Add recipe from image, photo suggestion, preview modal, no catalog interaction insertion. |
| CookBook recommendations | Stored cookbook recommendation arrays, local fallback, personal recipe ranking, desktop sidebar, mobile placement. |
| Chat surface | Full chat page, docked chat, chips, message history, typing state, camera attach availability, long message wrapping. |
| Chat recommendations | Recommend Me chip, natural-language recommendation request, personalized row usage, fallback recommendations, no invented catalog ranking. |
| Chat food logging | Text meal log, image-assisted meal log, unrecognized image, add-to-CookBook prompt, cooklist creation, Diary visibility. |
| Chat personal recipe | Add Recipe chip, labeled text parsing, cooklist target, image as recipe image, CookBook visibility, no meal log. |
| Chat How I Feel | Start check-in, continue conversation, complete symptom report, complete no-symptom report, Diary visibility, IBS risk update where data exists. |
| Chat Analyze my Lunch/general AI | Analyze my Lunch chip and free text use general chat response, signed-in RAG context where available, graceful Gemini failure. |
| Recipe feedback chat | Explicit ate/not-ate confirmation, recipe-backed meal log, completed interaction, liked/dismissed feedback, health report, CookBook prompt. |
| Diary meal logging | Manual meal, time, portion, unit, notes, cookbook picker, history picker, save, edit, delete, recent timeline, add to cooklist. |
| Diary image flows | Normal meal image attachment, Add meal from image, draft suggestion, Use button, remove image, upload failure, premium gate. |
| Diary nutrition | Manual calories/protein/fat, Auto calculate, catalog source, Gemini estimate source, edit nutrition, expired Sapling lock. |
| Diary check-ins | Symptom type, severity slider, no-symptom toggle, notes, save, timeline display, tree compost. |
| Analysis | Empty state, loading, error, stats, foods to watch, easier foods, strongest signal, recent pattern chart, nutrition chart, content-based testing suggestions. |
| Tamar Record | Current tree state, best run, best streak, reward count, replant history, read-only behavior. |
| Sapling and Canopy+ | Active Sapling, expired Sapling, Canopy+ metadata, reminder throttling, premium lock panels, Pricing page, payment-coming-soon dialog. |
| Tamar tree | Water, compost, same-day growth once, streak, death after seven missed days, replant, milestones at 7/30/100/200/300, reward toasts. |
| Insights popover | Signed-out prompt, unread badge, stale meal nudge, feeling nudge, tree nudges, cookbook nudge, navigation. |
| API and recommender | Refresh recommendations, fallback recommendations, meal-log bridge, health-report bridge, food image analysis, nutrition estimate, image fill. |
| Privacy and RLS | Cross-user isolation for meals, reports, check-ins, cooklists, personal recipes, uploads, recommendation rows, tree runs, reward events. |
| Phone and responsive | All major flows on small iPhone, modern iPhone, Android Pixel, small Android, portrait, landscape, camera capture, keyboard. |
| Accessibility | Keyboard, focus, dialogs, labels, icon button names, color contrast, screen-reader smoke checks. |
| Resilience | Supabase down, Gemini down, recommender down, storage failure, slow network, localStorage unavailable, missing migrations. |
| Performance and polish | Scroll smoothness, no repeated request loops, skeletons, image load behavior, build/test/lint results. |

### 2.2 Feature Coverage Map

Use this map to find the detailed scripts for each feature area.

| Feature area | Detailed section |
| --- | --- |
| Landing, auth, account | Sections 9 and 18 |
| Navigation, app shell, search, insights | Sections 10, 12, and 20 |
| First-run guide, taste onboarding, IBS onboarding, Home recommendations | Section 11 |
| Recipe cards, recipe images, recipe detail | Sections 11 and 13 |
| CookBook and personal recipes | Section 14 |
| Chat and AI flows | Section 15 |
| Diary, image uploads, nutrition, check-ins | Section 16 |
| Analysis and Tamar Record | Section 17 |
| Sapling, expired Sapling, Canopy+ and Pricing | Section 18 |
| Tamar tree growth/death/replant/milestones | Section 19 |
| Phone, accessibility, privacy, resilience, performance | Sections 21 through 25 |
| Automated checks and final sign-off | Sections 26 and 27 |

## 3. Time Budget

For a several-hour QA session, use this order:

1. **30 minutes**: Setup, account access, device matrix, and smoke tests.
2. **20 minutes**: Assign owners and statuses for the complete feature inventory.
3. **60 minutes**: Landing, auth, navigation, Home, search, recipe detail, and recipe saving.
4. **75 minutes**: Diary, Chat, CookBook, image uploads, and personal recipe flows.
5. **60 minutes**: Analysis, Sapling to Canopy+ gates, Pricing, and Tamar tree state coverage.
6. **60 minutes**: Phone testing on real devices, rotation, touch gestures, accessibility, and error states.
7. **30 minutes**: Regression pass, bug cleanup, screenshots, inventory reconciliation, and final summary.

If time is limited, prioritize P0/P1 flows: sign in, recipe recommendations, save to CookBook, log a meal, log a check-in, Analysis loads safely, Sapling/Canopy+ gates are correct, and the phone layout is usable.

## 4. Setup

### 4.1 Local App

Follow [docs/LOCAL_SETUP_WITH_RECOMMENDER.md](LOCAL_SETUP_WITH_RECOMMENDER.md).

Typical local URLs:

- Website: `http://127.0.0.1:8080`
- Python recommender service: `http://127.0.0.1:8000`
- Recommender health check: `http://127.0.0.1:8000/health`

Useful commands:

```powershell
npm install
npm run dev
npm run test
npm run build
npm run lint
```

If the Python recommender service is not available, the website should still show fallback recipe and Diary behavior where designed. Log this in the QA notes so failures are not misattributed.

### 4.2 Required Environment

Ask the test lead or developer to confirm:

- Supabase URL and publishable key are configured in `.env.local`.
- Supabase migrations have been applied in filename order.
- Recipe data exists in `recipes`.
- Auth providers needed for the pass are enabled.
- `GEMINI_TAMAR_API_KEY` is configured if testing chat, image analysis, and nutrition estimates.
- `RECOMMENDER_SERVICE_URL` and `RECOMMENDER_SERVICE_SECRET` are configured if testing personalized recommendation refresh.
- Storage bucket `user-uploads` exists if testing meal or recipe images.

### 4.3 Test Accounts

Prepare these accounts before the session. Use separate email addresses so privacy and RLS checks are possible.

| Account | State | Why it matters |
| --- | --- | --- |
| A0 Anonymous | Signed out | Landing, auth prompts, private-route behavior. |
| A1 New Sapling | Created today, no logs, no saved recipes | First-run guide, cold start, empty states. |
| A2 Active Sapling | Created 1-29 days ago | Premium features visible, reminders shown but features still usable. |
| A3 Expired Sapling | Created at least 30 days ago, no Canopy+ metadata | Premium gates, blocked image uploads, hidden macro/testing features. |
| A4 Canopy+ | `app_metadata` marks Canopy+ | Full feature access, no upgrade prompts. |
| A5 Returning user | Saved recipes, cooklists, meals, check-ins, recommendations | Rich dashboards, search, edit/delete, insight nudges. |
| A6 Privacy pair | Two normal users with distinct data | Verify one user never sees another user's private data. |

Canopy+ metadata is read from `app_metadata`, not user-editable metadata. Supported flags include `canopy_plus`, `tamar_canopy`, `is_canopy_plus`, or plan-like values such as `canopy_plus` on `tamar_plan`, `plan`, or `subscription_tier`.

### 4.4 Tree Fixture States

Ask a developer or admin to provide test users or seeded rows for these Tamar tree states:

| Tree state | Minimum expected UI |
| --- | --- |
| Fresh run | Level 0, Sapling ground, needs water and compost. |
| Water only today | Watered, needs compost, no growth today. |
| Compost only today | Composted, needs water, no growth today. |
| Full care today | Watered, composted, grew today, level increased once. |
| Repeated care today | Additional meals/check-ins do not add another level today. |
| Six days without care | Warning or low days-to-death value. |
| Seven days without care | Dead state and Replant Tamar button. |
| Replanted after death | New level 0 run, previous best level/streak preserved in Analysis. |
| Level 7 | Zone label Young oasis. |
| Level 30 | Zone label Fruit canopy. |
| Level 100 | Zone label Cloud canopy. |
| Level 200 | Zone label Atmosphere. |
| Level 300 | Zone label UFO grove. |

## 5. Test Devices

### 5.1 Desktop And Tablet

Test at least:

- 1440 x 900 desktop Chrome.
- 1366 x 768 laptop Chrome or Edge.
- 1024 x 768 tablet landscape.
- 768 x 1024 tablet portrait.

### 5.2 Phone

Use real phones when possible. Browser emulation is a backup, not a replacement.

Minimum phone matrix:

- iPhone SE size, Safari, 375 x 667.
- iPhone 13/14/15 size, Safari, around 390 x 844.
- Android Pixel size, Chrome, around 412 x 915.
- Small Android size, Chrome, 360 x 800.

For each phone:

- Test portrait and landscape.
- Test with browser zoom/default text size.
- Test touch targets with thumb use.
- Test keyboard opening on text fields.
- Test camera capture prompts for image flows.
- Test slow network mode if available.

## 6. Severity Guide

- **P0 Blocker**: Cannot sign in, main app unusable, data leak, app crash, wrong user data visible, or health/diagnosis copy is unsafe.
- **P1 High**: Core flow broken, premium gate incorrect, meal/check-in not saved, tree grows incorrectly, phone layout blocks key actions.
- **P2 Medium**: Important but recoverable issue, confusing copy, chart empty when data exists, non-critical action missing on one browser.
- **P3 Low**: Visual polish, minor alignment, non-blocking copy issue, rare edge case.

## 7. Bug Report Template

Use this structure for every bug:

```text
Title:
Severity:
Environment:
Account/persona:
Route:
Device/browser:
Steps to reproduce:
Expected:
Actual:
Screenshots/video:
Console/network errors:
Data notes:
```

Good titles are specific: "Expired Sapling can still upload Diary meal photo" is better than "Upload bug".

## 8. General Smoke Pass

Run this first on desktop and one phone.

- [ ] App opens without a blank screen.
- [ ] Console has no repeated red errors during normal navigation.
- [ ] Public landing appears when signed out.
- [ ] Signed-in users reach Home at `/`.
- [ ] Navbar links work: Home, CookBook, Chat, Analysis, Diary.
- [ ] Unknown routes show the not-found page without crashing.
- [ ] Search opens, accepts text, shows results or an empty state.
- [ ] Floating "Talk to Tamar" button opens a docked chat on signed-in pages.
- [ ] Refreshing a deep route keeps the correct page.
- [ ] Sign out returns the user to public/private-safe state.

## 9. Landing And Auth

Routes: `/`

### Anonymous Landing

- [ ] Verify logo, Sign in, Sign up, hero copy, and three benefit cards are visible.
- [ ] Hero image rotation does not cause layout shifts or text overlap.
- [ ] Buttons open the auth dialog in the correct mode.
- [ ] Dialog can switch between sign in and sign up if supported.
- [ ] Invalid credentials show a friendly error.
- [ ] Closing dialog returns to landing without stuck overlays.
- [ ] On phone, header buttons fit and the hero does not create horizontal scrolling.

### Authenticated Redirect

- [ ] Sign in from landing.
- [ ] User lands on Home.
- [ ] Reload `/`, `/cookbook`, `/app?tab=diary`, and `/pricing`; user stays signed in.
- [ ] Sign out from the account control or mobile menu.
- [ ] Private pages no longer expose private data after sign out.

## 10. Navigation And Global UI

### Desktop Navbar

- [ ] Logo navigates Home.
- [ ] Active nav item is visually clear.
- [ ] Canopy+ CTA appears for non-Canopy signed-in users.
- [ ] Canopy+ CTA is hidden for Canopy+ users.
- [ ] Search icon opens modal; Escape or close exits cleanly.
- [ ] Insights popover opens and its badge clears after opening.
- [ ] Tamar tree badge opens and can navigate to Diary or Chat.

### Mobile Menu

- [ ] Hamburger opens a right-side sheet.
- [ ] Sheet includes Canopy+ CTA for non-Canopy users.
- [ ] Each nav item closes the sheet and navigates correctly.
- [ ] Account area shows the signed-in user and sign-out control.
- [ ] The sheet is scrollable on small phones.
- [ ] No nav item is hidden by browser bottom bars or notches.

## 11. Home Recommendations

Route: `/`

### New User First Run

- [ ] New Sapling sees the first-run guide.
- [ ] Begin setup leads to taste and/or IBS personalization steps.
- [ ] Skip setup closes the guide and shows general recommendations.
- [ ] Skipping does not create fake dislikes or IBS questionnaire answers.
- [ ] Retrain Taste appears once onboarding is complete.
- [ ] Like/Dislike cards advance one at a time and save feedback.
- [ ] Final onboarding action returns to recommendation rows.
- [ ] If recommendation refresh fails, the page falls back instead of going blank.

### Guided Product Tour

- [ ] Tour spotlights Home, CookBook, Chat, Analysis, Diary, Search, and Quick Log in order.
- [ ] Next advances one step at a time.
- [ ] Back returns to the previous step and is disabled on the first step.
- [ ] Skip closes the tour immediately.
- [ ] Start setup closes the final step and continues to personalization.
- [ ] Spotlight targets remain correctly positioned after scrolling or resizing.
- [ ] On phone, tour cards fit inside the viewport and can be completed without hidden controls.

### IBS Personalization

- [ ] IBS personalization card appears for users who have not completed it and did not skip setup.
- [ ] Each question shows prompt, progress, five option buttons, and non-diagnostic copy.
- [ ] Option taps advance the questionnaire.
- [ ] Back returns to the previous IBS question.
- [ ] Final answer saves the profile and removes the card.
- [ ] Save failure shows a friendly retry/error state.
- [ ] Missing IBS database tables show migration-specific guidance instead of a blank crash.
- [ ] Skipping the overall setup does not save IBS answers.

### Recommendation Rows

- [ ] Curated for You loads recipes.
- [ ] Other rows load or show skeletons until available.
- [ ] Trending in Your Area loads recipes or an intentional fallback.
- [ ] Bursting with Flavor loads recipes or an intentional fallback.
- [ ] Healthy & Mindful loads recipes or an intentional fallback.
- [ ] Quick & Satisfying loads recipes or an intentional fallback.
- [ ] Recipe cards show image, title, match, time, and gentle label where applicable.
- [ ] Horizontal carousel scroll buttons work on desktop.
- [ ] Horizontal swipe works on phone.
- [ ] Placeholder images show a clean fallback, not broken image icons.
- [ ] Repeated or duplicate image behavior looks acceptable within a row.

### Recipe Card Actions

- [ ] Clicking the card opens the recipe detail page.
- [ ] Play button opens chat feedback for the recipe.
- [ ] Plus button saves an unsaved recipe to the default Liked cooklist.
- [ ] Saved recipe state changes to a check mark.
- [ ] Clicking a saved recipe check mark opens the cooklist picker.
- [ ] Cooklist picker can add and remove the recipe from lists.
- [ ] Creating a new cooklist from the picker works.
- [ ] Removing a recipe from all cooklists removes it from saved state.
- [ ] Info/details button expands prep time and ingredient summary without navigating.
- [ ] On phone, all card actions are reachable without hover-only behavior. If a touch user cannot reveal or tap card controls, file P1.

## 12. Search

Global search modal.

- [ ] Open search from desktop navbar.
- [ ] Open search from phone navbar.
- [ ] Empty query shows suggested/default recipes.
- [ ] Query by recipe name returns matching recipes.
- [ ] Query by ingredient returns matching recipes.
- [ ] No-result state is friendly and does not look broken.
- [ ] Clicking a result navigates to `/recipes/:recipeId`.
- [ ] Search state clears after choosing a result.
- [ ] Images and text fit inside the search result cards on phone.

## 13. Recipe Detail

Route: `/recipes/:recipeId`

- [ ] Valid recipe loads title, image, prep time, IBS-friendly badge when available, ingredients, and directions.
- [ ] Loading state appears while data is being fetched.
- [ ] Invalid recipe id shows Recipe not found with a route back.
- [ ] Back button returns to previous page.
- [ ] Signed-in view records a `viewed` interaction.
- [ ] Log through chat opens docked chat and asks for explicit meal confirmation.
- [ ] If user says no in chat, no meal log is created.
- [ ] If user says yes, meal log and completed interaction are created only after confirmation.
- [ ] Phone layout keeps hero title readable and ingredient list usable.

### Recipe Image Behavior

- [ ] Trusted manual/admin cached image rows display when valid.
- [ ] Automatic image rows do not override better curated category fallbacks where designed.
- [ ] Known non-food image slugs such as books, notebook, desk, office, or document fall back to food imagery.
- [ ] Duplicate image URLs in one visible row are replaced with deterministic fallback images when possible.
- [ ] Duplicate checks ignore query-string differences on the same image.
- [ ] Fallback image choice stays stable across page refreshes for the same recipe.
- [ ] Recipe row membership, order, and match scores do not change because of image fallback decisions.
- [ ] `/api/fill-recipe-images` can be queued from Home when the user has a session token.
- [ ] If Pexels or image-fill env vars are unavailable, recipes still render with local fallback images.

## 14. CookBook

Route: `/cookbook`

### Empty And Signed Out

- [ ] Anonymous user sees a private or sign-in-safe state.
- [ ] New signed-in user gets a default Liked cooklist.
- [ ] Empty cooklists have clear empty states.

### Cooklists

- [ ] Create a new cooklist.
- [ ] Duplicate or same-name behavior is friendly and deterministic.
- [ ] Rename a non-default cooklist.
- [ ] Delete a non-default cooklist.
- [ ] Default Liked cooklist cannot be renamed/deleted.
- [ ] Drag a recipe from one cooklist to another on desktop.
- [ ] On phone, drag-and-drop absence does not block basic cooklist management.
- [ ] Search filters saved recipes by title, description, or ingredients.

### Saved Catalog Recipes

- [ ] Saved recipes from Home appear in CookBook.
- [ ] Catalog recipe card opens recipe detail.
- [ ] Play button records started interaction and navigates to detail.
- [ ] Cooklist picker updates memberships.
- [ ] Removing the final membership removes the saved interaction.

### Personal Recipes

- [ ] Open personal recipe form.
- [ ] Required title validation works.
- [ ] Save personal recipe to a selected cooklist.
- [ ] Personal recipes do not create catalog recommendation interactions.
- [ ] Personal recipe preview opens from the card.
- [ ] Ingredients and steps preserve useful formatting.
- [ ] Personal recipe image field saves an image attachment.
- [ ] Add recipe from image uploads a photo, analyzes it, and fills draft fields only after user confirmation or explicit Use behavior.
- [ ] Photo analysis does not create meal logs or catalog recipes by itself.

### CookBook Recommendations

- [ ] Sidebar/section shows "from your CookBook" style recommendations when there is saved data.
- [ ] Recommendations are limited to recipes already in the user's cooklists.
- [ ] Personal recipes can appear through heuristic/local ranking.
- [ ] If stored cookbook recommendation columns are missing or stale, local fallback still shows usable recommendations.
- [ ] On phone, recommendations move above or near sections and remain readable.

## 15. Chat

Route: `/app?tab=chat`; docked chat from floating button or recipe card.

### General Chat Surface

- [ ] Chat header, chips, input, send button, and camera button are visible.
- [ ] Chips include Recommend Me, Log Food, Add Recipe, How I Feel, and Analyze my Lunch.
- [ ] Messages scroll to latest.
- [ ] Long messages wrap without clipping.
- [ ] Docked chat can be closed.
- [ ] Full chat page does not also show a docked chat.

### General AI And Analyze My Lunch

- [ ] Analyze my Lunch chip sends a normal chat message through the general Tamar backend.
- [ ] Free-text questions send through `/api/generate`.
- [ ] Signed-in requests include the session token when available.
- [ ] Tamar may use recent meals, check-ins, restrictions, recipe activity, and current recommendations as private context when relevant.
- [ ] The chat answer does not expose raw ids, table names, prompts, model internals, or private records.
- [ ] General chat does not create meal logs, health reports, recipe interactions, cooklists, or recommendations unless the user enters a dedicated save flow.
- [ ] If Gemini is unavailable, the user sees a clear error and can keep using the app.

### Recommend Me

- [ ] Signed-in user asking Recommend Me triggers recommendation refresh/read.
- [ ] Chat response uses current recommendation rows, not invented catalog items.
- [ ] If no personalized rows exist, fallback response is clear.
- [ ] Recommendation response does not create meal logs by itself.

### Log Food

- [ ] Anonymous user is prompted to sign in before saving.
- [ ] Signed-in user starts Log Food flow.
- [ ] Entering a simple meal name saves it to Diary.
- [ ] Chat asks whether to add the food to CookBook when appropriate.
- [ ] If adding to CookBook, user can specify a cooklist name.
- [ ] Image attach is enabled during Log Food.
- [ ] On active Sapling/Canopy+, image upload works.
- [ ] On expired Sapling, image upload is blocked by Canopy+ prompt.
- [ ] Photo suggestion can be accepted by replying yes or replaced by typing another meal name.
- [ ] Unrecognized food photo asks for a manual meal name.

### Add Recipe

- [ ] Add Recipe flow asks for recipe name and optional cooklist/ingredients/steps.
- [ ] User can add a personal recipe by text.
- [ ] Image attach saves as personal recipe image by default.
- [ ] Add Recipe does not log the recipe as eaten.
- [ ] Personal recipe appears in CookBook.

### How I Feel

- [ ] How I Feel starts the structured IBS check-in.
- [ ] User can report symptoms and recent foods.
- [ ] User can report feeling okay/no symptoms.
- [ ] Completed check-in appears in Diary.
- [ ] Collected foods also appear as meal history when implemented for that flow.
- [ ] Copy stays plain and non-diagnostic.
- [ ] Errors show a retry-friendly message.

### Recipe Feedback Chat

- [ ] Play button from Home or recipe detail opens recipe feedback.
- [ ] Chat asks whether the user ate the selected recipe.
- [ ] "No" stops without writing meal or health evidence.
- [ ] "Yes" creates a recipe-backed meal log.
- [ ] Chat asks whether the user liked it and records liked/dismissed when clear.
- [ ] Chat asks how the user feels and saves a health report.
- [ ] Saved feedback appears in Diary and can influence later pattern/recommendation refreshes.

## 16. Diary

Route: `/app?tab=diary`

### Empty And Header

- [ ] Anonymous user sees sign-in-safe private diary copy.
- [ ] Signed-in user sees stats: Meals today, Check-ins today, Rough notes saved.
- [ ] Refresh button reloads data without duplicating entries.
- [ ] Tamar tree panel appears for signed-in users.

### Add Meal

- [ ] Save meal with only a name and time.
- [ ] Save meal with portion size and unit.
- [ ] Save meal with notes.
- [ ] Save meal from CookBook picker.
- [ ] Save meal from recent history picker.
- [ ] Search picker switches between Cookbook and History.
- [ ] Required meal name validation works.
- [ ] Successful save appears in Recent diary.
- [ ] Save triggers Tamar tree water state.
- [ ] Image attachment works for active Sapling and Canopy+.
- [ ] Add meal from image uploads, analyzes, fills draft suggestions, and still requires Save meal.
- [ ] Image analysis alone does not create durable meal evidence.

### Nutrition

- [ ] Active Sapling sees calories, protein, fat, and Auto calculate.
- [ ] Canopy+ sees calories, protein, fat, and Auto calculate.
- [ ] Expired Sapling sees Canopy+ feature panel instead of editable macro fields.
- [ ] Manual macro values are saved with the meal when feature access exists.
- [ ] Auto calculate fills editable nutrition values.
- [ ] Catalog recipe nutrition is used when available.
- [ ] Gemini estimate is used for free-text/photo-assisted meals when configured.
- [ ] If estimate fails, the meal form remains usable.

### Add How You Feel

- [ ] Save a symptom check-in with type, severity, time, and notes.
- [ ] "I feel good right now" disables symptom type and sets severity to 0.
- [ ] Severity slider changes the label and value.
- [ ] Save check-in appears in Recent diary.
- [ ] Save check-in triggers Tamar tree compost state.
- [ ] Copy frames this as tracking, not diagnosis.

### Recent Diary

- [ ] Recent diary groups entries by day.
- [ ] Search filters meals, chat-food entries, recipes, and check-ins.
- [ ] Meal entries show image/nutrition/notes when present.
- [ ] User-owned meal logs can be edited.
- [ ] User-owned meal logs can be removed after confirmation.
- [ ] Chat-derived/read-only entries do not expose edit/delete unless backed by a meal log.
- [ ] Add to cooklist opens cooklist picker for food-history entries.
- [ ] On phone, edit dialog fits within viewport and scrolls.

## 17. Analysis

Route: `/app?tab=analysis`

### Empty And Loading

- [ ] Anonymous user sees private analysis sign-in copy.
- [ ] New user with no logs sees an empty state asking for meals and check-ins.
- [ ] Loading state is visible and not stuck.
- [ ] Error state says analysis is unavailable without exposing raw internals.

### Dashboard Content

- [ ] Header says this is a pattern view, not a diagnosis.
- [ ] Stats show meals logged, how-you-felt notes, rougher notes, and easier notes.
- [ ] Foods to watch use friendly labels such as Strong signal, Worth watching, or Early clue.
- [ ] Foods that seem easier use friendly labels such as Usually goes well.
- [ ] No section says a user is definitely sensitive/allergic/intolerant unless explicit restriction data exists.
- [ ] Recent pattern chart shows meals and average symptom level.
- [ ] Tamar Record shows current tree level, streaks, best run, reward count, and replant history.
- [ ] Recipe experiment links open valid recipe detail pages.

### What To Test Next Similarity Algorithm

The current implementation in `src/lib/analysis.ts` uses weighted token vectors and cosine similarity over already recommended recipe candidates. This is TF-style content matching, but it is not strict TF-IDF because it does not compute inverse document frequency across the candidate corpus. If the product requirement is true TF-IDF, file a bug or implementation task.

- [ ] Testing suggestions are drawn only from the current recommended recipe candidate pool.
- [ ] Recipe text includes title, ingredients, and description.
- [ ] User profile text includes easier foods and recent meal names.
- [ ] Ingredient tokens are weighted more strongly than description tokens.
- [ ] Candidate recipes already logged by the user are excluded.
- [ ] Candidate recipes containing stronger watchlist ingredients are penalized.
- [ ] Higher cosine-similarity candidates rank above weaker matches when penalties are equal.
- [ ] If no candidate has positive similarity, no recipe experiment card is shown.
- [ ] Suggested recipe card links to the matching recipe detail page.
- [ ] The UI does not expose algorithm terms such as TF-IDF, cosine similarity, or vector score to end users.

### Canopy+ Gates In Analysis

- [ ] Active Sapling sees nutrition chart and What to test next.
- [ ] Active Sapling may see a reminder dialog, but can continue.
- [ ] Expired Sapling sees macro tracking Canopy+ panel.
- [ ] Expired Sapling sees testing suggestions Canopy+ panel.
- [ ] Canopy+ sees all features with no upgrade prompt.
- [ ] Pricing link from feature panel opens `/pricing`.

## 18. Sapling And Canopy+ Plan QA

Routes: `/pricing`, plus Diary, Analysis, CookBook, and Chat image flows.

### Pricing Page

- [ ] Page loads for signed-in users.
- [ ] Back button returns to the previous page.
- [ ] Current plan label is correct: Sapling or Canopy+.
- [ ] Three plans appear: Single month, 6 months, Year.
- [ ] Choosing each plan opens Payment coming soon dialog.
- [ ] Dialog copy names the chosen plan.
- [ ] Got it closes the dialog.
- [ ] Phone layout stacks plans cleanly and prices fit.

### Active Sapling

- [ ] Plan label says Sapling.
- [ ] Macro tracking is visible in Diary.
- [ ] Camera uploads are allowed.
- [ ] Analysis nutrition and testing suggestions are visible.
- [ ] Image upload reminder may appear once per day and has Continue uploading.
- [ ] Analysis reminder may appear every two local days and has Keep exploring.
- [ ] Reminders do not appear on every navigation after being dismissed.

### Expired Sapling

- [ ] Plan label still says Sapling.
- [ ] Macro tracking fields are replaced with Canopy+ panel.
- [ ] Diary image upload is blocked and shows Camera uploads are in Canopy+.
- [ ] Chat image upload is blocked in attach-enabled flows.
- [ ] CookBook recipe image upload is blocked.
- [ ] Analysis nutrition chart is hidden behind Canopy+ panel.
- [ ] Analysis testing suggestions are hidden behind Canopy+ panel.
- [ ] Upgrade prompt navigates to Pricing.
- [ ] The user can still use non-premium basics: browse recipes, save recipes, create cooklists, log meal names, log check-ins, and use non-image chat.

### Canopy+

- [ ] Plan label says Canopy+.
- [ ] Navbar Canopy+ CTA is hidden.
- [ ] Premium reminders do not appear.
- [ ] Diary macro fields are visible.
- [ ] Image uploads are allowed in Diary, Chat, and CookBook.
- [ ] Analysis nutrition and testing suggestions are visible.
- [ ] Pricing still shows coming-soon checkout if visited directly.

### Boundary Dates

- [ ] Account created now: 30 days remaining.
- [ ] Account created 29 days ago: 1 day remaining and feature access still true.
- [ ] Account created exactly 30 days ago: feature access false.
- [ ] Account created 31+ days ago: feature access false.
- [ ] Canopy+ metadata overrides trial age and keeps feature access true.
- [ ] Local date calculations behave correctly around midnight.

## 19. Tamar Tree QA

Routes: `/app?tab=diary`, navbar tree badge, Insights popover, `/app?tab=analysis`.

### Basic Care Rules

- [ ] Fresh user starts at level 0, Sapling ground.
- [ ] Meal log waters the tree.
- [ ] How-you-feel check-in composts the tree.
- [ ] Water only does not grow the tree.
- [ ] Compost only does not grow the tree.
- [ ] Water and compost on the same local date grow the tree once.
- [ ] Additional meals/check-ins on the same date do not add extra levels.
- [ ] Food-only or feeling-only days keep tree alive.
- [ ] Seven consecutive local dates with no water or compost mark the tree dead.
- [ ] Dead run shows Replant Tamar.
- [ ] Replant creates a new level 0 run.
- [ ] Replant preserves best level, best streak, reward history, and past runs.
- [ ] If user replants after already logging today, today's existing care can apply to the new sapling.

### Growth Zones

- [ ] Level 0-6: zone label Sapling ground and early tree changes are visible.
- [ ] Level 7: Young oasis unlocked.
- [ ] Level 30: Fruit canopy unlocked.
- [ ] Level 100: Cloud canopy unlocked.
- [ ] Level 200: Atmosphere unlocked.
- [ ] Level 300: UFO grove unlocked.
- [ ] Next reward level displays correctly.
- [ ] Milestone text is deterministic and not random.
- [ ] Reward toast appears for water, compost, growth, milestone, death, and replant events where applicable.

### Placement

- [ ] Full Tamar tree panel appears near the top of Diary.
- [ ] Navbar tree badge reflects current care needs.
- [ ] Insights can nudge water, compost, full care, danger, dead, or replant states.
- [ ] Analysis Tamar Record shows historical stats.
- [ ] Tree state never appears to be a health diagnosis or recipe ranking factor.

## 20. Insights Popover

Global navbar lightbulb.

- [ ] Signed-out user sees sign-in prompt.
- [ ] New user sees starter nudges.
- [ ] User with stale meal log sees log-meal nudge.
- [ ] User missing feeling note sees log-feeling nudge.
- [ ] User with tree needing water/compost sees relevant tree nudge.
- [ ] Dead tree shows replant nudge.
- [ ] CookBook nudge appears only when saved recipes exist.
- [ ] Opening the popover clears unread badge.
- [ ] Clicking a nudge navigates to the expected route.
- [ ] Phone popover fits screen width.

## 21. Phone QA Checklist

Run this checklist on every phone in the matrix.

### Layout

- [ ] No horizontal page scrolling except intentional recipe carousels.
- [ ] Fixed navbar does not cover page headings.
- [ ] Floating chat button does not cover primary form submit buttons.
- [ ] Dialogs and sheets fit within viewport and can scroll.
- [ ] Cards, forms, and charts do not overflow.
- [ ] Long recipe names wrap or truncate cleanly.
- [ ] Text does not overlap icons or buttons.
- [ ] Footer is reachable.

### Touch And Gestures

- [ ] Hamburger menu opens reliably.
- [ ] Search modal input focuses and keyboard appears.
- [ ] Recipe carousels swipe smoothly.
- [ ] Recipe card actions are accessible without desktop hover.
- [ ] Cooklist checkbox rows are easy to tap.
- [ ] Diary sliders and date/time inputs are usable.
- [ ] Image upload/camera capture opens from Diary, Chat, and CookBook when allowed.
- [ ] Back and close buttons are large enough to tap.
- [ ] Pull-to-refresh/browser gestures do not trap the app.

### Keyboard And Forms

- [ ] Keyboard does not hide the active input in Chat.
- [ ] Keyboard does not hide Save meal or Save check-in on Diary.
- [ ] Date/time controls work on iOS and Android.
- [ ] Numeric keyboards appear for calories, protein, fat, severity where applicable.
- [ ] Form validation messages are visible above the fold or easy to find.

### Orientation

- [ ] Rotate from portrait to landscape on Home.
- [ ] Rotate while Chat is open.
- [ ] Rotate while an auth or cooklist dialog is open.
- [ ] Rotate while Diary edit dialog is open.
- [ ] No overlay becomes impossible to close after rotation.

## 22. Accessibility Smoke Test

Use keyboard on desktop and screen-reader spot checks when available.

- [ ] Tab order follows visible layout.
- [ ] Focus rings are visible.
- [ ] Buttons have accessible names, especially icon-only buttons.
- [ ] Dialog focus is trapped while open and returns after close.
- [ ] Escape closes modals where expected.
- [ ] Search, auth, cooklist picker, and edit meal dialogs are keyboard-usable.
- [ ] Color contrast is readable in dark Diary/Analysis surfaces.
- [ ] Images have useful alt text where they convey content.
- [ ] Loading states are not the only way to understand progress.
- [ ] Toasts do not contain the only critical instruction.

## 22.1 API And Recommender Integration Checks

Run these with a developer console, Supabase access, or API logs available. The goal is to confirm that UI actions reach the intended backend path and write only the expected data.

### Recommendation Refresh

- [ ] Opening Home as a signed-in user calls `/api/refresh-recommendations` when a session token exists.
- [ ] A successful refresh writes or updates the user's `user_recommendations` row.
- [ ] Home reads `recommended_recipe_ids` and `match_scores` for Curated for You.
- [ ] Category arrays are read for Trending, Flavor, Healthy, and Quick rows when present.
- [ ] Saved recipes are excluded from broader Home recommendations where designed.
- [ ] CookBook refresh writes or reads cookbook-only arrays for saved recipes only.
- [ ] Recommender service 401, timeout, or missing artifact falls back without a blank UI.

### Meal And Health Bridges

- [ ] Diary meal submit calls `/api/meal-log`.
- [ ] Chat Log Food calls the same meal-log bridge after user confirmation.
- [ ] Recipe feedback chat calls meal-log with `recipe_id` for confirmed catalog recipe evidence.
- [ ] Health check-ins call `/api/health-report`.
- [ ] Chat recipe feedback saves no-symptom or digestive-discomfort feedback through the health bridge.
- [ ] When the Python service is configured, bridge calls reach `/meal-log` and `/health-report`.
- [ ] When the Python service is unavailable, fallback rows are still visible in Diary.
- [ ] Meal logs can create ingredient exposure/risk updates through the service, but image analysis alone cannot.

### Image And Nutrition APIs

- [ ] `/api/analyze-food-image` requires authentication.
- [ ] Food-photo analysis only accepts user-owned `user-uploads` storage paths.
- [ ] Diary Add meal from image returns draft food/ingredient suggestions without saving rows.
- [ ] CookBook Add recipe from image returns draft personal-recipe suggestions without saving rows.
- [ ] Chat image analysis drafts a meal only in Log Food or recipe-feedback context.
- [ ] `/api/estimate-meal-nutrition` requires authentication.
- [ ] Catalog-backed nutrition uses recipe nutrition when available.
- [ ] Free-text/photo-assisted nutrition returns editable estimates.
- [ ] Nutrition estimates do not save data until the user saves the meal.

### Interaction Events

- [ ] Opening a recipe detail records `viewed`.
- [ ] Starting a catalog recipe from CookBook records `started`.
- [ ] Saving a catalog recipe records `saved`.
- [ ] Taste onboarding records `liked` or `dismissed`.
- [ ] Recipe feedback records `completed` after confirmed eating.
- [ ] Personal recipes do not create catalog `recipe_interactions`.
- [ ] Cooklist membership changes do not create duplicate recommender event types beyond the intended saved state.

## 23. Privacy And Security Checks

- [ ] User A never sees User B meals.
- [ ] User A never sees User B health reports or check-ins.
- [ ] User A never sees User B cooklists or personal recipes.
- [ ] User A cannot access User B uploaded images through normal UI.
- [ ] Signing out clears private UI state on shared devices.
- [ ] API errors do not expose service role keys, raw prompts, auth tokens, or private SQL details.
- [ ] Food-photo analysis requires a signed-in user's own uploaded image path.
- [ ] Canopy+ cannot be granted through user-editable metadata.
- [ ] Personal recipes are not inserted as public catalog recipes.

## 24. Error And Resilience Tests

Run these with developer help or network throttling.

- [ ] Supabase unavailable: pages show friendly errors or empty states, not blank screens.
- [ ] Recommender service down: Home falls back to default/general recipes.
- [ ] Recommendation refresh returns 401: console reports it, UI remains usable.
- [ ] Gemini unavailable: chat/image/nutrition features fail gracefully.
- [ ] Storage upload fails: user sees clear upload error.
- [ ] Unsupported image file: upload is rejected or explained.
- [ ] Slow network: skeletons and loading states appear.
- [ ] Refresh during form save does not duplicate entries.
- [ ] Browser localStorage disabled: first-run and reminder flows still let user continue.
- [ ] Missing cookbook recommendation columns: CookBook falls back to local recommendations.
- [ ] Missing tree tables: Diary still works and tree shows migration-safe state.

## 25. Performance And Polish

- [ ] Initial route reaches usable content quickly on local or test deployment.
- [ ] Home scrolling remains smooth with multiple carousels.
- [ ] Chat message list remains responsive after many messages.
- [ ] Diary with 100+ entries remains scrollable.
- [ ] CookBook with many saved recipes remains usable.
- [ ] Images lazy-load or skeleton smoothly without large layout jumps.
- [ ] No repeated network calls loop forever.
- [ ] Build output has no blocking warnings that indicate broken imports.

## 26. Automated Regression Checklist

Run these before or after manual QA:

```powershell
npm run test
npm run build
npm run lint
```

Existing automated tests cover helper logic for:

- Recipe image fallback and duplicate behavior.
- Analysis helper aggregation and recipe experiment suggestions.
- Insights prioritization and unread counts.
- IBS risk helper behavior.
- Freemium/Sapling/Canopy+ helper behavior.
- Tamar tree lifecycle and component rendering.

Manual QA should focus on integration, phone behavior, Supabase data, auth, and full user journeys because those are not fully covered by unit tests.

## 27. Final QA Summary Template

At the end of the session, summarize:

```text
Build/tested version:
Environment:
Browsers/devices:
Accounts used:
Feature inventory status:
Passed areas:
Blocked areas:
Untested features:
P0/P1 bugs:
P2/P3 bugs:
Unverified areas:
Recommended go/no-go:
```

Go/no-go guidance:

- **Go**: No P0/P1 bugs, phone basics pass, privacy passes, Sapling/Canopy+ gates pass, and every feature inventory row is Pass or accepted Not applicable.
- **Conditional go**: Only P2/P3 issues remain and the team accepts them, with any blocked/untested inventory rows explicitly signed off.
- **No-go**: Any P0, privacy leak, broken auth, broken meal/check-in logging, wrong premium gating, or unusable phone layout.
