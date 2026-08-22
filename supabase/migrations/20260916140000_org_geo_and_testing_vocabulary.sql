-- Support organizations gain their own geography, and the search index starts
-- using it. Groundwork for importing European Test Finder testing sites as
-- `organizations` rows with roles = ['support'].
--
-- WHY GEO ON THE ORG ROW. `organizations` had no coordinates at all — the
-- dedup engine says so out loud (`_shared/dedup-engine.ts:315`, "No geo on orgs
-- -> no geoGuard"), and `search_documents_index_organizations` borrowed `geog`
-- from `primary_venue_id`'s venue. That is fine for a business spine where the
-- org is an abstract party and its venue is the place, but a testing site IS a
-- place, and minting 534 `venues` rows to hold the coordinates would put
-- clinics into venue browse and onto the map beside bars and saunas. The
-- address columns (`address`, `state`, `postal_code`) already live on the org
-- row — added 20260807100000 and still unused on every one of 5,385 rows — so
-- coordinates joining them is consistent, not novel.
--
-- WHAT WAS ACTUALLY BROKEN IN SEARCH. Verified against the live function
-- definition before writing this, not assumed:
--   * `city` and `country` were literal `null::text, null::text` for EVERY
--     organization, so the city and country search facets have never worked for
--     any org — 5,215 active orgs carry a `city_id` or `country_id` that the
--     index simply threw away.
--   * `geog` came only from a linked venue, so the 2,268 orgs with no
--     `primary_venue_id` are invisible to every proximity query.
-- Both are fixed below. The org's OWN coordinates win when present, falling
-- back to the linked venue so nothing that works today regresses.
--
-- THE BACKFILL IS NOT IN THIS MIGRATION, DELIBERATELY. Re-indexing those 5,215
-- rows is a single upsert into `search_documents`, which maintains a tsvector
-- and an HNSW vector index on a disk-constrained instance. Migrations run
-- inside a transaction, so a statement timeout here is a FULL ROLLBACK of the
-- DDL as well. `run_org_search_reindex(p_limit)` at the bottom is the batched,
-- resumable runner instead — the same shape as `run_event_city_link` and
-- friends, and the same reason.

-- ---------------------------------------------------------------------------
-- 1. Geography on the organization row
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column public.organizations.latitude is
  'WGS84 latitude. Paired with longitude — see organizations_coords_paired. A support org that is itself a physical place (a testing site, a community centre) carries its own point; a pure business-spine party leaves both null and borrows geo from primary_venue_id.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organizations'::regclass
       and conname = 'organizations_coords_paired'
  ) then
    -- A half-coordinate is worse than none: it reads as present to any
    -- `latitude is not null` check and then produces a null point.
    alter table public.organizations
      add constraint organizations_coords_paired
      check ((latitude is null) = (longitude is null)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organizations'::regclass
       and conname = 'organizations_coords_range'
  ) then
    alter table public.organizations
      add constraint organizations_coords_range
      check (
        (latitude is null or latitude between -90 and 90)
        and (longitude is null or longitude between -180 and 180)
      ) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Search index: use the org's own geography, and stop discarding city/country
-- ---------------------------------------------------------------------------
--
-- `city` is the city NAME and `country` is the ISO-2 CODE — matched to what
-- venues and events already write, checked against live rows ("Berlin"/"DE"),
-- because a facet that disagrees with its neighbours silently splits results.
-- Names and codes live on `geo_places`; `organizations.city_id`/`country_id`
-- are FKs to `geo_city_profiles(place_id)` / `geo_country_profiles(place_id)`
-- after the P2 FK flip, and `place_id` is the `geo_places.id`, so the join goes
-- straight to the spine.

create or replace function public.search_documents_index_organizations(p_id uuid default null::uuid)
returns void
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'organization:'||o.id, 'organization', o.id, o.name,
       coalesce(o.editorial_hook, o.description),
       setweight(to_tsvector('simple', unaccent(coalesce(o.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(o.website_domain,''))),'B')
    || setweight(to_tsvector('simple', unaccent(array_to_string(o.roles,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(array_to_string(o.tags,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(cp.name,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(o.editorial_hook, o.description, ''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'roles', to_jsonb(o.roles), 'tags', to_jsonb(o.tags), 'entity_kind', 'organization')),
    coalesce(
      -- The org's own point, when it is itself a place.
      case
        when o.latitude is not null and o.longitude is not null
          then st_setsrid(st_makepoint(o.longitude::float8, o.latitude::float8), 4326)::geography
      end,
      -- Otherwise the linked venue, exactly as before this migration.
      (select st_setsrid(st_makepoint(v.longitude::float8, v.latitude::float8), 4326)::geography
         from public.venues v
        where v.id = o.primary_venue_id and v.longitude is not null and v.latitude is not null)
    ),
    o.trust_score::smallint, 'live', false, o.completeness_score::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    o.slug, coalesce(o.logo_url, o.cover_image_url),
    cp.name, up.code, null::text, now()
  from public.organizations o
  left join public.geo_places cp on cp.id = o.city_id
  left join public.geo_places up on up.id = o.country_id
  where o.status = 'active' and o.duplicate_of_id is null and (p_id is null or o.id = p_id)
  on conflict (entity_type, entity_id) do update set title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv, facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score, liveness_status=excluded.liveness_status, is_featured=excluded.is_featured, quality_score=excluded.quality_score, closed_at=excluded.closed_at, start_date=excluded.start_date, end_date=excluded.end_date, is_free=excluded.is_free, price_min=excluded.price_min, price_max=excluded.price_max, slug=excluded.slug, image_url=excluded.image_url, city=excluded.city, country=excluded.country, content_language=excluded.content_language, updated_at=now();
$function$;

-- ---------------------------------------------------------------------------
-- 3. Batched reindex runner
-- ---------------------------------------------------------------------------
--
-- Cursor is `search_documents.updated_at` vs the org row: a doc that has not
-- been rewritten since this migration landed is still carrying the old
-- null-city shape. Returns the number reindexed so a caller can loop to zero.

create or replace function public.run_org_search_reindex(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select array_agg(o.id) into v_ids
  from (
    select o.id
      from public.organizations o
      left join public.search_documents d
        on d.entity_type = 'organization' and d.entity_id = o.id
     where o.status = 'active'
       and o.duplicate_of_id is null
       and (
         d.entity_id is null
         -- Has geography we are now able to index but the doc does not show it.
         or (d.city is null and o.city_id is not null)
         or (d.country is null and o.country_id is not null)
         or (d.geog is null and o.latitude is not null)
       )
     order by o.created_at
     limit greatest(1, least(p_limit, 2000))
  ) o;

  if v_ids is null then
    return 0;
  end if;

  perform public.search_documents_index_organizations(id) from unnest(v_ids) as t(id);
  v_count := array_length(v_ids, 1);
  return coalesce(v_count, 0);
end $$;

revoke all on function public.run_org_search_reindex(integer) from public, anon, authenticated;
grant execute on function public.run_org_search_reindex(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Testing-service vocabulary
-- ---------------------------------------------------------------------------
--
-- `organizations.tags` is unconstrained free text (the only CHECK on the table
-- is `organizations_roles_known`), so strictly these rows are not required for
-- the import to work. They exist so the slugs have ONE definition, so
-- `src/lib/amenityIcons.ts` can render them, and so the same vocabulary is
-- reusable on venues later without a second naming decision.
--
-- kind = 'amenity' is deliberate and load-bearing: `normalize_venue_tags` keeps
-- only `kind IN ('queer','venue_type')`, so seeding these as 'amenity' means
-- they can never leak into `venues.tags` as a side effect. (`amenities_kind_check`
-- allows only amenity/accessibility/queer/venue_type, so 'health' is not an
-- option — the scope array carries that meaning instead.)
--
-- NOTE the deliberate absence of `anonymous-testing`. The source has no
-- anonymity field, and inferring one from prose would be a fabricated claim on
-- health content. If it is ever added it must come from a real source field.

insert into public.amenities (slug, name, icon_name, kind, category_scope, is_active, sort_order)
values
  ('hiv-testing',          'HIV testing',                'TestTube',         'amenity', array['health'], true, 900),
  ('sti-testing',          'STI testing',                'TestTubes',        'amenity', array['health'], true, 910),
  ('hepatitis-testing',    'Viral hepatitis testing',    'Microscope',       'amenity', array['health'], true, 920),
  ('rapid-test',           'Rapid / point-of-care test', 'Stethoscope',      'amenity', array['health'], true, 930),
  ('self-test',            'Self-test / self-sampling',  'HandHeart',        'amenity', array['health'], true, 940),
  ('sti-treatment',        'STI treatment',              'BriefcaseMedical', 'amenity', array['health'], true, 950),
  ('prep',                 'PrEP',                       'Pill',             'amenity', array['health'], true, 960),
  ('pep',                  'PEP',                        'Pill',             'amenity', array['health'], true, 970),
  ('vaccination',          'Vaccination',                'Syringe',          'amenity', array['health'], true, 980),
  ('testing-counselling',  'Testing-related counselling','HeartPulse',       'amenity', array['health'], true, 990),
  ('psychosocial-support', 'Psychosocial support',       'HandHeart',        'amenity', array['health'], true, 1000),
  ('partner-notification', 'Partner notification',       'Users',            'amenity', array['health'], true, 1010),
  ('free-testing',         'Free testing available',     'Banknote',         'amenity', array['health'], true, 1020),
  ('no-referral-needed',   'No referral needed',         'ShieldCheck',      'amenity', array['health'], true, 1030),
  ('walk-in',              'Walk-in / drop-in',          'DoorOpen',         'amenity', array['health'], true, 1040),
  ('appointment-required', 'Appointment required',       'CalendarCheck',    'amenity', array['health'], true, 1050),
  -- The measured long tail. Occurrence counts are across all 530 centres, not
  -- a sample: leaving these unmapped left the four largest services in the
  -- corpus silently untagged.
  ('prevention-referral',  'Referral for prevention',    'ShieldCheck',      'amenity', array['health'], true, 1060), -- 199
  ('family-planning',      'Contraception & family planning', 'HandHeart',   'amenity', array['health'], true, 1070), -- 152
  ('needle-exchange',      'Needle & syringe programme', 'Syringe',          'amenity', array['health'], true, 1080), --  62
  ('tuberculosis-services','Tuberculosis services',      'Microscope',       'amenity', array['health'], true, 1090)  --  55
on conflict (slug) do update
  set name = excluded.name,
      icon_name = excluded.icon_name,
      kind = excluded.kind,
      category_scope = excluded.category_scope,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 5. target_groups aliases for the source's own spellings
-- ---------------------------------------------------------------------------
--
-- `target_groups` is an exact-match filter and a live search facet, so the
-- import resolves its "Target population" values against this table rather than
-- through a TypeScript map that would drift. These are the spellings the source
-- actually uses that the alias lists do not yet cover.
--
-- Deliberately NOT added: "people who inject drugs" / "sex workers". Neither
-- has a slug in this 30-row vocabulary, and inventing one here — where the only
-- consumer is an import — would mint a facet with no editorial home. They stay
-- unresolved and are dropped, which is visible, rather than mapped to something
-- adjacent-but-wrong (`sober` is the opposite claim, not a near miss).

update public.target_groups
   set aliases = (
         select array_agg(distinct a)
           from unnest(aliases || array['lgbtqi*','lgbtqia*','lgbti']) as a
       ),
       updated_at = now()
 where slug = 'lgbtq';

update public.target_groups
   set aliases = (
         select array_agg(distinct a)
           from unnest(aliases || array['msm','men who have sex with men']) as a
       ),
       updated_at = now()
 where slug = 'gay';

update public.target_groups
   set aliases = (
         select array_agg(distinct a)
           from unnest(aliases || array['migrants','migrant']) as a
       ),
       updated_at = now()
 where slug = 'migrants';

-- ---------------------------------------------------------------------------
-- 6. Identity lookup for externally-sourced organizations
-- ---------------------------------------------------------------------------
--
-- `organizations` has no `external_id` column (venues do). Rather than add one
-- for a single importer, provenance lives where the rest of it already does —
-- `field_provenance.source.external_id` — and this index makes the idempotency
-- lookup a seek instead of a 5,385-row jsonb scan on every upserted record.

create index if not exists organizations_source_external_id_idx
  on public.organizations ((field_provenance->'source'->>'external_id'))
  where field_provenance->'source'->>'external_id' is not null;

-- ---------------------------------------------------------------------------
-- 7. Idempotent upsert for European Test Finder testing sites
-- ---------------------------------------------------------------------------
--
-- Lives in SQL rather than in the importer's string-building because it owns
-- three things that must not be re-derived per caller: the adopt-before-create
-- ladder, the slug-collision loop, and the city/country resolution guard.
--
-- CITY RESOLUTION BLOCKS RATHER THAN GUESSES. `20260802090844` is the record of
-- why: resolving `events.city` by name alone attached 116 events to the wrong
-- city (Portland ME -> Portland OR, Charleston SC -> Charleston IL) and then
-- stamped each with that city's centroid, state and timezone. A null city_id is
-- recoverable; a wrong one is not, and here it would additionally mislabel
-- which country's health system a clinic belongs to. So: resolve country first,
-- match the city ONLY within that country, and if the name is ambiguous leave
-- it null and say so in enrichment_status.
--
-- TWO UPDATE MODES, deliberately different:
--   * matched by external_id  -> this is OUR row from a previous run; refresh
--     the source-owned facts, because a re-crawl is the only thing that keeps
--     them current.
--   * matched by website domain -> this is SOMEONE ELSE'S row that we are
--     adopting into the spine; fill only what is empty, never clobber curated
--     editorial. Same rule as commit_venue_staging_item's UPDATE branch.
-- `status` is never written on update: an admin may have promoted the row to
-- 'active' and a re-crawl must not silently unpublish it.

create or replace function public.commit_testfinder_org(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_ext          text := nullif(trim(p->>'external_id'), '');
  v_name         text := nullif(trim(p->>'name'), '');
  v_website      text := nullif(trim(p->>'website'), '');
  v_domain       text;
  v_id           uuid;
  v_matched_ext  boolean := false;
  v_slug         text;
  v_base         text;
  v_try          integer := 0;
  v_country_id   uuid;
  v_city_id      uuid;
  v_city_name    text := nullif(trim(p->>'city'), '');
  v_city_hits    integer := 0;
  v_city_note    text := null;
  v_tags         text[];
  v_groups       text[];
  v_lat          double precision;
  v_lng          double precision;
begin
  if v_ext is null or v_name is null then
    raise exception 'commit_testfinder_org: external_id and name are both required (got %, %)', v_ext, v_name;
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

  if v_country_id is not null and v_city_name is not null then
    select count(*) into v_city_hits
      from public.geo_places gp
     where gp.place_type = 'city'
       and gp.duplicate_of_id is null
       and gp.country_id = v_country_id
       and lower(gp.name) = lower(v_city_name);

    if v_city_hits = 1 then
      select gp.id into v_city_id
        from public.geo_places gp
       where gp.place_type = 'city'
         and gp.duplicate_of_id is null
         and gp.country_id = v_country_id
         and lower(gp.name) = lower(v_city_name);
    elsif v_city_hits > 1 then
      v_city_note := format('ambiguous: %s cities named %L in this country', v_city_hits, v_city_name);
    else
      v_city_note := format('no city named %L in this country', v_city_name);
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
     and o.duplicate_of_id is null
   limit 1;
  v_matched_ext := v_id is not null;

  if v_id is null and v_domain is not null then
    select o.id into v_id
      from public.organizations o
     where lower(o.website_domain) = v_domain
       and o.duplicate_of_id is null
     limit 1;
  end if;

  ------------------------------------------------------------------- insert
  if v_id is null then
    v_base := left(regexp_replace(lower(unaccent(v_name)), '[^a-z0-9]+', '-', 'g'), 60);
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := 'testing-site'; end if;
    v_slug := v_base;
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_try := v_try + 1;
      if v_try > 50 then
        raise exception 'commit_testfinder_org: could not find a free slug for %', v_name;
      end if;
      v_slug := v_base || '-' || v_try;
    end loop;

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
      coalesce(v_tags, '{}') || array['european-test-finder'],
      coalesce(v_groups, '{}'),
      jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      jsonb_build_object(
        'testfinder', coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note))
    )
    returning id into v_id;

  ------------------------------------------------------------------- update
  elsif v_matched_ext then
    -- Our own row: refresh source-owned facts.
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
      tags           = (select array_agg(distinct t)
                          from unnest(o.tags || coalesce(v_tags, '{}') || array['european-test-finder']) t),
      target_groups  = (select array_agg(distinct g)
                          from unnest(o.target_groups || coalesce(v_groups, '{}')) g),
      field_provenance = o.field_provenance || jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      enrichment_status = o.enrichment_status || jsonb_build_object(
        'testfinder', coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note)),
      updated_at = now()
    where o.id = v_id;

  else
    -- Adopted someone else's row: fill only what is empty.
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
      tags           = (select array_agg(distinct t)
                          from unnest(o.tags || coalesce(v_tags, '{}') || array['european-test-finder']) t),
      target_groups  = (select array_agg(distinct g)
                          from unnest(o.target_groups || coalesce(v_groups, '{}')) g),
      field_provenance = o.field_provenance || jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      enrichment_status = o.enrichment_status || jsonb_build_object(
        'testfinder', coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note,
                                            'adopted_existing_org', true)),
      needs_attention = true,
      updated_at = now()
    where o.id = v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.commit_testfinder_org(jsonb) from public, anon, authenticated;
grant execute on function public.commit_testfinder_org(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Public read: testing sites near a place
-- ---------------------------------------------------------------------------
--
-- A separate RPC rather than a new parameter on `list_organizations`, because
-- that function has already been hardened twice for safety-gate leaks
-- (`20260821100000` — Helem, a Beirut community centre, was readable by anon
-- despite safety_gated=true) and widening its signature is a poor place to take
-- risk. The gate below is copied from it verbatim and must stay that way:
-- SECURITY DEFINER bypasses RLS, so this predicate IS the access control.
--
-- Ordering is by distance when the caller supplies a point, so "testing near
-- me" works, and falls back to completeness+name so a country-level list is
-- still sensibly ordered.

create or replace function public.list_testing_sites(
  p_country_code text default null,
  p_city_id      uuid default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_limit        integer default 24
)
returns setof public.organizations
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  select o.*
    from public.organizations o
   where o.status = 'active'
     and o.duplicate_of_id is null
     -- Safety layer: signed-out callers never see gated rows.
     and ((select auth.uid()) is not null or o.safety_gated is not true)
     and o.roles @> array['support']
     and o.tags && array['hiv-testing','sti-testing','hepatitis-testing']
     and (p_city_id is null or o.city_id = p_city_id)
     and (
       p_country_code is null
       or p_country_code = 'ALL'
       or o.country_id = (
         select gp.id from public.geo_places gp
          where gp.place_type = 'country' and upper(gp.code) = upper(p_country_code)
          limit 1)
     )
   order by
     case
       when p_lat is not null and p_lng is not null
            and o.latitude is not null and o.longitude is not null
       then st_distance(
              st_setsrid(st_makepoint(o.longitude, o.latitude), 4326)::geography,
              st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
       else null
     end nulls last,
     o.completeness_score desc nulls last,
     o.name
   limit greatest(0, least(coalesce(p_limit, 24), 100));
$$;

grant execute on function public.list_testing_sites(text, uuid, double precision, double precision, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Assertions — fail loudly rather than half-applying
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
  v_n integer;
begin
  -- Every seeded icon_name must be resolvable by src/lib/amenityIcons.ts. That
  -- file is a hand-maintained lucide allowlist, so an unlisted name silently
  -- renders the generic Tag fallback. This assertion cannot read the TS file;
  -- it checks the vocabulary is at least internally complete.
  select string_agg(slug, ', ') into v_missing
    from public.amenities
   where category_scope @> array['health'] and (icon_name is null or icon_name = '');
  if v_missing is not null then
    raise exception 'health amenities missing icon_name: %', v_missing;
  end if;

  select count(*) into v_n
    from public.amenities where category_scope @> array['health'];
  if v_n <> 20 then
    raise exception 'expected 20 health amenity rows, found %', v_n;
  end if;

  if not exists (select 1 from public.target_groups where slug='lgbtq' and 'lgbtqi*' = any(aliases)) then
    raise exception 'target_groups alias backfill did not apply';
  end if;
end $$;
