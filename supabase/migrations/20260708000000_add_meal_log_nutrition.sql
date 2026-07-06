alter table public.meal_logs
  add column if not exists calories numeric check (calories is null or calories >= 0),
  add column if not exists protein_g numeric check (protein_g is null or protein_g >= 0),
  add column if not exists fat_g numeric check (fat_g is null or fat_g >= 0),
  add column if not exists nutrition_source text check (
    nutrition_source is null
    or nutrition_source in ('manual', 'catalog_recipe', 'gemini_estimate')
  ),
  add column if not exists nutrition_confidence numeric check (
    nutrition_confidence is null
    or (nutrition_confidence >= 0 and nutrition_confidence <= 1)
  );
