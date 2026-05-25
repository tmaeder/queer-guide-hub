-- AchievementToast subscribes to INSERT events on user_achievements via
-- supabase.channel('user-achievements-{userId}').on('postgres_changes', …).
-- For that listener to fire, the table must be a member of the
-- `supabase_realtime` publication. It was missed in the original migration.
-- Without this row, the toast never appears even though the trigger writes
-- the row correctly.
--
-- Idempotent: `ADD TABLE` will error if the table is already in the
-- publication, so the DO block swallows that case.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
