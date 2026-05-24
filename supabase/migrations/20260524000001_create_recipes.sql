-- Migration to create recipes and historical interactions tables

-- Create public.recipes table
create table if not exists public.recipes (
  id bigint primary key, -- Food.com recipe ID
  name text not null,
  minutes integer,
  n_steps integer,
  n_ingredients integer,
  ingredients text[] not null,
  steps text[] not null,
  nutrition double precision[] not null, -- [calories, total fat, sugar, sodium, protein, saturated fat, carbs]
  description text,
  image_url text,
  is_ibs_friendly boolean default true,
  created_at timestamptz not null default now()
);

-- Enable RLS for recipes
alter table public.recipes enable row level security;

-- Create policy to allow read access to recipes for anyone
create policy "Allow read access to recipes for everyone"
on public.recipes
for select
using (true);

-- Create public.historical_interactions table for training data
create table if not exists public.historical_interactions (
  id bigint generated always as identity primary key,
  user_id integer not null, -- Food.com user ID (integer)
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  rating double precision not null,
  created_at timestamptz not null default now()
);

-- Enable RLS for historical interactions
alter table public.historical_interactions enable row level security;

-- Create indexes for performance
create index if not exists recipes_name_idx on public.recipes (name);
create index if not exists historical_interactions_recipe_idx on public.historical_interactions (recipe_id);
create index if not exists historical_interactions_user_idx on public.historical_interactions (user_id);
