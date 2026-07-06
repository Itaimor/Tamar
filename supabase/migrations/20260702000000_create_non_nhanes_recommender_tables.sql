-- Recommender implementation tables.
--
-- This migration adds the database surface for:
-- - normalized recipe ingredients and population IBS priors
-- - strict user restrictions for hard filtering
-- - meal logs, health reports, ingredient exposures, and personalized risks
-- - precomputed preference candidates and online model prediction records
--
-- Additional risk propagation tables are intentionally not created here.

create table if not exists public.ingredients (
  id bigint generated always as identity primary key,
  ingredient_name text not null unique,
  normalized_name text not null unique,
  trigger_group text,
  population_risk_score numeric not null default 0.10 check (
    population_risk_score >= 0 and population_risk_score <= 1
  ),
  source text not null default 'recipe_catalog',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  ingredient_id bigint references public.ingredients(id) on delete set null,
  ingredient_name text not null,
  normalized_name text not null,
  amount numeric,
  unit text,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  primary key (recipe_id, normalized_name)
);

create table if not exists public.ibs_population_ingredient_priors (
  ingredient_name text primary key,
  normalized_name text not null unique,
  trigger_group text not null,
  population_risk_score numeric not null check (
    population_risk_score >= 0 and population_risk_score <= 1
  ),
  confidence numeric not null default 0.35 check (confidence >= 0 and confidence <= 1),
  source_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_restrictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ingredient_id bigint references public.ingredients(id) on delete set null,
  ingredient_name text not null,
  normalized_name text not null,
  restriction_type text not null check (
    restriction_type in ('allergy', 'strict_sensitivity', 'forbidden_ingredient', 'diet_violation')
  ),
  severity text not null default 'strict' check (
    severity in ('low', 'medium', 'high', 'strict')
  ),
  is_strict boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name, restriction_type)
);

create table if not exists public.meal_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id bigint references public.recipes(id) on delete set null,
  food_name text not null,
  logged_at timestamptz not null default now(),
  portion_size numeric,
  portion_unit text,
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.health_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reported_at timestamptz not null default now(),
  symptom_type text not null,
  severity numeric not null check (severity >= 0 and severity <= 1),
  no_symptoms boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_ingredient_exposures (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_log_id bigint references public.meal_logs(id) on delete cascade,
  recipe_id bigint references public.recipes(id) on delete set null,
  ingredient_id bigint references public.ingredients(id) on delete set null,
  ingredient_name text not null,
  normalized_name text not null,
  exposed_at timestamptz not null,
  portion_weight numeric not null default 1 check (portion_weight >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.user_ingredient_risks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ingredient_id bigint references public.ingredients(id) on delete set null,
  ingredient_name text not null,
  normalized_name text not null,
  exposure_count integer not null default 0 check (exposure_count >= 0),
  positive_evidence numeric not null default 0 check (positive_evidence >= 0),
  negative_evidence numeric not null default 0 check (negative_evidence >= 0),
  risk_score numeric not null default 0.25 check (risk_score >= 0 and risk_score <= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  status text not null default 'unknown' check (
    status in ('known_bad', 'suspected_bad', 'unknown', 'suspected_good', 'known_good')
  ),
  evidence_source text not null default 'meal_health_reports',
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, normalized_name)
);

create table if not exists public.user_candidate_recipes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  preference_score double precision not null,
  model_name text not null default 'cf_item_factors',
  generated_at timestamptz not null default now(),
  primary key (user_id, recipe_id, model_name)
);

create table if not exists public.model_predictions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  model_name text not null,
  prediction_type text not null check (
    prediction_type in ('ingredient_risk', 'symptom_risk', 'combined_risk', 'online_rerank')
  ),
  score double precision not null,
  features jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  primary key (user_id, recipe_id, model_name, prediction_type)
);

alter table public.user_recommendations
  add column if not exists ingredient_risk_scores double precision[],
  add column if not exists symptom_risk_scores double precision[],
  add column if not exists combined_risk_scores double precision[],
  add column if not exists final_scores double precision[];

alter table public.ingredients enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.ibs_population_ingredient_priors enable row level security;
alter table public.user_restrictions enable row level security;
alter table public.meal_logs enable row level security;
alter table public.health_reports enable row level security;
alter table public.user_ingredient_exposures enable row level security;
alter table public.user_ingredient_risks enable row level security;
alter table public.user_candidate_recipes enable row level security;
alter table public.model_predictions enable row level security;

grant select on table public.ingredients to anon, authenticated;
grant select on table public.recipe_ingredients to anon, authenticated;
grant select on table public.ibs_population_ingredient_priors to anon, authenticated;

grant select, insert, update, delete on table public.user_restrictions to authenticated;
grant select, insert, update, delete on table public.meal_logs to authenticated;
grant select, insert, update, delete on table public.health_reports to authenticated;
grant select, insert, update, delete on table public.user_ingredient_exposures to authenticated;
grant select, insert, update, delete on table public.user_ingredient_risks to authenticated;
grant select on table public.user_candidate_recipes to authenticated;
grant select on table public.model_predictions to authenticated;

grant select, insert, update, delete on table
  public.ingredients,
  public.recipe_ingredients,
  public.ibs_population_ingredient_priors,
  public.user_restrictions,
  public.meal_logs,
  public.health_reports,
  public.user_ingredient_exposures,
  public.user_ingredient_risks,
  public.user_candidate_recipes,
  public.model_predictions
to service_role;

grant usage, select on sequence public.ingredients_id_seq to service_role;
grant usage, select on sequence public.user_restrictions_id_seq to authenticated, service_role;
grant usage, select on sequence public.meal_logs_id_seq to authenticated, service_role;
grant usage, select on sequence public.health_reports_id_seq to authenticated, service_role;
grant usage, select on sequence public.user_ingredient_exposures_id_seq to authenticated, service_role;

drop policy if exists "Allow read access to ingredients for everyone" on public.ingredients;
create policy "Allow read access to ingredients for everyone"
on public.ingredients
for select
using (true);

drop policy if exists "Allow read access to recipe ingredients for everyone" on public.recipe_ingredients;
create policy "Allow read access to recipe ingredients for everyone"
on public.recipe_ingredients
for select
using (true);

drop policy if exists "Allow read access to IBS population priors for everyone" on public.ibs_population_ingredient_priors;
create policy "Allow read access to IBS population priors for everyone"
on public.ibs_population_ingredient_priors
for select
using (true);

drop policy if exists "Users can read their own restrictions" on public.user_restrictions;
create policy "Users can read their own restrictions"
on public.user_restrictions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own restrictions" on public.user_restrictions;
create policy "Users can insert their own restrictions"
on public.user_restrictions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own restrictions" on public.user_restrictions;
create policy "Users can update their own restrictions"
on public.user_restrictions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own restrictions" on public.user_restrictions;
create policy "Users can delete their own restrictions"
on public.user_restrictions
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own meal logs" on public.meal_logs;
create policy "Users can manage their own meal logs"
on public.meal_logs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own health reports" on public.health_reports;
create policy "Users can manage their own health reports"
on public.health_reports
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own ingredient exposures" on public.user_ingredient_exposures;
create policy "Users can manage their own ingredient exposures"
on public.user_ingredient_exposures
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own ingredient risks" on public.user_ingredient_risks;
create policy "Users can manage their own ingredient risks"
on public.user_ingredient_risks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own candidate recipes" on public.user_candidate_recipes;
create policy "Users can read their own candidate recipes"
on public.user_candidate_recipes
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own model predictions" on public.model_predictions;
create policy "Users can read their own model predictions"
on public.model_predictions
for select
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists ingredients_normalized_idx
on public.ingredients (normalized_name);

create index if not exists recipe_ingredients_ingredient_idx
on public.recipe_ingredients (ingredient_id);

create index if not exists recipe_ingredients_normalized_idx
on public.recipe_ingredients (normalized_name, recipe_id);

create index if not exists ibs_population_priors_normalized_idx
on public.ibs_population_ingredient_priors (normalized_name);

create index if not exists user_restrictions_user_normalized_idx
on public.user_restrictions (user_id, normalized_name);

create index if not exists meal_logs_user_logged_idx
on public.meal_logs (user_id, logged_at desc);

create index if not exists meal_logs_recipe_idx
on public.meal_logs (recipe_id);

create index if not exists health_reports_user_reported_idx
on public.health_reports (user_id, reported_at desc);

create index if not exists user_ingredient_exposures_user_exposed_idx
on public.user_ingredient_exposures (user_id, exposed_at desc);

create index if not exists user_ingredient_exposures_meal_log_idx
on public.user_ingredient_exposures (meal_log_id);

create index if not exists user_ingredient_exposures_recipe_idx
on public.user_ingredient_exposures (recipe_id);

create index if not exists user_ingredient_risks_user_score_idx
on public.user_ingredient_risks (user_id, risk_score desc, confidence desc);

create index if not exists user_candidate_recipes_user_score_idx
on public.user_candidate_recipes (user_id, preference_score desc);

create index if not exists user_candidate_recipes_user_generated_idx
on public.user_candidate_recipes (user_id, generated_at desc);

create index if not exists model_predictions_user_generated_idx
on public.model_predictions (user_id, generated_at desc);

create index if not exists model_predictions_features_gin_idx
on public.model_predictions using gin (features);
