-- Consolidate RLS policies to resolve Supabase advisor performance warnings:
--   * auth_rls_initplan on group_join_requests (wrap auth.uid() in SELECT)
--   * multiple_permissive_policies on group_join_requests, community_groups,
--     pipeline_health_alerts (collapse overlapping policies per action)

-- 1. group_join_requests ------------------------------------------------------

DROP POLICY IF EXISTS "Requesters read own requests"       ON public.group_join_requests;
DROP POLICY IF EXISTS "Group admins read requests"         ON public.group_join_requests;
DROP POLICY IF EXISTS "Users submit own join request"      ON public.group_join_requests;
DROP POLICY IF EXISTS "Requesters cancel own pending"      ON public.group_join_requests;
DROP POLICY IF EXISTS "Group admins manage requests"       ON public.group_join_requests;

CREATE POLICY "group_join_requests_read"
ON public.group_join_requests
FOR SELECT
USING (
  (select auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = (select auth.uid())
      AND gm.role IN ('admin', 'moderator')
  )
);

CREATE POLICY "group_join_requests_insert_own"
ON public.group_join_requests
FOR INSERT
WITH CHECK (
  (select auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.community_groups cg
    WHERE cg.id = group_join_requests.group_id AND cg.is_private = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = (select auth.uid())
  )
);

-- Single UPDATE policy: either (a) requester cancelling own pending row, or
-- (b) group admin/moderator. WITH CHECK enforces that requesters may only move
-- their own row from pending -> cancelled; admins have no such restriction.
CREATE POLICY "group_join_requests_update"
ON public.group_join_requests
FOR UPDATE
USING (
  ((select auth.uid()) = user_id AND status = 'pending')
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = (select auth.uid())
      AND gm.role IN ('admin', 'moderator')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = (select auth.uid())
      AND gm.role IN ('admin', 'moderator')
  )
  OR ((select auth.uid()) = user_id AND status IN ('pending', 'cancelled'))
);

-- 2. community_groups ---------------------------------------------------------
-- "Public read access for community_groups" already uses USING(true); this
-- discovery policy is fully redundant.
DROP POLICY IF EXISTS "Authenticated users discover private groups" ON public.community_groups;

-- 3. pipeline_health_alerts ---------------------------------------------------
-- Keep the open SELECT policy; restrict admin_all to write actions only so the
-- planner no longer ORs two permissive SELECT policies.
DROP POLICY IF EXISTS "pipeline_health_alerts_admin_all" ON public.pipeline_health_alerts;

CREATE POLICY "pipeline_health_alerts_admin_insert"
ON public.pipeline_health_alerts
FOR INSERT
WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY "pipeline_health_alerts_admin_update"
ON public.pipeline_health_alerts
FOR UPDATE
USING (has_role((select auth.uid()), 'admin'::app_role))
WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY "pipeline_health_alerts_admin_delete"
ON public.pipeline_health_alerts
FOR DELETE
USING (has_role((select auth.uid()), 'admin'::app_role));
