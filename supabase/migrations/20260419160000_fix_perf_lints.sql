-- ============================================================
-- Fix Supabase performance linter warnings:
--   1. multiple_permissive_policies on
--      public.trip_suggestion_impressions (SELECT)
--   2. duplicate_index on public.affiliate_partners
--      (partner_name)
-- ============================================================

-- 1. Consolidate the two SELECT policies (admin + own) into one.
--    Multiple permissive policies for the same role+action force
--    PostgREST to evaluate every policy on every row.
DROP POLICY IF EXISTS trip_suggestion_impressions_admin_select
  ON public.trip_suggestion_impressions;
DROP POLICY IF EXISTS trip_suggestion_impressions_own_select
  ON public.trip_suggestion_impressions;

CREATE POLICY trip_suggestion_impressions_select
  ON public.trip_suggestion_impressions
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- 2. Drop the redundant standalone unique index. The
--    `uq_affiliate_partner_name` index backs the UNIQUE
--    constraint of the same name, so it must stay.
DROP INDEX IF EXISTS public.affiliate_partners_partner_name_key;
