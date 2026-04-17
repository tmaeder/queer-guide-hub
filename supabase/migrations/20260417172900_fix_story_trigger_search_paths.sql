-- Supabase advisor flagged these three story-related trigger functions for
-- having a role-mutable search_path. Pin them to `public, extensions` to
-- match the rest of the story-grouping RPCs. Applied in-prod on 2026-04-17.
ALTER FUNCTION public.tg_feedback_stories_touch() SET search_path = public, extensions;
ALTER FUNCTION public.tg_audit_story_member() SET search_path = public, extensions;
ALTER FUNCTION public.notify_feedback_embed() SET search_path = public, extensions;
