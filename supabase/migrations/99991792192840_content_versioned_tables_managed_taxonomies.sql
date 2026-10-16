-- content_versioned_tables: re-mirror the content type registry after the
-- managed-taxonomy work added nine editable types.
--
-- WHY THIS EXISTS. `50010101100000_content_revisions.sql` seeded 25 registry
-- keys. This branch registers nine more content types as editable in the CMS —
-- amenities, competitions, event_categories, kink_categories, kink_items,
-- marketplace_categories, news_categories, tag_categories, taxonomy_terms —
-- and none of them reached `content_versioned_tables`. A content type editable
-- in the CMS but absent from that table has NO audit trail: the trigger reads
-- its configuration from this table, so an edit to one of those nine would be
-- written with nothing recording it, and `content_revision_revert_fields`
-- refuses any table absent from here, so that edit would also be unrevertable.
-- That is the exact failure the versioning feature was built to end,
-- reintroduced for nine types at once.
--
-- THE SEED IS RESTATED IN FULL, NOT APPENDED TO, and that is a requirement of
-- the guard rather than a style choice. `contentVersionedTablesDrift.test.ts`
-- finds the NEWEST migration containing this INSERT and parses only that one
-- (the styleguideScopes precedent — pin behaviour, not a filename). A migration
-- carrying only the nine new rows would become "the seed", and the test would
-- then read a 9-row mirror against a 34-key registry and fail. All 34 pairs are
-- listed here for that reason.
--
-- The registry key is NOT always the table name: `feedback` writes
-- `community_submissions`. Getting that wrong registers a table nothing edits
-- and leaves the real one unversioned, so these pairs were generated from
-- `contentTypeRegistry` + `internalContentTypeRegistry` rather than assumed.
--
-- NOTHING IS ARMED HERE. Every row ships with the column default (disabled).
-- `50010101100000`'s own measurement is why: the trigger costs ~0.34 ms/row and
-- `content_revisions` had to be re-sized by 45x once already (99991792001788),
-- so triggers are turned on table by table against the disk budget, never nine
-- at a time in the migration that registers them. `ON CONFLICT DO NOTHING`
-- leaves the 25 existing rows — and any `enabled` flag an operator has since
-- set on them — untouched.

INSERT INTO public.content_versioned_tables (registry_key, table_name) VALUES
  ('accessibility_attributes', 'accessibility_attributes'),
  ('amenities', 'amenities'),
  ('cities', 'cities'),
  ('cms_pages', 'cms_pages'),
  ('community_groups', 'community_groups'),
  ('competitions', 'competitions'),
  ('countries', 'countries'),
  ('event_amenities', 'event_amenities'),
  ('event_categories', 'event_categories'),
  ('event_services', 'event_services'),
  ('event_types', 'event_types'),
  ('events', 'events'),
  ('feedback', 'community_submissions'),
  ('guides', 'guides'),
  ('hotels', 'hotels'),
  ('kink_categories', 'kink_categories'),
  ('kink_items', 'kink_items'),
  ('marketplace_brands', 'marketplace_brands'),
  ('marketplace_categories', 'marketplace_categories'),
  ('marketplace_listings', 'marketplace_listings'),
  ('milestones', 'milestones'),
  ('news_articles', 'news_articles'),
  ('news_categories', 'news_categories'),
  ('organizations', 'organizations'),
  ('personalities', 'personalities'),
  ('professions', 'professions'),
  ('queer_villages', 'queer_villages'),
  ('redirects', 'redirects'),
  ('tag_categories', 'tag_categories'),
  ('target_groups', 'target_groups'),
  ('taxonomy_terms', 'taxonomy_terms'),
  ('unified_tags', 'unified_tags'),
  ('venue_services', 'venue_services'),
  ('venues', 'venues')
ON CONFLICT (registry_key) DO NOTHING;

DO $verify$
DECLARE
  v_missing text;
  v_wrong   text;
  v_armed   int;
BEGIN
  -- P1. Every one of the nine new types is registered. Named individually
  -- rather than counted, because a count passes if one is missing and an
  -- unrelated row was added in the same window.
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_missing
  FROM unnest(ARRAY[
    'amenities','competitions','event_categories','kink_categories','kink_items',
    'marketplace_categories','news_categories','tag_categories','taxonomy_terms'
  ]) AS k
  WHERE NOT EXISTS (
    SELECT 1 FROM public.content_versioned_tables t WHERE t.registry_key = k
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'P1 failed: registry keys absent from content_versioned_tables: %', v_missing;
  END IF;

  -- P2. Every table named here is a REAL table. A row pointing at a table that
  -- does not exist cannot be given a trigger, so it would read as registered
  -- and still never record anything.
  SELECT string_agg(t.registry_key || '->' || t.table_name, ', ' ORDER BY t.registry_key)
    INTO v_wrong
  FROM public.content_versioned_tables t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables i
    WHERE i.table_schema = 'public' AND i.table_name = t.table_name
  );
  IF v_wrong IS NOT NULL THEN
    RAISE EXCEPTION 'P2 failed: content_versioned_tables rows naming a non-existent table: %', v_wrong;
  END IF;

  -- P3. The mapping that is easy to get wrong, asserted directly.
  IF NOT EXISTS (
    SELECT 1 FROM public.content_versioned_tables
    WHERE registry_key = 'feedback' AND table_name = 'community_submissions'
  ) THEN
    RAISE EXCEPTION 'P3 failed: feedback must map to community_submissions, not to a feedback table';
  END IF;

  -- P4. This migration armed nothing. Scoped to the nine it inserts, so an
  -- operator having deliberately enabled one of the original 25 does not fail it.
  SELECT count(*) INTO v_armed
  FROM public.content_versioned_tables
  WHERE enabled
    AND registry_key IN (
      'amenities','competitions','event_categories','kink_categories','kink_items',
      'marketplace_categories','news_categories','tag_categories','taxonomy_terms'
    );
  IF v_armed <> 0 THEN
    RAISE EXCEPTION 'P4 failed: % newly registered table(s) ship enabled; the rollout is table-by-table', v_armed;
  END IF;
END
$verify$;
