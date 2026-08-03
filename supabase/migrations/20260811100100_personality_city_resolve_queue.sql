-- match_personality_city(): stop deriving a birthplace's country from the
-- person's nationality, and stop minting cities inline.
--
-- The live body (20260606001000, superseding 20260510150000) had three defects
-- and is responsible for 1,824 of the 5,136 live `cities` rows — 36% of the
-- table, 1,763 of which exist only because somebody was born there.
--
-- 1. IT ASSIGNED THE BIRTHPLACE CITY TO THE PERSON'S NATIONALITY COUNTRY.
--    `SELECT id FROM countries WHERE name ILIKE NEW.nationality` — a demonym
--    lookup feeding a *geographic* column. Confirmed on every outlier sampled:
--    Kew (London) -> Australia, Whyalla (South Australia) -> United States,
--    Sibonga (Philippines) -> Venezuela, North Sydney (NSW) -> Czech Republic.
--    In each case the assigned country is exactly `personalities.nationality`.
--    100 live rows sit >2,500 km from their assigned country while being
--    <600 km from another; 71 of them came from this trigger.
--
-- 2. IT ONLY STRIPPED A PARENTHETICAL, never the ", Region" suffix, so
--    "San Francisco, California" never matched the existing "San Francisco"
--    row and was inserted alongside it. `uk_cities_country_name_active` cannot
--    see that collision because the names genuinely differ. Fixed upstream by
--    geo_split_place_name() (20260811100000); this function now uses it.
--
-- 3. ITS MATCH QUERY HAD NO COUNTRY FILTER AT ALL and fell back to
--    `ORDER BY population DESC` — the documented same-name collision class
--    (Portland ME -> Portland OR) that 20260802090844 fixed for events and
--    20260802115249 for news, but never for this writer.
--
-- WHY IT NO LONGER INSERTS. Getting the country right needs a geocoder, and a
-- BEFORE trigger cannot make a network call. So an unresolved birthplace is
-- enqueued and a drain worker resolves it through `resolve-or-create-city`,
-- which already validates the Photon hit's countrycode and refuses rather than
-- snapping to a wrong-country capital. This mirrors `geo_address_queue` +
-- `geo_address_drain` (20260807100000), a TABLE rather than per-row
-- net.http_post for the same reason given there.
--
-- Nothing is lost by leaving city_id NULL: `personalities.birth_place` holds
-- the free text and is what profiles render.

CREATE TABLE IF NOT EXISTS public.city_resolve_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- DEFERRABLE INITIALLY DEFERRED is load-bearing: match_personality_city() is
  -- a BEFORE INSERT trigger, so on a new personality the referenced row does
  -- not exist yet and an immediate FK check would abort every insert that
  -- enqueues. Deferring moves the check to commit, by which time it does.
  personality_id  uuid NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED,
  birth_place     text NOT NULL,
  base_name       text,
  region_hint     text,
  country_hint_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  reason          text NOT NULL,
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'resolved', 'data_unavailable')),
  attempts        smallint NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.city_resolve_queue IS
  'Birthplaces that could not be linked to a city without guessing. Drained by '
  'the city_resolve_drain cron via resolve-or-create-city, which geocodes with '
  'a country check. Terminal at 3 attempts (data_unavailable), so an '
  'unresolvable string is retried three times, not nightly forever.';

-- One open row per person: re-saving a personality must not fan out the queue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_city_resolve_queue_open
  ON public.city_resolve_queue (personality_id) WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_city_resolve_queue_pending
  ON public.city_resolve_queue (created_at) WHERE state = 'pending';

ALTER TABLE public.city_resolve_queue ENABLE ROW LEVEL SECURITY;

-- Service-role only: this is operator plumbing, and birth_place plus a person
-- id is exactly the kind of pairing that should not be broadly readable.
DROP POLICY IF EXISTS "city_resolve_queue admin read" ON public.city_resolve_queue;
CREATE POLICY "city_resolve_queue admin read"
  ON public.city_resolve_queue FOR SELECT
  USING (public.has_any_role_jwt(ARRAY['admin'::public.app_role]));

REVOKE ALL ON public.city_resolve_queue FROM anon;
GRANT SELECT ON public.city_resolve_queue TO authenticated;
GRANT ALL ON public.city_resolve_queue TO service_role;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_personality_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_split      record;
  v_base       text;
  v_country_id uuid;
  v_region     text;
  v_city_id    uuid;
  v_city_reg   text;
  v_tail       text;
  v_reason     text;
  v_n_matches  int;
BEGIN
  IF NEW.city_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.birth_place IS NULL OR btrim(NEW.birth_place) = '' THEN RETURN NEW; END IF;

  SELECT * INTO v_split FROM public.geo_split_place_name(NEW.birth_place);
  v_base    := v_split.base;
  v_region  := v_split.region_name;
  -- Country hint comes from the BIRTHPLACE STRING ONLY. Never nationality,
  -- never NEW.country_id (which this trigger itself used to pollute).
  v_country_id := v_split.country_id;

  IF v_base IS NULL OR length(v_base) < 2 THEN RETURN NEW; END IF;

  -- A bare COUNTRY name is never a city. "Irland", "Kenia", "Indonesien" all
  -- arrived through here and became city rows. Drop them outright -- there is
  -- nothing for a geocoder to add.
  IF EXISTS (SELECT 1 FROM public.countries co
              WHERE public.normalize_name(co.name) = public.normalize_name(v_base)
                AND co.duplicate_of_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.geo_place_qualifiers q
                 WHERE q.alias_key = public.normalize_name(v_base)
                   AND q.kind = 'country')
  THEN
    RETURN NEW;
  END IF;

  -- A bare REGION name ("Louisiana", "Rio Grande Valley") is probably not a
  -- city either -- but Victoria, Luxembourg and Quebec City are, so this is a
  -- suspicion, not a verdict. Queue it with the suspicion attached and let the
  -- drain's geocoder decide on place type; dropping it here would be
  -- unrecoverable.
  IF EXISTS (SELECT 1 FROM public.geo_place_qualifiers q
              WHERE q.alias_key = public.normalize_name(v_base)
                AND q.kind = 'region')
     OR EXISTS (SELECT 1 FROM public.cities c
                 WHERE public.normalize_name(c.region_name) = public.normalize_name(v_base)
                   AND c.region_name IS NOT NULL)
  THEN
    v_reason := 'base_looks_like_region';
  END IF;

  -- Last-resort country hint: an ISO-2 / full name in the trailing segment.
  -- resolve_country_from_text refuses the two dozen codes that are also US
  -- state abbreviations unless the city corroborates them.
  IF v_country_id IS NULL AND position(',' IN NEW.birth_place) > 0 THEN
    v_tail := btrim(substring(NEW.birth_place from position(',' IN NEW.birth_place) + 1));
    v_country_id := public.resolve_country_from_text(v_tail, v_base);
  END IF;

  -- (1) Curated alias. city_aliases is hand-maintained, so it outranks name
  -- matching -- but still only inside the resolved country when we have one.
  SELECT ca.city_id INTO v_city_id
    FROM public.city_aliases ca
    JOIN public.cities c ON c.id = ca.city_id AND c.duplicate_of_id IS NULL
     -- alias_key is GENERATED as city_canonical_key(alias); match on it so the
     -- lookup uses the index rather than normalize_name(), which is a
     -- different normalization and would miss.
   WHERE ca.alias_key IN (
           public.city_canonical_key(v_base), public.city_canonical_key(NEW.birth_place))
     AND (v_country_id IS NULL OR c.country_id = v_country_id)
   LIMIT 1;

  -- (2) Name match, SCOPED TO THE RESOLVED COUNTRY. No country, no match --
  -- `cities` holds at most one row per (name, country), so a name-only lookup
  -- cannot tell an unambiguous name from an unrepresentable twin.
  IF v_city_id IS NULL AND v_country_id IS NOT NULL THEN
    SELECT c.id, c.region_name INTO v_city_id, v_city_reg
      FROM public.cities c
     WHERE c.country_id = v_country_id
       AND c.name_normalized = public.normalize_name(v_base)
       AND c.duplicate_of_id IS NULL
     LIMIT 1;

    -- Corroboration: a stated region that disagrees with the candidate's own
    -- region is a different place with the same name. Block, never guess --
    -- a NULL city_id is recoverable, a wrong one is not.
    IF v_city_id IS NOT NULL AND v_region IS NOT NULL AND v_city_reg IS NOT NULL
       AND public.normalize_name(v_region) <> public.normalize_name(v_city_reg) THEN
      v_city_id := NULL;
      v_reason  := 'region_contradiction';
    END IF;
  END IF;

  IF v_city_id IS NOT NULL THEN
    NEW.city_id := v_city_id;
    IF NEW.country_id IS NULL THEN
      SELECT c.country_id INTO NEW.country_id FROM public.cities c WHERE c.id = v_city_id;
    END IF;
    RETURN NEW;
  END IF;

  -- (3) Unresolved. Enqueue for geocoding; leave city_id NULL.
  IF v_reason IS NULL THEN
    v_reason := CASE WHEN v_country_id IS NULL THEN 'no_country_signal'
                     ELSE 'no_city_match' END;
  END IF;

  -- Only 4,880 of 16,060 personalities have a birth_place at all and 163 lack a
  -- city, so this stays small. Multiple candidate matches would mean the same
  -- name in the same country, which the unique index forbids.
  SELECT count(*) INTO v_n_matches FROM public.city_resolve_queue q
   WHERE q.personality_id = NEW.id AND q.state = 'pending';

  IF v_n_matches = 0 THEN
    INSERT INTO public.city_resolve_queue
      (personality_id, birth_place, base_name, region_hint, country_hint_id, reason)
    VALUES (NEW.id, NEW.birth_place, v_base, v_region, v_country_id, v_reason)
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.city_resolve_queue q
       SET birth_place = NEW.birth_place, base_name = v_base, region_hint = v_region,
           country_hint_id = v_country_id, reason = v_reason, updated_at = now()
     WHERE q.personality_id = NEW.id AND q.state = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.match_personality_city() IS
  'Links personalities.birth_place to a city using ONLY signals from the '
  'birthplace string. Never derives the country from nationality and never '
  'inserts a city -- unresolved rows go to city_resolve_queue.';

-- `nationality` leaves the trigger scope: it is no longer an input. A row whose
-- nationality changes must not re-run birthplace resolution.
DROP TRIGGER IF EXISTS trg_personality_city_match ON public.personalities;
CREATE TRIGGER trg_personality_city_match
  BEFORE INSERT OR UPDATE OF birth_place
  ON public.personalities
  FOR EACH ROW
  EXECUTE FUNCTION public.match_personality_city();

-- The queue INSERT above references NEW.id, which on INSERT is only populated
-- because personalities.id has a default. Guard against the alternative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'personalities'
       AND column_name = 'id' AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'personalities.id has no default; match_personality_city() '
                    'would enqueue a NULL personality_id on INSERT';
  END IF;
END;
$$;
