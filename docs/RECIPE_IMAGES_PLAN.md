# Recipe Images Plan

## Problem

The recipe database contains recipe names, ingredients, and instructions, but most rows do not have useful image URLs. Many recipes use the same generic placeholder URL, so the UI showed an empty plate with the recipe ID.

## Current Solution

The app now uses a layered image strategy:

1. If `recipe_images.image_url` exists, use it.
2. If no exact image exists, infer a category from the recipe title.
3. If the title does not match, infer a category from ingredients.
4. If nothing matches, use a general food image.

This means users should no longer see the empty plate for normal recipe rows.

## Exact Image Cache

`recipe_images` is used as a shared cache for exact recipe images.

When recipes are loaded on the homepage, the frontend sends their IDs to:

```text
/api/fill-recipe-images
```

That endpoint:

1. Checks which recipe IDs already have images.
2. Searches Pexels for missing recipes.
3. Saves found image URLs into `recipe_images`.

The first view may show a category image. Later views should show the saved exact image.

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

The category fallback works immediately and does not require extra API calls.

## Future Improvements

- Add Pexels attribution in the UI.
- Add a batch script that slowly fills missing `recipe_images`.
- Improve category rules and category image choices.
- Improve Pexels search queries.
- Add manual/admin override for bad image matches.
- Use a paid/high-volume search API if full 100,000 recipe coverage is required quickly.
