-- Issue #139: app-wide 403s on /rest/v1/profiles
--
-- Multiple migrations have stacked policies on public.profiles over time
-- (20250817174552 created profiles_select_own, 20250824085153 layered
-- profiles_owner_full_access, etc.). RLS combines permissive policies
-- with OR, so any one match grants access — but the cumulative state
-- across environments has drifted, and the symptom (admin gets 403 on
-- their own row) suggests at least one environment is missing a clean
-- self-read SELECT policy for `authenticated`.
--
-- Idempotently re-assert the canonical owner-self SELECT policy. This
-- does not drop the layered policies (admin override, public-visible,
-- service_role_all) — they remain additive.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';
