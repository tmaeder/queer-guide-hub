-- Pipeline canary: a harmless no-op migration whose only purpose is to trigger
-- the "Deploy Supabase functions" db-push step after the 2026-06-24 migration-
-- history drift repair. Merging this flushes the post-2026-06-19 backlog that
-- accumulated while db push was silently skipping on drift (now 0 orphans).
-- Idempotent and side-effect-free.
DO $$ BEGIN PERFORM 1; END $$;
