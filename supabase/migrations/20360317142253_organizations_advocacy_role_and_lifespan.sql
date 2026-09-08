-- Organizations: `advocacy` role + organizational lifespan (founded/dissolved).
--
-- Prepares `public.organizations` to receive the English Wikipedia LGBTQ
-- political organization / advocacy group corpus (421 distinct Wikidata QIDs).
-- Design: docs/plans/2026-09-08-lgbtq-advocacy-org-import-design.md
--
-- Three parts:
--   1. `advocacy` joins the roles vocabulary.
--   2. `founded_at` / `dissolved_at` give an organization a lifespan.
--   3. The search indexer stops asserting that every organization is live.
--
-- WHY A NEW ROLE AND NOT `support`. `support` holds 3,019 rows and is the help
-- directory — a reader looking for a hotline must not be handed the Gay
-- Liberation Front, dissolved 1973. `community` is in the CHECK with zero rows,
-- but it is an undefined lane and spending it here would name this one wrongly.
--
-- WHY DISSOLVED ORGANIZATIONS KEEP `closed_at` NULL. `search_hybrid` excludes on
-- `closed_at` in its *candidate* CTE:
--
--     where ($3 is null or sd.entity_type=any($3)) and sd.closed_at is null
--
-- so the `-0.5` closed_at penalty further down its scorer is dead code — closed
-- rows never reach it. Setting `closed_at = dissolved_at` here would make Gay
-- Liberation Front, Street Transvestite Action Revolutionaries and the
-- Scientific-Humanitarian Committee unfindable in site search. Erasing the
-- movement's founding organizations from a queer platform's search is the wrong
-- outcome, so the derank is carried by `liveness_status='dead_link'` instead,
-- which IS in that scorer's -0.5 list. Dissolved organizations rank below live
-- ones and stay reachable by name.
--
-- `closed_at` is non-null on 0 of 120,170 search documents today. This migration
-- does not change that, and the assertion at the foot enforces it.
--
-- LOCKSTEP. The role vocabulary lives in three places: this CHECK, `OrgRole` in
-- src/hooks/useOrganization.ts, and ROLE_LABEL + TABS in src/pages/Organizations.tsx.
-- Miss one and the tab silently never renders. Guarded by
-- src/lib/__tests__/organizationRoles.test.ts, which parses this file.

-- ---------------------------------------------------------------------------
-- 1. Roles vocabulary
-- ---------------------------------------------------------------------------

alter table public.organizations
  drop constraint if exists organizations_roles_known;

alter table public.organizations
  add constraint organizations_roles_known
  check (roles <@ array[
    'venue', 'publisher', 'seller', 'support', 'hotel',
    'affiliate_partner', 'brand', 'organizer', 'community', 'advocacy'
  ]) not valid;

-- ---------------------------------------------------------------------------
-- 2. Lifespan
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists founded_at date,
  add column if not exists dissolved_at date,
  add column if not exists is_defunct boolean not null default false;

comment on column public.organizations.founded_at is
  'Date the organization was founded (Wikidata P571 where sourced). Display only.';
comment on column public.organizations.dissolved_at is
  'Date the organization ceased to exist (Wikidata P576 where sourced). The DATE only '
  '- it is not the flag. Use is_defunct to ask whether an organization still exists.';
comment on column public.organizations.is_defunct is
  'Whether the organization has ceased to exist. Deliberately separate from '
  'dissolved_at, because the two available sources barely overlap: across the 2026-09 '
  'Wikipedia advocacy corpus, 28 rows were in a Defunct category and 25 carried a '
  'Wikidata P576 dissolved date, but only 5 had BOTH - a union of 48. Keying liveness '
  'off dissolved_at alone would have published 20 dead organizations as live. This '
  'flag drives liveness_status=''dead_link'' in search; it must NEVER be mirrored into '
  'search_documents.closed_at, which hard-excludes from search_hybrid.';

-- A dated dissolution implies defunct; the reverse does not hold (20 of the 48
-- are defunct with no known date).
alter table public.organizations
  drop constraint if exists organizations_dissolved_implies_defunct;

alter table public.organizations
  add constraint organizations_dissolved_implies_defunct
  check (dissolved_at is null or is_defunct)
  not valid;

-- A dissolved organization cannot predate its own founding.
alter table public.organizations
  drop constraint if exists organizations_lifespan_ordered;

alter table public.organizations
  add constraint organizations_lifespan_ordered
  check (founded_at is null or dissolved_at is null or dissolved_at >= founded_at)
  not valid;

-- ---------------------------------------------------------------------------
-- 3. Search indexer
-- ---------------------------------------------------------------------------
-- Reproduced verbatim from the live definition except for the liveness
-- expression and the `defunct` facet. `closed_at` stays an explicit NULL.

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
      'roles', to_jsonb(o.roles), 'tags', to_jsonb(o.tags), 'entity_kind', 'organization',
      -- Always present (true/false, never null) so it is filterable both ways.
      'defunct', o.is_defunct)),
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
    o.trust_score::smallint,
    -- A defunct organization is deranked, never excluded. See the header.
    case when o.is_defunct then 'dead_link' else 'live' end,
    false, o.completeness_score::smallint, null::timestamptz,
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
-- 4. Assertions
-- ---------------------------------------------------------------------------
-- This migration only opens the door; the import script walks through it. So the
-- assertions here check the door, not the corpus: the vocabulary accepts the new
-- role, the lifespan columns exist, and — the one that actually matters — the
-- indexer cannot mirror a dissolved organization into closed_at.

do $verify$
declare
  v_ok boolean;
  v_closed bigint;
begin
  -- The CHECK admits 'advocacy'.
  select conname is not null into v_ok
    from pg_constraint
   where conrelid = 'public.organizations'::regclass
     and conname  = 'organizations_roles_known'
     and pg_get_constraintdef(oid) like '%advocacy%';
  if not coalesce(v_ok, false) then
    raise exception 'organizations_roles_known does not admit the advocacy role';
  end if;

  -- Both lifespan columns landed.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'organizations'
         and column_name in ('founded_at', 'dissolved_at')) <> 2 then
    raise exception 'founded_at / dissolved_at missing from organizations';
  end if;

  -- The indexer must never write closed_at for an organization. Checked against
  -- the live table rather than the function text, so a future edit that
  -- reintroduces it fails here on the next reindex rather than silently
  -- deleting dissolved organizations from search.
  select count(*) into v_closed
    from public.search_documents
   where entity_type = 'organization' and closed_at is not null;
  if v_closed > 0 then
    raise exception
      'search_documents holds % organization row(s) with a non-null closed_at; '
      'closed_at hard-excludes from search_hybrid, so dissolved organizations '
      'would become unfindable', v_closed;
  end if;
end
$verify$;
