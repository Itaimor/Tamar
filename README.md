# Tamar

IBS-friendly recipe recommendation project for a university recommender systems course.

## Authentication and Database Setup

This app uses Supabase for user accounts, Google/Facebook OAuth, and recipe interaction history.

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Fill in:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

5. In Supabase Authentication, enable email/password, Google, and Facebook providers.
6. Add your local URL, usually `http://localhost:5173`, to the allowed redirect URLs.

Recipe interactions are stored in `recipe_interactions` so they can later become recommendation signals for the "Curated for You" section.
