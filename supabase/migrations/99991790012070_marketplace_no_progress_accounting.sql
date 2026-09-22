-- HTTP 200 is dispatch health, not data-pipeline progress. A run that examined
-- rows but changed or terminally handled none is a genuine no-progress failure;
-- the existing after-finish trigger pauses only after three consecutive errors.

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
  IF NEW.status='success' AND coalesce((v_body->>'items_failed')::int,(v_body->>'failed')::int,0)>0
     AND NEW.items_changed=0 THEN NEW.status:='error'; END IF;
  IF NEW.status='success' AND NEW.items_examined>0 AND NEW.items_changed=0
     AND coalesce((v_body->>'items_terminal')::int,0)=0 THEN
    NEW.status:='error';
    NEW.error:=coalesce(NEW.error,'worker examined rows but made no changed or terminal progress');
  END IF;
  RETURN NEW;
END;
$$;
