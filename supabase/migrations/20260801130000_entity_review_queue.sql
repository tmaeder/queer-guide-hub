-- ============================================================================
-- B1 — one review queue instead of five
--
-- city_review_queue, venue_review_queue, village_review_queue,
-- personality_review_queue and marketplace_review_queue are position-for-
-- position identical: the same 12 columns in the same order, the same partial
-- unique index on (<entity>_id, field) WHERE status='open'. The ONLY real
-- difference is the name of the FK column and the `field` CHECK list.
--
-- Strategy: rename the five to *_legacy, create ONE table, and put
-- auto-updatable compat VIEWS back under the original names.
--
--   * One write path from minute one, so the two-sources-of-truth drift this
--     whole effort exists to kill cannot happen during the transition.
--   * Zero client changes. triage_action is the sole consumer of the review
--     RPCs (verified against the live DB — nothing in src/ calls them since
--     review moved into the unified inbox), and it keeps working untouched
--     because the RPCs still see their tables.
--   * Rollback is two statements per entity: DROP VIEW, rename back.
--
-- The views keep the original 12 columns in the ORIGINAL ORDER and append
-- entity_type as a 13th. Order matters because the RPCs do `SELECT * INTO r`
-- against a `<table>%ROWTYPE` variable, which is positional — but the rowtype
-- is derived from the view itself, so the extra trailing column is harmless.
-- entity_type has to be IN the view for `ALTER VIEW ... SET DEFAULT` to work,
-- which is what lets the enrichers keep inserting without naming it.
--
-- Backfill volume measured before writing this: 2,928 rows total (city 1,011,
-- marketplace 1,385, venue 519, village 13, personality 0). Far below the
-- threshold that would need a batched loop, so a single INSERT..SELECT is fine.
-- No search_documents trigger fires on these tables.
-- ============================================================================

-- ── 1. The unified queue ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.entity_review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL,
  entity_id      uuid NOT NULL,
  field          text NOT NULL,
  proposed_value jsonb NOT NULL,
  citations      jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence     numeric(3,2),
  model          text,
  status         text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','approved','rejected','superseded')),
  reviewer_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

COMMENT ON TABLE public.entity_review_queue IS
  'Unified Truth-Engine review gate. Replaces the five identical '
  '*_review_queue tables; entity_type + field are validated against '
  'review_field_registry by trigger. Polymorphic entity_id has no FK — see '
  'the per-parent AFTER DELETE triggers below for cascade behaviour.';

-- Exactly the semantics of the five uq_*_review_queue_open indexes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_erq_open
  ON public.entity_review_queue (entity_type, entity_id, field) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_erq_open_by_type
  ON public.entity_review_queue (entity_type, created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_erq_entity
  ON public.entity_review_queue (entity_type, entity_id);

ALTER TABLE public.entity_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erq_read ON public.entity_review_queue;
CREATE POLICY erq_read ON public.entity_review_queue FOR SELECT
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS erq_write ON public.entity_review_queue;
CREATE POLICY erq_write ON public.entity_review_queue FOR ALL
  USING (has_any_role_jwt(ARRAY['admin'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));

REVOKE ALL ON public.entity_review_queue FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_review_queue TO authenticated;
GRANT ALL ON public.entity_review_queue TO service_role;

-- ── 2. Field registry (replaces five `field` CHECK constraints) ─────────────
--
-- Also carries the apply map consumed by approve_entity_review in the next
-- migration. Every row here was transcribed from the LIVE function bodies
-- (pg_proc.prosrc), not from the migration files — several of them had drifted.

CREATE TABLE IF NOT EXISTS public.review_field_registry (
  entity_type   text NOT NULL,
  field         text NOT NULL,
  label         text NOT NULL,
  target_table  text NOT NULL,
  target_column text,
  -- Which key inside proposed_value holds the payload. Marketplace is the
  -- odd one out: it reads proposed_value->>'subcategory', not ->>'value'.
  value_key     text NOT NULL DEFAULT 'value',
  apply_mode    text NOT NULL CHECK (apply_mode IN (
                  'text','text_truncated','text_required','int_clamped',
                  'text_array_union','jsonb_array_to_text_array','geo_latlng')),
  apply_args    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Safety: a high-risk field must never be swept up by a batch approval.
  batchable     boolean NOT NULL DEFAULT true,
  risk_gate     text CHECK (risk_gate IN ('criminalizing_destination')),
  active        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (entity_type, field)
);

-- Enforced as a CONSTRAINT, not a convention: unlike a trigger this is checked
-- against existing rows and cannot be flipped by a stray UPDATE. A wrong
-- accessibility claim is real-world harm, and a criminalizing-destination
-- safety note is an outing risk — neither may ever auto-apply in bulk.
ALTER TABLE public.review_field_registry
  DROP CONSTRAINT IF EXISTS rfr_never_batch_high_risk;
ALTER TABLE public.review_field_registry
  ADD CONSTRAINT rfr_never_batch_high_risk
  CHECK (NOT (batchable AND (risk_gate IS NOT NULL OR field LIKE 'accessibility%')));

ALTER TABLE public.review_field_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rfr_read ON public.review_field_registry;
CREATE POLICY rfr_read ON public.review_field_registry FOR SELECT
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));
REVOKE ALL ON public.review_field_registry FROM anon;
GRANT SELECT ON public.review_field_registry TO authenticated;
GRANT ALL ON public.review_field_registry TO service_role;

INSERT INTO public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key, apply_mode, apply_args, batchable, risk_gate)
VALUES
  -- city: rating is clamped 1..5, hook truncated to 120, safety_notes raw.
  ('city','lgbt_friendly_rating','LGBTQ+ friendly rating','cities','lgbt_friendly_rating','value',
     'int_clamped','{"min":1,"max":5}'::jsonb, true, NULL),
  ('city','safety_notes','Safety notes','cities','safety_notes','value',
     'text','{}'::jsonb, false, 'criminalizing_destination'),
  ('city','editorial_hook','Editorial hook','cities','editorial_hook','value',
     'text_truncated','{"max_len":120}'::jsonb, true, NULL),

  -- venue: arrays union into the existing column; amenities also flips
  -- amenities_verified. Contact fields are trim-and-required (the live RPC
  -- RAISES on empty, it does not null them out).
  ('venue','accessibility_attributes','Accessibility attributes','venues','accessibility_attributes','value',
     'text_array_union','{}'::jsonb, false, NULL),
  ('venue','accessibility_notes','Accessibility notes','venues','accessibility_notes','value',
     'text','{}'::jsonb, false, NULL),
  ('venue','amenities','Amenities','venues','amenities','value',
     'text_array_union','{"set_true":["amenities_verified"]}'::jsonb, true, NULL),
  ('venue','email','Email','venues','email','value','text_required','{}'::jsonb, true, NULL),
  ('venue','phone','Phone','venues','phone','value','text_required','{}'::jsonb, true, NULL),
  ('venue','website','Website','venues','website','value','text_required','{}'::jsonb, true, NULL),
  ('venue','geo','Coordinates','venues',NULL,'value',
     'geo_latlng','{"lat_col":"latitude","lng_col":"longitude"}'::jsonb, true, NULL),

  -- village: every field also stamps last_refreshed_at.
  ('village','history','History','queer_villages','history','value',
     'text','{"touch":["last_refreshed_at"]}'::jsonb, true, NULL),
  ('village','description','Description','queer_villages','description','value',
     'text','{"touch":["last_refreshed_at"]}'::jsonb, true, NULL),
  ('village','editorial_hook','Editorial hook','queer_villages','editorial_hook','value',
     'text','{"touch":["last_refreshed_at"]}'::jsonb, true, NULL),
  ('village','notable_landmarks','Notable landmarks','queer_villages','notable_landmarks','value',
     'jsonb_array_to_text_array','{"touch":["last_refreshed_at"]}'::jsonb, true, NULL),

  -- personality: every field also stamps updated_at.
  ('personality','lgbti_connection','LGBTI connection','personalities','lgbti_connection','value',
     'text','{"touch":["updated_at"]}'::jsonb, true, NULL),
  ('personality','lgbti_details','LGBTI details','personalities','lgbti_details','value',
     'text','{"touch":["updated_at"]}'::jsonb, true, NULL),
  ('personality','verification_status','Verification status','personalities','verification_status','value',
     'text','{"touch":["updated_at"]}'::jsonb, true, NULL),

  -- marketplace: reads proposed_value->>'subcategory', and RAISES when blank.
  ('marketplace','subcategory','Subcategory','marketplace_listings','subcategory','subcategory',
     'text_required','{}'::jsonb, true, NULL)
ON CONFLICT (entity_type, field) DO NOTHING;

-- ── 3. Validation trigger ───────────────────────────────────────────────────
--
-- HONEST CAVEAT: this is weaker than the five CHECK constraints it replaces.
-- A trigger is not validated against existing rows, gives the planner nothing,
-- and is bypassable under session_replication_role='replica'. Acceptable here
-- because the table is admin/service-role only and every writer goes through
-- PostgREST or a SECURITY DEFINER RPC — but it IS a real loss, recorded so the
-- next reader does not have to rediscover it.

CREATE OR REPLACE FUNCTION public.erq_validate_field() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.review_field_registry
    WHERE entity_type = NEW.entity_type AND field = NEW.field AND active
  ) THEN
    RAISE EXCEPTION 'unregistered review field: %/%', NEW.entity_type, NEW.field
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_erq_validate_field ON public.entity_review_queue;
CREATE TRIGGER trg_erq_validate_field
  BEFORE INSERT OR UPDATE OF entity_type, field ON public.entity_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.erq_validate_field();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────

INSERT INTO public.entity_review_queue
  (id, entity_type, entity_id, field, proposed_value, citations, confidence, model,
   status, reviewer_id, reviewer_note, created_at, reviewed_at)
SELECT id,'city',        city_id,        field, proposed_value, citations, confidence, model,
       status, reviewer_id, reviewer_note, created_at, reviewed_at FROM public.city_review_queue
UNION ALL
SELECT id,'venue',       venue_id,       field, proposed_value, citations, confidence, model,
       status, reviewer_id, reviewer_note, created_at, reviewed_at FROM public.venue_review_queue
UNION ALL
SELECT id,'village',     village_id,     field, proposed_value, citations, confidence, model,
       status, reviewer_id, reviewer_note, created_at, reviewed_at FROM public.village_review_queue
UNION ALL
SELECT id,'personality', personality_id, field, proposed_value, citations, confidence, model,
       status, reviewer_id, reviewer_note, created_at, reviewed_at FROM public.personality_review_queue
UNION ALL
SELECT id,'marketplace', listing_id,     field, proposed_value, citations, confidence, model,
       status, reviewer_id, reviewer_note, created_at, reviewed_at FROM public.marketplace_review_queue
ON CONFLICT (id) DO NOTHING;

-- ── 5. Swap: legacy tables out, compat views in ─────────────────────────────

ALTER TABLE public.city_review_queue        RENAME TO city_review_queue_legacy;
ALTER TABLE public.venue_review_queue       RENAME TO venue_review_queue_legacy;
ALTER TABLE public.village_review_queue     RENAME TO village_review_queue_legacy;
ALTER TABLE public.personality_review_queue RENAME TO personality_review_queue_legacy;
ALTER TABLE public.marketplace_review_queue RENAME TO marketplace_review_queue_legacy;

-- security_invoker so base-table RLS still applies (repo convention).
-- CASCADED CHECK OPTION so a venue row cannot be inserted through the city view.
-- The entity_type DEFAULT lets the enrichers keep their existing
-- `DELETE ... WHERE status='open'` + plain INSERT pattern with no column list
-- change and no INSTEAD OF triggers — these views are auto-updatable.
CREATE VIEW public.city_review_queue WITH (security_invoker = true) AS
  SELECT id, entity_id AS city_id, field, proposed_value, citations, confidence, model,
         status, reviewer_id, reviewer_note, created_at, reviewed_at, entity_type
  FROM public.entity_review_queue WHERE entity_type = 'city'
  WITH CASCADED CHECK OPTION;

CREATE VIEW public.venue_review_queue WITH (security_invoker = true) AS
  SELECT id, entity_id AS venue_id, field, proposed_value, citations, confidence, model,
         status, reviewer_id, reviewer_note, created_at, reviewed_at, entity_type
  FROM public.entity_review_queue WHERE entity_type = 'venue'
  WITH CASCADED CHECK OPTION;

CREATE VIEW public.village_review_queue WITH (security_invoker = true) AS
  SELECT id, entity_id AS village_id, field, proposed_value, citations, confidence, model,
         status, reviewer_id, reviewer_note, created_at, reviewed_at, entity_type
  FROM public.entity_review_queue WHERE entity_type = 'village'
  WITH CASCADED CHECK OPTION;

CREATE VIEW public.personality_review_queue WITH (security_invoker = true) AS
  SELECT id, entity_id AS personality_id, field, proposed_value, citations, confidence, model,
         status, reviewer_id, reviewer_note, created_at, reviewed_at, entity_type
  FROM public.entity_review_queue WHERE entity_type = 'personality'
  WITH CASCADED CHECK OPTION;

CREATE VIEW public.marketplace_review_queue WITH (security_invoker = true) AS
  SELECT id, entity_id AS listing_id, field, proposed_value, citations, confidence, model,
         status, reviewer_id, reviewer_note, created_at, reviewed_at, entity_type
  FROM public.entity_review_queue WHERE entity_type = 'marketplace'
  WITH CASCADED CHECK OPTION;

ALTER VIEW public.city_review_queue        ALTER COLUMN entity_type SET DEFAULT 'city';
ALTER VIEW public.venue_review_queue       ALTER COLUMN entity_type SET DEFAULT 'venue';
ALTER VIEW public.village_review_queue     ALTER COLUMN entity_type SET DEFAULT 'village';
ALTER VIEW public.personality_review_queue ALTER COLUMN entity_type SET DEFAULT 'personality';
ALTER VIEW public.marketplace_review_queue ALTER COLUMN entity_type SET DEFAULT 'marketplace';

DO $grants$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['city_review_queue','venue_review_queue','village_review_queue',
                           'personality_review_queue','marketplace_review_queue']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', v);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v);
  END LOOP;
END $grants$;

-- ── 6. Replace the lost ON DELETE CASCADE ───────────────────────────────────
--
-- The five legacy tables each had `REFERENCES <parent>(id) ON DELETE CASCADE`.
-- A polymorphic entity_id cannot keep that (dedup_review_queue set the same
-- precedent), so each parent gets a one-line AFTER DELETE trigger doing a
-- single indexed delete. Hard deletes on these tables are rare by convention
-- (merges are reversible soft deletes), so the cost is negligible.

CREATE OR REPLACE FUNCTION public.erq_cascade_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.entity_review_queue
   WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_erq_cascade ON public.cities;
CREATE TRIGGER trg_erq_cascade AFTER DELETE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.erq_cascade_delete('city');

DROP TRIGGER IF EXISTS trg_erq_cascade ON public.venues;
CREATE TRIGGER trg_erq_cascade AFTER DELETE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.erq_cascade_delete('venue');

DROP TRIGGER IF EXISTS trg_erq_cascade ON public.queer_villages;
CREATE TRIGGER trg_erq_cascade AFTER DELETE ON public.queer_villages
  FOR EACH ROW EXECUTE FUNCTION public.erq_cascade_delete('village');

DROP TRIGGER IF EXISTS trg_erq_cascade ON public.personalities;
CREATE TRIGGER trg_erq_cascade AFTER DELETE ON public.personalities
  FOR EACH ROW EXECUTE FUNCTION public.erq_cascade_delete('personality');

DROP TRIGGER IF EXISTS trg_erq_cascade ON public.marketplace_listings;
CREATE TRIGGER trg_erq_cascade AFTER DELETE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.erq_cascade_delete('marketplace');
