-- Avatar uploads from the browser always failed: every POST to
-- storage/v1/object/avatars/<uid>/... answered 400 "new row violates
-- row-level security policy for table objects" (storage_logs, 2026-11-24).
--
-- The storage API writes with INSERT ... ON CONFLICT DO UPDATE ... RETURNING
-- (upsert) or INSERT ... RETURNING. Both read the new row back, and Postgres
-- then applies the table's SELECT policies to it. The avatars bucket had
-- INSERT/UPDATE/DELETE policies (20260724250000) but no SELECT policy, so the
-- read-back was refused and the whole write rolled back. Measured as
-- `authenticated` in a rolled-back transaction: plain INSERT ok,
-- INSERT ... RETURNING and the upsert both 42501.
--
-- Owner-scoped on purpose: the bucket is public, so files are already served
-- by URL; this adds only the owner's own rows, not a listing of every member.
DROP POLICY IF EXISTS "Users can view their own avatar objects" ON storage.objects;
CREATE POLICY "Users can view their own avatar objects" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
