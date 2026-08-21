-- A closure vocabulary for locations, and dates a timeline can actually draw
--
-- Why this exists
-- ---------------
-- `venues.closed_at` is the only closure marker in the schema and it answers the wrong
-- question. Measured on production: 177 venues carry it, spread over SIX distinct days,
-- 128 of them on 2026-07-26 alone. Those are the days the sweeper RAN. Nothing in the
-- schema records the day a place actually shut, so a timeline built on `closed_at`
-- would show 128 bars in nine countries closing simultaneously one Sunday in July.
--
-- The engine already collects the right date and discards it. Every one of the 177
-- audit rows carries `detail.last_seen_at` -- the last time a source actually saw the
-- venue alive (2026-04-26 in the sampled row) -- inside a jsonb blob, while the wrong
-- value goes into the column a reader would use.
--
-- Second, and the reason a plain date is not enough: all 177 closures share ONE reason,
-- `multi_signal_broken_url_and_stale`, whose evidence is `url_status=broken` plus
-- `no_source_sighting>90d`. That is absence of evidence. A bar whose domain lapsed is
-- not a closed bar. The schema had no way to distinguish "we confirmed this place is
-- gone" from "our crawler lost track of it", so both rendered identically.
--
-- Third, `hotels` has `liveness_status` and no closure column at all; `venues` has the
-- reverse. `queer_villages` and landmarks have neither. There is no shared vocabulary.
--
-- What a timeline needs, and what each piece is for
-- ------------------------------------------------
--   closure_status     the marker. From a REFERENCE TABLE, not a CHECK, because the
--                      rendering rules travel with it (see below).
--   closed_on          the date the place shut -- a plain date, NOT a timestamp, and
--                      deliberately a different column from `closed_at` so the two
--                      meanings can never be confused again.
--   closed_on_precision  day | month | year | decade. Load-bearing on this platform:
--                      historic queer venues are typically known to the year and
--                      sometimes only to the decade. Storing 1969-01-01 for "closed
--                      sometime in 1969" and rendering it as a day is a fabricated
--                      fact; the precision column is what lets the renderer say "1969".
--   opened_on          a timeline needs a start. No table had one.
--   closure_source     a citation, so the claim is checkable.
--
-- `venues.closed_at` KEEPS its meaning and its readers (VenueCard, useVenueDescriptor,
-- useHomeNearYou, useIntentData, search_documents) -- it is the moment the record was
-- marked closed, i.e. detection. The trigger below derives it from `closure_status`, so
-- every existing consumer keeps working untouched and becomes correct for free.
--
-- Why a reference table rather than a CHECK constraint
-- ---------------------------------------------------
-- Three questions have to be answered per status and none of them belong in application
-- code, because four tables and a search indexer would each answer them separately:
--
--   counts_as_closed    should this hide the place / show a "closed" badge?
--   is_terminal         may a timeline draw an END here? `temporarily_closed` and
--                       `presumed_closed` are open-ended; `permanently_closed` is not.
--   machine_assignable  MAY A JOB SET THIS? This is the doctrine of the repo -- the
--                       machine proposes, a person decides -- expressed as data rather
--                       than as a comment somebody has to remember. A sweeper may
--                       conclude `presumed_closed` or `unknown`. It may never conclude
--                       `permanently_closed`, `demolished`, `relocated` or `renamed`.
--                       Those are claims about the world, not about our crawl.

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_closure_statuses (
  slug               text PRIMARY KEY,
  label              text     NOT NULL,
  description        text     NOT NULL,
  counts_as_closed   boolean  NOT NULL,
  is_terminal        boolean  NOT NULL,
  machine_assignable boolean  NOT NULL,
  sort_order         smallint NOT NULL,
  -- A terminal status is by definition a closed one; the reverse does not hold.
  CONSTRAINT lcs_terminal_implies_closed CHECK (NOT is_terminal OR counts_as_closed)
);

COMMENT ON TABLE public.location_closure_statuses IS
  'Shared closure vocabulary for every location type (venues, hotels, queer villages, '
  'landmarks). counts_as_closed drives display, is_terminal tells a timeline whether it '
  'may draw an end point, machine_assignable says whether an automated job is allowed '
  'to conclude it.';
COMMENT ON COLUMN public.location_closure_statuses.machine_assignable IS
  'False for every status that asserts something about the world rather than about our '
  'own crawl. A sweeper observing a dead URL may conclude presumed_closed; concluding '
  'permanently_closed from the same evidence is the mistake this column prevents.';

INSERT INTO public.location_closure_statuses
  (slug, label, description, counts_as_closed, is_terminal, machine_assignable, sort_order)
VALUES
  ('open', 'Open',
   'Operating, as far as we know.', false, false, true, 10),
  ('unknown', 'Unknown',
   'We do not know. Distinct from open: an unverified record should not be published as '
   'a positive claim that the place is trading.', false, false, true, 20),
  ('presumed_closed', 'Presumed closed',
   'Evidence of absence only -- dead website, no sighting from any source for a long '
   'time. The strongest conclusion an automated check can reach on its own.',
   true, false, true, 30),
  ('temporarily_closed', 'Temporarily closed',
   'Renovation, season, or a stated hiatus. Expected to reopen, so a timeline must not '
   'draw an end here.', true, false, false, 40),
  ('permanently_closed', 'Permanently closed',
   'Confirmed shut for good. Requires a human decision and, ideally, a citation.',
   true, true, false, 50),
  ('relocated', 'Relocated',
   'The business continues at a different address. This RECORD ends; the business does '
   'not.', true, true, false, 60),
  ('renamed', 'Renamed',
   'Same place, trading under a new name. This record ends where the successor begins.',
   true, true, false, 70),
  ('demolished', 'Demolished',
   'The building itself is gone. Meaningful for queer-history mapping, where the loss '
   'of the site is the fact worth recording.', true, true, false, 80)
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description,
      counts_as_closed = EXCLUDED.counts_as_closed, is_terminal = EXCLUDED.is_terminal,
      machine_assignable = EXCLUDED.machine_assignable, sort_order = EXCLUDED.sort_order;

ALTER TABLE public.location_closure_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcs_read ON public.location_closure_statuses;
CREATE POLICY lcs_read ON public.location_closure_statuses FOR SELECT USING (true);

-- New tables need explicit anon grants in this project; it is a public vocabulary and
-- the frontend renders labels from it.
GRANT SELECT ON public.location_closure_statuses TO anon, authenticated;
GRANT ALL    ON public.location_closure_statuses TO service_role;

-- ---------------------------------------------------------------------------
-- The columns, on all four location types
-- ---------------------------------------------------------------------------
-- ADD COLUMN ... DEFAULT is metadata-only in PG11+ and does not rewrite the table or
-- fire row triggers, so this does not storm trg_search_documents_venue across 23,512
-- rows. The backfill in the companion migration is what has to respect the batch cap.
DO $$
DECLARE
  t text;
  -- geo_landmark_profiles keys on place_id, not id; nothing here depends on the key,
  -- but the list is spelled out rather than discovered so a new table cannot join by
  -- accident.
  v_tables text[] := ARRAY['venues', 'hotels', 'queer_villages', 'geo_landmark_profiles'];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS closure_status text NOT NULL DEFAULT 'open'
          REFERENCES public.location_closure_statuses(slug),
        ADD COLUMN IF NOT EXISTS closed_on date,
        ADD COLUMN IF NOT EXISTS closed_on_precision text,
        ADD COLUMN IF NOT EXISTS opened_on date,
        ADD COLUMN IF NOT EXISTS opened_on_precision text,
        ADD COLUMN IF NOT EXISTS closure_source text
    $f$, t);

    -- A precision with no date is meaningless, and a date with no precision would be
    -- read as day-precision by any renderer -- which is the fabrication this column
    -- exists to prevent. So each implies the other.
    EXECUTE format($f$
      ALTER TABLE public.%I
        DROP CONSTRAINT IF EXISTS %I,
        ADD CONSTRAINT %I CHECK (
          (closed_on IS NULL) = (closed_on_precision IS NULL)
          AND (opened_on IS NULL) = (opened_on_precision IS NULL)
          AND (closed_on_precision IS NULL
               OR closed_on_precision IN ('day','month','year','decade'))
          AND (opened_on_precision IS NULL
               OR opened_on_precision IN ('day','month','year','decade'))
          AND (closed_on IS NULL OR opened_on IS NULL OR closed_on >= opened_on)
        )
    $f$, t, t || '_date_precision_ck', t || '_date_precision_ck');

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (closure_status) '
      || 'WHERE closure_status <> ''open''', t || '_closure_status_idx', t);
  END LOOP;
END $$;

-- Seed the new column from the state that already exists.
--
-- ADD COLUMN ... DEFAULT is metadata-only and fires NO row trigger, so without this the
-- 177 venues that carry closed_at would sit at closure_status='open' -- the two columns
-- contradicting each other from the moment the column exists, and every selector written
-- against the new one silently missing them.
--
-- presumed_closed is the honest reading of what those rows are: each was concluded by a
-- sweeper from a dead URL and a stale sighting. Promoting them to permanently_closed
-- here would launder 177 machine guesses into confirmed facts in the same statement that
-- introduces the distinction.
--
-- 177 rows is within the 300-row trg_search_documents_venue budget. The trigger keeps
-- closed_at as it stands (it is already set) and turns off seo_indexable.
UPDATE public.venues
   SET closure_status = 'presumed_closed'
 WHERE closed_at IS NOT NULL AND closure_status = 'open';

COMMENT ON COLUMN public.venues.closed_at IS
  'DETECTION timestamp: the moment this record was marked closed. NOT the date the '
  'venue shut -- use closed_on for that. Derived from closure_status by '
  'venues_zz_closure_sync; kept because VenueCard, useVenueDescriptor, useHomeNearYou, '
  'useIntentData and search_documents all read it.';
COMMENT ON COLUMN public.venues.closed_on IS
  'The date the place actually shut, at the precision given by closed_on_precision. '
  'NULL when unknown -- which is the normal case for a machine-detected closure, where '
  'all we have is a last-seen bound.';

-- ---------------------------------------------------------------------------
-- Keep venues.closed_at and closure_status from ever disagreeing
-- ---------------------------------------------------------------------------
-- One trigger, reconciling in a fixed precedence, rather than two triggers syncing each
-- other. Bidirectional pairs are ambiguous exactly when both columns change in one
-- statement, which is the case that matters here: the legacy admin form writes
-- closed_at, the new engine writes closure_status, and a backfill may write both.
--
-- The `zz_` prefix is load-bearing. BEFORE triggers fire in NAME order and
-- venues_closed_not_indexable is scoped BEFORE UPDATE OF (closed_at, seo_indexable) --
-- it has to see the closed_at this trigger derives, so this must sort before it. It
-- does not: 'trg_venues_closed_not_indexable' < 'venues_zz_closure_sync' means the
-- indexable trigger runs FIRST and would miss a closed_at that only this trigger sets.
-- Hence closure_status changes explicitly recompute seo_indexable here too, rather than
-- relying on a trigger that has already run.
CREATE OR REPLACE FUNCTION public.venues_closure_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_closed   boolean;
  v_status_changed boolean := (TG_OP = 'UPDATE' AND NEW.closure_status IS DISTINCT FROM OLD.closure_status);
  v_at_changed     boolean := (TG_OP = 'UPDATE' AND NEW.closed_at      IS DISTINCT FROM OLD.closed_at);
BEGIN
  IF TG_OP = 'UPDATE' AND NOT v_status_changed AND NOT v_at_changed THEN
    RETURN NEW;
  END IF;

  -- Precedence: the vocabulary wins. It is the column that carries meaning; closed_at
  -- is a derived timestamp.
  IF v_status_changed OR TG_OP = 'INSERT' THEN
    SELECT counts_as_closed INTO v_closed
      FROM public.location_closure_statuses WHERE slug = NEW.closure_status;

    IF v_closed THEN
      IF NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
      NEW.seo_indexable := false;
    ELSE
      NEW.closed_at := NULL;
    END IF;

  ELSIF v_at_changed THEN
    -- Legacy path: something wrote closed_at directly (the admin form, or an
    -- un-migrated job). Give it the weakest honest status rather than inventing a
    -- confirmed closure.
    IF NEW.closed_at IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.location_closure_statuses
          WHERE slug = NEW.closure_status AND counts_as_closed) THEN
      NEW.closure_status := 'presumed_closed';
      NEW.seo_indexable  := false;
    ELSIF NEW.closed_at IS NULL AND EXISTS (
         SELECT 1 FROM public.location_closure_statuses
          WHERE slug = NEW.closure_status AND counts_as_closed) THEN
      NEW.closure_status := 'open';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.venues_closure_sync() IS
  'Reconciles venues.closure_status and the legacy venues.closed_at in one direction '
  'per statement: the vocabulary wins when it changed, otherwise a direct closed_at '
  'write is interpreted as presumed_closed. Never permanently_closed -- a bare '
  'timestamp is not evidence of a confirmed closure.';

DROP TRIGGER IF EXISTS venues_zz_closure_sync ON public.venues;
CREATE TRIGGER venues_zz_closure_sync
  BEFORE INSERT OR UPDATE OF closure_status, closed_at ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_closure_sync();

-- ---------------------------------------------------------------------------
-- Read model for a timeline
-- ---------------------------------------------------------------------------
-- Returns the interval a renderer can honestly draw, for any location type. When
-- someone recorded the real date, `closed_on` carries it at its stated precision.
-- When nobody did -- the normal case for a machine-detected closure -- the honest
-- answer is an INTERVAL, not a date: alive_until is the last day a source saw the
-- place, gone_by the day we recorded it missing, and the truth lies between them.
--
-- Exposing the bound AS a bound is the entire point of this migration. A caller that
-- wants one number will have to decide which one, in the open, instead of silently
-- reading a detection timestamp as a closing date -- which is how 128 venues came to
-- share a closing day.
--
-- Only venues carry alive_until/gone_by: they are the only location type with a
-- closure engine and an audit trail behind them. For the other three the columns are
-- there for people and for the timeline, and are NULL until somebody fills them.
CREATE OR REPLACE FUNCTION public.location_closure_timeline(
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS TABLE (
  closure_status   text,
  counts_as_closed boolean,
  is_terminal      boolean,
  opened_on        date,
  opened_precision text,
  closed_on        date,
  closed_precision text,
  alive_until      date,
  gone_by          date,
  source           text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH rec AS (
    SELECT v.closure_status, v.opened_on, v.opened_on_precision,
           v.closed_on, v.closed_on_precision, v.closure_source,
           (SELECT (a.detail->>'last_seen_at')::timestamptz::date
              FROM public.venue_closed_audit a
             WHERE a.venue_id = v.id ORDER BY a.created_at DESC LIMIT 1) AS alive_until,
           v.closed_at::date AS gone_by
      FROM public.venues v
     WHERE p_entity_type = 'venue' AND v.id = p_entity_id
    UNION ALL
    SELECT h.closure_status, h.opened_on, h.opened_on_precision,
           h.closed_on, h.closed_on_precision, h.closure_source, NULL::date, NULL::date
      FROM public.hotels h
     WHERE p_entity_type = 'hotel' AND h.id = p_entity_id
    UNION ALL
    SELECT q.closure_status, q.opened_on, q.opened_on_precision,
           q.closed_on, q.closed_on_precision, q.closure_source, NULL::date, NULL::date
      FROM public.queer_villages q
     WHERE p_entity_type = 'queer_village' AND q.id = p_entity_id
    UNION ALL
    SELECT l.closure_status, l.opened_on, l.opened_on_precision,
           l.closed_on, l.closed_on_precision, l.closure_source, NULL::date, NULL::date
      FROM public.geo_landmark_profiles l
     WHERE p_entity_type = 'landmark' AND l.place_id = p_entity_id
  )
  SELECT r.closure_status, s.counts_as_closed, s.is_terminal,
         r.opened_on, r.opened_on_precision,
         r.closed_on, r.closed_on_precision,
         -- Suppressed once a real date exists: a bound alongside a fact invites a
         -- renderer to draw both.
         CASE WHEN r.closed_on IS NULL THEN r.alive_until END,
         CASE WHEN r.closed_on IS NULL THEN r.gone_by END,
         r.closure_source
  FROM rec r
  JOIN public.location_closure_statuses s ON s.slug = r.closure_status;
$$;

COMMENT ON FUNCTION public.location_closure_timeline(text, uuid) IS
  'Timeline read model for one location. Returns a real closed_on when one was '
  'recorded, otherwise the alive_until / gone_by interval the closure was inferred '
  'from. p_entity_type is one of venue, hotel, queer_village, landmark.';

REVOKE ALL ON FUNCTION public.location_closure_timeline(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.location_closure_timeline(text, uuid)
  TO anon, authenticated, service_role;
