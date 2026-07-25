-- ============================================================================
-- Admin vendor management (2026-07-25)
-- ----------------------------------------------------------------------------
-- marketplace_merchants has no admin UI — rows were only ever created via SQL
-- seed migrations, and admin RLS is deliberately SELECT-only. These two
-- SECURITY DEFINER RPCs are the ONLY write path for the new /admin/vendors
-- surface; the table policies stay untouched.
-- Also: get_admin_counts gains 'review_brands' (pending marketplace_brands)
-- to feed the /admin/brands sidebar badge.
-- ============================================================================

-- ── Merchant upsert ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_upsert_marketplace_merchant(p jsonb)
RETURNS public.marketplace_merchants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := nullif(p->>'id','')::uuid;
  v_provider text := p->>'provider';
  v_slug text := p->>'slug';
  m public.marketplace_merchants%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  IF v_id IS NULL THEN
    -- create: provider + slug are the identity, required and validated
    IF v_provider IS NULL OR v_provider NOT IN ('shopify-public','woocommerce-public','etsy','crawl') THEN
      RAISE EXCEPTION 'invalid provider % (allowed: shopify-public, woocommerce-public, etsy, crawl)', coalesce(v_provider,'<null>')
        USING ERRCODE='22023'; END IF;
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN
      RAISE EXCEPTION 'invalid slug % (lowercase letters, digits, dashes only)', coalesce(v_slug,'<null>')
        USING ERRCODE='22023'; END IF;
    IF coalesce(p->>'display_name','') = '' THEN
      RAISE EXCEPTION 'display_name is required' USING ERRCODE='22023'; END IF;

    INSERT INTO public.marketplace_merchants
      (provider, slug, display_name, shop_domain, config, is_enabled,
       affiliate_partner_id, organization_id)
    VALUES (
      v_provider, v_slug, p->>'display_name', nullif(p->>'shop_domain',''),
      coalesce(p->'config','{}'::jsonb),
      coalesce((p->>'is_enabled')::boolean, true),
      nullif(p->>'affiliate_partner_id','')::uuid,
      nullif(p->>'organization_id','')::uuid)
    ON CONFLICT (provider, slug) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      shop_domain = EXCLUDED.shop_domain,
      config = public.marketplace_merchants.config || EXCLUDED.config,
      is_enabled = EXCLUDED.is_enabled,
      affiliate_partner_id = EXCLUDED.affiliate_partner_id,
      organization_id = EXCLUDED.organization_id,
      updated_at = now()
    RETURNING * INTO m;
  ELSE
    -- update: provider/slug are immutable (unique sync-registry key)
    UPDATE public.marketplace_merchants SET
      display_name = coalesce(nullif(p->>'display_name',''), display_name),
      shop_domain = CASE WHEN p ? 'shop_domain' THEN nullif(p->>'shop_domain','') ELSE shop_domain END,
      config = CASE WHEN p ? 'config' THEN config || (p->'config') ELSE config END,
      is_enabled = coalesce((p->>'is_enabled')::boolean, is_enabled),
      affiliate_partner_id = CASE WHEN p ? 'affiliate_partner_id'
        THEN nullif(p->>'affiliate_partner_id','')::uuid ELSE affiliate_partner_id END,
      organization_id = CASE WHEN p ? 'organization_id'
        THEN nullif(p->>'organization_id','')::uuid ELSE organization_id END,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO m;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'merchant not found' USING ERRCODE='22023'; END IF;
  END IF;

  -- mirror link_org_merchant_domain_matches: linked orgs gain the seller role
  IF m.organization_id IS NOT NULL THEN
    UPDATE public.organizations o
       SET roles = (SELECT array(SELECT DISTINCT unnest(o.roles || array['seller'])))
     WHERE o.id = m.organization_id AND NOT ('seller' = ANY(o.roles));
  END IF;

  RETURN m;
END; $$;
ALTER FUNCTION public.admin_upsert_marketplace_merchant(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_upsert_marketplace_merchant(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_marketplace_merchant(jsonb) TO authenticated, service_role;

-- ── Merchant delete ──────────────────────────────────────────────────────────
-- Listings reference merchants by source_slug/merchant_domain (no FK), so this
-- only removes the sync-registry row; committed listings are untouched.

CREATE OR REPLACE FUNCTION public.admin_delete_marketplace_merchant(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  DELETE FROM public.marketplace_merchants WHERE id = p_id RETURNING slug INTO v_slug;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'merchant not found' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('deleted', true, 'slug', v_slug);
END; $$;
ALTER FUNCTION public.admin_delete_marketplace_merchant(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_delete_marketplace_merchant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_marketplace_merchant(uuid) TO authenticated, service_role;

-- ── get_admin_counts + review_brands ────────────────────────────────────────
-- Full replacement of the 20260724150000 body with one addition: the
-- 'review_brands' key in the final static block (pending marketplace_brands,
-- feeds the /admin/brands badge). Brands are NOT in triage_sources — approval
-- needs per-brand ownership-tag selection, which the generic inbox action
-- contract can't express; they keep a dedicated queue UI.

CREATE OR REPLACE FUNCTION public.get_admin_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  estimates jsonb;
  v_sla jsonb := '{}'::jsonb;
  v_cnt bigint;
  v_overdue bigint;
  r record;
  sla_feedback_h constant int := 48;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_object_agg(relname, reltuples::bigint)
  INTO estimates
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = ANY (ARRAY[
      'venues','events','news_articles','personalities','cities','countries',
      'hotels','queer_villages','marketplace_listings','community_groups',
      'unified_tags','cms_pages','email_ingestions','workflow_runs',
      'scrape_sources','content_links','community_submissions','redirects'
    ]);

  result := coalesce(estimates, '{}'::jsonb);

  FOR r IN
    SELECT queue_key, view_name, count_key, sla_hours
    FROM triage_sources WHERE active ORDER BY queue_key
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE created_at < now() - %L::interval) FROM public.%I',
      r.sla_hours || ' hours', r.view_name
    ) INTO v_cnt, v_overdue;
    result := result
      || jsonb_build_object('review_' || r.count_key, v_cnt)
      || jsonb_build_object('review_' || r.count_key || '_overdue', v_overdue);
    v_sla := v_sla || jsonb_build_object(r.count_key, r.sla_hours);
  END LOOP;

  result := result || jsonb_build_object(
    'review_feedback',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')),
    'review_feedback_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')
          AND submitted_at < now() - (sla_feedback_h || ' hours')::interval),
    'sla_hours', v_sla || jsonb_build_object('feedback', sla_feedback_h)
  );

  -- Preserve the keys added by the concurrent Admin-IA work (migration
  -- 20260724100000): the Quality hub, group-requests badge, and cockpit read
  -- these from this same single count source. The Truth-Engine review gates
  -- are NOT yet in the triage_sources registry (they get folded in A3); until
  -- then, emit them here as a static block so nothing #2269 shipped regresses.
  result := result || jsonb_build_object(
    'review_group_requests',
      (SELECT count(*) FROM group_join_requests WHERE status='pending'),
    'review_brands',
      (SELECT count(*) FROM marketplace_brands WHERE status='pending'),
    'quality_city',
      (SELECT count(*) FROM city_review_queue WHERE status='open'),
    'quality_venue',
      (SELECT count(*) FROM venue_review_queue WHERE status='open'),
    'quality_village',
      (SELECT count(*) FROM village_review_queue WHERE status='open'),
    'quality_personality',
      (SELECT count(*) FROM personality_review_queue WHERE status='open'),
    'quality_marketplace',
      (SELECT count(*) FROM marketplace_review_queue WHERE status='open'),
    'quality_existence',
      (SELECT count(*) FROM entity_existence_audit
        WHERE action='flag' AND reverted_at IS NULL),
    'quality_editorial',
      (SELECT count(*) FROM editorial_drafts WHERE status='pending')
  );

  RETURN result;
END;
$function$;
