-- Close an anon-reachable write-capable SECURITY DEFINER function.
--
-- `public.run_marketplace_taxonomy_backfill(integer)` is the batched v3 taxonomy
-- backfill from 20260927110000, re-created by 20260927130000. Both files end with
--
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION ... TO service_role, authenticated;
--
-- and both left `anon` holding EXECUTE. **Revoking FROM PUBLIC does not remove a
-- role-specific grant.** Supabase ships
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated,
-- service_role`, so the function is born with all three entries in its ACL; the
-- REVOKE deletes a PUBLIC entry that was never there and the `anon=X` entry
-- survives untouched. Measured on prod before this migration:
--
--     proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- The body carries no `assert_admin_or_internal()`, so anyone holding the public
-- anon key could invoke it over PostgREST and have it run as the owner with RLS
-- not applying. This is the same defect and the same one-line cause as
-- 20260927110100 (tmp_dancesafe_embed_nudge), eight days later — the REVOKE/GRANT
-- pair reads as if it closes the door, which is why it keeps being written.
-- `check-anon-function-grants.mjs` (the `anon_function_exposure` gate from
-- 20260824100000) caught it again, and because that gate measures PROD rather
-- than the branch it blocked every open PR in the repo until prod was fixed.
-- The revoke was therefore applied live on 2026-08-23 and is restated here
-- idempotently so the repo matches the database and an environment rebuild
-- cannot reintroduce the grant.
--
-- `authenticated` goes too, not just `anon`. There is no call site: the only
-- caller is the `marketplace_taxonomy_backfill` pg_cron job, which runs
-- `SELECT public.run_marketplace_taxonomy_backfill(100);` as `postgres` (the
-- owner) and is unaffected by any grant here. Handing an unauthenticated-by-body
-- write batch to every logged-in user is the same hole one step less severe, and
-- the gate only happens not to look for it. If an admin console ever needs to
-- call this, the fix is `PERFORM assert_admin_or_internal();` in the body — not
-- a grant.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'run_marketplace_taxonomy_backfill'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.run_marketplace_taxonomy_backfill(integer)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
