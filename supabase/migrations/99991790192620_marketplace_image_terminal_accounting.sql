-- Per-asset failures are data outcomes, not automation transport failures.
-- A worker run is productive when it either changes an asset or records a
-- terminal outcome. It remains a genuine failure when rows are examined but
-- neither changed nor terminally handled.

CREATE OR REPLACE FUNCTION public.admin_marketplace_run_metrics()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_body jsonb; v_text text;
BEGIN
  IF NEW.automation_slug NOT IN ('marketplace_variant_backfill','marketplace_link_checker',
      'marketplace_description_enhance','marketplace_image_retry','marketplace_image_optimize',
      'marketplace_taxonomy_classify') THEN RETURN NEW; END IF;
  v_text:=coalesce(NEW.summary#>>'{requests,0,body}',NEW.summary->>'body');
  BEGIN v_body:=v_text::jsonb; EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
  NEW.items_examined:=greatest(coalesce(NEW.items_examined,0),coalesce(
    (v_body->>'items_examined')::int,(v_body->>'items_processed')::int,
    (v_body->>'processed')::int,(v_body->>'items')::int,0));
  NEW.items_changed:=greatest(coalesce(NEW.items_changed,0),coalesce(
    (v_body->>'items_changed')::int,(v_body->>'items_succeeded')::int,
    (v_body->>'listings_updated')::int,0));
  NEW.summary:=coalesce(NEW.summary,'{}'::jsonb)||jsonb_build_object('worker_metrics',jsonb_build_object(
    'examined',NEW.items_examined,'changed',NEW.items_changed,
    'terminal',coalesce((v_body->>'items_terminal')::int,0),
    'failed',coalesce((v_body->>'items_failed')::int,(v_body->>'failed')::int,0)));
  IF NEW.status='success' AND NEW.items_examined>0 AND NEW.items_changed=0
     AND coalesce((v_body->>'items_terminal')::int,0)=0 THEN
    NEW.status:='error';
    NEW.error:=coalesce(NEW.error,'worker examined rows but made no changed or terminal progress');
  END IF;
  RETURN NEW;
END;
$$;

-- Correct image-optimizer run rows that were misclassified solely because
-- every examined asset reached a recorded terminal failure state.
UPDATE public.admin_automation_runs
SET status='success',error=NULL
WHERE automation_slug='marketplace_image_optimize'
  AND status='error'
  AND items_examined>0
  AND items_changed=0
  AND coalesce((summary#>>'{worker_metrics,terminal}')::int,0)>0
  AND coalesce((summary#>>'{requests,0,status}')::int,200) BETWEEN 200 AND 299;

UPDATE public.admin_automations
SET enabled=true,consecutive_failures=0,last_run_status='success',updated_at=now()
WHERE slug='marketplace_image_optimize';

CREATE OR REPLACE FUNCTION public.marketplace_image_failure_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH linked AS (
    SELECT DISTINCT ial.entity_id,ia.id,ia.optimization_status,ia.metadata
    FROM public.image_asset_links ial
    JOIN public.image_assets ia ON ia.id=ial.asset_id
    JOIN public.marketplace_listings ml ON ml.id=ial.entity_id
    WHERE ial.entity_type='marketplace_listing' AND ml.status='active'
  )
  SELECT jsonb_build_object(
    'image_opt_failed_total',count(DISTINCT entity_id) FILTER(
      WHERE optimization_status='failed'),
    'image_opt_retryable_failed',count(DISTINCT entity_id) FILTER(
      WHERE optimization_status='failed'
        AND CASE WHEN coalesce(metadata->>'optimization_attempts','') ~ '^\d+$'
          THEN (metadata->>'optimization_attempts')::int ELSE 0 END < 3),
    'image_opt_terminal_failed',count(DISTINCT entity_id) FILTER(
      WHERE optimization_status='failed'
        AND CASE WHEN coalesce(metadata->>'optimization_attempts','') ~ '^\d+$'
          THEN (metadata->>'optimization_attempts')::int ELSE 0 END >= 3)
  ) FROM linked;
$$;
REVOKE ALL ON FUNCTION public.marketplace_image_failure_metrics() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_image_failure_metrics() TO service_role;

-- Keep the complete failure count for reporting, but use only retryable
-- failures for backlog-growth and retry-worker-stall detection. The guarded
-- rewrite avoids copying the large snapshot function and fails closed if its
-- expected anchors ever change.
DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.run_marketplace_quality_snapshot()'::regprocedure)
  INTO v_def;
  IF position('image_opt_retryable_failed' IN v_def)>0 THEN RETURN; END IF;

  v_next:=replace(v_def,
    E') INTO v_stats FROM l;\n  INSERT INTO public.marketplace_quality_snapshots',
    E') INTO v_stats FROM l;\n  v_stats:=v_stats||public.marketplace_image_failure_metrics();\n  INSERT INTO public.marketplace_quality_snapshots');
  v_next:=replace(v_next,$needle$('image_opt_failed')$needle$,
    $needle$('image_opt_retryable_failed')$needle$);
  v_next:=replace(v_next,$needle$(v_stats->>'image_opt_failed')::int>0$needle$,
    $needle$(v_stats->>'image_opt_retryable_failed')::int>0$needle$);

  IF v_next=v_def
     OR position('v_stats:=v_stats||public.marketplace_image_failure_metrics()' IN v_next)=0
     OR position($needle$('image_opt_retryable_failed')$needle$ IN v_next)=0
     OR position($needle$(v_stats->>'image_opt_retryable_failed')::int>0$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'marketplace quality snapshot anchors changed; refusing partial rewrite';
  END IF;
  EXECUTE v_next;
END;
$$;

SELECT public.sync_automations_to_cron(true);
