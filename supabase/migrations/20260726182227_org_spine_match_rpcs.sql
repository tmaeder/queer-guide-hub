-- ============================================================
-- Business Spine Unification — Phase B1: read-only matchers
--
--  * org_normalize_domain(text) — shared domain normalizer (regex lifted from
--    find_org_merchant_domain_matches, 20260716202716)
--  * find_org_adoption_candidates(entity_type, limit) — the adopt-before-create
--    matching ladder. confidence >= 0.90 is auto-link grade (domain proof or
--    despaced-name + same city); below that is review grade (org_link_suggestions).
-- ============================================================

create or replace function public.org_normalize_domain(p text)
returns text
language sql immutable
as $$
  select nullif(lower(split_part(
    regexp_replace(
      regexp_replace(btrim(coalesce(p, '')), '^[a-z][a-z0-9+.-]*://', '', 'i'),
      '^www\.', '', 'i'),
    '/', 1)), '');
$$;

comment on function public.org_normalize_domain(text) is
  'Normalizes a URL or domain to bare host: strips scheme, leading www., path. Returns NULL for empty input.';

grant execute on function public.org_normalize_domain(text) to authenticated, service_role;

-- Matching ladder. Only rows where the entity is still unlinked.
--   1.00 domain_exact       — normalized domain equality (auto)
--   0.95 name_city_exact    — despaced-name equality + same city_id (auto)
--   0.95 merchant_backlink  — partner adopted via merchant.affiliate_partner_id (auto)
--   0.60 name_no_geo        — despaced-name equality without geo agreement (review)
create or replace function public.find_org_adoption_candidates(
  p_entity_type text,
  p_limit int default 500
)
returns table(
  entity_type text, entity_id uuid, entity_name text,
  organization_id uuid, org_name text, match_type text, confidence numeric
)
language sql stable
security definer set search_path = public
as $$
  with o as (
    select org.id, org.name, org.city_id,
           public.org_normalize_domain(org.website_domain) as dom,
           public.dedup_despace(org.name) as key
    from public.organizations org
    where org.status = 'active'
  )
  select * from (
    -- ── hotels ──────────────────────────────────────────────────────────
    select 'hotel'::text, h.id, h.name, o.id, o.name,
           case when public.org_normalize_domain(h.website) = o.dom then 'domain_exact'
                when h.city_id = o.city_id then 'name_city_exact'
                else 'name_no_geo' end,
           case when public.org_normalize_domain(h.website) = o.dom then 1.00
                when h.city_id = o.city_id then 0.95
                else 0.60 end::numeric
    from public.hotels h
    join o on (public.org_normalize_domain(h.website) is not null
               and public.org_normalize_domain(h.website) = o.dom)
           or (length(public.dedup_despace(h.name)) >= 4
               and public.dedup_despace(h.name) = o.key)
    where p_entity_type = 'hotel'
      and h.organization_id is null and h.duplicate_of_id is null

    union all
    -- ── venues ──────────────────────────────────────────────────────────
    select 'venue', v.id, v.name, o.id, o.name,
           case when public.org_normalize_domain(v.website_domain) = o.dom then 'domain_exact'
                when v.city_id = o.city_id then 'name_city_exact'
                else 'name_no_geo' end,
           case when public.org_normalize_domain(v.website_domain) = o.dom then 1.00
                when v.city_id = o.city_id then 0.95
                else 0.60 end::numeric
    from public.venues v
    join o on (public.org_normalize_domain(v.website_domain) is not null
               and public.org_normalize_domain(v.website_domain) = o.dom)
           or (length(public.dedup_despace(v.name)) >= 4
               and public.dedup_despace(v.name) = o.key)
    where p_entity_type = 'venue'
      and v.organization_id is null and v.duplicate_of_id is null

    union all
    -- ── merchants (domain proof only; no geo to corroborate names) ──────
    select 'merchant', mm.id, mm.display_name, o.id, o.name,
           case when public.org_normalize_domain(mm.shop_domain) = o.dom then 'domain_exact'
                else 'name_no_geo' end,
           case when public.org_normalize_domain(mm.shop_domain) = o.dom then 1.00
                else 0.60 end::numeric
    from public.marketplace_merchants mm
    join o on (public.org_normalize_domain(mm.shop_domain) is not null
               and public.org_normalize_domain(mm.shop_domain) = o.dom)
           or (length(public.dedup_despace(mm.display_name)) >= 4
               and public.dedup_despace(mm.display_name) = o.key)
    where p_entity_type = 'merchant'
      and mm.organization_id is null

    union all
    -- ── affiliate partners: any configured domain, else merchant backlink ─
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

    union all
    -- ── brands (queer-owned lane only; global brands never auto-adopt) ──
    select 'brand', b.id, b.display_name, o.id, o.name,
           case when public.org_normalize_domain(b.website) = o.dom then 'domain_exact'
                else 'name_no_geo' end,
           case when public.org_normalize_domain(b.website) = o.dom then 0.85
                else 0.60 end::numeric
    from public.marketplace_brands b
    join o on (public.org_normalize_domain(b.website) is not null
               and public.org_normalize_domain(b.website) = o.dom)
           or (length(public.dedup_despace(b.display_name)) >= 4
               and public.dedup_despace(b.display_name) = o.key)
    where p_entity_type = 'brand'
      and b.organization_id is null and b.status = 'approved'
      and b.ownership_tags <> '{}'
  ) c(entity_type, entity_id, entity_name, organization_id, org_name, match_type, confidence)
  order by c.confidence desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

comment on function public.find_org_adoption_candidates(text, int) is
  'Adopt-before-create ladder for the business spine: unlinked entities matched to '
  'active organizations. >=0.90 = auto-link grade (domain proof / name+city), '
  'below = review grade. Brands are capped at 0.85 (always review; queue-only lane).';

grant execute on function public.find_org_adoption_candidates(text, int) to authenticated, service_role;
