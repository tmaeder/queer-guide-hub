-- Close anon/authenticated write access to `admin_automation_tracked_callers`.
--
-- Measured on production before this migration:
--
--   relrowsecurity            false          -- RLS never enabled
--   anon        INSERT/UPDATE/DELETE/TRUNCATE granted, SELECT *not* granted
--   authenticated  all of the above PLUS SELECT
--   rows                      2
--
-- With RLS off, a grant is the whole access decision, so **any anonymous
-- caller holding the anon key — which ships inside the frontend bundle — could
-- INSERT, UPDATE or DELETE this table** through PostgREST. The missing SELECT
-- alongside present writes is the signature of Supabase default privileges
-- arming a new table, not of a deliberate policy: nobody grants write-but-
-- not-read on purpose.
--
-- This is an integrity target, not a data-exposure one, and it is a security
-- control in its own right. Per the run-tracking design, only helpers listed
-- here may be wrapped for automation run tracking — the table is "proof of
-- patching, not a wish list" — and `admin_automation_tracking_gaps()
-- .untracked_http_dispatchers` hard-fails CI on a caller that is missing from
-- it. So a writable registry means an attacker can either forge tracking for a
-- dispatcher that was never patched (a false green on the layer the auto-pause
-- net depends on) or empty it and break the CI gate. At 2 rows, a single
-- DELETE is the whole registry.
--
-- ROOT CAUSE: this table exists in production but **no file in this repository
-- mentions it** — it was created outside the migration path, so it never went
-- through the grant hygiene every reviewed table gets. The fix is therefore
-- also the first repo record of the object.

REVOKE ALL ON public.admin_automation_tracked_callers FROM anon;
REVOKE ALL ON public.admin_automation_tracked_callers FROM authenticated;

ALTER TABLE public.admin_automation_tracked_callers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_automation_tracked_callers IS
  'Registry of helpers proven to route through automation_http_post, gating which cron commands may be wrapped. Server-side only: no client reads or writes it. RLS is enabled with NO policy deliberately — see the migration that added it.';

-- NO POLICY IS CREATED, AND THAT IS THE INTENT.
--
-- RLS with no policy denies every role that is subject to it, which is exactly
-- right here because nothing reachable by a client needs this table:
--
--   * `service_role` BYPASSES RLS, so every edge function and cron keeps
--     working.
--   * The table is owned by `postgres` and `relforcerowsecurity` is false, so
--     the owner is not subject to RLS either. That is the path that matters:
--     the single reader, `admin_automation_effective_command()`, is *not*
--     SECURITY DEFINER, so it reads as its caller — and its only caller is
--     `sync_automations_to_cron()`, invoked from pg_cron as postgres. Verified
--     that no file under src/, functions/ or workers/ references either the
--     table or that function, so there is no client caller to strand.
--
-- Belt and braces on purpose: the REVOKEs alone would close it today, and
-- enabling RLS alone would not (a future GRANT would silently re-open it,
-- which is precisely how this table got here). Together, re-granting is no
-- longer sufficient to expose it.
--
-- Verified in a rolled-back transaction against production before shipping:
--
--   anon    INSERT / UPDATE / DELETE / TRUNCATE   true  -> false
--   authenticated SELECT                          true  -> false
--   service_role  SELECT                          true  -> true   (unchanged)
--   owner row read                                2     -> 2      (cron path intact)
--
-- Rollback:
--   ALTER TABLE public.admin_automation_tracked_callers DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_automation_tracked_callers TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.admin_automation_tracked_callers TO anon;
