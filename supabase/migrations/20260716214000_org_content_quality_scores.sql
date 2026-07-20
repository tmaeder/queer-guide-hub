-- ============================================================
-- Phase 5a — scores at source (organizations + content completeness gaps)
--
-- 1. run_org_quality_recompute() — organizations.completeness_score /
--    needs_attention finally get a maintainer. The columns have existed since
--    the org spine (20260620082831) with DEFAULT 0 and NOTHING computing them;
--    twenty-sync already pushes them to Twenty (qgCompletenessScore /
--    qgNeedsAttention), so tonight they start meaning something.
--    completeness = weighted % of filled key fields; needs_attention when
--    completeness < 40 or email missing. (trust_score stays NULL — no
--    corroboration signals exist for orgs yet; a composite would be noise.)
--
-- 2. completeness_score smallint for the two content tables that carry NO
--    score at all: hotels and marketplace_listings (products). Every other
--    content table already has a truth-engine-maintained score:
--      venues.quality_score (ingest pipeline), events.quality_score
--      (=completeness, run_event_completeness_recompute) + trust_score,
--      cities/queer_villages completeness+trust (truth loops),
--      countries.content_completeness_score (run_country_completeness_recompute).
--    products get completeness only — no trust for 44k listings (plan 5a).
--
-- Diff discipline (critical): every UPDATE joins a scored CTE and writes ONLY
-- rows whose value actually changed (IS DISTINCT FROM). Score nights must not
-- bump updated_at on unchanged rows — that would re-push the whole table
-- through twenty-sync {recent} mode and re-fan search-document syncs.
--
-- No inline backfill: marketplace_listings has a row-level search_documents
-- trigger; the first nightly cron run (off-peak) performs the initial fill.
-- Registration mirrors run_data_normalization_guard (20260716202717).
-- ============================================================

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS completeness_score smallint;
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS completeness_score smallint;

COMMENT ON COLUMN public.hotels.completeness_score IS
  'Field-coverage 0-100 from run_content_completeness_recompute() (nightly). Hotels have no other quality score.';
COMMENT ON COLUMN public.marketplace_listings.completeness_score IS
  'Field-coverage 0-100 from run_content_completeness_recompute() (nightly). Completeness only — listings deliberately get no trust score. Distinct from quality_score (ingest-time composite).';

-- ── organizations: completeness + needs_attention ──────────────────────────
CREATE OR REPLACE FUNCTION public.run_org_quality_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_orgs          int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'org_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'org_quality_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Weighted filled-field coverage (sums to 100):
  --   name 20 | description 15 | website 15 | email 15 | phone 10 |
  --   logo_url 10 | city_id 5 | roles 5 | tags 5
  WITH scored AS (
    SELECT o.id,
      ( (NULLIF(trim(o.name), '')        IS NOT NULL)::int * 20
      + (NULLIF(trim(o.description), '') IS NOT NULL)::int * 15
      + (NULLIF(trim(o.website), '')     IS NOT NULL)::int * 15
      + (NULLIF(trim(o.email), '')       IS NOT NULL)::int * 15
      + (NULLIF(trim(o.phone), '')       IS NOT NULL)::int * 10
      + (NULLIF(trim(o.logo_url), '')    IS NOT NULL)::int * 10
      + (o.city_id IS NOT NULL)::int * 5
      + (COALESCE(cardinality(o.roles), 0) > 0)::int * 5
      + (COALESCE(cardinality(o.tags), 0) > 0)::int * 5
      )::smallint AS new_completeness,
      (NULLIF(trim(o.email), '') IS NULL) AS email_missing
    FROM public.organizations o
  )
  UPDATE public.organizations o
     SET completeness_score = s.new_completeness,
         needs_attention    = (s.new_completeness < 40 OR s.email_missing)
    FROM scored s
   WHERE o.id = s.id
     AND (o.completeness_score IS DISTINCT FROM s.new_completeness
       OR o.needs_attention IS DISTINCT FROM (s.new_completeness < 40 OR s.email_missing));
  GET DIAGNOSTICS v_orgs = ROW_COUNT;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_orgs, items_changed=v_orgs,
        summary=jsonb_build_object('organizations_updated', v_orgs)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('organizations_updated', v_orgs);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

COMMENT ON FUNCTION public.run_org_quality_recompute(boolean) IS
  'Nightly organizations quality recompute: completeness_score = weighted filled-field % '
  '(name/description/website/email/phone/logo_url/city_id/roles/tags), needs_attention = '
  'completeness < 40 OR email missing. Diff-guarded — only changed rows are written.';

ALTER FUNCTION public.run_org_quality_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_org_quality_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_org_quality_recompute(boolean) TO service_role, authenticated;

-- ── hotels + products: filled-field completeness ────────────────────────────
CREATE OR REPLACE FUNCTION public.run_content_completeness_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_hotels        int := 0;
  v_products      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'content_completeness_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'content_completeness_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- hotels (sums to 100): name 20 | description 20 | website 15 | email 10 |
  --   phone 10 | address 10 | booking_url 5 | city_id 5 | amenities 5
  WITH scored AS (
    SELECT h.id,
      ( (NULLIF(trim(h.name), '')        IS NOT NULL)::int * 20
      + (NULLIF(trim(h.description), '') IS NOT NULL)::int * 20
      + (NULLIF(trim(h.website), '')     IS NOT NULL)::int * 15
      + (NULLIF(trim(h.email), '')       IS NOT NULL)::int * 10
      + (NULLIF(trim(h.phone), '')       IS NOT NULL)::int * 10
      + (NULLIF(trim(h.address), '')     IS NOT NULL)::int * 10
      + (NULLIF(trim(h.booking_url), '') IS NOT NULL)::int * 5
      + (h.city_id IS NOT NULL)::int * 5
      + (COALESCE(cardinality(h.amenities), 0) > 0)::int * 5
      )::smallint AS new_completeness
    FROM public.hotels h
  )
  UPDATE public.hotels h
     SET completeness_score = s.new_completeness
    FROM scored s
   WHERE h.id = s.id
     AND h.completeness_score IS DISTINCT FROM s.new_completeness;
  GET DIAGNOSTICS v_hotels = ROW_COUNT;

  -- marketplace_listings / products (sums to 100): title 20 | description 20 |
  --   url 15 | images 15 | brand 10 | category 10 | price 10
  WITH scored AS (
    SELECT l.id,
      ( (NULLIF(trim(l.title), '')       IS NOT NULL)::int * 20
      + (NULLIF(trim(l.description), '') IS NOT NULL)::int * 20
      + (COALESCE(NULLIF(trim(l.external_url), ''), NULLIF(trim(l.website), '')) IS NOT NULL)::int * 15
      + (COALESCE(cardinality(l.images), 0) > 0)::int * 15
      + (NULLIF(trim(l.brand), '')       IS NOT NULL)::int * 10
      + (NULLIF(trim(l.category), '')    IS NOT NULL)::int * 10
      + (l.price_usd IS NOT NULL)::int * 10
      )::smallint AS new_completeness
    FROM public.marketplace_listings l
  )
  UPDATE public.marketplace_listings l
     SET completeness_score = s.new_completeness
    FROM scored s
   WHERE l.id = s.id
     AND l.completeness_score IS DISTINCT FROM s.new_completeness;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_hotels+v_products, items_changed=v_hotels+v_products,
        summary=jsonb_build_object('hotels_updated', v_hotels, 'products_updated', v_products)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('hotels_updated', v_hotels, 'products_updated', v_products);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

COMMENT ON FUNCTION public.run_content_completeness_recompute(boolean) IS
  'Nightly filled-field completeness for the score-less content tables: hotels and '
  'marketplace_listings (products, completeness only — no trust). Diff-guarded — '
  'only changed rows are written so unchanged rows never re-sync to Twenty/search.';

ALTER FUNCTION public.run_content_completeness_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_content_completeness_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_content_completeness_recompute(boolean) TO service_role, authenticated;

-- ── register automations + cron (city truth loop pattern) ──────────────────
-- Enabled from day one: pure derived metadata, diff-guarded, no-op once stable.
-- The FIRST nightly run performs the initial backfill (no inline sweep here —
-- marketplace_listings carries a row-level search_documents trigger; better at 02:55).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('org_quality_recompute','Nightly organization quality recompute',
   'Recomputes organizations.completeness_score (weighted filled-field %: name/description/website/email/phone/logo_url/city_id/roles/tags) and needs_attention (completeness < 40 or email missing). Diff-guarded; only changed rows are written.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_org_quality_recompute"}'::jsonb, '50 2 * * *'),
  ('content_completeness_recompute','Nightly hotel/product completeness recompute',
   'Recomputes completeness_score for the score-less content tables: hotels and marketplace_listings (products — completeness only, no trust). Diff-guarded; only changed rows are written.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_content_completeness_recompute"}'::jsonb, '55 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='org_quality_recompute') THEN
    PERFORM cron.unschedule('org_quality_recompute');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='content_completeness_recompute') THEN
    PERFORM cron.unschedule('content_completeness_recompute');
  END IF;
END $$;
SELECT cron.schedule('org_quality_recompute', '50 2 * * *', 'SELECT public.run_org_quality_recompute();');
SELECT cron.schedule('content_completeness_recompute', '55 2 * * *', 'SELECT public.run_content_completeness_recompute();');
