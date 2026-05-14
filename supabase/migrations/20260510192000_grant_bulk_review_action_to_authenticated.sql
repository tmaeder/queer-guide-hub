-- Fix: admin_bulk_review_action returns 403 for authenticated users.
-- Function is SECURITY DEFINER with has_any_role_jwt(admin, moderator) check inside.

GRANT EXECUTE ON FUNCTION public.admin_bulk_review_action(text, uuid) TO authenticated;
