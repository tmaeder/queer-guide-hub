-- 1. user_submission_reputation: switch from SECURITY DEFINER to
-- SECURITY INVOKER. The view aggregates community_submissions with
-- their audit log, grouped by submitter. With security_invoker, RLS on
-- the underlying tables applies per-querier — staff see all rows;
-- regular users see only their own.
-- Closes the last advisor ERROR.
ALTER VIEW public.user_submission_reputation SET (security_invoker = true);

-- 2. personality_internal_notes had two permissive SELECT policies for
-- `authenticated`:
--   * "Staff can read personality internal notes" cmd=SELECT
--   * "Staff can write personality internal notes" cmd=ALL
-- The "write" policy with cmd=ALL already permits SELECT for the same
-- role check (admin OR moderator OR editor). The SELECT-only policy is
-- redundant — drop it. Closes the remaining
-- multiple_permissive_policies advisor warning.
DROP POLICY IF EXISTS "Staff can read personality internal notes" ON public.personality_internal_notes;

-- Already applied to prod via Supabase MCP on 2026-05-02.
