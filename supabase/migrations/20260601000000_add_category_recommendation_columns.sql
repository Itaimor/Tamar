-- Adds per-category recommendation columns to user_recommendations.
--
-- The CF pipeline (recommend_fast.py / recommend_batch.py) writes a single row
-- per user. Until now that row only held the "Curated for You" list. The new
-- columns below add four additional category-specific lists that drive the
-- corresponding rows on the homepage:
--
--   trending_recipe_ids   -> "Trending in Your Area"
--   flavor_recipe_ids     -> "Bursting with Flavor"
--   healthy_recipe_ids    -> "Healthy & Mindful"
--   quick_recipe_ids      -> "Quick & Satisfying"
--
-- Each list has a matching *_match_scores array with the per-recipe display
-- confidence (0.78-0.98 band, same scheme as the existing match_scores).
-- The arrays are nullable so old rows continue to validate; the algorithm
-- always writes them all on the next refresh.
--
-- Cross-category de-duplication is enforced server-side in recommend_fast.py:
-- a recipe id appearing in one of the five lists will not appear in another.

alter table public.user_recommendations
  add column if not exists trending_recipe_ids text[],
  add column if not exists trending_match_scores double precision[],
  add column if not exists flavor_recipe_ids text[],
  add column if not exists flavor_match_scores double precision[],
  add column if not exists healthy_recipe_ids text[],
  add column if not exists healthy_match_scores double precision[],
  add column if not exists quick_recipe_ids text[],
  add column if not exists quick_match_scores double precision[];
