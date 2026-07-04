-- No-op canary: a migration-touching commit so the deploy workflow's
-- "Push migrations" step runs on this PR's merge, exercising the new
-- `db push --include-all` and flushing the idempotent pending backlog that
-- accumulated while the pipeline was drift-skipping. Safe to re-run; records
-- nothing of substance.
DO $$ BEGIN PERFORM 1; END $$;
