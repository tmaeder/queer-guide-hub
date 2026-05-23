-- Re-grant EXECUTE on feedback-story RPCs to the `authenticated` role.
--
-- These functions were originally granted to `authenticated` in
-- migrations 20260418000000 and 20260418030000, but the live ACL no
-- longer reflects those grants (a later migration recreated the
-- functions in a way that dropped the ACL). The admin Feedback drawer
-- has been getting PostgREST 403s on every divergence/cascade/etc.
-- call as a result — see feedback submission 81017609 (2026-05-22).
--
-- All eight functions are SECURITY DEFINER and gate access internally
-- via `has_any_role_jwt(ARRAY['admin','moderator'])` (or, for the
-- read-only divergence helper, via the SECURITY DEFINER + table-owner
-- bypass pattern). Granting the `authenticated` role EXECUTE is safe.

GRANT EXECUTE ON FUNCTION public.add_story_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cascade_story_to_members(uuid, text, smallint, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_story(text, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_story_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_story(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_story_narrative(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.story_member_divergence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_story_from_ids(uuid[]) TO authenticated;
