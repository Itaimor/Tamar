alter table public.meal_logs
  add column if not exists image_url text;

alter table public.cooklist_recipes
  add column if not exists recipe_source text not null default 'catalog'
    check (recipe_source in ('catalog', 'personal')),
  add column if not exists image_url text,
  add column if not exists description text,
  add column if not exists ingredients text,
  add column if not exists instructions text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists cooklist_recipes_user_source_idx
on public.cooklist_recipes (user_id, recipe_source, created_at desc);
