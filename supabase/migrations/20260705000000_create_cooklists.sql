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
  created_at timestamptz not null default now(),
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

drop policy if exists "Users can delete their own recipe interactions" on public.recipe_interactions;
create policy "Users can delete their own recipe interactions"
on public.recipe_interactions
for delete
using (auth.uid() = user_id);

create unique index if not exists cooklists_user_default_idx
on public.cooklists (user_id)
where is_default;

create unique index if not exists cooklists_user_lower_name_idx
on public.cooklists (user_id, lower(name));

create unique index if not exists cooklist_recipes_unique_recipe_idx
on public.cooklist_recipes (user_id, cooklist_id, recipe_id);

create index if not exists cooklist_recipes_user_recipe_idx
on public.cooklist_recipes (user_id, recipe_id);

drop policy if exists "Users can read their own cooklists" on public.cooklists;
create policy "Users can read their own cooklists"
on public.cooklists
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own cooklists" on public.cooklists;
create policy "Users can insert their own cooklists"
on public.cooklists
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own cooklists" on public.cooklists;
create policy "Users can update their own cooklists"
on public.cooklists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own cooklists" on public.cooklists;
create policy "Users can delete their own cooklists"
on public.cooklists
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read their own cooklist recipes" on public.cooklist_recipes;
create policy "Users can read their own cooklist recipes"
on public.cooklist_recipes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own cooklist recipes" on public.cooklist_recipes;
create policy "Users can insert their own cooklist recipes"
on public.cooklist_recipes
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own cooklist recipes" on public.cooklist_recipes;
create policy "Users can update their own cooklist recipes"
on public.cooklist_recipes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own cooklist recipes" on public.cooklist_recipes;
create policy "Users can delete their own cooklist recipes"
on public.cooklist_recipes
for delete
using (auth.uid() = user_id);

insert into public.cooklists (user_id, name, is_default)
select distinct ri.user_id, 'Liked', true
from public.recipe_interactions ri
where ri.interaction_type in ('saved', 'save')
on conflict do nothing;

insert into public.cooklist_recipes (cooklist_id, user_id, recipe_id, recipe_title, created_at)
select distinct on (ri.user_id, ri.recipe_id)
  cl.id,
  ri.user_id,
  ri.recipe_id,
  ri.recipe_title,
  ri.created_at
from public.recipe_interactions ri
join public.cooklists cl
  on cl.user_id = ri.user_id
  and cl.is_default = true
where ri.interaction_type in ('saved', 'save')
order by ri.user_id, ri.recipe_id, ri.created_at desc
on conflict do nothing;
