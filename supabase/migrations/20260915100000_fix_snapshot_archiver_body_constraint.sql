-- The snapshot archiver has never archived anything, by construction.
--
-- scraper_mark_snapshot_archived() frees the body once the worker has copied it
-- to R2:
--     UPDATE scraper_snapshots
--        SET archived_at = now(), r2_key = p_r2_key, content = NULL, content_gz = NULL
--
-- while the table carried
--     CONSTRAINT scraper_snapshots_body_present
--       CHECK (content IS NOT NULL OR content_gz IS NOT NULL)
--
-- The two are mutually exclusive, so every archive attempt raised 23514 and rolled
-- back. Measured on prod 2026-08-21 before this migration: 2,683 rows, of which
-- archived_at IS NOT NULL on 0 and r2_key IS NOT NULL on 0 — not one row has ever
-- been archived since the feature shipped.
--
-- It failed silently. The worker catches per-row errors and only console.error's
-- them, the HTTP response is a 200 carrying {"archived":0,"failed":N}, and the
-- weekly cron's output goes to Workers logs nothing watches. It surfaced only
-- because setting ADMIN_SECRET made a manual POST / possible and someone read the
-- response body.
--
-- The R2 upload happens BEFORE the failing RPC, so each weekly run also re-uploads
-- objects that are already there. Keys are deterministic
-- (scraper-snapshots/<source>/<year>/<id>.gz), so that overwrites rather than
-- accumulates — wasted writes, not runaway storage.
--
-- Fix: keep the original intent (a snapshot row must not be silently empty) but
-- admit the archived state as a third legal shape. A row may lack a body only once
-- it demonstrably lives in R2 — archived_at AND r2_key both set.

ALTER TABLE public.scraper_snapshots
  DROP CONSTRAINT IF EXISTS scraper_snapshots_body_present;

-- Validated, not NOT VALID: the new predicate is strictly weaker than the old one
-- ((A OR B) → (A OR B OR C)), so every existing row provably satisfies it, and the
-- table is small enough for the scan to be free (2,683 rows / 7 MB, measured).
ALTER TABLE public.scraper_snapshots
  ADD CONSTRAINT scraper_snapshots_body_present
  CHECK (
    content IS NOT NULL
    OR content_gz IS NOT NULL
    OR (archived_at IS NOT NULL AND r2_key IS NOT NULL)
  );

COMMENT ON CONSTRAINT scraper_snapshots_body_present ON public.scraper_snapshots IS
  'A snapshot must carry a body UNLESS it has been archived to R2 (archived_at + r2_key both set), in which case the body lives there instead. The third arm is what makes scraper_mark_snapshot_archived() possible; without it the archiver raises 23514 on every row.';

-- ---------------------------------------------------------------------------
-- Tighten the grants this constraint was accidentally covering for.
--
-- Until now the broken constraint blocked scraper_mark_snapshot_archived() for
-- EVERY caller, including ones that should never have reached it. Making the
-- function work again removes that accidental brake, so the deliberate controls
-- had better be right.
--
-- They are, so this is belt-and-braces rather than a live fix — but the margin is
-- thinner than it should be. Verified live before writing: anon and authenticated
-- hold INSERT/UPDATE/DELETE on scraper_snapshots (the documented "DEFAULT
-- PRIVILEGES arm every new object" pattern), and PUBLIC/anon/authenticated hold
-- EXECUTE on the function. What actually saves it is RLS: enabled, with a single
-- policy "Admin only" USING (false) for ALL/public, so no row is reachable by any
-- role subject to RLS. Only service_role (BYPASSRLS) gets through — the archiver
-- worker itself.
--
-- One permissive policy added later would turn those grants real, on a function
-- whose entire job is to destroy content. The function is SECURITY INVOKER
-- (verified: prosecdef = false), so revoking EXECUTE costs its real caller
-- nothing: the worker authenticates as service_role.
-- ---------------------------------------------------------------------------
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.scraper_snapshots FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.scraper_snapshots FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.scraper_mark_snapshot_archived(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.scraper_mark_snapshot_archived(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.scraper_mark_snapshot_archived(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.scraper_mark_snapshot_archived(uuid, text) TO service_role;
