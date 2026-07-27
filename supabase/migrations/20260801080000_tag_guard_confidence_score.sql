-- ============================================================================
-- Follow-up to 20260801070000: add confidence_score to the derived-column set.
--
-- Running run_tag_quality_recompute() against production after 070000 shipped
-- showed the guard still raising: that job's UPDATE writes four columns —
-- quality_score, quality_breakdown, last_quality_at AND confidence_score —
-- and only the first three were allowlisted.
--
-- confidence_score is derived, not curated: run_tag_quality_recompute computes
-- it from verification_status, wikidata_id/wikipedia_url and the presence of
-- tag_sources rows. It *reads* human_reviewed (a reviewed tag scores 1.0), so
-- it sits downstream of human curation rather than being an input to it —
-- exactly the bookkeeping shape the allowlist is for. Every genuinely curated
-- column stays protected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_unified_tag_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor TEXT := COALESCE(current_setting('app.actor', true), 'system:trigger');
  -- Recomputed by scheduled jobs, never human-curated.
  v_derived CONSTANT text[] := ARRAY[
    'usage_count', 'updated_at',
    'quality_score', 'quality_breakdown', 'last_quality_at', 'confidence_score'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.human_reviewed = TRUE
       AND v_actor LIKE 'system:%'
       AND (to_jsonb(NEW) - v_derived) IS DISTINCT FROM (to_jsonb(OLD) - v_derived) THEN
      RAISE EXCEPTION 'human_reviewed tag % cannot be modified by %', OLD.id, v_actor;
    END IF;
    INSERT INTO tag_change_log(tag_id, action_type, before_data, after_data, actor)
      VALUES (OLD.id, 'update', to_jsonb(OLD), to_jsonb(NEW), v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO tag_change_log(tag_id, action_type, before_data, actor)
      VALUES (OLD.id, 'delete', to_jsonb(OLD), v_actor);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO tag_change_log(tag_id, action_type, after_data, actor)
      VALUES (NEW.id, 'create', to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;
