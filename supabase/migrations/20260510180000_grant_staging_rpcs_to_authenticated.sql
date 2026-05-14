-- Fix: get_staging_page and get_staging_ids return 403 for authenticated users.
-- Both are SECURITY DEFINER with has_any_role_jwt(admin, moderator) checks inside,
-- so granting EXECUTE to authenticated is safe.

GRANT EXECUTE ON FUNCTION public.get_staging_page(text, text, text, text, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staging_ids(text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staging_ids(text, text, text, integer, text) TO authenticated;
