-- The snapshot is refreshed independently of staging reconciliation. Read the
-- live staging eligibility before showing a cached staging case.
-- Automation can also stop because a ready case explicitly requires a person.
do $worklist$
declare
  definition text := pg_get_viewdef('public.admin_review_case_worklist'::regclass, true);
  active_anchor text := 'WHERE c.active;';
  stage_anchor text := $anchor$WHEN a.status = 'blocked'::text THEN 'blocked'::text$anchor$;
begin
  if (length(definition)-length(replace(definition,active_anchor,'')))/length(active_anchor)<>1
    or (length(definition)-length(replace(definition,stage_anchor,'')))/length(stage_anchor)<>1 then
    raise exception 'Review worklist contract changed';
  end if;
  definition := replace(definition, active_anchor, $active$WHERE c.active
    AND (c.item->>'queue_type' IS DISTINCT FROM 'staging' OR EXISTS (
      SELECT 1 FROM public.triage_src_staging s
      WHERE s.id = (c.item->>'id')::uuid
    ));$active$);
  definition := replace(definition, stage_anchor, $stage$WHEN c.stage = 'ready'
      AND a.status = 'blocked'
      AND a.outcome->>'reason' IN ('visual_evidence_requires_human_review',
        'mandatory_human_publication_review','protected_review') THEN 'ready'
    WHEN a.status = 'blocked'::text THEN 'blocked'::text$stage$);
  execute 'CREATE OR REPLACE VIEW public.admin_review_case_worklist WITH (security_invoker=true) AS ' || definition;
end $worklist$;

-- Deep links use the same eligibility and stage as the list and its totals.
do $details$
declare
  definition text := pg_get_functiondef('api_private.get_admin_review_case_details(uuid)'::regprocedure);
  declare_anchor text := 'v_candidates jsonb;';
  read_anchor text := ' select * into j from public.admin_review_research_jobs where case_id=c.id and fingerprint=c.fingerprint;';
  stage_anchor text := $anchor$case when c.stage='ready' or j.outcome->>'decision_ready'='true' then 'ready' when j.status='blocked' then 'blocked' else 'research' end$anchor$;
begin
  if (length(definition)-length(replace(definition,declare_anchor,'')))/length(declare_anchor)<>1
    or (length(definition)-length(replace(definition,read_anchor,'')))/length(read_anchor)<>1
    or (length(definition)-length(replace(definition,stage_anchor,'')))/length(stage_anchor)<>1 then
    raise exception 'Review detail contract changed';
  end if;
  definition := replace(definition, declare_anchor, declare_anchor || ' v_work_stage text;');
  definition := replace(definition, read_anchor, $stage$
 select w.work_stage into v_work_stage from public.admin_review_case_worklist w where w.id=c.id;
 if not found then return null; end if;
$stage$ || read_anchor);
  execute replace(definition, stage_anchor, 'v_work_stage');
end $details$;
