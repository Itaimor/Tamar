# Recipe Images Plan

## Problem

The recipe database contains recipe names, ingredients, and instructions, but most rows do not have useful image URLs. Many recipes use the same generic placeholder URL, so the UI showed an empty plate with the recipe ID.

## Current Solution

The app now uses a layered image strategy:

1. If `recipe_images.image_url` exists, use it.
2. If no exact image exists, try specific title categories before broad categories.
3. If the title does not match, try specific ingredient categories.
4. If ingredients still do not give a clear food category, infer a broad meal type.
5. If nothing matches, use a general food image.

This means users should no longer see the empty plate for normal recipe rows.

## Fallback Image Matching

Fallback matching lives in `src/lib/recipes.ts`.

The order is intentionally specific-first:

1. Specific title rules, such as `banana bread`, `chicken soup`, `apple pie`, `shrimp pasta`, or `rice bowl`.
2. Broad title rules, such as `chicken`, `pasta`, `salad`, `cake`, or `smoothie`.
3. Specific ingredient rules.
4. Meal-type rules for vague names. For example, a recipe with unclear title but ingredients such as oats, eggs, broth, rice, flour, or sugar can still map to breakfast, soup/stew, grain bowl, baked food, or dessert.
5. Broad ingredient rules.
6. General food fallback.

Rules use word-aware matching for single-word keywords. This avoids accidental matches where a short food word appears inside an unrelated longer word.

## Curated Image Pools

Most fallback categories now have a small pool of curated images instead of one shared image.

The selected fallback image is deterministic:

```text
recipe id % number of images in category
```

This keeps the same recipe visually stable between page loads while making rows feel more varied. Two recipes in the same category no longer always need to show the exact same image.

When a fetched recipe batch is mapped for display, fallback selection also keeps track of images already used in that batch. If a later recipe lands on the same category image, the picker walks to the next image in that category pool when possible.

Examples of richer categories:

- `banana_bread`
- `chocolate_cake`
- `apple_pie`
- `chicken_soup`
- `beef_stew`
- `shrimp_pasta`
- `tuna_salad`
- `rice_bowl`
- `breakfast_bowl`
- `roasted_vegetables`
- `dips_spreads`
- `smoothie_bowl`

## Exact Image Cache

`recipe_images` is used as a shared cache for exact recipe images.

When recipes are loaded on the homepage, the frontend sends their IDs to:

```text
/api/fill-recipe-images
```

That endpoint:

1. Checks which recipe IDs already have images.
2. Searches Pexels for missing recipes.
3. Searches Pexels again for duplicated `pexels-auto` rows in the current batch.
4. Saves found image URLs into `recipe_images`.

The first view may show a category image. Later views should show the saved exact image.

To reduce repeated cached images, the endpoint asks Pexels for several candidates per recipe instead of taking only the first result. It chooses a stable image by starting at:

```text
recipe id % candidate count
```

If another recipe in the same request already chose that URL, the endpoint walks to the next candidate. This keeps images stable per recipe while making different recipes less likely to share the same cached Pexels image.

Existing `pexels-auto` rows may be refreshed only when their image URL is duplicated inside the current request. This allows bad automatic duplicates to be repaired without replacing manual/admin images.

The frontend also has a duplicate safeguard for visible recipe batches. If multiple recipes in the same fetched batch have the same stored image URL, those repeated cards use the richer category/meal fallback instead of showing the same image again. Duplicate checks normalize photo IDs/paths, so the same image can still be detected when query parameters differ. Images marked `manual` or `admin` are still trusted.

## Required Env Vars

Frontend/database:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Server-side image fill:

```env
SUPABASE_SERVICE_ROLE_KEY=...
PEXELS_API_KEY=...
```

Do not commit `.env.local`.

## Current Limits

Pexels API has usage limits. Until a higher limit is approved, the exact-image cache should grow gradually.

The category and meal-type fallbacks work immediately and do not require extra API calls.

## Future Improvements

- Add Pexels attribution in the UI.
- Add a batch script that slowly fills missing `recipe_images`.
- Continue improving category rules and curated image pools based on real recipe titles.
- Improve Pexels search queries.
- Add manual/admin override for bad image matches.
- Use a paid/high-volume search API if full 100,000 recipe coverage is required quickly.
