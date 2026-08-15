-- Gate reads of `personalities` on `visibility`.
--
-- The policy this replaces was:
--
--   CREATE POLICY "Public read access for personalities"
--     FOR SELECT TO PUBLIC USING (true);
--
-- `USING (true)` for PUBLIC, so the **anon key** — which ships inside the
-- frontend bundle — could read every row in the table. Measured before this
-- migration: 1,614 public rows and 14,446 `visibility='draft'`, of which 6,967
-- carry `is_adult` and 2,947 are `review_status='archived'`. That archived
-- cohort is the personhood-disposition output: organizations misfiled as people
-- ("9th Ave Pub Corp", "The Avenue Grill"), deliberately taken out of
-- circulation and readable by anyone who looked.
--
-- This is NOT the leak fixed in functions/_lib/detail.ts. That one is the EDGE
-- path, which prefers SUPABASE_SERVICE_ROLE_KEY and bypasses RLS by design.
-- This is the ordinary browser client.
--
-- Because the policy was open, every client query had to remember
-- `visibility=eq.public` by hand, and three surfaces had already failed to:
--   * functions/_lib/detail.ts     -- 4,669 drafts served to Googlebot
--   * useBornThisWeek             -- #2734
--   * usePersonalitiesByProfession -- 171 profession pages, #2741
-- Each was fixed where it was found; this closes the class at the source.
--
-- `personalities` is the outlier, not a pattern: sweeping for unconditional
-- public SELECT policies on tables that also carry visibility/review_status/
-- is_adult returns only this table and `tag_aliases` (vocabulary rows, far
-- lower sensitivity — deliberately left alone).

DROP POLICY IF EXISTS "Public read access for personalities" ON public.personalities;

CREATE POLICY "personalities_public_read" ON public.personalities
  FOR SELECT
  TO PUBLIC
  USING (
    visibility = 'public'
    -- Staff roles, NOT is_admin() alone. The personalities CMS lives under the
    -- `content` nav section at minRole 'editor', and the ladder in
    -- src/config/adminRoles.ts is admin(3) > moderator(2) > editor(1) — so the
    -- moderator on this project can open it today. An admin-only predicate
    -- would show them an EMPTY console rather than an error, because RLS
    -- filters rows silently. has_any_role_jwt reads the `user_role` JWT claim
    -- and falls back to a user_roles lookup, which is the path that actually
    -- runs here (the JWT carries no such claim).
    OR has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[])
    -- The UPDATE policy on this table already lets a submitter edit their own
    -- row (auth.uid() = created_by). Without a matching read arm they could
    -- update a row they cannot see.
    OR (SELECT auth.uid()) = created_by
  );

COMMENT ON POLICY "personalities_public_read" ON public.personalities IS
  'Anon and ordinary signed-in users see visibility=public only. Staff (admin/moderator/editor) and a row''s own creator see everything. Replaced a USING (true) policy that exposed 14,446 drafts to the anon key.';

-- Verified in a rolled-back transaction against production data before shipping:
--
--   role                     non-public rows   total visible
--   anon                                   0           1,614
--   moderator (user_roles)            14,446          16,060
--   signed-in, no role                     0           1,614
--
-- Unaffected: service_role bypasses RLS, so every edge function, cron, pipeline
-- stage, search indexer and data-quality script keeps full access; SECURITY
-- DEFINER functions and views run as owner. Six of the seven public
-- personality hooks already filtered visibility and return identical rows.
--
-- Rollback is one statement:
--   DROP POLICY "personalities_public_read" ON public.personalities;
--   CREATE POLICY "Public read access for personalities"
--     ON public.personalities FOR SELECT TO PUBLIC USING (true);
