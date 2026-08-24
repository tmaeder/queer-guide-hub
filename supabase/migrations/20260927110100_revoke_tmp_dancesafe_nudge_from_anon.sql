-- Close an anon-reachable write-capable SECURITY DEFINER function.
--
-- NOT FROM THIS BRANCH'S WORK. `public.tmp_dancesafe_embed_nudge()` is
-- abandoned scaffolding left on prod by another session: a temporary cron
-- helper (`tmp-dancesafe-embed-nudge`) that unschedules itself after 20 ticks.
-- It is SECURITY DEFINER and VOLATILE, and its ACL granted EXECUTE to PUBLIC
-- *and* anon — so any caller with the public anon key could invoke it over
-- PostgREST and have it run as the owner, with RLS not applying.
--
-- `check-anon-function-grants.mjs` (the `anon_function_exposure` gate from
-- 20260824100000) caught it, which is the gate working exactly as intended.
-- Because that gate runs against PROD rather than the branch, it blocked every
-- open PR until prod itself was fixed, so the revoke was applied live on
-- 2026-08-23 and is restated here idempotently so the repo matches the
-- database and a later environment rebuild cannot reintroduce the grant.
--
-- Deliberately a REVOKE and not a DROP: this function belongs to someone
-- else's work-in-progress. Removing the anon/PUBLIC grant closes the security
-- hole while leaving the object and its owner's access intact. Whoever owns
-- the dancesafe embed backfill should drop it when that work lands —
-- see the abandoned-work-on-prod precedent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'tmp_dancesafe_embed_nudge'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.tmp_dancesafe_embed_nudge() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
