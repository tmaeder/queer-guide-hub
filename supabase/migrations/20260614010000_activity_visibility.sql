-- Personal layer Phase 5: opt-in friend-activity visibility.
--
-- user_activity_events has had a single self-only SELECT policy — a user's
-- activity is invisible to everyone but themselves. This adds an OPT-IN path so
-- a user can choose to share their recent activity, gated by a new
-- privacy_settings.activity_visibility tier (mirrors profile_visibility):
--   'public'/'community' -> any signed-in viewer
--   'friends'            -> accepted friends only (are_friends)
--   'private' / absent   -> nobody (DEFAULT — deny-by-default)
--
-- The existing self-select policy is left intact; the new policy is additive
-- (RLS SELECT policies are OR'd). Nothing is exposed until a user explicitly
-- raises their tier, so this migration is a no-op for every current user.

CREATE OR REPLACE FUNCTION public.can_view_user_activity(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_owner IS NOT NULL
    AND (
      auth.uid() = p_owner  -- self always
      OR EXISTS (
        SELECT 1
        FROM public.profiles pr
        WHERE pr.user_id = p_owner
          AND (
            pr.privacy_settings->>'activity_visibility' IN ('public', 'community')
            OR (
              pr.privacy_settings->>'activity_visibility' = 'friends'
              AND public.are_friends(auth.uid(), p_owner)
            )
          )
      )
    );
$$;

COMMENT ON FUNCTION public.can_view_user_activity(uuid) IS
  'Phase 5: true iff the caller may read p_owner''s activity — self, or per the owner''s privacy_settings.activity_visibility tier (public/community = any signed-in; friends = accepted friends). Missing/private => false.';

GRANT EXECUTE ON FUNCTION public.can_view_user_activity(uuid) TO authenticated;

-- Additive opt-in SELECT policy (OR'd with the existing self-select policy).
DROP POLICY IF EXISTS user_activity_events_optin_select ON public.user_activity_events;
CREATE POLICY user_activity_events_optin_select
  ON public.user_activity_events
  FOR SELECT
  TO authenticated
  USING (public.can_view_user_activity(user_id));
