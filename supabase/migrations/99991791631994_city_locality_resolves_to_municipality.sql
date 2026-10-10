-- An Ortsteil is not a city: resolve localities onto their municipality.
--
-- Prompted by `Hinterzarten` (deleted by 99991791631989): a Gemeinde whose
-- territory is a village plus a dozen Zinken and Wohnplaetze — Alpersbach,
-- Am Feldberg, Bisten, Bruderhalde, Erlenbruck, Loeffeltal, Oberzarten,
-- Rinken, Rotwasser, Windeck, Winterhalde, Altenvogtshuette, Ramselegut,
-- Dorneck, Fuersatz, Silberberg (de.wikipedia, "Gemeindegliederung", read
-- 2026-10-09). Rule from now on: a writer asking `city_resolve_or_create` for
-- one of those names must get the MUNICIPALITY, never a fresh city row named
-- after the Ortsteil.
--
-- Nothing in the schema could express that before this file: `cities` has no
-- parent column, `geo_places`' `village` type is a queer district, and every
-- city creator goes through `city_resolve_or_create`, which only ever matched
-- or minted at the same level.
--
-- WHY A TABLE AND NOT `city_aliases`. An alias arm is name-only within a
-- country, and Ortsteil names collide with real municipalities elsewhere in
-- the same country: `Windeck` is also a Gemeinde in NRW, `Silberberg`,
-- `Rinken` and `Dorneck` exist several times over. An alias `Windeck ->
-- Hinterzarten` would capture the NRW municipality. So the locality arm here
-- needs a SECOND, independent signal — the caller's coordinates within the
-- locality's radius, or the locality's own Wikidata QID — and stays silent on
-- a bare name. (The house rule: never resolve by name alone when the reference
-- table cannot represent the ambiguity.)
--
-- When the municipality has no city row (Hinterzarten today), the arm REFUSES
-- with `locality_of_unresolved_municipality` rather than letting the insert
-- branch mint an Ortsteil shell. The municipality itself is still creatable by
-- its own name with real evidence.
--
-- Also: GeoNames `PPLX` ("section of populated place") staging rows may still
-- MATCH an existing city, but may no longer CREATE one.
--
-- Both functions are PATCHED from their live definitions (pg_get_functiondef),
-- never restated; every anchor is asserted to occur exactly once.

-- ── 1. Registry ─────────────────────────────────────────────────────────────

create table if not exists public.city_localities (
  id                uuid primary key default gen_random_uuid(),
  country_id        uuid not null references public.countries(id),
  locality_name     text not null,
  locality_key      text generated always as (public.city_canonical_key(locality_name)) stored,
  locality_qid      text,
  kind              text not null default 'ortsteil'
                    check (kind in ('ortsteil','zinken','wohnplatz','quarter','dwelling_place','municipality_seat','locality')),
  municipality_name text not null,
  municipality_qid  text,
  anchor_lat        numeric not null,
  anchor_lng        numeric not null,
  radius_m          integer not null default 9000 check (radius_m between 500 and 25000),
  source            text not null,
  note              text,
  created_at        timestamptz not null default now(),
  constraint city_localities_qid_fmt check (locality_qid is null or locality_qid ~ '^Q[0-9]+$'),
  constraint city_localities_muni_qid_fmt check (municipality_qid is null or municipality_qid ~ '^Q[0-9]+$')
);

create unique index if not exists city_localities_country_key_muni_uniq
  on public.city_localities (country_id, locality_key, coalesce(municipality_qid, municipality_name));
create unique index if not exists city_localities_qid_uniq
  on public.city_localities (locality_qid) where locality_qid is not null;
create index if not exists city_localities_key_idx
  on public.city_localities (country_id, locality_key);

comment on table public.city_localities is
  'Ortsteile / Ortschaften / Wohnplaetze that belong to a municipality. city_resolve_or_create resolves a request for one of these onto the municipality (by QID, or by name + caller coordinates within radius_m of the anchor) and never creates a city row for it. Name alone never fires: Ortsteil names collide with real municipalities elsewhere.';

alter table public.city_localities enable row level security;
revoke all on table public.city_localities from anon, authenticated;
grant all on table public.city_localities to service_role;

-- ── 2. Seed: Hinterzarten ───────────────────────────────────────────────────
-- Anchor = Q515356's P625 (47.90778, 8.10083). Gemeinde area ~31 km2; the
-- Zinken around Feldberg/Titisee sit up to ~7 km out, hence 9 km. The radius
-- only ever applies together with an exact name match.

insert into public.city_localities
  (country_id, locality_name, locality_qid, kind, municipality_name, municipality_qid,
   anchor_lat, anchor_lng, radius_m, source, note)
select c.id, v.name, v.qid, v.kind, 'Hinterzarten', 'Q515356', 47.907778, 8.100833, 9000,
       'migration:99991791631994', v.note
  from public.countries c
  cross join (values
    ('Alpersbach',       null,          'zinken',    null),
    ('Am Feldberg',      null,          'zinken',    null),
    ('Bisten',           null,          'zinken',    'teilweise Gemarkung Breitnau'),
    ('Bruderhalde',      null,          'zinken',    null),
    ('Erlenbruck',       null,          'zinken',    null),
    ('Löffeltal',        null,          'zinken',    null),
    ('Oberzarten',       'Q130278913',  'zinken',    null),
    ('Rinken',           null,          'zinken',    null),
    ('Rotwasser',        null,          'zinken',    null),
    ('Windeck',          null,          'zinken',    'NOT the NRW municipality Windeck; coordinate-gated'),
    ('Winterhalde',      null,          'zinken',    null),
    ('Altenvogtshütte',  null,          'wohnplatz', null),
    ('Ramselegut',       'Q27525485',   'wohnplatz', null),
    ('Dorneck',          null,          'wohnplatz', null),
    ('Fürsatz',          null,          'wohnplatz', null),
    ('Silberberg',       null,          'wohnplatz', null)
  ) v(name, qid, kind, note)
 where c.code = 'DE' and c.duplicate_of_id is null
on conflict do nothing;

-- ── 3. Resolver arm ─────────────────────────────────────────────────────────

do $patch$
declare
  v_def text := pg_get_functiondef('public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text)'::regprocedure);
  v_decl_anchor text := '  v_admin       boolean := (p_actor = ''admin'');';
  v_arm_anchor  text := '  -- (c)-(f) Name arms. Each collects EVERY same-name survivor in the country';
  v_new text;
begin
  if regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g') like '%city_localities%' then
    raise notice 'city_resolve_or_create already has the locality arm; skipping';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_decl_anchor, ''))) / length(v_decl_anchor) <> 1 then
    raise exception 'declare anchor not found exactly once in city_resolve_or_create';
  end if;
  if (length(v_def) - length(replace(v_def, v_arm_anchor, ''))) / length(v_arm_anchor) <> 1 then
    raise exception 'name-arms anchor not found exactly once in city_resolve_or_create';
  end if;

  v_new := replace(v_def, v_decl_anchor, v_decl_anchor
    || E'\n  v_loc         record;'
    || E'\n  v_muni        uuid;');

  v_new := replace(v_new, v_arm_anchor, $ins$  -- (h) Locality of a municipality (Ortsteil / Zinken / Wohnplatz). Never by
  -- name alone: the caller's QID must be the locality's, or the caller's
  -- coordinates must sit within the locality's radius. On a hit the answer is
  -- the MUNICIPALITY; if that has no city row, refuse rather than mint a shell.
  -- Runs BEFORE the name arms: with coordinates in hand, a same-named city
  -- elsewhere in the country (another Alpersbach, Windeck NRW) is not the
  -- place the caller is standing in.
  IF v_hit IS NULL THEN
  SELECT l.* INTO v_loc FROM public.city_localities l
   WHERE l.country_id = v_country_id
     AND (
       (nullif(btrim(p_wikidata_qid),'') IS NOT NULL AND l.locality_qid = btrim(p_wikidata_qid))
       OR (l.locality_key = v_key AND p_lat IS NOT NULL AND p_lng IS NOT NULL
           AND public.haversine_m(p_lat, p_lng, l.anchor_lat, l.anchor_lng) <= l.radius_m)
     )
   ORDER BY (l.locality_qid IS NOT DISTINCT FROM nullif(btrim(p_wikidata_qid),'')) DESC
   LIMIT 1;
  IF FOUND THEN
    IF v_loc.municipality_qid IS NOT NULL THEN
      SELECT coalesce(c.duplicate_of_id, c.id) INTO v_muni FROM public.cities c
       WHERE c.wikidata_qid = v_loc.municipality_qid AND c.country_id = v_country_id LIMIT 1;
    END IF;
    IF v_muni IS NULL THEN
      SELECT coalesce(c.duplicate_of_id, c.id) INTO v_muni FROM public.cities c
       WHERE c.country_id = v_country_id AND c.duplicate_of_id IS NULL
         AND c.canonical_key = public.city_canonical_key(v_loc.municipality_name)
         AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
         AND public.haversine_m(v_loc.anchor_lat, v_loc.anchor_lng, c.latitude, c.longitude) <= v_loc.radius_m
       LIMIT 1;
    END IF;
    IF v_muni IS NOT NULL THEN
      RETURN QUERY SELECT v_muni, 'matched', 'locality_of_municipality', 0.95::numeric, NULL::text,
        jsonb_build_object('locality', v_loc.locality_name, 'municipality', v_loc.municipality_name);
      RETURN;
    END IF;
    RETURN QUERY SELECT NULL::uuid, 'refused', 'locality_of_municipality', 0::numeric,
      'locality_of_unresolved_municipality',
      jsonb_build_object('locality', v_loc.locality_name, 'municipality', v_loc.municipality_name,
                         'municipality_qid', v_loc.municipality_qid);
    RETURN;
  END IF;
  END IF;

$ins$ || v_arm_anchor);

  execute v_new;
end
$patch$;

-- ── 4. GeoNames PPLX may match, never create ────────────────────────────────

do $patch$
declare
  v_def text := pg_get_functiondef('public.commit_city_staging_item(uuid,text)'::regprocedure);
  v_call_anchor  text := '      p_actor            => ''pipeline-commit''' || chr(10) || '    );';
  v_raise_anchor text := '      RAISE EXCEPTION ''city_unresolved: staging=% reason=% name=%'', p_staging_id, v_res.reason, v_name;';
  v_new text;
begin
  if regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g') like '%PPLX%' then
    raise notice 'commit_city_staging_item already has the PPLX rule; skipping';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_call_anchor, ''))) / length(v_call_anchor) <> 1 then
    raise exception 'resolver-call anchor not found exactly once in commit_city_staging_item';
  end if;
  if (length(v_def) - length(replace(v_def, v_raise_anchor, ''))) / length(v_raise_anchor) <> 1 then
    raise exception 'raise anchor not found exactly once in commit_city_staging_item';
  end if;

  v_new := replace(v_def, v_call_anchor,
       '      p_actor            => ''pipeline-commit'',' || chr(10)
    || '      -- GeoNames PPLX = section of a populated place (an Ortsteil): match only.' || chr(10)
    || '      p_allow_create     => upper(coalesce(v_meta->>''feature_code'', '''')) <> ''PPLX''' || chr(10)
    || '    );');

  v_new := replace(v_new, v_raise_anchor,
       '      RAISE EXCEPTION ''city_unresolved: staging=% reason=% name=%'', p_staging_id,' || chr(10)
    || '        CASE WHEN v_res.reason = ''create_not_allowed'' AND upper(coalesce(v_meta->>''feature_code'', '''')) = ''PPLX''' || chr(10)
    || '             THEN ''geonames_pplx_locality'' ELSE v_res.reason END, v_name;');

  execute v_new;
end
$patch$;

-- ── 5. Postconditions ───────────────────────────────────────────────────────

do $verify$
declare
  v_r   record;
  v_src text;
  v_n   int;
begin
  -- Seeded rows reached (positive count; a missing DE row would make it 0).
  select count(*) into v_n from public.city_localities where municipality_qid = 'Q515356';
  if v_n < 16 then raise exception 'city_localities seed: % of 16 Hinterzarten rows', v_n; end if;

  -- Both patches present in the LIVE bodies, comments stripped.
  v_src := regexp_replace(pg_get_functiondef('public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  if v_src not like '%from public.city_localities l%' and v_src not like '%FROM public.city_localities l%' then
    raise exception 'locality arm missing from city_resolve_or_create';
  end if;
  v_src := regexp_replace(pg_get_functiondef('public.commit_city_staging_item(uuid,text)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  if v_src not like '%p_allow_create     => upper(coalesce(v_meta->>''feature_code'', '''')) <> ''PPLX''%' then
    raise exception 'PPLX rule missing from commit_city_staging_item';
  end if;

  -- Behaviour, not text: an Ortsteil near Hinterzarten must never be created.
  -- p_allow_create => false so this probe can never write, whatever happens.
  select * into v_r from public.city_resolve_or_create(
    p_name => 'Alpersbach', p_country_code => 'DE', p_lat => 47.8990, p_lng => 8.0880,
    p_source_slug => 'migration-probe', p_allow_create => false);
  if v_r.match_type is distinct from 'locality_of_municipality' then
    raise exception 'locality arm did not fire for Alpersbach near Hinterzarten (got % / %)', v_r.match_type, v_r.reason;
  end if;

  -- Mirror: the same name far away (Windeck NRW, ~50.77 N 7.57 E) must NOT fire.
  select * into v_r from public.city_resolve_or_create(
    p_name => 'Windeck', p_country_code => 'DE', p_lat => 50.7700, p_lng => 7.5700,
    p_source_slug => 'migration-probe', p_allow_create => false);
  if v_r.match_type = 'locality_of_municipality' then
    raise exception 'locality arm fired on a bare name 300 km away (Windeck NRW)';
  end if;
end
$verify$;
