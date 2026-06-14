alter table public.user_recommendations
add column if not exists trending_recipe_ids text[],
add column if not exists trending_match_scores double precision[],
add column if not exists flavor_recipe_ids text[],
add column if not exists flavor_match_scores double precision[],
add column if not exists healthy_recipe_ids text[],
add column if not exists healthy_match_scores double precision[],
add column if not exists quick_recipe_ids text[],
add column if not exists quick_match_scores double precision[];
