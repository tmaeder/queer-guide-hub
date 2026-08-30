-- A postal-code arm for the one sanctioned city resolver, and the health-service
-- importer routed through it.
--
-- WHY. `commit_health_service_org` carried its OWN city probe: one arm, matching
-- `lower(geo_places.name) = lower(payload.city)` inside the resolved country,
-- blocking on anything else. Blocking was right and stays. Being the only arm
-- was not: the aids.ch registry publishes French and Italian municipality names
-- against a table holding English and hyphenated bilingual ones, so 94 of 201
-- Swiss centres were stranded without a city and invisible to
-- list_testing_sites(p_city_id), to the city page and to every city facet.
--
-- The fix is to stop hand-rolling the probe. `city_resolve_or_create` already
-- exists for exactly this and 20261001100000 is the record of why: five live
-- writers each probed differently, and the good probes were wired to the pipe
-- nothing flowed through. Routing this importer through it is STRICTER than what
-- it replaces -- every refusal is kept, and the arms it gains (QID, source key,
-- canonical_key, name_normalized, city_aliases, and now postal code) all resolve
-- THROUGH duplicate_of_id to the surviving row, which the bespoke probe could
-- not do at all.
--
-- THE NEW ARM IS OPT-IN. `p_postal_code` defaults to NULL and a caller that
-- passes none gets byte-identical behaviour, so this changes nothing for the
-- other callers of the resolver. Only the health importer passes it today.
--
-- A POSTAL CODE IS NOT A CITY, and the arm is built around that. It is an
-- administrative fact about an address, which makes it a genuine second signal
-- of the kind 20260802090844 demands -- but it is not one-to-one with a
-- municipality anywhere. In Switzerland 636 postal-directory rows put one code
-- in several municipalities (1211 spans Geneve, Lancy, Meyrin, Le Grand-Saconnex
-- and Pregny-Chambesy); a US ZIP crosses city lines; a UK postcode is finer than
-- a town. So the arm demands EXACTLY ONE live city in the country claiming the
-- code, and blocks otherwise -- the same posture as the name arms rather than a
-- softer one.
--
-- It also runs LAST among the identity arms and, where a name arm already hit,
-- it is used to CONTRADICT rather than confirm: a name and a postal code that
-- point at different cities mean at least one is wrong, and that returns
-- `refused / postal_conflict` instead of a coin flip. A null city_id is
-- recoverable; a clinic filed in the wrong canton is not.
--
-- The old 13-argument signature is DROPped rather than left beside the new one.
-- Adding a defaulted parameter creates an overload, and two overloads whose
-- argument lists differ only by a trailing default make every unqualified call
-- ambiguous -- while the REVOKE/GRANT/COMMENT below would silently apply to just
-- one of them.

DROP FUNCTION IF EXISTS public.city_resolve_or_create(
  text, uuid, text, text, numeric, numeric, text, text, text, boolean, text, text, uuid);

CREATE OR REPLACE FUNCTION public.city_resolve_or_create(
  p_name             text,
  p_country_id       uuid    DEFAULT NULL,
  p_country_code     text    DEFAULT NULL,
  p_region_hint      text    DEFAULT NULL,
  p_lat              numeric DEFAULT NULL,
  p_lng              numeric DEFAULT NULL,
  p_wikidata_qid     text    DEFAULT NULL,
  p_source_slug      text    DEFAULT 'unknown',
  p_source_entity_id text    DEFAULT NULL,
  p_allow_create     boolean DEFAULT true,
  p_actor            text    DEFAULT 'resolver',
  p_requester        text    DEFAULT NULL,
  p_requester_ref    uuid    DEFAULT NULL,
  p_postal_code      text    DEFAULT NULL
)
RETURNS TABLE (
  city_id    uuid,
  action     text,
  match_type text,
  confidence numeric,
  reason     text,
  candidates jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_split       record;
  v_base        text;
  v_region      text;
  v_country_id  uuid := p_country_id;
  v_key         text;
  v_nn          text;
  v_lock        bigint;
  v_hit         uuid;
  v_mt          text;
  v_conf        numeric;
  v_cands       jsonb;
  v_cand_count  int := 0;
  v_new_id      uuid;
  v_has_evidence boolean;
  v_postal      text;
  v_postal_hit  uuid;
  v_postal_n    int := 0;
BEGIN
  p_name := nullif(btrim(p_name), '');
  IF p_name IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'empty_name', NULL::jsonb; RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Country, or nothing. Same bar as commit_city_staging_item.
  ----------------------------------------------------------------------------
  IF v_country_id IS NULL AND nullif(btrim(p_country_code),'') IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c
     WHERE c.code = upper(btrim(p_country_code)) AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'no_country', NULL::jsonb; RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Split a qualified name through the existing splitter, so the probes see the
  -- same string trg_cities_aa_split_name would have written. A country hint in
  -- the string that contradicts the caller's country is the ONLY surviving
  -- evidence that one of the two is wrong (20260811100400 found 47 such rows),
  -- so it blocks instead of being silently stripped.
  ----------------------------------------------------------------------------
  v_base   := p_name;
  v_region := nullif(btrim(p_region_hint), '');
  IF position(',' IN p_name) > 0 THEN
    SELECT * INTO v_split FROM public.geo_split_place_name(p_name);
    IF v_split.did_split THEN
      IF v_split.country_id IS NOT NULL AND v_split.country_id <> v_country_id THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'country_contradiction',
          jsonb_build_object('stated_country', v_split.country_id, 'given_country', v_country_id);
        RETURN;
      END IF;
      v_base := v_split.base;
      IF v_region IS NULL AND v_split.qualifier_kind <> 'ambiguous' THEN
        v_region := v_split.region_name;
      END IF;
    END IF;
  END IF;

  v_key := public.city_canonical_key(v_base);
  v_nn  := public.normalize_name(v_base);

  ----------------------------------------------------------------------------
  -- Serialize on the same key commit_city_staging_item uses, so the two paths
  -- cannot race each other into a duplicate.
  ----------------------------------------------------------------------------
  v_lock := hashtextextended(v_country_id::text || '|' || v_nn, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  ----------------------------------------------------------------------------
  -- Probe ladder. First hit wins; every arm resolves through duplicate_of_id.
  ----------------------------------------------------------------------------

  -- (a) QID. Deliberately NOT scoped to the country: a QID match that crosses a
  -- border is evidence the caller's country is wrong, not evidence of a second
  -- city, and returning it with a reason is more useful than creating a twin.
  IF v_hit IS NULL AND nullif(btrim(p_wikidata_qid),'') IS NOT NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.wikidata_qid = btrim(p_wikidata_qid) LIMIT 1;
    IF v_hit IS NOT NULL THEN
      v_mt := 'qid'; v_conf := 1.0;
      IF NOT EXISTS (SELECT 1 FROM public.cities c WHERE c.id = v_hit AND c.country_id = v_country_id) THEN
        RETURN QUERY SELECT v_hit, 'matched', v_mt, v_conf, 'qid_country_mismatch', NULL::jsonb; RETURN;
      END IF;
    END IF;
  END IF;

  -- (b) The source's own id for this city.
  IF v_hit IS NULL AND nullif(btrim(p_source_entity_id),'') IS NOT NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit
      FROM public.geo_sources gs JOIN public.cities c ON c.id = gs.city_id
     WHERE gs.entity_type = 'city' AND gs.source_slug = p_source_slug
       AND gs.source_entity_id = btrim(p_source_entity_id) LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'source_key'; v_conf := 0.99; END IF;
  END IF;

  -- (c) The generated canonical key. TOTAL index -- merged rows included.
  IF v_hit IS NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.canonical_key = v_key LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'canonical_key'; v_conf := 0.99; END IF;
  END IF;

  -- (d) lower(name). Also TOTAL, and it catches what canonical_key's unaccent
  -- folds differently.
  IF v_hit IS NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND lower(c.name) = lower(v_base) LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'name_country'; v_conf := 0.98; END IF;
  END IF;

  -- (e) name_normalized, but only when it is a real key. normalize_name strips
  -- every non-[a-z0-9] character, so a name in Greek, Japanese, Korean, Hebrew,
  -- Cyrillic, Georgian, Thai, Khmer or Lao normalizes to the EMPTY STRING --
  -- 27 live rows do, and matching on '' would resolve every one of them to
  -- whichever row happens to be first. canonical_key (arm c) preserves the
  -- script and is the arm that actually protects those names.
  IF v_hit IS NULL AND length(v_nn) >= 3 THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.name_normalized = v_nn LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'name_normalized'; v_conf := 0.98; END IF;
  END IF;

  -- (f) Alias. This is the arm that catches the exonym -- Kapstadt -> Cape Town,
  -- Teheran -> Tehran, Thorn -> Torun -- and it is only as good as the table
  -- behind it. merge_cities already mints an alias for every name it drops
  -- (207 of 210 merged names are covered); the Wikidata harvest is what makes
  -- it cover names that were never merged.
  IF v_hit IS NULL AND length(v_key) >= 3 THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit
      FROM public.city_aliases a JOIN public.cities c ON c.id = a.city_id
     WHERE a.alias_key = v_key AND c.country_id = v_country_id LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'alias'; v_conf := 0.95; END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- (g) Postal code. OPT-IN: a caller that passes none gets byte-identical
  -- behaviour to before this arm existed.
  --
  -- A postal code is an administrative fact about an address, which makes it a
  -- second signal of exactly the kind 20260802090844 demands -- but it is NOT
  -- one-to-one with a city and must never be treated as though it were. In
  -- Switzerland alone 636 directory rows put one code in several municipalities
  -- (1211 covers Geneve, Lancy, Meyrin, Le Grand-Saconnex and Pregny-Chambesy),
  -- and elsewhere it is worse: a US ZIP crosses city lines and a UK postcode is
  -- finer than a town. So this arm requires EXACTLY ONE live city in the country
  -- to claim the code and blocks otherwise, the same posture as the name arms.
  --
  -- It runs LAST among the identity arms, so it can only speak where name, QID,
  -- source key and alias were all silent -- and when a name arm did hit, the
  -- code is used to CONTRADICT rather than to confirm: two identity signals that
  -- disagree mean at least one is wrong, and a null city_id is recoverable while
  -- a wrong one is not.
  v_postal := nullif(btrim(p_postal_code), '');
  IF v_postal IS NOT NULL THEN
    -- Resolved THROUGH duplicate_of_id like every other arm, and counted over
    -- DISTINCT survivors. Filtering merged rows out instead would go blind to a
    -- code carried by a row that has since been merged away; counting raw rows
    -- instead would let a survivor and its own twin look like two cities and
    -- block a resolution that is not actually ambiguous.
    --
    -- (array_agg(...))[1], never min(uuid): there is no min() for uuid, and the
    -- same mistake already cost 20260724260500 a migration.
    SELECT count(DISTINCT coalesce(c.duplicate_of_id, c.id)),
           (array_agg(DISTINCT coalesce(c.duplicate_of_id, c.id)))[1]
      INTO v_postal_n, v_postal_hit
      FROM public.cities c
     WHERE c.country_id = v_country_id
       AND c.postal_codes @> ARRAY[v_postal];

    IF v_hit IS NOT NULL AND v_postal_n = 1 AND v_postal_hit IS DISTINCT FROM v_hit THEN
      RETURN QUERY SELECT NULL::uuid, 'refused', 'postal_conflict', 0::numeric,
        'name_and_postal_disagree',
        jsonb_build_object('by_name', v_hit, 'by_postal', v_postal_hit, 'postal_code', v_postal);
      RETURN;
    END IF;

    IF v_hit IS NULL AND v_postal_n = 1 THEN
      v_hit := v_postal_hit; v_mt := 'postal_code'; v_conf := 0.95;
    END IF;
  END IF;

  IF v_hit IS NOT NULL THEN
    RETURN QUERY SELECT v_hit, 'matched', v_mt, v_conf, NULL::text, NULL::jsonb; RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- No identity hit. Collect near candidates and refuse if there are any --
  -- including the sole-city-within-2 km case, which scores 0.85 and so can
  -- never reach the 0.95 match bar. Proximity stops a create; it never makes one.
  ----------------------------------------------------------------------------
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
             'city_id', x.id, 'name', x.name, 'distance_m', round(x.dm)::int,
             'wikidata_qid', x.wikidata_qid)), count(*)
      INTO v_cands, v_cand_count
      FROM (
        SELECT c.id, c.name, c.wikidata_qid,
               public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) AS dm
          FROM public.cities c
         WHERE c.country_id = v_country_id AND c.duplicate_of_id IS NULL
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND abs(c.latitude - p_lat) < 0.03 AND abs(c.longitude - p_lng) < 0.05
           AND public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) < 2000
           -- Two distinct QIDs are two distinct entities. Same hard exclusion
           -- as the sweep arm, so a district never blocks its own city.
           AND NOT (c.wikidata_qid IS NOT NULL AND nullif(btrim(p_wikidata_qid),'') IS NOT NULL
                    AND c.wikidata_qid <> btrim(p_wikidata_qid))
         ORDER BY dm LIMIT 5
      ) x;
  END IF;

  IF v_cand_count > 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'geo_proximity', 0.85::numeric, 'ambiguous', v_cands;
    RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Create, but only past the evidence bar.
  ----------------------------------------------------------------------------
  IF NOT p_allow_create THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'create_not_allowed', NULL::jsonb; RETURN;
  END IF;

  v_has_evidence := (p_lat IS NOT NULL AND p_lng IS NOT NULL)
                 OR nullif(btrim(p_wikidata_qid),'') IS NOT NULL
                 OR nullif(btrim(p_source_entity_id),'') IS NOT NULL
                 OR p_actor = 'admin';

  IF NOT v_has_evidence THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'insufficient_evidence', NULL::jsonb; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.cities
      (name, country_id, region_name, latitude, longitude, wikidata_qid,
       data_source, last_synced_at, last_refreshed_at, created_at, updated_at,
       field_provenance)
    VALUES
      (v_base, v_country_id, v_region, p_lat, p_lng, nullif(btrim(p_wikidata_qid),''),
       p_source_slug, now(), now(), now(), now(),
       jsonb_build_object('city_resolve', jsonb_build_object(
         'action','created','source',p_source_slug,'actor',p_actor,'at',now())))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    -- Someone won the race, or trg_cities_aa_split_name rewrote the name into
    -- one that already exists. Re-probe on the POST-trigger key, still holding
    -- the advisory lock. This one recovery replaces three hand-rolled copies
    -- (resolve-or-create-city, backfill-venue-cities, venue-import-helpers),
    -- which each followed duplicate_of_id slightly differently.
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.canonical_key = v_key LIMIT 1;
    IF v_hit IS NULL THEN
      SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
       WHERE c.country_id = v_country_id AND lower(c.name) = lower(v_base) LIMIT 1;
    END IF;
    IF v_hit IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'unique_violation_unresolved', NULL::jsonb; RETURN;
    END IF;
    RETURN QUERY SELECT v_hit, 'raced', 'canonical_key', 0.99::numeric, NULL::text, NULL::jsonb; RETURN;
  END;

  IF nullif(btrim(p_source_entity_id),'') IS NOT NULL THEN
    INSERT INTO public.geo_sources
      (entity_type, city_id, source_slug, source_entity_id, confidence, is_primary, first_seen_at, last_seen_at)
    VALUES ('city', v_new_id, p_source_slug, btrim(p_source_entity_id), 1.0, true, now(), now())
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET last_seen_at = now();
  END IF;

  RETURN QUERY SELECT v_new_id, 'created', 'none', 1.0::numeric, NULL::text, NULL::jsonb;
END; $$;
ALTER FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text) TO service_role, authenticated;

COMMENT ON FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text) IS
  'The only sanctioned way to turn a city name into a city_id. Probes qid, '
  'source key, canonical_key, lower(name), name_normalized, city_aliases and -- '
  'when the caller supplies one -- a postal code claimed by exactly one city in '
  'the country. All arms ignore duplicate_of_id and resolve to the survivor. '
  'Refuses on ambiguity, on a contradicting country in the name, on a name and '
  'postal code that disagree, and on a create with no evidence.';


-- ---------------------------------------------------------------------------
-- The health-service importer, routed through the resolver above.
-- ---------------------------------------------------------------------------

create or replace function public.commit_health_service_org(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_ext          text := nullif(trim(p->>'external_id'), '');
  v_name         text := nullif(trim(p->>'name'), '');
  v_website      text := nullif(trim(p->>'website'), '');
  -- The provenance tag. Required: it is what "who told us this" and every
  -- source-scoped promote/retire query key on, so a default would let a caller
  -- that forgot it file records under another directory's name.
  v_source       text := nullif(trim(p->'source'->>'name'), '');
  v_detail_key   text := coalesce(nullif(trim(p->>'enrichment_key'), ''), nullif(trim(p->'source'->>'name'), ''));
  v_slug_default text := coalesce(nullif(trim(p->>'slug_fallback'), ''), 'health-service');
  v_domain       text;
  v_id           uuid;
  v_matched_ext  boolean := false;
  v_slug         text;
  v_base         text;
  v_try          integer := 0;
  v_constraint   text;
  v_country_id   uuid;
  v_city_id      uuid;
  v_city_name    text := nullif(trim(p->>'city'), '');
  v_city_postal  text := nullif(trim(p->>'postal_code'), '');
  v_city_note    text := null;
  v_res_action   text;
  v_res_match    text;
  v_res_reason   text;
  v_tags         text[];
  v_groups       text[];
  v_lat          double precision;
  v_lng          double precision;
begin
  if v_ext is null or v_name is null then
    raise exception 'commit_health_service_org: external_id and name are both required (got %, %)', v_ext, v_name;
  end if;
  if v_source is null then
    raise exception 'commit_health_service_org: source.name is required (it is the provenance tag)';
  end if;

  v_domain := nullif(lower(regexp_replace(coalesce(v_website, ''), '^https?://(www\.)?([^/?#]+).*$', '\2')), '');

  v_lat := nullif(p->>'latitude', '')::double precision;
  v_lng := nullif(p->>'longitude', '')::double precision;
  -- Half a coordinate is not a location. The paired CHECK would reject it, but
  -- failing the whole record over it would lose an otherwise good clinic.
  if v_lat is null or v_lng is null or (v_lat = 0 and v_lng = 0) then
    v_lat := null; v_lng := null;
  end if;

  ------------------------------------------------------------------ geography
  select gp.id into v_country_id
    from public.geo_places gp
   where gp.place_type = 'country'
     and gp.duplicate_of_id is null
     and (
       (nullif(p->>'country_code','') is not null and upper(gp.code) = upper(p->>'country_code'))
       or (nullif(p->>'country','') is not null and lower(gp.name) = lower(p->>'country'))
     )
   order by (upper(gp.code) = upper(coalesce(p->>'country_code',''))) desc
   limit 1;

  -- Resolve the city through `city_resolve_or_create`, which is the only
  -- sanctioned way to turn a city name into a city_id, at p_allow_create=false.
  --
  -- WHAT THIS REPLACED and why it is STRICTER, not looser. The bespoke probe
  -- here matched `lower(geo_places.name) = lower(payload.city)` inside the
  -- resolved country and blocked on anything else. That guard was right --
  -- 20260802090844 is the record of name-only resolution attaching 116 events to
  -- the wrong Portland -- but it was also the ONLY arm, and this registry
  -- publishes French and Italian names against a table holding English and
  -- hyphenated bilingual ones. 94 of 201 Swiss centres were therefore stranded
  -- with no city, invisible to list_testing_sites(p_city_id), to the city page
  -- and to every city facet.
  --
  -- The resolver keeps every refusal this had (ambiguity, a contradicting
  -- country inside the name, geo proximity) and adds the arms that were missing:
  -- QID, source key, canonical_key, name_normalized, `city_aliases` -- which is
  -- what reaches Geneve -> Geneva and Fribourg -> "Fribourg - Freiburg" -- and
  -- the postal-code arm. Every arm resolves THROUGH duplicate_of_id to the
  -- surviving row, which the old probe could not do at all: it filtered merged
  -- rows out and so simply failed on any name that had been merged away.
  --
  -- p_allow_create stays FALSE. A clinic's address is not evidence for minting a
  -- city, and a bare (name, country) from an automated feed is precisely the
  -- shape that minted Kapstadt beside Cape Town. Cities are added deliberately,
  -- by migration, from a reviewed list.
  if v_country_id is not null and v_city_name is not null then
    select r.city_id, r.action, r.match_type, r.reason
      into v_city_id, v_res_action, v_res_match, v_res_reason
      from public.city_resolve_or_create(
             p_name         => v_city_name,
             p_country_id   => v_country_id,
             p_postal_code  => v_city_postal,
             p_source_slug  => v_source,
             p_allow_create => false,
             p_actor        => 'health-service-import'
           ) r;

    -- Record HOW it resolved, not just that it did. The note is the only place a
    -- human sees why a centre has no city, and "no city named X" was true of
    -- three different failures that need three different fixes: the city is
    -- missing, the city is present under another name, or two signals disagree.
    if v_city_id is null then
      v_city_note := format('unresolved (%s): %s',
                            coalesce(v_res_match, 'none'), coalesce(v_res_reason, 'no match'));
    elsif v_res_match is distinct from 'canonical_key' and v_res_match is distinct from 'name_country' then
      v_city_note := format('resolved by %s', v_res_match);
    end if;
  elsif v_country_id is null then
    v_city_note := 'country unresolved';
  end if;

  ------------------------------------------------------------------ vocabulary
  select array_agg(distinct a.slug) into v_tags
    from public.amenities a
   where a.is_active
     and a.slug in (select jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)));

  select array_agg(distinct tg.slug) into v_groups
    from public.target_groups tg
   where tg.is_active
     and exists (
       select 1
         from jsonb_array_elements_text(coalesce(p->'target_terms', '[]'::jsonb)) as t(term)
        where lower(tg.slug) = t.term
           or lower(tg.name) = t.term
           or t.term in (select lower(x) from unnest(coalesce(tg.aliases, '{}')) as x)
     );

  ------------------------------------------------- adopt-before-create ladder
  select o.id into v_id
    from public.organizations o
   where o.field_provenance->'source'->>'external_id' = v_ext
     and o.field_provenance->'source'->>'name' is not distinct from v_source
     and o.duplicate_of_id is null
   limit 1;
  v_matched_ext := v_id is not null;

  -- Domain adoption, but NEVER onto an org another directory entry already owns.
  --
  -- `website_domain` identifies a business; it does NOT identify a LOCATION,
  -- and these sources are full of multi-branch providers whose every branch
  -- publishes the same site. Measured on the testfinder corpus: 35 domains are
  -- shared by 124 centres. Without the external_id guard the first centre
  -- adopts (or mints) a row and every sibling adopts that SAME row, each
  -- overwriting its name, address, coordinates and provenance: 530 payloads
  -- collapsed to 441 rows.
  --
  -- So adopt only an org that no directory entry has claimed yet. Two
  -- directories that both list the same clinic therefore mint two rows on
  -- purpose; resolving that is the nightly dedup sweep's job, which merges
  -- reversibly and audits.
  if v_id is null and v_domain is not null then
    select o.id into v_id
      from public.organizations o
     where lower(o.website_domain) = v_domain
       and o.duplicate_of_id is null
       and o.field_provenance->'source'->>'external_id' is null
     limit 1;
  end if;

  ------------------------------------------------------------------- insert
  if v_id is null then
    v_base := left(regexp_replace(lower(unaccent(v_name)), '[^a-z0-9]+', '-', 'g'), 60);
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := v_slug_default; end if;
    v_slug := v_base;

    -- Cheap pre-check: resolves the ordinary case without ever raising.
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_try := v_try + 1;
      if v_try > 50 then
        raise exception 'commit_health_service_org: could not find a free slug for %', v_name;
      end if;
      v_slug := v_base || '-' || v_try;
    end loop;

    -- The unique index is the arbiter. The SELECT above takes no lock, so two
    -- concurrent commits of two same-named branches can both see a slug free;
    -- the loser bumps its suffix and tries again rather than losing the record.
    loop
      begin
        insert into public.organizations (
          slug, name, description, roles, status, needs_attention,
          website, website_domain, email, phone,
          address, postal_code, city_id, country_id, latitude, longitude,
          tags, target_groups, field_provenance, enrichment_status
        ) values (
          v_slug, v_name, nullif(trim(p->>'description'), ''), array['support'], 'draft', true,
          v_website, v_domain, nullif(trim(p->>'email'), ''), nullif(trim(p->>'phone'), ''),
          nullif(trim(p->>'address'), ''), nullif(trim(p->>'postal_code'), ''),
          v_city_id, v_country_id, v_lat, v_lng,
          coalesce(v_tags, '{}') || array[v_source],
          coalesce(v_groups, '{}'),
          jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
          jsonb_build_object(
            v_detail_key, coalesce(p->'detail', '{}'::jsonb)
                          || jsonb_build_object('city_link_note', v_city_note))
        )
        returning id into v_id;
        exit;
      exception when unique_violation then
        -- ONLY the slug index retries. A blanket handler would swallow a
        -- collision on some other constraint and spin 50 times before
        -- reporting a misleading "could not find a free slug".
        -- CONSTRAINT_NAME, not PG_EXCEPTION_CONSTRAINT: the latter is the
        -- name in libpq's error fields and PL/pgSQL does not accept it
        -- (42601 unrecognized GET DIAGNOSTICS item).
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint is distinct from 'organizations_slug_key' then
          raise;
        end if;
        v_try := v_try + 1;
        if v_try > 50 then
          raise exception 'commit_health_service_org: could not find a free slug for % after % attempts', v_name, v_try;
        end if;
        v_slug := v_base || '-' || v_try;
      end;
    end loop;

  ------------------------------------------------------------------- update
  elsif v_matched_ext then
    -- Our own row: refresh source-owned facts, because a re-fetch is the only
    -- thing that keeps them current. `status` is never written — an admin may
    -- have promoted the row and a re-sync must not silently unpublish it.
    update public.organizations o set
      name           = v_name,
      description    = coalesce(nullif(trim(p->>'description'), ''), o.description),
      roles          = (select array_agg(distinct r) from unnest(o.roles || array['support']) r),
      website        = coalesce(v_website, o.website),
      website_domain = coalesce(v_domain, o.website_domain),
      email          = coalesce(nullif(trim(p->>'email'), ''), o.email),
      phone          = coalesce(nullif(trim(p->>'phone'), ''), o.phone),
      address        = coalesce(nullif(trim(p->>'address'), ''), o.address),
      postal_code    = coalesce(nullif(trim(p->>'postal_code'), ''), o.postal_code),
      city_id        = coalesce(v_city_id, o.city_id),
      country_id     = coalesce(v_country_id, o.country_id),
      latitude       = coalesce(v_lat, o.latitude),
      longitude      = coalesce(v_lng, o.longitude),
      -- coalesce the WHOLE aggregate: array_agg over an empty set returns
      -- NULL, and both columns are NOT NULL.
      tags           = coalesce((select array_agg(distinct t)
                          from unnest(o.tags || coalesce(v_tags, '{}') || array[v_source]) t), '{}'),
      target_groups  = coalesce((select array_agg(distinct g)
                          from unnest(o.target_groups || coalesce(v_groups, '{}')) g), '{}'),
      field_provenance = o.field_provenance || jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      enrichment_status = o.enrichment_status || jsonb_build_object(
        v_detail_key, coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note)),
      updated_at = now()
    where o.id = v_id;

  else
    -- Adopted someone else's row: fill only what is empty, never clobber
    -- curated editorial. Same rule as commit_venue_staging_item's UPDATE branch.
    update public.organizations o set
      description    = coalesce(o.description, nullif(trim(p->>'description'), '')),
      roles          = (select array_agg(distinct r) from unnest(o.roles || array['support']) r),
      email          = coalesce(o.email, nullif(trim(p->>'email'), '')),
      phone          = coalesce(o.phone, nullif(trim(p->>'phone'), '')),
      address        = coalesce(o.address, nullif(trim(p->>'address'), '')),
      postal_code    = coalesce(o.postal_code, nullif(trim(p->>'postal_code'), '')),
      city_id        = coalesce(o.city_id, v_city_id),
      country_id     = coalesce(o.country_id, v_country_id),
      latitude       = coalesce(o.latitude, v_lat),
      longitude      = coalesce(o.longitude, v_lng),
      tags           = coalesce((select array_agg(distinct t)
                          from unnest(o.tags || coalesce(v_tags, '{}') || array[v_source]) t), '{}'),
      target_groups  = coalesce((select array_agg(distinct g)
                          from unnest(o.target_groups || coalesce(v_groups, '{}')) g), '{}'),
      field_provenance = o.field_provenance || jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      enrichment_status = o.enrichment_status || jsonb_build_object(
        v_detail_key, coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note,
                                            'adopted_existing_org', true)),
      needs_attention = true,
      updated_at = now()
    where o.id = v_id;
  end if;

  return v_id;
end $$;
revoke all on function public.commit_health_service_org(jsonb) from public, anon, authenticated;
grant execute on function public.commit_health_service_org(jsonb) to service_role;
