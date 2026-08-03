-- Split region/country-qualified place names at the door.
--
-- 798 of 5,136 live `cities` rows carry a qualifier in the NAME — "San Francisco,
-- California", "Vancouver, British Columbia", "Kapstadt, Südafrika", "Yonkers,
-- New York, USA". 180 of them have the bare toponym sitting in the same country
-- as a SEPARATE row. The unique index `uk_cities_country_name_active
-- (country_id, name_normalized)` cannot catch that, because the two names
-- genuinely differ — so every writer that passes a qualified string through
-- mints a duplicate and the index reports success.
--
-- The qualifier belongs in `region_name`, which is also what the same-name
-- collision guards (run_event_city_link, city-collision-guard.ts) read to tell
-- Charleston SC from Charleston IL. Today it is trapped in the name: only 9 of
-- the 798 qualified rows have `region_name` populated at all.
--
-- VOCABULARY IS RESOLVED LIVE, NOT SEEDED. A frozen list of countries and
-- regions goes stale silently, and a stale vocabulary here fails OPEN (the
-- suffix stops being recognised and the duplicate is minted again). So the
-- resolver reads `countries.name` and `cities.region_name` directly and keeps
-- only exonyms and abbreviations — the things no table holds — in
-- `geo_place_qualifiers`.
--
-- AMBIGUITY IS FIRST-CLASS. "Georgia" is a country AND a US state; so are
-- Luxembourg, Singapore, Panama, Mexico. Reading such a suffix as a country
-- would file Atlanta under Georgia-the-country; reading it as a region would
-- file Tbilisi under the United States. Either is worse than the disease. An
-- ambiguous qualifier therefore still splits the NAME (the bare toponym is
-- correct under both readings) but yields NO country hint and NO region write.
-- Same posture as `country_code_is_ambiguous` in resolve_country_from_text.
--
-- A suffix that resolves to NOTHING leaves the whole name untouched. That is
-- deliberate: "Eitelsbach, heute Trier" and "Greiz, Vogtland" survive verbatim
-- rather than being guessed at.
--
-- "Washington, D.C." DOES split, because `d c` is a seeded region alias. That
-- is intended: the table already holds a separate "Washington" row in the US
-- with region_name 'District of Columbia', so the two are a genuine duplicate
-- pair that the differing names hid. Splitting surfaces it. The collision is
-- resolved by merging them, not by special-casing the name.

-- ---------------------------------------------------------------------------
-- Curated aliases: only what no live table can supply.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.geo_place_qualifiers (
  alias_key   text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('country', 'region')),
  canonical   text NOT NULL,
  -- For kind='region': the owning country, so a region suffix can still supply
  -- a country hint. NULL when the region spans/does not identify one.
  country_code text,
  note        text
);

COMMENT ON TABLE public.geo_place_qualifiers IS
  'Curated place-name suffixes that no live table holds: country exonyms and '
  'first-level region abbreviations. countries.name and cities.region_name are '
  'read live by geo_resolve_place_qualifier() and are NOT duplicated here.';

ALTER TABLE public.geo_place_qualifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geo_place_qualifiers readable" ON public.geo_place_qualifiers;
CREATE POLICY "geo_place_qualifiers readable"
  ON public.geo_place_qualifiers FOR SELECT USING (true);

-- New tables need explicit grants in this project.
GRANT SELECT ON public.geo_place_qualifiers TO anon, authenticated, service_role;

-- Country exonyms actually present in this corpus, plus the everyday English
-- short forms. Demonyms are deliberately absent: a demonym never appears as a
-- place-name suffix, and admitting them was how nationality leaked into
-- geography in the first place.
INSERT INTO public.geo_place_qualifiers (alias_key, kind, canonical, country_code, note) VALUES
  ('usa', 'country', 'United States', 'US', 'exonym'),
  ('u s a', 'country', 'United States', 'US', 'exonym'),
  ('united states of america', 'country', 'United States', 'US', 'exonym'),
  ('uk', 'country', 'United Kingdom', 'GB', 'exonym'),
  ('great britain', 'country', 'United Kingdom', 'GB', 'exonym'),
  ('britain', 'country', 'United Kingdom', 'GB', 'exonym'),
  ('deutschland', 'country', 'Germany', 'DE', 'exonym'),
  ('frankreich', 'country', 'France', 'FR', 'exonym'),
  ('italien', 'country', 'Italy', 'IT', 'exonym'),
  ('spanien', 'country', 'Spain', 'ES', 'exonym'),
  ('espana', 'country', 'Spain', 'ES', 'exonym'),
  ('niederlande', 'country', 'Netherlands', 'NL', 'exonym'),
  ('holland', 'country', 'Netherlands', 'NL', 'exonym'),
  ('nederland', 'country', 'Netherlands', 'NL', 'exonym'),
  ('schweiz', 'country', 'Switzerland', 'CH', 'exonym'),
  ('suisse', 'country', 'Switzerland', 'CH', 'exonym'),
  ('osterreich', 'country', 'Austria', 'AT', 'exonym'),
  ('danemark', 'country', 'Denmark', 'DK', 'exonym'),
  ('schweden', 'country', 'Sweden', 'SE', 'exonym'),
  ('norwegen', 'country', 'Norway', 'NO', 'exonym'),
  ('finnland', 'country', 'Finland', 'FI', 'exonym'),
  ('irland', 'country', 'Ireland', 'IE', 'exonym'),
  ('polen', 'country', 'Poland', 'PL', 'exonym'),
  ('russland', 'country', 'Russia', 'RU', 'exonym'),
  ('griechenland', 'country', 'Greece', 'GR', 'exonym'),
  ('turkei', 'country', 'Turkey', 'TR', 'exonym'),
  ('turkiye', 'country', 'Turkey', 'TR', 'exonym'),
  ('indien', 'country', 'India', 'IN', 'exonym'),
  ('kenia', 'country', 'Kenya', 'KE', 'exonym'),
  ('sudafrika', 'country', 'South Africa', 'ZA', 'exonym'),
  ('brasilien', 'country', 'Brazil', 'BR', 'exonym'),
  ('brasil', 'country', 'Brazil', 'BR', 'exonym'),
  ('kuba', 'country', 'Cuba', 'CU', 'exonym'),
  ('japan', 'country', 'Japan', 'JP', 'exonym'),
  ('kanada', 'country', 'Canada', 'CA', 'exonym'),
  ('australien', 'country', 'Australia', 'AU', 'exonym'),
  ('neuseeland', 'country', 'New Zealand', 'NZ', 'exonym'),
  ('mexiko', 'country', 'Mexico', 'MX', 'exonym'),
  ('czechia', 'country', 'Czech Republic', 'CZ', 'exonym'),
  ('cesko', 'country', 'Czech Republic', 'CZ', 'exonym'),
  ('tschechien', 'country', 'Czech Republic', 'CZ', 'exonym'),
  ('ungarn', 'country', 'Hungary', 'HU', 'exonym'),
  ('belgien', 'country', 'Belgium', 'BE', 'exonym'),
  ('portugal', 'country', 'Portugal', 'PT', 'exonym')
ON CONFLICT (alias_key) DO NOTHING;

-- UK constituent countries. They are REGIONS for this purpose: "Belfast,
-- Northern Ireland" and "Dundee, Scotland" must yield region_name, and the
-- country hint is the UK. COUNTRY_ALIASES in geo-normalize.ts maps them
-- straight to 'United Kingdom', which is right for a country lookup and wrong
-- for a name suffix — hence the separate entry here.
INSERT INTO public.geo_place_qualifiers (alias_key, kind, canonical, country_code, note) VALUES
  ('england', 'region', 'England', 'GB', 'uk constituent'),
  ('scotland', 'region', 'Scotland', 'GB', 'uk constituent'),
  ('wales', 'region', 'Wales', 'GB', 'uk constituent'),
  ('northern ireland', 'region', 'Northern Ireland', 'GB', 'uk constituent'),
  ('nordirland', 'region', 'Northern Ireland', 'GB', 'uk constituent'),
  ('schottland', 'region', 'Scotland', 'GB', 'uk constituent')
ON CONFLICT (alias_key) DO NOTHING;

-- US states, Canadian provinces and Australian states by full name plus the
-- abbreviations. Mirrors REGION_BY_ABBR in _shared/city-collision-guard.ts.
-- `WA` and `NT` are claimed by more than one country and are omitted entirely —
-- the TS map marks them __ambiguous__ for the same reason.
INSERT INTO public.geo_place_qualifiers (alias_key, kind, canonical, country_code, note) VALUES
  ('al','region','Alabama','US','us state abbr'), ('ak','region','Alaska','US','us state abbr'),
  ('az','region','Arizona','US','us state abbr'), ('ar','region','Arkansas','US','us state abbr'),
  ('co','region','Colorado','US','us state abbr'), ('ct','region','Connecticut','US','us state abbr'),
  ('de','region','Delaware','US','us state abbr'), ('fl','region','Florida','US','us state abbr'),
  ('ga','region','Georgia','US','us state abbr'), ('hi','region','Hawaii','US','us state abbr'),
  ('id','region','Idaho','US','us state abbr'), ('il','region','Illinois','US','us state abbr'),
  ('ia','region','Iowa','US','us state abbr'), ('ks','region','Kansas','US','us state abbr'),
  ('ky','region','Kentucky','US','us state abbr'), ('la','region','Louisiana','US','us state abbr'),
  ('me','region','Maine','US','us state abbr'), ('md','region','Maryland','US','us state abbr'),
  ('ma','region','Massachusetts','US','us state abbr'), ('mi','region','Michigan','US','us state abbr'),
  ('mn','region','Minnesota','US','us state abbr'), ('ms','region','Mississippi','US','us state abbr'),
  ('mo','region','Missouri','US','us state abbr'), ('mt','region','Montana','US','us state abbr'),
  ('ne','region','Nebraska','US','us state abbr'), ('nv','region','Nevada','US','us state abbr'),
  ('nh','region','New Hampshire','US','us state abbr'), ('nj','region','New Jersey','US','us state abbr'),
  ('nm','region','New Mexico','US','us state abbr'), ('ny','region','New York','US','us state abbr'),
  ('nc','region','North Carolina','US','us state abbr'), ('nd','region','North Dakota','US','us state abbr'),
  ('oh','region','Ohio','US','us state abbr'), ('ok','region','Oklahoma','US','us state abbr'),
  ('pa','region','Pennsylvania','US','us state abbr'), ('ri','region','Rhode Island','US','us state abbr'),
  ('sc','region','South Carolina','US','us state abbr'), ('sd','region','South Dakota','US','us state abbr'),
  ('tn','region','Tennessee','US','us state abbr'), ('tx','region','Texas','US','us state abbr'),
  ('ut','region','Utah','US','us state abbr'), ('vt','region','Vermont','US','us state abbr'),
  ('va','region','Virginia','US','us state abbr'), ('wv','region','West Virginia','US','us state abbr'),
  ('wi','region','Wisconsin','US','us state abbr'), ('wy','region','Wyoming','US','us state abbr'),
  ('dc','region','District of Columbia','US','us state abbr'),
  ('d c','region','District of Columbia','US','us state abbr'),
  ('ab','region','Alberta','CA','ca province abbr'), ('bc','region','British Columbia','CA','ca province abbr'),
  ('mb','region','Manitoba','CA','ca province abbr'), ('nb','region','New Brunswick','CA','ca province abbr'),
  ('nl','region','Newfoundland and Labrador','CA','ca province abbr'),
  ('ns','region','Nova Scotia','CA','ca province abbr'), ('nu','region','Nunavut','CA','ca province abbr'),
  ('on','region','Ontario','CA','ca province abbr'), ('pe','region','Prince Edward Island','CA','ca province abbr'),
  ('qc','region','Quebec','CA','ca province abbr'), ('sk','region','Saskatchewan','CA','ca province abbr'),
  ('yt','region','Yukon','CA','ca province abbr'),
  ('nsw','region','New South Wales','AU','au state abbr'), ('vic','region','Victoria','AU','au state abbr'),
  ('qld','region','Queensland','AU','au state abbr'), ('tas','region','Tasmania','AU','au state abbr'),
  ('act','region','Australian Capital Territory','AU','au state abbr')
ON CONFLICT (alias_key) DO NOTHING;

-- The full names too, so a suffix resolves even before any city in that region
-- exists to supply it via cities.region_name.
INSERT INTO public.geo_place_qualifiers (alias_key, kind, canonical, country_code, note)
SELECT public.normalize_name(v.canonical), 'region', v.canonical, v.country_code, 'region full name'
FROM (
  SELECT DISTINCT canonical, country_code
  FROM public.geo_place_qualifiers
  WHERE note IN ('us state abbr', 'ca province abbr', 'au state abbr')
) v
ON CONFLICT (alias_key) DO NOTHING;

-- cities.region_name is read live; make that lookup indexable.
CREATE INDEX IF NOT EXISTS idx_cities_region_name_lower
  ON public.cities (public.normalize_name(region_name))
  WHERE region_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Resolver: one suffix segment -> country | region | ambiguous | null
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.geo_resolve_place_qualifier(p_segment text)
RETURNS TABLE (kind text, canonical text, country_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key            text := public.normalize_name(nullif(btrim(coalesce(p_segment, '')), ''));
  v_country_id     uuid;
  v_country_name   text;
  v_region_name    text;
  v_region_country uuid;
  v_curated        record;
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    RETURN;
  END IF;

  -- (1) Live country table.
  SELECT co.id, co.name INTO v_country_id, v_country_name
    FROM public.countries co
   WHERE public.normalize_name(co.name) = v_key
     AND co.duplicate_of_id IS NULL
   LIMIT 1;

  -- (2) Live region vocabulary, plus the curated aliases.
  SELECT c.region_name INTO v_region_name
    FROM public.cities c
   WHERE public.normalize_name(c.region_name) = v_key
     AND c.region_name IS NOT NULL
   LIMIT 1;

  SELECT * INTO v_curated
    FROM public.geo_place_qualifiers q
   WHERE q.alias_key = v_key
   LIMIT 1;

  IF v_curated.alias_key IS NOT NULL THEN
    IF v_curated.kind = 'country' THEN
      SELECT co.id, co.name INTO v_country_id, v_country_name
        FROM public.countries co
       WHERE upper(co.code) = upper(v_curated.country_code)
         AND co.duplicate_of_id IS NULL
       LIMIT 1;
      IF v_country_id IS NULL THEN
        v_country_name := v_curated.canonical;
      END IF;
    ELSE
      v_region_name := coalesce(v_region_name, v_curated.canonical);
    END IF;
  END IF;

  -- Owning country for a region: prefer the curated code, else the country the
  -- cities carrying that region actually sit in — but ONLY when they agree.
  -- A region name shared across countries yields no hint rather than a guess.
  IF v_region_name IS NOT NULL THEN
    IF v_curated.alias_key IS NOT NULL AND v_curated.kind = 'region'
       AND v_curated.country_code IS NOT NULL THEN
      SELECT co.id INTO v_region_country
        FROM public.countries co
       WHERE upper(co.code) = upper(v_curated.country_code)
         AND co.duplicate_of_id IS NULL
       LIMIT 1;
    ELSE
      -- Derived ownership only counts when every city carrying this region
      -- name sits in the same country. "Victoria" and "Georgia" span several,
      -- so they yield no hint rather than the most popular guess.
      -- No min(uuid) in Postgres; take the single element of the distinct set.
      SELECT CASE WHEN count(DISTINCT c.country_id) = 1
                  THEN (array_agg(DISTINCT c.country_id))[1] END
        INTO v_region_country
        FROM public.cities c
       WHERE public.normalize_name(c.region_name) = v_key
         AND c.country_id IS NOT NULL
         AND c.duplicate_of_id IS NULL;
    END IF;
  END IF;

  -- Both readings valid => ambiguous. Split the name, claim nothing else.
  IF v_country_id IS NOT NULL AND v_region_name IS NOT NULL THEN
    RETURN QUERY SELECT 'ambiguous'::text, coalesce(v_country_name, v_region_name), NULL::uuid;
    RETURN;
  END IF;

  IF v_country_id IS NOT NULL THEN
    RETURN QUERY SELECT 'country'::text, v_country_name, v_country_id;
    RETURN;
  END IF;

  IF v_region_name IS NOT NULL THEN
    RETURN QUERY SELECT 'region'::text, v_region_name, v_region_country;
    RETURN;
  END IF;

  -- Unresolved. Caller must leave the name alone.
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.geo_resolve_place_qualifier(text) IS
  'Classify one comma-separated place-name suffix. Returns no row when the '
  'segment is not a known country or region -- callers must then leave the '
  'whole name untouched rather than guess.';

-- ---------------------------------------------------------------------------
-- Splitter: "Yonkers, New York, USA" -> base Yonkers / region New York / US
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.geo_split_place_name(p_name text)
RETURNS TABLE (
  base            text,
  qualifier       text,
  qualifier_kind  text,
  region_name     text,
  country_id      uuid,
  did_split       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tidy   text;
  v_segs   text[];
  v_base   text;
  v_n      int;
  i        int;
  v_res    record;
  v_region text;
  v_cid    uuid;
  v_qual   text;
  v_kind   text;
BEGIN
  v_tidy := btrim(coalesce(p_name, ''));
  -- Drop a trailing parenthetical, collapse whitespace. Same tidy() as
  -- _shared/city-name-normalize.ts so both sides agree on the base.
  v_tidy := btrim(regexp_replace(v_tidy, '\s*\([^()]*\)\s*$', ''));
  v_tidy := btrim(regexp_replace(v_tidy, '\s+', ' ', 'g'));

  base := v_tidy;
  qualifier := NULL;
  qualifier_kind := NULL;
  region_name := NULL;
  country_id := NULL;
  did_split := false;

  IF v_tidy = '' OR position(',' IN v_tidy) = 0 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_segs := regexp_split_to_array(v_tidy, '\s*,\s*');
  v_n := coalesce(array_length(v_segs, 1), 0);
  v_base := btrim(coalesce(v_segs[1], ''));

  -- Nothing usable in front of the first comma.
  IF v_n < 2 OR length(v_base) < 2 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- EVERY trailing segment must resolve. One unknown segment and we keep the
  -- name verbatim -- "Washington, D.C." and "Eitelsbach, heute Trier" are not
  -- ours to rewrite.
  FOR i IN 2..v_n LOOP
    SELECT * INTO v_res FROM public.geo_resolve_place_qualifier(v_segs[i]);
    IF v_res.kind IS NULL THEN
      RETURN NEXT;
      RETURN;
    END IF;

    IF i = 2 THEN
      v_qual := btrim(v_segs[2]);
      v_kind := v_res.kind;
    END IF;

    IF v_res.kind = 'region' AND v_region IS NULL THEN
      v_region := v_res.canonical;
    END IF;
    -- A country segment outranks a region's owning country: it is stated, not
    -- inferred. Later segments are broader, so the last country wins.
    IF v_res.kind = 'country' THEN
      v_cid := v_res.country_id;
    ELSIF v_res.kind = 'region' AND v_cid IS NULL THEN
      v_cid := v_res.country_id;
    END IF;
  END LOOP;

  base := v_base;
  qualifier := v_qual;
  qualifier_kind := v_kind;
  region_name := v_region;
  country_id := v_cid;
  did_split := true;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.geo_split_place_name(text) IS
  'Split a qualified place name into base toponym + region + country hint. '
  'did_split=false means at least one suffix segment was unrecognised and the '
  'caller must use the name verbatim.';

-- ---------------------------------------------------------------------------
-- Trigger on cities: normalize the name before anything keys off it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cities_split_qualified_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v record;
BEGIN
  IF NEW.name IS NULL OR position(',' IN NEW.name) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v FROM public.geo_split_place_name(NEW.name);
  IF NOT v.did_split OR v.base = NEW.name THEN
    RETURN NEW;
  END IF;

  -- Record what was removed before removing it, so the decision is auditable
  -- and reversible without going to the WAL.
  NEW.field_provenance := coalesce(NEW.field_provenance, '{}'::jsonb)
    || jsonb_build_object('name', jsonb_build_object(
         'value', v.base,
         'source', 'derived:qualified_name_split',
         'original', NEW.name,
         'qualifier', v.qualifier,
         'qualifier_kind', v.qualifier_kind));

  NEW.name := v.base;

  -- Never overwrite a curated region. An ambiguous qualifier ("Georgia") only
  -- lands in region_name when the row's own country agrees with it -- otherwise
  -- we would file Tbilisi under a US state.
  IF NEW.region_name IS NULL AND v.region_name IS NOT NULL
     AND v.qualifier_kind <> 'ambiguous' THEN
    IF v.country_id IS NULL OR NEW.country_id IS NULL OR v.country_id = NEW.country_id THEN
      NEW.region_name := v.region_name;
    END IF;
  END IF;

  -- name_normalized is maintained by trg_cities_normalized, which is scoped
  -- BEFORE INSERT OR UPDATE OF name. This trigger carries the same scope, so
  -- that one always fires too -- but recompute anyway: a column-scoped trigger
  -- fires on the columns named in the UPDATE STATEMENT, not on what a BEFORE
  -- trigger mutated, and relying on ordering here has burned us before
  -- (20260807100200). Recomputing is idempotent.
  NEW.name_normalized := public.normalize_name(NEW.name);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cities_split_qualified_name() IS
  'Moves a recognised region/country suffix out of cities.name into '
  'region_name, so uk_cities_country_name_active can actually see the '
  'duplicate it was created to block.';

-- `aa_` prefix is load-bearing: BEFORE triggers fire in NAME order and this
-- must precede trg_cities_normalized (name_normalized) and trg_cities_slug.
DROP TRIGGER IF EXISTS trg_cities_aa_split_name ON public.cities;
CREATE TRIGGER trg_cities_aa_split_name
  BEFORE INSERT OR UPDATE OF name ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.cities_split_qualified_name();

REVOKE ALL ON FUNCTION public.geo_resolve_place_qualifier(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.geo_split_place_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geo_resolve_place_qualifier(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.geo_split_place_name(text) TO authenticated, service_role;
