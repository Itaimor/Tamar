-- Make Food.com historical interactions idempotent to reseed.
-- If a previous seed inserted duplicate user/recipe rows, keep the newest row.
delete from public.historical_interactions older
using public.historical_interactions newer
where older.user_id = newer.user_id
  and older.recipe_id = newer.recipe_id
  and older.id < newer.id;

create unique index if not exists historical_interactions_user_recipe_unique_idx
on public.historical_interactions (user_id, recipe_id);
