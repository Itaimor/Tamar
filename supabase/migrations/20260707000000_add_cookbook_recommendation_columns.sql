alter table public.user_recommendations
  add column if not exists cookbook_recipe_ids text[],
  add column if not exists cookbook_recipe_sources text[],
  add column if not exists cookbook_match_scores double precision[],
  add column if not exists cookbook_reasons text[];
