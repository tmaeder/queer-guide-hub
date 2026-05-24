-- Fix Supabase Security Advisor: security_definer_view (0010)
--
-- Both `public.entity_cluster_membership` and `public.admin_media_unified`
-- were created without `security_invoker`, defaulting to SECURITY DEFINER
-- semantics — the view runs with the creator's permissions and bypasses
-- RLS on underlying tables. Recreate with security_invoker = true so each
-- query enforces the calling user's RLS and grants.

alter view public.entity_cluster_membership set (security_invoker = true);
alter view public.admin_media_unified       set (security_invoker = true);

-- cluster_entity_counts was added in the same migration as
-- entity_cluster_membership; harden it too for consistency.
alter view public.cluster_entity_counts     set (security_invoker = true);
