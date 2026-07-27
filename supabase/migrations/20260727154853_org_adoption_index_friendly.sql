-- Business spine: make the adoption matcher index-friendly.
--
-- Applied live via MCP apply_migration (P1 — the nightly cron was dead), so this
-- file carries the version the remote actually stamped (20260727154853), not a
-- 2026-08-01 block version; CI's db push then matches it and skips.
--
-- The nightly org_spine_backfill cron (job 2231) has failed every run since it
-- was created with "canceling statement due to statement timeout" inside
-- find_org_adoption_candidates -> dedup_despace. Cause: the matcher joined
-- organizations to each entity table on
--     (normalized_domain = o.dom) OR (dedup_despace(name) = o.key)
-- An OR across two different join keys is not indexable, so Postgres nested-loops
-- the whole cross product and evaluates unaccent+regexp per pair (≈2 989 unlinked
-- venues x 246 active orgs before the other sources). Nothing was ever adopted.
--
-- Fix: split the OR into a UNION ALL of two equi-joins, each of which can use an
-- expression index, then keep the best row per entity. Same result set and the
-- same confidence ladder as before (domain 1.00 > name+city 0.95 > name-only
-- 0.60), just a plan the planner can actually index.

-- Expression indexes for the name rung. dedup_despace / org_normalize_domain are
-- both IMMUTABLE, so they are indexable. Partial on the "still unlinked" predicate
-- keeps them tiny and exactly matches the matcher's WHERE. No CONCURRENTLY —
-- migrations run inside a transaction.
CREATE INDEX IF NOT EXISTS idx_organizations_despace_active
  ON public.organizations (public.dedup_despace(name))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_organizations_domain_active
  ON public.organizations (public.org_normalize_domain(website_domain))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hotels_despace_unlinked
  ON public.hotels (public.dedup_despace(name))
  WHERE organization_id IS NULL AND duplicate_of_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_venues_despace_unlinked
  ON public.venues (public.dedup_despace(name))
  WHERE organization_id IS NULL AND duplicate_of_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchants_despace_unlinked
  ON public.marketplace_merchants (public.dedup_despace(display_name))
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_brands_despace_unlinked
  ON public.marketplace_brands (public.dedup_despace(display_name))
  WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.find_org_adoption_candidates(
  p_entity_type text,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  entity_type text,
  entity_id uuid,
  entity_name text,
  organization_id uuid,
  org_name text,
  match_type text,
  confidence numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with o as (
    select org.id, org.name, org.city_id,
           public.org_normalize_domain(org.website_domain) as dom,
           public.dedup_despace(org.name) as key
    from public.organizations org
    where org.status = 'active'
  ),
  raw as (
    -- ── hotels ────────────────────────────────────────────────────────────
    select 'hotel'::text as entity_type, h.id as entity_id, h.name as entity_name,
           o.id as organization_id, o.name as org_name,
           'domain_exact'::text as match_type, 1.00::numeric as confidence
    from public.hotels h
    join o on o.dom = public.org_normalize_domain(h.website)
    where p_entity_type = 'hotel'
      and h.organization_id is null and h.duplicate_of_id is null
      and public.org_normalize_domain(h.website) is not null

    union all
    select 'hotel', h.id, h.name, o.id, o.name,
           case when h.city_id = o.city_id then 'name_city_exact' else 'name_no_geo' end,
           case when h.city_id = o.city_id then 0.95 else 0.60 end::numeric
    from public.hotels h
    join o on o.key = public.dedup_despace(h.name)
    where p_entity_type = 'hotel'
      and h.organization_id is null and h.duplicate_of_id is null
      and length(public.dedup_despace(h.name)) >= 4

    -- ── venues ────────────────────────────────────────────────────────────
    union all
    select 'venue', v.id, v.name, o.id, o.name, 'domain_exact', 1.00::numeric
    from public.venues v
    join o on o.dom = public.org_normalize_domain(v.website_domain)
    where p_entity_type = 'venue'
      and v.organization_id is null and v.duplicate_of_id is null
      and public.org_normalize_domain(v.website_domain) is not null

    union all
    select 'venue', v.id, v.name, o.id, o.name,
           case when v.city_id = o.city_id then 'name_city_exact' else 'name_no_geo' end,
           case when v.city_id = o.city_id then 0.95 else 0.60 end::numeric
    from public.venues v
    join o on o.key = public.dedup_despace(v.name)
    where p_entity_type = 'venue'
      and v.organization_id is null and v.duplicate_of_id is null
      and length(public.dedup_despace(v.name)) >= 4

    -- ── merchants ─────────────────────────────────────────────────────────
    union all
    select 'merchant', mm.id, mm.display_name, o.id, o.name, 'domain_exact', 1.00::numeric
    from public.marketplace_merchants mm
    join o on o.dom = public.org_normalize_domain(mm.shop_domain)
    where p_entity_type = 'merchant'
      and mm.organization_id is null
      and public.org_normalize_domain(mm.shop_domain) is not null

    union all
    select 'merchant', mm.id, mm.display_name, o.id, o.name, 'name_no_geo', 0.60::numeric
    from public.marketplace_merchants mm
    join o on o.key = public.dedup_despace(mm.display_name)
    where p_entity_type = 'merchant'
      and mm.organization_id is null
      and length(public.dedup_despace(mm.display_name)) >= 4

    -- ── affiliate partners (domain array + merchant back-link) ────────────
    union all
    select 'affiliate_partner', ap.id, ap.partner_name, o.id, o.name, 'domain_exact', 1.00::numeric
    from public.affiliate_partners ap
    join o on o.dom in (select public.org_normalize_domain(d) from unnest(ap.domains) d)
    where p_entity_type = 'affiliate_partner' and ap.organization_id is null

    union all
    select 'affiliate_partner', ap.id, ap.partner_name, mm.organization_id, org.name,
           'merchant_backlink', 0.95::numeric
    from public.affiliate_partners ap
    join public.marketplace_merchants mm on mm.affiliate_partner_id = ap.id
                                        and mm.organization_id is not null
    join public.organizations org on org.id = mm.organization_id
    where p_entity_type = 'affiliate_partner' and ap.organization_id is null

    -- ── brands (queer-owned only; queue-only downstream) ──────────────────
    union all
    select 'brand', b.id, b.display_name, o.id, o.name, 'domain_exact', 0.85::numeric
    from public.marketplace_brands b
    join o on o.dom = public.org_normalize_domain(b.website)
    where p_entity_type = 'brand'
      and b.organization_id is null and b.status = 'approved'
      and b.ownership_tags <> '{}'
      and public.org_normalize_domain(b.website) is not null

    union all
    select 'brand', b.id, b.display_name, o.id, o.name, 'name_no_geo', 0.60::numeric
    from public.marketplace_brands b
    join o on o.key = public.dedup_despace(b.display_name)
    where p_entity_type = 'brand'
      and b.organization_id is null and b.status = 'approved'
      and b.ownership_tags <> '{}'
      and length(public.dedup_despace(b.display_name)) >= 4
  )
  -- One row per (entity, org) pair: the domain and name rungs can both fire for
  -- the same pair, and the caller's ladder expects the strongest match only.
  -- The de-dup has to happen in a subquery — DISTINCT ON dictates its own ORDER BY,
  -- and the caller needs the *highest-confidence* p_limit rows, not the first by id.
  select entity_type, entity_id, entity_name, organization_id, org_name, match_type, confidence
  from (
    select distinct on (entity_id, organization_id)
           entity_type, entity_id, entity_name, organization_id, org_name, match_type, confidence
    from raw
    order by entity_id, organization_id, confidence desc
  ) best
  order by confidence desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$function$;

REVOKE ALL ON FUNCTION public.find_org_adoption_candidates(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.find_org_adoption_candidates(text, integer) TO service_role, authenticated;

COMMENT ON FUNCTION public.find_org_adoption_candidates(text, integer) IS
  'Adopt-before-create matcher for the organizations spine. Domain and name rungs '
  'are separate equi-joins (indexable) unioned together — never re-introduce an '
  'OR across the two keys, it made the nightly cron time out.';
