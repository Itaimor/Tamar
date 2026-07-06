create table if not exists public.user_tamar_tree_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_current boolean not null default true,
  status text not null default 'alive' check (status in ('alive', 'dead')),
  level integer not null default 0 check (level >= 0),
  growth_days integer not null default 0 check (growth_days >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  best_level integer not null default 0 check (best_level >= 0),
  last_watered_date date,
  last_composted_date date,
  last_care_date date,
  last_growth_date date,
  planted_at timestamptz not null default now(),
  died_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_tamar_tree_reward_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_id bigint not null references public.user_tamar_tree_runs(id) on delete cascade,
  event_key text not null,
  event_type text not null check (event_type in ('water', 'compost', 'growth', 'cosmetic', 'milestone', 'death', 'replant')),
  care_date date,
  level integer,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

alter table public.user_tamar_tree_runs enable row level security;
alter table public.user_tamar_tree_reward_events enable row level security;

grant select, insert, update, delete on table public.user_tamar_tree_runs to authenticated;
grant select, insert, update, delete on table public.user_tamar_tree_reward_events to authenticated;

grant select, insert, update, delete on table
  public.user_tamar_tree_runs,
  public.user_tamar_tree_reward_events
to service_role;

grant usage, select on sequence public.user_tamar_tree_runs_id_seq to authenticated, service_role;
grant usage, select on sequence public.user_tamar_tree_reward_events_id_seq to authenticated, service_role;

drop policy if exists "Users can manage their own Tamar tree runs" on public.user_tamar_tree_runs;
create policy "Users can manage their own Tamar tree runs"
on public.user_tamar_tree_runs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own Tamar tree rewards" on public.user_tamar_tree_reward_events;
create policy "Users can manage their own Tamar tree rewards"
on public.user_tamar_tree_reward_events
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create unique index if not exists user_tamar_tree_runs_one_current_idx
on public.user_tamar_tree_runs (user_id)
where is_current;

create index if not exists user_tamar_tree_runs_user_current_idx
on public.user_tamar_tree_runs (user_id, is_current);

create index if not exists user_tamar_tree_runs_user_planted_idx
on public.user_tamar_tree_runs (user_id, planted_at desc);

create index if not exists user_tamar_tree_reward_events_user_key_idx
on public.user_tamar_tree_reward_events (user_id, event_key);

create index if not exists user_tamar_tree_reward_events_user_created_idx
on public.user_tamar_tree_reward_events (user_id, created_at desc);

create index if not exists user_tamar_tree_reward_events_run_created_idx
on public.user_tamar_tree_reward_events (run_id, created_at desc);
