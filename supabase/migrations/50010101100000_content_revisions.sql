-- Versioning that actually records, for every content type.
--
-- ── WHAT WAS THERE, MEASURED ────────────────────────────────────────────────
-- Two tables claimed to be the revision trail and neither worked.
--
-- `admin_edit_log`: 0 rows, ever. RLS is enabled and the table carries exactly
-- one policy — `Admin read edit log`, for SELECT. There is no INSERT policy, so
-- every insert from useInlineSave was denied, and the client swallowed it in a
-- bare `catch {}`. The alt-click inline edit, the path an admin actually uses
-- on a public page, has never recorded a single change.
--
-- `cms_revisions`: 28 rows over seven months, across 4 of 26 content types, 28
-- distinct entities, and `max(revision_number) = 1` on every one of them — no
-- record has ever had a second revision. It is written client-side,
-- fire-and-forget inside a `void (async …)` whose catch only console.errors; it
-- reads-then-increments `revision_number` against a UNIQUE index, so a race is
-- a swallowed 23505; and it snapshots the CLIENT's form state rather than the
-- row the server actually stored.
--
-- This repo already named the gap, in 20270301100400_external_correction_audit:
-- "unified_tags is the ONLY table in this schema with a generic, revertible,
-- field-level audit ... So a bad automated batch against venues, cities, events
-- or countries is unrevertible today."
--
-- ── WHY A TRIGGER ───────────────────────────────────────────────────────────
-- Both dead paths were client code. A fire-and-forget insert from a browser is
-- not a record: it fails silently, it cannot see a write made by a cron or an
-- edge function, and it records what the client believed rather than what the
-- database did. The model to copy is log_unified_tag_change(), the one working
-- audit in this schema.
--
-- ── WHY A DELTA, NOT A SNAPSHOT ─────────────────────────────────────────────
-- This records EVERY write, machine writes included. Measured on prod:
-- ~5,400 content rows are touched per day (marketplace_listings 2,780,
-- news_articles 1,493, personalities 818, events 204, venues 29, cities 25,
-- unified_tags 5), and the wide tables average 4.3-4.6 KB per row (venues has
-- 90 columns, events 82, countries 81, marketplace_listings 70, cities 69).
--
--   whole-row before+after  ~9 KB x 5,400/day  = ~45 MB/day  = ~16 GB/year
--   changed-columns delta                      = ~3 MB/day   = ~1.1 GB/year
--
-- The database is 12 GB. The first would more than double it in a year; the
-- second is +9%. The delta loses no coverage — every write still produces a
-- revision, it just stores what changed.
--
-- ── ACTOR CLASSIFICATION IS THE OTHER HALF ──────────────────────────────────
-- Most rows here will be machine writes, so a human edit has to be
-- distinguishable at a glance, and retention has to be able to treat the two
-- differently. auth.uid() reads the JWT `sub` claim and is NULL for pg_cron,
-- migrations and service_role edge functions — verified against the live
-- function definition, not assumed. `app.actor` is the existing convention
-- (log_unified_tag_change defaults it to 'system:trigger'), so a migration or
-- RPC that declares itself is credited rather than lumped in with the crons.
--
-- An edge function that forwards a user's JWT is recorded as `human`. That is
-- correct: it is acting for that user.

BEGIN;

-- ── The allowlist ───────────────────────────────────────────────────────────
-- The DB has to know which tables are versioned: the trigger reads its own
-- configuration from here, the revert RPC refuses any table that is not in it,
-- and the sentinel fails when a registry content type has no trigger.
-- Kept in step with src/config/contentTypes by a drift test.
CREATE TABLE IF NOT EXISTS public.content_versioned_tables (
  registry_key   text PRIMARY KEY,
  table_name     text NOT NULL UNIQUE,
  -- The kill switch. A row UPDATE, not `ALTER TABLE ... DISABLE TRIGGER`:
  -- disabling a trigger takes ACCESS EXCLUSIVE on the table, and taking that
  -- on a 206 MB hot table during an incident is its own outage.
  enabled        boolean NOT NULL DEFAULT false,
  -- Columns whose change carries no information. A revision whose only content
  -- is "updated_at moved" costs a row and says nothing, so these are removed
  -- BEFORE the no-op test rather than after it.
  ignore_columns text[] NOT NULL DEFAULT ARRAY['updated_at'],
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_versioned_tables IS
  'Which content tables carry a revision trigger. `enabled` is the kill switch — flip it with an UPDATE, no DDL and no table lock. Mirrors src/config/contentTypes; drift-tested.';

-- ── The log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_revisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table   text NOT NULL,
  source_id      uuid NOT NULL,
  op             char(1) NOT NULL CHECK (op IN ('I', 'U', 'D')),
  -- Changed keys only on an UPDATE; empty on INSERT; the whole row on DELETE,
  -- where a delta has no meaning because there is no row left to diff against.
  -- NOT NULL, and a SQL NULL is stored as the jsonb scalar 'null': the
  -- external_correction_audit rule that a missing before-image is
  -- unrepresentable. "This field had no value" and "we did not record it" must
  -- not look the same.
  before         jsonb NOT NULL,
  after          jsonb NOT NULL,
  changed_fields text[] NOT NULL,
  actor_kind     text NOT NULL CHECK (actor_kind IN ('human', 'declared', 'system')),
  actor_id       uuid,
  actor          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.content_revisions.before IS
  'Previous values for the changed keys. A key absent from the old row is stored as jsonb ''null'' — absence of a value is a value, absence of a record is not.';
COMMENT ON COLUMN public.content_revisions.actor_kind IS
  'human = a logged-in person (auth.uid()); declared = a migration/RPC that set app.actor; system = pg_cron, an edge function on the service role, or an unattributed write. Retention and the history UI both key on this.';

-- The only access pattern that matters: one record's history, newest first.
CREATE INDEX IF NOT EXISTS content_revisions_entity_idx
  ON public.content_revisions (source_table, source_id, created_at DESC);
-- Retention scans by kind and age; a human revision is never pruned.
CREATE INDEX IF NOT EXISTS content_revisions_prune_idx
  ON public.content_revisions (created_at)
  WHERE actor_kind = 'system';

ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versioned_tables ENABLE ROW LEVEL SECURITY;

-- Read-only to staff. There is deliberately NO insert policy: the trigger is
-- the only writer and reaches the table as the owner. An insert policy is
-- exactly what would let a client write history again.
DROP POLICY IF EXISTS "Staff read content revisions" ON public.content_revisions;
CREATE POLICY "Staff read content revisions" ON public.content_revisions
  FOR SELECT TO authenticated
  USING (public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));

DROP POLICY IF EXISTS "Staff read versioned tables" ON public.content_versioned_tables;
CREATE POLICY "Staff read versioned tables" ON public.content_versioned_tables
  FOR SELECT TO authenticated
  USING (public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role, 'editor'::public.app_role]));

REVOKE ALL ON public.content_revisions FROM anon;
REVOKE ALL ON public.content_versioned_tables FROM anon;
GRANT SELECT ON public.content_revisions TO authenticated;
GRANT SELECT ON public.content_versioned_tables TO authenticated;

-- ── The trigger ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_content_revision() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_enabled  boolean;
  v_ignore   text[];
  v_actor_id uuid := auth.uid();
  v_actor    text := nullif(current_setting('app.actor', true), '');
  v_kind     text;
  v_old      jsonb;
  v_new      jsonb;
  v_before   jsonb;
  v_after    jsonb;
BEGIN
  -- Cheapest possible exit first: an UPDATE that changed nothing writes
  -- nothing. Row-level `IS NOT DISTINCT FROM` before any jsonb work.
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
    RETURN NULL;
  END IF;

  SELECT enabled, ignore_columns INTO v_enabled, v_ignore
    FROM public.content_versioned_tables
   WHERE table_name = TG_TABLE_NAME;

  -- Unregistered or switched off. Not an error: this is how a table is taken
  -- out of the trail without DDL on a hot table.
  IF NOT FOUND OR NOT v_enabled THEN
    RETURN NULL;
  END IF;

  IF v_actor_id IS NOT NULL THEN
    v_kind := 'human';
  ELSIF v_actor IS NOT NULL AND v_actor NOT LIKE 'system:%' THEN
    v_kind := 'declared';
  ELSE
    v_kind := 'system';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_after
      FROM jsonb_each(v_new) WHERE NOT (key = ANY (v_ignore));
    v_before := '{}'::jsonb;

  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_before
      FROM jsonb_each(v_old) WHERE NOT (key = ANY (v_ignore));
    v_after := '{}'::jsonb;

  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    -- Keys whose VALUE differs. Deliberately not `to_jsonb(NEW) - to_jsonb(OLD)`:
    -- jsonb subtraction removes by key NAME, so it would return every column.
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_after
      FROM jsonb_each(v_new)
     WHERE NOT (key = ANY (v_ignore))
       AND value IS DISTINCT FROM (v_old -> key);

    -- Only bookkeeping columns moved — nothing worth a row.
    IF v_after = '{}'::jsonb THEN
      RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_object_agg(k, coalesce(v_old -> k, 'null'::jsonb)), '{}'::jsonb)
      INTO v_before
      FROM jsonb_object_keys(v_after) AS k;
  END IF;

  INSERT INTO public.content_revisions
    (source_table, source_id, op, before, after, changed_fields, actor_kind, actor_id, actor)
  VALUES (
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'id')::uuid ELSE (to_jsonb(NEW) ->> 'id')::uuid END,
    left(TG_OP, 1),
    v_before,
    v_after,
    ARRAY(SELECT jsonb_object_keys(CASE WHEN TG_OP = 'DELETE' THEN v_before ELSE v_after END)),
    v_kind,
    v_actor_id,
    v_actor
  );

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.log_content_revision() IS
  'AFTER row trigger recording every write to a registered content table as a changed-columns delta. Attach per table; enable via content_versioned_tables.enabled.';

REVOKE ALL ON FUNCTION public.log_content_revision() FROM PUBLIC, anon, authenticated;

-- ── Seed the allowlist, all disabled ────────────────────────────────────────
-- Mirrors src/config/contentTypes. Every row starts disabled: the triggers are
-- attached and switched on table by table, smallest first, with the size of a
-- revision measured between waves. Turning 26 triggers on in one migration is
-- how you find out about write amplification from a statement timeout.
INSERT INTO public.content_versioned_tables (registry_key, table_name) VALUES
  ('venues', 'venues'),
  ('events', 'events'),
  ('personalities', 'personalities'),
  ('news_articles', 'news_articles'),
  ('cities', 'cities'),
  ('countries', 'countries'),
  ('unified_tags', 'unified_tags'),
  ('marketplace_listings', 'marketplace_listings'),
  ('marketplace_brands', 'marketplace_brands'),
  ('community_groups', 'community_groups'),
  ('cms_pages', 'cms_pages'),
  ('hotels', 'hotels'),
  ('queer_villages', 'queer_villages'),
  ('feedback', 'community_submissions'),
  ('milestones', 'milestones'),
  ('organizations', 'organizations'),
  ('guides', 'guides'),
  ('redirects', 'redirects'),
  ('venue_services', 'venue_services'),
  ('event_types', 'event_types'),
  ('event_amenities', 'event_amenities'),
  ('event_services', 'event_services'),
  ('accessibility_attributes', 'accessibility_attributes'),
  ('target_groups', 'target_groups'),
  ('professions', 'professions')
ON CONFLICT (registry_key) DO NOTHING;

-- `community_submissions` has no `updated_at` column at all — verified across
-- all 25 tables. Nothing here may assume one exists; its ignore list is empty.
UPDATE public.content_versioned_tables
   SET ignore_columns = '{}'::text[]
 WHERE table_name = 'community_submissions';

DO $verify$
DECLARE
  v_missing text;
  v_bad     text;
BEGIN
  -- Every registered table must exist and carry an `id` column, because that
  -- is what source_id records and what the revert RPC keys on.
  SELECT string_agg(t.table_name, ', ') INTO v_missing
    FROM public.content_versioned_tables t
   WHERE to_regclass('public.' || quote_ident(t.table_name)) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'content_versioned_tables names tables that do not exist: %', v_missing;
  END IF;

  SELECT string_agg(t.table_name, ', ') INTO v_bad
    FROM public.content_versioned_tables t
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'id'
   );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'registered tables with no id column: %', v_bad;
  END IF;

  -- Nothing is armed yet. A migration that silently enabled the hot tables
  -- would skip the measured rollout this design depends on.
  IF EXISTS (SELECT 1 FROM public.content_versioned_tables WHERE enabled) THEN
    RAISE EXCEPTION 'no table may be enabled by this migration';
  END IF;
END $verify$;

COMMIT;
