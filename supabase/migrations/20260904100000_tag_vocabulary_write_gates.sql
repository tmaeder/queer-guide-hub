-- Restrict WRITES on the tag vocabulary to staff.
--
-- `tag_aliases` and `unified_tags` both gated INSERT/UPDATE/DELETE on nothing
-- more than `auth.uid() IS NOT NULL`, and `authenticated` holds all three
-- grants — so **any signed-in user could rewrite or delete the entire search
-- vocabulary**: 15,106 aliases + 9,170 tags = 24,276 rows. Verified by running
-- an UPDATE as a signed-in user carrying no role at all, inside a transaction
-- that was rolled back:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<a uuid with no user_roles row>"}';
--   update tag_aliases set alias_name = 'PWNED' ... ;   -- SUCCEEDED
--
-- This is not a read-exposure problem, it is an integrity one, and the damage
-- would be quiet: aliases drive search resolution, so repointing them
-- (`canonical_tag_id`) poisons results rather than breaking anything visibly,
-- and deleting the 14,931 `multilingual` aliases would silently end
-- non-English tag search.
--
-- The sibling vocabularies already do this correctly — `professions` and
-- `tag_categories` gate every write on a role check. These two were the
-- outliers.
--
-- STAFF, NOT ADMIN-ONLY. `professions`/`tag_categories` use
-- has_role_jwt('admin'), which would be wrong here: the tags admin lives at
-- /admin/content/unified_tags, inside the `content` nav section whose minRole
-- is 'editor', and the ladder in src/config/adminRoles.ts is
-- admin(3) > moderator(2) > editor(1). This project has 4 admins and 1
-- moderator, and that moderator can open the page — an admin-only write policy
-- would give them a console that loads fine and then silently refuses every
-- save. Same reasoning as 20260903100000. (The two sibling tables are
-- admin-only AND reachable at editor level, so they likely have this bug in
-- reverse; left alone here rather than widened as a drive-by.)
--
-- READS ARE DELIBERATELY UNCHANGED on tag_aliases. Its `review_status` looks
-- like a publication gate but is not: the values are `auto` (15,036, machine
-- generated) and `approved` (70, human curated). There is no pending, rejected
-- or draft state, so nothing is being hidden, and gating reads on 'approved'
-- would drop 99.5% of the vocabulary and break multilingual tag resolution.
-- `unified_tags` already has a sensitivity-aware read policy
-- (`unified_tags_public_gated_read`) and is untouched.

-- ── tag_aliases ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert tag_aliases" ON public.tag_aliases;
DROP POLICY IF EXISTS "Authenticated users can update tag_aliases" ON public.tag_aliases;
DROP POLICY IF EXISTS "Authenticated users can delete tag_aliases" ON public.tag_aliases;

CREATE POLICY "tag_aliases_staff_insert" ON public.tag_aliases
  FOR INSERT TO PUBLIC
  WITH CHECK (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

CREATE POLICY "tag_aliases_staff_update" ON public.tag_aliases
  FOR UPDATE TO PUBLIC
  USING (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

CREATE POLICY "tag_aliases_staff_delete" ON public.tag_aliases
  FOR DELETE TO PUBLIC
  USING (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

-- ── unified_tags ───────────────────────────────────────────────────────────
-- Included because fixing only the aliases would be half a fix: the canonical
-- rows they point at were writable by the same population.
DROP POLICY IF EXISTS "Authenticated users can insert unified tags" ON public.unified_tags;
DROP POLICY IF EXISTS "Authenticated users can update unified tags" ON public.unified_tags;
DROP POLICY IF EXISTS "Authenticated users can delete unified tags" ON public.unified_tags;

CREATE POLICY "unified_tags_staff_insert" ON public.unified_tags
  FOR INSERT TO PUBLIC
  WITH CHECK (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

CREATE POLICY "unified_tags_staff_update" ON public.unified_tags
  FOR UPDATE TO PUBLIC
  USING (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

CREATE POLICY "unified_tags_staff_delete" ON public.unified_tags
  FOR DELETE TO PUBLIC
  USING (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

COMMENT ON POLICY "tag_aliases_staff_update" ON public.tag_aliases IS
  'Writes are staff-only (admin/moderator/editor). Replaced a policy gated on auth.uid() IS NOT NULL, under which any signed-in user could repoint or delete all 15,106 search aliases.';

-- Unaffected: `service_role` bypasses RLS, so tag-enrichment-sweep,
-- ai-suggestions and every other edge function and cron keeps writing. The
-- public tag pages (TagsIndex, TagDetail) only ever read — they destructure
-- `{ allTags, categoriesTree, loading, error }` from useCentralizedTags and
-- never call its mutations; the mutation callers are all under
-- src/components/admin/ or src/pages/admin/.
--
-- Verified in a rolled-back transaction against production data:
--   signed-in, no role  -> UPDATE/DELETE/INSERT all rejected
--   moderator           -> all three succeed
--
-- Rollback: drop the six policies and recreate the originals with
-- `USING ((SELECT auth.uid()) IS NOT NULL)`.
