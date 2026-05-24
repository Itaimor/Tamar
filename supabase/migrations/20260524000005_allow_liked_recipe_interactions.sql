alter table public.recipe_interactions
drop constraint if exists recipe_interactions_interaction_type_check;

alter table public.recipe_interactions
add constraint recipe_interactions_interaction_type_check
check (interaction_type in ('viewed', 'started', 'saved', 'completed', 'liked', 'dismissed'));
