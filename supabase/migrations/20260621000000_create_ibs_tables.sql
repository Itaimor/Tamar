-- Create IBS-specific profile, personal ingredient risk, and check-in tables.
-- This task maintains IBS tables only; recommendation ranking consumes these later.

create table if not exists public.ibs_ingredients (
  ingredient_name text primary key,
  aliases text[] not null default '{}',
  trigger_group text not null check (
    trigger_group in (
      'fructans_gos',
      'lactose',
      'excess_fructose',
      'polyols',
      'gas_producing',
      'fatty_spicy_processed',
      'caffeine_alcohol_fizzy',
      'fiber_sensitive'
    )
  ),
  source_notes text,
  created_at timestamptz not null default now()
);

alter table public.ibs_ingredients enable row level security;

create policy "Allow read access to IBS ingredient catalog for everyone"
on public.ibs_ingredients
for select
using (true);

create table if not exists public.user_ibs_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  onboarding_completed_at timestamptz,
  last_checkin_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ibs_profiles enable row level security;

create policy "Users can read their own IBS profile"
on public.user_ibs_profiles
for select
using (auth.uid() = user_id);

create policy "Users can insert their own IBS profile"
on public.user_ibs_profiles
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own IBS profile"
on public.user_ibs_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.user_ibs_ingredient_risks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ingredient_name text not null,
  trigger_group text not null check (
    trigger_group in (
      'fructans_gos',
      'lactose',
      'excess_fructose',
      'polyols',
      'gas_producing',
      'fatty_spicy_processed',
      'caffeine_alcohol_fizzy',
      'fiber_sensitive'
    )
  ),
  grade numeric not null default 0 check (grade >= 0 and grade <= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ingredient_name)
);

alter table public.user_ibs_ingredient_risks enable row level security;

create policy "Users can read their own IBS ingredient risks"
on public.user_ibs_ingredient_risks
for select
using (auth.uid() = user_id);

create policy "Users can insert their own IBS ingredient risks"
on public.user_ibs_ingredient_risks
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own IBS ingredient risks"
on public.user_ibs_ingredient_risks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.user_ibs_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  severity numeric not null check (severity >= 0 and severity <= 1),
  symptoms text[] not null default '{}',
  summary text not null,
  food_windows jsonb not null,
  matched_ingredients text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_ibs_checkins enable row level security;

create policy "Users can read their own IBS check-ins"
on public.user_ibs_checkins
for select
using (auth.uid() = user_id);

create policy "Users can insert their own IBS check-ins"
on public.user_ibs_checkins
for insert
with check (auth.uid() = user_id);

create index if not exists user_ibs_profiles_updated_idx
on public.user_ibs_profiles (user_id, updated_at desc);

create index if not exists user_ibs_ingredient_risks_user_grade_idx
on public.user_ibs_ingredient_risks (user_id, grade desc, confidence desc);

create index if not exists user_ibs_checkins_user_created_idx
on public.user_ibs_checkins (user_id, created_at desc);

