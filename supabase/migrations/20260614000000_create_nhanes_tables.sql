-- Migration to create NHANES merged diet and symptoms table for NMF modeling
create table if not exists public.nhanes_merged_diet_symptoms (
  id bigint generated always as identity primary key,
  seqn integer not null,
  food_code integer not null,
  food_description text,
  food_group text,
  day integer not null,
  amount_g double precision not null,
  bowel_leakage_gas integer,
  bowel_leakage_mucus integer,
  bowel_leakage_liquid integer,
  bowel_leakage_solid integer,
  stool_frequency integer,
  stool_type integer,
  bowel_urgency integer,
  constipation integer,
  diarrhea integer,
  laxative_taken integer,
  laxative_frequency integer,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.nhanes_merged_diet_symptoms enable row level security;

-- Create read access policy
create policy "Allow read access to NHANES data for everyone"
on public.nhanes_merged_diet_symptoms
for select
using (true);

-- Create performance indexes for collaborative filtering queries
create index if not exists nhanes_seqn_idx on public.nhanes_merged_diet_symptoms (seqn);
create index if not exists nhanes_food_code_idx on public.nhanes_merged_diet_symptoms (food_code);
create index if not exists nhanes_food_group_idx on public.nhanes_merged_diet_symptoms (food_group);
