-- ============================================================
-- Phase 3a — Org ↔ merchant domain dedup (link, don't delete)
--
-- marketplace_merchants.shop_domain and organizations.website_domain describe
-- the same brand identity. This wires them together deterministically:
--   * find_org_merchant_domain_matches()  — read-only domain join (normalized)
--   * link_org_merchant_domain_matches()  — fills marketplace_merchants.
--     organization_id where NULL (idempotent, never overwrites)
--   * find_organization_duplicate_candidates() — deterministic blocker RPC for
--     the `organization` entity in _shared/dedup-engine.ts (name near-dupes
--     like ABUniverse/Abuniverse flow through pipeline-deduplicate).
--
-- NOTE: organizations has no duplicate_of_id column today, so org merges stay
-- review-only downstream (staging-side dedup verdicts); nothing here deletes.
-- ============================================================

-- ── 1. domain matches: org.website_domain ↔ merchant.shop_domain ──────────
-- shop_domain arrives in mixed shapes (https://x.com/, www.x.com, x.com/shop);
-- normalize both sides: strip scheme, leading www., trailing slash/path.
CREATE OR REPLACE FUNCTION public.find_org_merchant_domain_matches()
RETURNS TABLE(merchant_id uuid, organization_id uuid, merchant_name text, org_name text, domain text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT mm.id, mm.display_name,
           lower(split_part(
             regexp_replace(
               regexp_replace(btrim(mm.shop_domain), '^[a-z][a-z0-9+.-]*://', '', 'i'),
               '^www\.', '', 'i'),
             '/', 1)) AS dom
    FROM public.marketplace_merchants mm
    WHERE mm.shop_domain IS NOT NULL AND btrim(mm.shop_domain) <> ''
  ),
  o AS (
    SELECT org.id, org.name,
           lower(split_part(
             regexp_replace(
               regexp_replace(btrim(org.website_domain), '^[a-z][a-z0-9+.-]*://', '', 'i'),
               '^www\.', '', 'i'),
             '/', 1)) AS dom
    FROM public.organizations org
    WHERE org.website_domain IS NOT NULL AND btrim(org.website_domain) <> ''
  )
  SELECT m.id, o.id, m.display_name, o.name, m.dom
  FROM m
  JOIN o ON o.dom = m.dom
  WHERE m.dom <> '' AND m.dom LIKE '%.%';
$$;

COMMENT ON FUNCTION public.find_org_merchant_domain_matches() IS
  'Deterministic org↔merchant matches on normalized domain (scheme, www., path '
  'stripped from both organizations.website_domain and marketplace_merchants.'
  'shop_domain). Read-only; link_org_merchant_domain_matches() applies.';

GRANT EXECUTE ON FUNCTION public.find_org_merchant_domain_matches() TO authenticated, service_role;

-- ── 2. linker: fill marketplace_merchants.organization_id where NULL ──────
-- Idempotent: only fills NULLs, never overwrites an existing link. One org per
-- merchant via DISTINCT ON (duplicate orgs sharing a domain pick the oldest).
CREATE OR REPLACE FUNCTION public.link_org_merchant_domain_matches(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows  jsonb;
  v_count int := 0;
BEGIN
  PERFORM public.assert_admin_or_internal();

  WITH pick AS (
    SELECT DISTINCT ON (f.merchant_id)
           f.merchant_id, f.organization_id, f.merchant_name, f.org_name, f.domain
    FROM public.find_org_merchant_domain_matches() f
    JOIN public.marketplace_merchants mm ON mm.id = f.merchant_id
    JOIN public.organizations org ON org.id = f.organization_id
    WHERE mm.organization_id IS NULL
    ORDER BY f.merchant_id, org.created_at ASC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'merchant_id', p.merchant_id, 'organization_id', p.organization_id,
           'merchant_name', p.merchant_name, 'org_name', p.org_name, 'domain', p.domain)), '[]'::jsonb),
         count(*)
    INTO v_rows, v_count
  FROM pick p;

  IF NOT p_dry_run THEN
    WITH pick AS (
      SELECT DISTINCT ON (f.merchant_id) f.merchant_id, f.organization_id
      FROM public.find_org_merchant_domain_matches() f
      JOIN public.marketplace_merchants mm ON mm.id = f.merchant_id
      JOIN public.organizations org ON org.id = f.organization_id
      WHERE mm.organization_id IS NULL
      ORDER BY f.merchant_id, org.created_at ASC
    )
    UPDATE public.marketplace_merchants mm
       SET organization_id = pick.organization_id
      FROM pick
     WHERE mm.id = pick.merchant_id AND mm.organization_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- mirror link_organization_entity: linked orgs gain the seller role
    UPDATE public.organizations o
       SET roles = (SELECT array(SELECT DISTINCT unnest(o.roles || array['seller'])))
     WHERE o.id IN (SELECT mm.organization_id FROM public.marketplace_merchants mm
                    WHERE mm.organization_id IS NOT NULL)
       AND NOT ('seller' = ANY(o.roles));
  END IF;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'linked', v_count, 'matches', v_rows);
END; $$;

COMMENT ON FUNCTION public.link_org_merchant_domain_matches(boolean) IS
  'Sets marketplace_merchants.organization_id from normalized-domain matches. '
  'Only fills NULLs (never overwrites), one org per merchant (oldest wins on '
  'shared domains). p_dry_run=true (default) reports without writing. '
  'Returns jsonb {dry_run, linked, matches[]}. Idempotent.';

GRANT EXECUTE ON FUNCTION public.link_org_merchant_domain_matches(boolean) TO authenticated, service_role;

-- ── 3. deterministic blocker RPC for the `organization` dedup entity ──────
-- Contract (mirrors find_venue/marketplace_duplicate_candidates):
--   normalized-name exact + same domain  → 1.00  (strong, auto-merge eligible)
--   same domain alone                    → 0.90  (review only — shared platforms)
--   despaced-name exact, no domain proof → 0.85  (review only)
--   very-high name trigram               → ≤0.85 (review only)
-- Thresholds in DEDUP_REGISTRY.organization: autoMerge 0.92 / review 0.80.
CREATE OR REPLACE FUNCTION public.find_organization_duplicate_candidates(
  p_name text, p_website_domain text DEFAULT NULL, p_limit integer DEFAULT 10)
RETURNS TABLE(organization_id uuid, match_type text, score numeric, distance_m double precision)
LANGUAGE sql STABLE SET search_path TO 'public','extensions' AS $$
  WITH cand AS (
    -- normalized-name exact + same website_domain = strong
    SELECT o.id AS oid, 'name_domain_exact'::text AS mt, 1.00::numeric AS sc
    FROM public.organizations o
    WHERE p_website_domain IS NOT NULL AND o.website_domain IS NOT NULL
      AND lower(o.website_domain) = lower(btrim(p_website_domain))
      AND length(public.dedup_despace(p_name)) >= 3
      AND public.dedup_despace(o.name) = public.dedup_despace(p_name)
    UNION ALL
    -- same domain alone: plausible but not proof (marketplaces share domains)
    SELECT o.id, 'domain_exact', 0.90
    FROM public.organizations o
    WHERE p_website_domain IS NOT NULL AND o.website_domain IS NOT NULL
      AND lower(o.website_domain) = lower(btrim(p_website_domain))
    UNION ALL
    -- despaced-name exact without domain corroboration (ABUniverse = Abuniverse)
    SELECT o.id, 'name_exact', 0.85
    FROM public.organizations o
    WHERE length(public.dedup_despace(p_name)) >= 4
      AND public.dedup_despace(o.name) = public.dedup_despace(p_name)
    UNION ALL
    -- fuzzy: very-high trigram similarity only
    SELECT o.id, 'name_trigram',
           (extensions.similarity(public.normalize_name(o.name), public.normalize_name(p_name)) * 0.85)::numeric
    FROM public.organizations o
    WHERE p_name IS NOT NULL AND length(btrim(p_name)) >= 4
      AND extensions.similarity(public.normalize_name(o.name), public.normalize_name(p_name)) >= 0.90
  )
  SELECT q.oid, q.mt, q.sc, NULL::double precision
  FROM (SELECT DISTINCT ON (oid) oid, mt, sc FROM cand ORDER BY oid, sc DESC) q
  ORDER BY q.sc DESC
  LIMIT greatest(1, least(coalesce(p_limit, 10), 50));
$$;

COMMENT ON FUNCTION public.find_organization_duplicate_candidates(text, text, integer) IS
  'Deterministic dedup blocker for organizations (dedup-engine `organization` '
  'entity). Strong (1.00) only when despaced-name exact AND website_domain '
  'match; domain-only or name-only signals cap below auto-merge (review).';

GRANT EXECUTE ON FUNCTION public.find_organization_duplicate_candidates(text, text, integer) TO authenticated, service_role;
