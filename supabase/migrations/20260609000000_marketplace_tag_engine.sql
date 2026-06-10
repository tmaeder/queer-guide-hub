-- Marketplace Tagging Truth Engine — P1b/P3 schema spine.
-- Design: docs/plans/2026-06-08-marketplace-tagging-design.md §1/§3 + the P1b→P3 plan.
--
-- Adds, with the storm constraint in mind (trg_search_documents_marketplace fires on
-- EVERY listings UPDATE; the DB is disk-constrained):
--   1. Attribute vocabulary in unified_tags (material/occasion/vibe), namespaced slugs.
--   2. marketplace_department() umbrella map + a STORED GENERATED `department` column
--      (DDL rewrite — storm-free, unlike a 13.8k-row UPDATE). Derives from base
--      `subcategory` (a generated col can't reference the generated subcategory_slug).
--   3. marketplace_review_queue + approve/reject RPCs — the content_rating-downgrade gate
--      (re-bucketing a product OUT of an adult department is the harmful direction).
--   4. marketplace_due_for_tagging() work-list selector (empty-attributes first).
--   5. Daily extract cron + weekly LLM cron (net.http_post -> edge fn, vault secret) +
--      weekly coverage health pulse, registered in admin_automations.
-- Idempotent; no CONCURRENTLY (runs in a txn). The free-extract reclassification itself
-- lives in the marketplace-tag-backfill edge fn (TS normalizer); this is its scaffolding.

-- ============================================================================
-- 1. Attribute vocabulary (namespaced to avoid colliding with existing global tags)
-- ============================================================================
INSERT INTO public.unified_tags (slug, name, category, entity_kind, status, seo_indexable) VALUES
  -- material (mat-)
  ('mat-cotton','Cotton','material','concept','active',false),
  ('mat-leather','Leather','material','concept','active',false),
  ('mat-vegan-leather','Vegan Leather','material','concept','active',false),
  ('mat-silicone','Silicone','material','concept','active',false),
  ('mat-latex','Latex','material','concept','active',false),
  ('mat-rubber','Rubber','material','concept','active',false),
  ('mat-mesh','Mesh','material','concept','active',false),
  ('mat-lace','Lace','material','concept','active',false),
  ('mat-satin','Satin','material','concept','active',false),
  ('mat-denim','Denim','material','concept','active',false),
  ('mat-wool','Wool','material','concept','active',false),
  ('mat-nylon','Nylon','material','concept','active',false),
  ('mat-spandex','Spandex','material','concept','active',false),
  ('mat-bamboo','Bamboo','material','concept','active',false),
  ('mat-modal','Modal','material','concept','active',false),
  ('mat-stainless-steel','Stainless Steel','material','concept','active',false),
  ('mat-silver','Silver','material','concept','active',false),
  ('mat-gold','Gold','material','concept','active',false),
  ('mat-glass','Glass','material','concept','active',false),
  ('mat-wood','Wood','material','concept','active',false),
  ('mat-ceramic','Ceramic','material','concept','active',false),
  ('mat-metal','Metal','material','concept','active',false),
  -- occasion (occ-)
  ('occ-pride','Pride','occasion','concept','active',false),
  ('occ-drag','Drag','occasion','concept','active',false),
  ('occ-wedding','Wedding','occasion','concept','active',false),
  ('occ-everyday','Everyday','occasion','concept','active',false),
  ('occ-festival','Festival','occasion','concept','active',false),
  ('occ-party','Party','occasion','concept','active',false),
  ('occ-halloween','Halloween','occasion','concept','active',false),
  ('occ-gym','Gym','occasion','concept','active',false),
  ('occ-beach','Beach','occasion','concept','active',false),
  ('occ-holiday','Holiday','occasion','concept','active',false),
  -- vibe (vibe-)
  ('vibe-minimal','Minimal','vibe','aesthetic','active',false),
  ('vibe-bold','Bold','vibe','aesthetic','active',false),
  ('vibe-vintage','Vintage','vibe','aesthetic','active',false),
  ('vibe-sporty','Sporty','vibe','aesthetic','active',false),
  ('vibe-cute','Cute','vibe','aesthetic','active',false),
  ('vibe-elegant','Elegant','vibe','aesthetic','active',false),
  ('vibe-gothic','Gothic','vibe','aesthetic','active',false),
  ('vibe-colorful','Colorful','vibe','aesthetic','active',false),
  ('vibe-handmade','Handmade','vibe','aesthetic','active',false)
ON CONFLICT (slug) DO UPDATE SET category = EXCLUDED.category, status = 'active', updated_at = now();

-- ============================================================================
-- 2. Department umbrella map + generated column
-- ============================================================================
-- Maps a fine subcategory (base text -> slugified) to a browse umbrella, so SFW browse
-- isn't dominated by the three adult toy buckets. Keep in sync with the normalizer's
-- DEPARTMENTS set and marketplace_content_rating().
CREATE OR REPLACE FUNCTION public.marketplace_department(p_subcategory text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(regexp_replace(coalesce(p_subcategory,''), '[\s\-]+', '_', 'g'))
    WHEN 'sex_toys' THEN 'intimacy'
    WHEN 'anal_toys' THEN 'intimacy'
    WHEN 'cock_rings_and_stretchers' THEN 'intimacy'
    WHEN 'pumps_and_enlargement' THEN 'intimacy'
    WHEN 'chastity' THEN 'intimacy'
    WHEN 'bdsm_and_bondage' THEN 'bdsm_fetish'
    WHEN 'fetish_wear' THEN 'bdsm_fetish'
    WHEN 'fetish_gear' THEN 'bdsm_fetish'
    WHEN 'pup_and_pet_play' THEN 'bdsm_fetish'
    WHEN 'underwear_and_swimwear' THEN 'underwear'
    WHEN 'underwear' THEN 'underwear'
    WHEN 'lingerie' THEN 'underwear'
    WHEN 'swimwear' THEN 'swimwear'
    WHEN 'apparel_and_accessories' THEN 'apparel'
    WHEN 'apparel' THEN 'apparel'
    WHEN 'accessories' THEN 'apparel'
    WHEN 'jewelry_and_pins' THEN 'jewelry'
    WHEN 'jewelry' THEN 'jewelry'
    WHEN 'books_and_art' THEN 'books_art'
    WHEN 'books' THEN 'books_art'
    WHEN 'art' THEN 'books_art'
    WHEN 'hygiene_and_care' THEN 'hygiene'
    WHEN 'hygiene' THEN 'hygiene'
    WHEN 'mental_health' THEN 'services'
    WHEN 'personal_training' THEN 'services'
    WHEN 'event_planning' THEN 'services'
    ELSE 'other'
  END;
$$;

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS department text
  GENERATED ALWAYS AS (public.marketplace_department(subcategory)) STORED;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_department
  ON public.marketplace_listings (department)
  WHERE status = 'active';

COMMENT ON COLUMN public.marketplace_listings.department IS
  'Browse umbrella (intimacy/bdsm_fetish/apparel/underwear/swimwear/jewelry/books_art/hygiene/services/other). '
  'STORED generated from subcategory via marketplace_department(). Storm-free (DDL rewrite, not row DML).';

-- ============================================================================
-- 3. Review queue — content_rating downgrade gate (re-bucketing OUT of adult)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketplace_review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id     uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  field          text NOT NULL DEFAULT 'subcategory' CHECK (field IN ('subcategory')),
  proposed_value jsonb NOT NULL,                       -- {subcategory, from_rating, to_rating, rationale}
  citations      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{quote, source}]
  confidence     numeric(3,2),
  model          text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  reviewer_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_review_queue_open
  ON public.marketplace_review_queue(listing_id, field) WHERE status='open';

ALTER TABLE public.marketplace_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_review_queue_admin_all ON public.marketplace_review_queue;
CREATE POLICY marketplace_review_queue_admin_all ON public.marketplace_review_queue
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
GRANT ALL ON TABLE public.marketplace_review_queue TO authenticated, service_role;

-- approve: copy the proposed subcategory onto the listing (recomputes subcategory_slug +
-- content_rating + department generated cols). A content_rating downgrade is the whole
-- reason this is gated, so applying it is the admin's explicit decision.
CREATE OR REPLACE FUNCTION public.approve_marketplace_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.marketplace_review_queue%ROWTYPE; v_subcat text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.marketplace_review_queue WHERE id=p_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  v_subcat := r.proposed_value->>'subcategory';
  IF v_subcat IS NULL OR btrim(v_subcat) = '' THEN
    RAISE EXCEPTION 'proposed subcategory missing' USING ERRCODE='22023'; END IF;

  UPDATE public.marketplace_listings SET subcategory = v_subcat WHERE id = r.listing_id;
  UPDATE public.marketplace_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id=p_id;
  RETURN jsonb_build_object('approved', true, 'listing_id', r.listing_id, 'subcategory', v_subcat);
END; $$;
ALTER FUNCTION public.approve_marketplace_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_marketplace_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_marketplace_review(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_marketplace_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.marketplace_review_queue%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.marketplace_review_queue WHERE id=p_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;
  UPDATE public.marketplace_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id=p_id;
  RETURN jsonb_build_object('rejected', true, 'listing_id', r.listing_id);
END; $$;
ALTER FUNCTION public.reject_marketplace_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_marketplace_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_marketplace_review(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- 4. Work-list selector — empty-attributes first, then never/least-recently tagged
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketplace_due_for_tagging(p_limit int DEFAULT 150)
RETURNS TABLE (
  id                   uuid,
  title                text,
  description          text,
  brand                text,
  subcategory          text,
  subcategory_slug     text,
  content_rating       text,
  community_owned_tags text[],
  lgbti_relevance_score numeric,
  has_attributes       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.title, l.description, l.brand, l.subcategory, l.subcategory_slug,
         l.content_rating, l.community_owned_tags, l.lgbti_relevance_score,
         EXISTS (
           SELECT 1 FROM public.unified_tag_assignments a
           JOIN public.unified_tags t ON t.id = a.tag_id
           WHERE a.entity_type = 'marketplace_listing' AND a.entity_id = l.id
             AND t.category IN ('material','occasion','vibe')
         ) AS has_attributes
  FROM public.marketplace_listings l
  WHERE l.status = 'active'
  ORDER BY
    EXISTS (
      SELECT 1 FROM public.unified_tag_assignments a
      JOIN public.unified_tags t ON t.id = a.tag_id
      WHERE a.entity_type = 'marketplace_listing' AND a.entity_id = l.id
        AND t.category IN ('material','occasion','vibe')
    ),                                  -- untagged (false) first
    l.classified_at ASC NULLS FIRST,    -- then never/oldest classified
    l.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.marketplace_due_for_tagging(int) TO service_role, authenticated;
COMMENT ON FUNCTION public.marketplace_due_for_tagging(int) IS
  'Prioritized batch for marketplace-tag-backfill: untagged-attributes first, then never/oldest classified. Active listings only.';

-- ============================================================================
-- 5. Coverage health pulse (light aggregate — no per-row writes)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_marketplace_tag_coverage_summary(p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_summary jsonb;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'marketplace_tag_coverage_summary';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'marketplace_tag_coverage_summary', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH tagged AS (
    SELECT DISTINCT a.entity_id
    FROM public.unified_tag_assignments a
    JOIN public.unified_tags t ON t.id = a.tag_id
    WHERE a.entity_type='marketplace_listing' AND t.category IN ('material','occasion','vibe')
  )
  SELECT jsonb_build_object(
    'total_active', (SELECT count(*) FROM public.marketplace_listings WHERE status='active'),
    'with_attributes', (SELECT count(*) FROM public.marketplace_listings l WHERE l.status='active' AND EXISTS (SELECT 1 FROM tagged g WHERE g.entity_id=l.id)),
    'departments', (SELECT jsonb_object_agg(department, n) FROM (SELECT department, count(*) n FROM public.marketplace_listings WHERE status='active' GROUP BY 1) d),
    'open_reviews', (SELECT count(*) FROM public.marketplace_review_queue WHERE status='open')
  ) INTO v_summary;

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=(v_summary->>'total_active')::int, summary=v_summary WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN v_summary;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_tag_coverage_summary(boolean) TO service_role, authenticated;

-- ============================================================================
-- 5b. Edge-fn invoker wrappers (so admin "Run now" + cron share one entry, and the
--     admin_automations.enabled toggle actually pauses the sweep). Zero-arg form so the
--     data-driven dispatcher's run_<slug>() fallback resolves them.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_marketplace_tag_backfill(p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enabled boolean; v_req bigint; v_secret text;
BEGIN
  SELECT enabled INTO v_enabled FROM public.admin_automations WHERE slug='marketplace_tag_backfill';
  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    RETURN jsonb_build_object('skipped',true,'reason','paused'); END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='marketplace_tag_webhook_secret';
  v_req := net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-tag-backfill',
    headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret', v_secret),
    body := '{"sources":["extract"],"batch_limit":150}'::jsonb,
    timeout_milliseconds := 120000);
  UPDATE public.admin_automations SET last_run_at=now(), last_run_status='success' WHERE slug='marketplace_tag_backfill';
  RETURN jsonb_build_object('dispatched',true,'request_id',v_req,'sources',ARRAY['extract']);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_tag_backfill(boolean) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.run_marketplace_tag_llm(p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enabled boolean; v_req bigint; v_secret text;
BEGIN
  SELECT enabled INTO v_enabled FROM public.admin_automations WHERE slug='marketplace_tag_llm';
  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    RETURN jsonb_build_object('skipped',true,'reason','paused'); END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='marketplace_tag_webhook_secret';
  v_req := net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-tag-backfill',
    headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret', v_secret),
    body := '{"sources":["extract","llm"],"batch_limit":40}'::jsonb,
    timeout_milliseconds := 150000);
  UPDATE public.admin_automations SET last_run_at=now(), last_run_status='success' WHERE slug='marketplace_tag_llm';
  RETURN jsonb_build_object('dispatched',true,'request_id',v_req,'sources',ARRAY['extract','llm']);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_tag_llm(boolean) TO service_role, authenticated;

-- ============================================================================
-- 6. Automations registry + vault secret + crons
-- ============================================================================
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('marketplace_tag_backfill','Marketplace tag backfill (extract)',
   'Daily free re-extract of department + material/occasion/vibe attributes + per-item relevance for untagged products. Bounded batch protects the search sync.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_tag_backfill"}'::jsonb, '45 4 * * *'),
  ('marketplace_tag_llm','Marketplace tag LLM gap-fill',
   'Weekly LLM gap-fill for thin-description products (circuit-broken, daily-capped). Attributes auto-apply >=0.8; content_rating downgrades are review-gated.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_tag_llm"}'::jsonb, '0 5 * * 0'),
  ('marketplace_tag_coverage_summary','Marketplace tag coverage summary',
   'Weekly read-only health pulse: attribute coverage + department distribution + open reviews.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_tag_coverage_summary"}'::jsonb, '35 5 * * 0')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- Vault secret for the cron -> edge fn webhook auth (matches MARKETPLACE_TAG_WEBHOOK_SECRET
-- set on the edge function env). Create only if absent. Random per install — copy the
-- generated value into the edge fn env MARKETPLACE_TAG_WEBHOOK_SECRET.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='marketplace_tag_webhook_secret') THEN
    PERFORM vault.create_secret('mktag_' || encode(extensions.gen_random_bytes(20), 'hex'), 'marketplace_tag_webhook_secret');
  END IF;
END $$;

-- Daily extract sweep (free, no LLM) + weekly LLM gap-fill — both via the wrappers so
-- the admin enabled toggle pauses them.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_tag_backfill') THEN
    PERFORM cron.unschedule('marketplace_tag_backfill');
  END IF;
  PERFORM cron.schedule('marketplace_tag_backfill', '45 4 * * *',
    'SELECT public.run_marketplace_tag_backfill();');
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_tag_llm') THEN
    PERFORM cron.unschedule('marketplace_tag_llm');
  END IF;
  PERFORM cron.schedule('marketplace_tag_llm', '0 5 * * 0',
    'SELECT public.run_marketplace_tag_llm();');
END $$;

-- Weekly coverage summary.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_tag_coverage_summary') THEN
    PERFORM cron.unschedule('marketplace_tag_coverage_summary');
  END IF;
  PERFORM cron.schedule('marketplace_tag_coverage_summary', '35 5 * * 0',
    'SELECT public.run_marketplace_tag_coverage_summary();');
END $$;
