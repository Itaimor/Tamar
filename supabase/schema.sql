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
    interaction_type in ('viewed', 'started', 'saved', 'completed', 'dismissed')
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

create index if not exists recipe_interactions_user_created_idx
on public.recipe_interactions (user_id, created_at desc);

create index if not exists recipe_interactions_recipe_idx
on public.recipe_interactions (recipe_id);

