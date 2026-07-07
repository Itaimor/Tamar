-- Create a secure function to allow admin users to reset their own profile data (wipe all memory)
-- to debug the new user onboarding flow.

create or replace function public.reset_user_memory()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_full_name text;
  v_avatar_url text;
begin
  -- 1. Verify that the caller is an admin user.
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') != 'admin' then
    raise exception 'Unauthorized: Only admin users can reset their user memory.';
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized: No authenticated user session found.';
  end if;

  -- 2. Fetch current profile details to restore them after the wipe.
  select email, full_name, avatar_url
  into v_email, v_full_name, v_avatar_url
  from public.profiles
  where id = v_uid;

  -- 3. Delete the profile.
  -- Due to foreign key constraints referencing public.profiles(id) with ON DELETE CASCADE,
  -- this will automatically and cleanly delete all rows for this user in:
  -- recipe_interactions, user_recommendations, cooklists, cooklist_recipes,
  -- user_ibs_profiles, user_ibs_ingredient_risks, user_ibs_checkins, user_restrictions,
  -- meal_logs, user_ingredient_exposures, user_ingredient_risks, user_candidate_recipes,
  -- model_predictions, user_tamar_tree_runs, user_tamar_tree_reward_events.
  delete from public.profiles where id = v_uid;

  -- 4. Re-insert a clean profile so the admin user remains valid in the profiles table.
  insert into public.profiles (id, email, full_name, avatar_url)
  values (v_uid, v_email, v_full_name, v_avatar_url);
end;
$$;

-- Restrict function execution permissions to authenticated users.
revoke all on function public.reset_user_memory() from public;
grant execute on function public.reset_user_memory() to authenticated;
