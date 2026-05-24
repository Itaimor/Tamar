-- Migration to create recipe_images lookup table and configure security policies

create table if not exists public.recipe_images (
  id bigint generated always as identity primary key,
  recipe_id bigint not null unique references public.recipes(id) on delete cascade,
  image_url text not null,
  source_tier varchar(50) not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.recipe_images enable row level security;

-- Create policy to allow read access to recipe_images for anyone
create policy "Allow read access to recipe_images for everyone"
on public.recipe_images
for select
using (true);

-- Create index on recipe_id for fast JOIN queries
create index if not exists recipe_images_recipe_id_idx on public.recipe_images (recipe_id);
