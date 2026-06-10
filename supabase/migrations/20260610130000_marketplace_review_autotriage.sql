-- Marketplace tag engine: deterministic review-queue auto-triage.
-- The rating-downgrade gate fills from the daily extract + weekly LLM crons. The
-- 2026-06-10 manual triage proved a deterministic, safe disposition policy; this
-- registers it as a nightly cron so the queue stays drained and humans only ever
-- see what the policy leaves open (currently: nothing — rejection is the default,
-- and rejection = keep the current adult bucket = over-gating, the safe direction).
--
-- Policy (mirrors the manual pass):
--   APPROVE when the post-change rating stays adult/explicit (still behind the
--           18+ gate — re-bucketing cannot expose it), or when title+description
--           are clean of an extended residual-adult lexicon.
--   REJECT  extract-model proposals to Books/Jewelry out of adult buckets
--           ('print'/'game'/'ring' regex false-positives), and anything whose
--           rating would cross the gate while residual adult markers are present.
-- Approvals write marketplace_listings.subcategory (search trigger) → capped batch.

CREATE OR REPLACE FUNCTION public.run_marketplace_review_autotriage(
  p_batch int DEFAULT 200, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_approved int := 0; v_rejected int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'marketplace_review_autotriage';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'marketplace_review_autotriage', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Rejections (no listing writes — uncapped).
  WITH cls AS (
    SELECT q.id, q.model, q.proposed_value->>'subcategory' AS proposed, l.subcategory_slug AS cur,
      public.marketplace_content_rating(q.proposed_value->>'subcategory', l.title, l.description) AS wouldbe,
      (lower(coalesce(l.title,'')||' '||coalesce(l.description,'')) ~
       '(latex|wetlook|gummi|rubber|leder|leather|lack|lacquer|pvc|vinyl|fetisch|fetish|harness|ouvert|crotch|nippel|nipple|\mpup\M|puppy|sling|chaps|neopren|bondage|bdsm|dildo|anal|plug|vibrat|cock|penis|keuschheit|chastity|slave|sklav|pinwheel|wartenberg)') AS adult_residual
    FROM public.marketplace_review_queue q JOIN public.marketplace_listings l ON l.id=q.listing_id
    WHERE q.status='open'
  ),
  to_reject AS (
    SELECT id FROM cls
    WHERE (model='extract' AND proposed='Books and Art')
       OR (model='extract' AND proposed='Jewelry and Pins'
           AND cur IN ('sex_toys','anal_toys','cock_rings_and_stretchers','chastity','pumps_and_enlargement','bdsm_and_bondage','fetish_wear'))
       OR (wouldbe NOT IN ('adult','explicit') AND adult_residual)
  )
  UPDATE public.marketplace_review_queue q
  SET status='rejected', reviewed_at=now(),
      reviewer_note='autotriage: rating would cross the 18+ gate with residual adult markers (or extract books/jewelry false positive) — keeping current bucket'
  FROM to_reject t WHERE q.id=t.id;
  GET DIAGNOSTICS v_rejected = ROW_COUNT;

  -- Approvals (listing writes — capped batch protects the search sync).
  WITH cls AS (
    SELECT q.id, q.listing_id, q.created_at, q.proposed_value->>'subcategory' AS proposed,
      public.marketplace_content_rating(q.proposed_value->>'subcategory', l.title, l.description) AS wouldbe,
      (lower(coalesce(l.title,'')||' '||coalesce(l.description,'')) ~
       '(latex|wetlook|gummi|rubber|leder|leather|lack|lacquer|pvc|vinyl|fetisch|fetish|harness|ouvert|crotch|nippel|nipple|\mpup\M|puppy|sling|chaps|neopren|bondage|bdsm|dildo|anal|plug|vibrat|cock|penis|keuschheit|chastity|slave|sklav|pinwheel|wartenberg)') AS adult_residual
    FROM public.marketplace_review_queue q JOIN public.marketplace_listings l ON l.id=q.listing_id
    WHERE q.status='open'
  ),
  batch AS (
    SELECT id, listing_id, proposed FROM cls
    WHERE wouldbe IN ('adult','explicit') OR NOT adult_residual
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(p_batch, 500))
  ),
  upd AS (
    UPDATE public.marketplace_listings l SET subcategory = b.proposed
    FROM batch b WHERE l.id = b.listing_id RETURNING l.id
  )
  UPDATE public.marketplace_review_queue q
  SET status='approved', reviewed_at=now(),
      reviewer_note='autotriage: applied — post-change rating stays 18+-gated, or text clean of residual adult markers'
  FROM batch b WHERE q.id=b.id;
  GET DIAGNOSTICS v_approved = ROW_COUNT;

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_approved+v_rejected, items_changed=v_approved,
    summary=jsonb_build_object('approved',v_approved,'rejected',v_rejected) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('approved', v_approved, 'rejected', v_rejected);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_review_autotriage(int, boolean) TO service_role, authenticated;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('marketplace_review_autotriage','Marketplace review auto-triage',
   'Nightly deterministic disposition of the rating-downgrade gate: approve when the post-change rating stays 18+-gated or text is clean; reject (keep adult bucket) when residual adult markers are present. Capped listing writes.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_review_autotriage"}'::jsonb, '15 5 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_review_autotriage') THEN
    PERFORM cron.unschedule('marketplace_review_autotriage');
  END IF;
  PERFORM cron.schedule('marketplace_review_autotriage', '15 5 * * *',
    'SELECT public.run_marketplace_review_autotriage();');
END $$;
