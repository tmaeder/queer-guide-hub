-- Fix: approve_tag_suggestions returns 403 for authenticated users.
-- Function is SECURITY DEFINER — granting EXECUTE to authenticated is safe.

GRANT EXECUTE ON FUNCTION public.approve_tag_suggestions(uuid[], uuid) TO authenticated;
