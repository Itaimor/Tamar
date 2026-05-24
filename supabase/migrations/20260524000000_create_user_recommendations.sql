-- Migration to create user recommendations table and configure security policies

create table if not exists public.user_recommendations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  recommended_recipe_ids text[] not null,
  user_vector double precision[],
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.user_recommendations enable row level security;

-- Create policy to allow users to read their own recommendations
create policy "Users can read their own recommendations"
on public.user_recommendations
for select
using (auth.uid() = user_id);

-- Create policy to allow users to insert/update their own recommendations (if client-side bootstrapping updates it)
create policy "Users can insert their own recommendations"
on public.user_recommendations
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own recommendations"
on public.user_recommendations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
