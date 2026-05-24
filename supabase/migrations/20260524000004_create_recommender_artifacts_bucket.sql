-- Private bucket for trained collaborative-filtering artifacts.
-- Server-side jobs use the service-role key to upload/download these files.

insert into storage.buckets (id, name, public)
values ('recommender-artifacts', 'recommender-artifacts', false)
on conflict (id) do nothing;
