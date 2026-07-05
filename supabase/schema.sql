-- Run this in the Supabase SQL editor after creating your project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id text not null,
  recipe_title text not null,
  interaction_type text not null check (
    interaction_type in ('viewed', 'started', 'saved', 'completed', 'liked', 'dismissed')
  ),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.recipe_interactions enable row level security;

create policy "Users can read their own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can insert their own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read their own recipe interactions"
on public.recipe_interactions
for select
using (auth.uid() = user_id);

create policy "Users can insert their own recipe interactions"
on public.recipe_interactions
for insert
with check (auth.uid() = user_id);

create policy "Users can delete their own recipe interactions"
on public.recipe_interactions
for delete
using (auth.uid() = user_id);

create index if not exists recipe_interactions_user_created_idx
on public.recipe_interactions (user_id, created_at desc);

create index if not exists recipe_interactions_recipe_idx
on public.recipe_interactions (recipe_id);

create table if not exists public.user_recommendations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  recommended_recipe_ids text[] not null default '{}',
  match_scores double precision[],
  user_vector double precision[],
  trending_recipe_ids text[],
  trending_match_scores double precision[],
  flavor_recipe_ids text[],
  flavor_match_scores double precision[],
  healthy_recipe_ids text[],
  healthy_match_scores double precision[],
  quick_recipe_ids text[],
  quick_match_scores double precision[],
  ingredient_risk_scores double precision[],
  symptom_risk_scores double precision[],
  combined_risk_scores double precision[],
  final_scores double precision[],
  cookbook_recipe_ids text[],
  cookbook_recipe_sources text[],
  cookbook_match_scores double precision[],
  cookbook_reasons text[],
  updated_at timestamptz not null default now()
);

alter table public.user_recommendations enable row level security;

create policy "Users can read their own recommendations"
on public.user_recommendations
for select
using (auth.uid() = user_id);

create policy "Users can insert their own recommendations"
on public.user_recommendations
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own recommendations"
on public.user_recommendations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.cooklists (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cooklists_id_user_id_unique unique (id, user_id)
);

create table if not exists public.cooklist_recipes (
  id bigint generated always as identity primary key,
  cooklist_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id text not null,
  recipe_title text not null,
  recipe_source text not null default 'catalog' check (recipe_source in ('catalog', 'personal')),
  image_url text,
  description text,
  ingredients text,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cooklist_recipes_cooklist_owner_fk
    foreign key (cooklist_id, user_id)
    references public.cooklists(id, user_id)
    on delete cascade
);

alter table public.cooklists enable row level security;
alter table public.cooklist_recipes enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cooklists to authenticated;
grant select, insert, update, delete on public.cooklist_recipes to authenticated;

create unique index if not exists cooklists_user_default_idx
on public.cooklists (user_id)
where is_default;

create unique index if not exists cooklists_user_lower_name_idx
on public.cooklists (user_id, lower(name));

create unique index if not exists cooklist_recipes_unique_recipe_idx
on public.cooklist_recipes (user_id, cooklist_id, recipe_id);

create index if not exists cooklist_recipes_user_recipe_idx
on public.cooklist_recipes (user_id, recipe_id);

create index if not exists cooklist_recipes_user_source_idx
on public.cooklist_recipes (user_id, recipe_source, created_at desc);

create policy "Users can read their own cooklists"
on public.cooklists
for select
using (auth.uid() = user_id);

create policy "Users can insert their own cooklists"
on public.cooklists
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own cooklists"
on public.cooklists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own cooklists"
on public.cooklists
for delete
using (auth.uid() = user_id);

create policy "Users can read their own cooklist recipes"
on public.cooklist_recipes
for select
using (auth.uid() = user_id);

create policy "Users can insert their own cooklist recipes"
on public.cooklist_recipes
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own cooklist recipes"
on public.cooklist_recipes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own cooklist recipes"
on public.cooklist_recipes
for delete
using (auth.uid() = user_id);


create table if not exists public.recipe_images (
  id bigint generated always as identity primary key,
  recipe_id bigint not null unique references public.recipes(id) on delete cascade,
  image_url text not null,
  source_tier varchar(50) not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_images enable row level security;

create policy "Allow read access to recipe_images for everyone"
on public.recipe_images
for select
using (true);

create index if not exists recipe_images_recipe_id_idx on public.recipe_images (recipe_id);


