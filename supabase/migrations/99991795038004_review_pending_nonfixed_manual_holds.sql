-- 99991795038004_review_pending_nonfixed_manual_holds.sql
-- Resolve source-verified nonfixed venue cases while preserving human holds in every closing path.
-- Function ownership, grants, security and unrelated behavior remain unchanged.
do $patch$
declare definition text; patched text; code_definition text; code_patched text;
  anchor text := E'      or nullif(btrim(e.venue_name), '''') is null\n    );';
  addition text := E'      or nullif(btrim(e.venue_name), '''') is null\n      or api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance)\n    );';
  old_resolution text := 'case when e.venue_id is not null then ''venue_linked'' else ''event_no_longer_actionable'' end';
  new_resolution text := 'case when e.venue_id is not null then ''venue_linked'' when api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance) then ''verified_nonfixed_location'' else ''event_no_longer_actionable'' end';
  queue_anchor text := E'    and r.status = ''pending''\n    and (';
  guarded_queue text := $guard$    and r.status = 'pending'
    and r.resolved_by is null and r.resolved_at is null
    and not (coalesce(r.details, '{}'::jsonb) ?| array[
      'manual_hold','manual_review_required','requires_confirm','force_review','human_reviewed'])
    and coalesce(r.details->>'hard_blocker','false') <> 'true'
    and not exists (
      select 1 from public.event_quality_issues i
      where i.event_id=e.id and i.issue_code='NAMED_VENUE_UNLINKED'
        and (i.reviewed_by is not null or i.status='open' and
          (i.reviewed_at is not null or i.resolved_at is not null or i.resolution is not null
            or coalesce(i.evidence, '{}'::jsonb) ?| array[
              'manual_hold','manual_review_required','governance_resolution']
            or i.evidence->>'hard_blocker'='true'))
    )
    and ($guard$;
begin
  definition := pg_get_functiondef('public.reconcile_event_venue_link_reviews()'::regprocedure);
  -- Inspect executable text; retain the original definition for replacement.
  code_definition:=regexp_replace(pg_get_functiondef('public.reconcile_event_venue_link_reviews()'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  patched:=definition;
  if not (position(new_resolution in code_definition)>0 and position(addition in code_definition)>0) then
    if (length(code_definition)-length(replace(code_definition,anchor,'')))/length(anchor)<>1
      or (length(code_definition)-length(replace(code_definition,old_resolution,'')))/length(old_resolution)<>1 then
      raise exception 'Event venue review reconciliation changed; inspect before applying';
    end if;
    patched:=replace(replace(definition,anchor,addition),old_resolution,new_resolution);
  end if;
  code_patched:=regexp_replace(patched, '--[^' || chr(10) || ']*', '', 'g');
  if position(guarded_queue in code_patched)=0 then
    if (length(code_patched)-length(replace(code_patched,queue_anchor,'')))/length(queue_anchor)<>1 then
      raise exception 'Event venue closing predicate changed; inspect before applying';
    end if;
    patched:=replace(patched,queue_anchor,guarded_queue);
  end if;
  if patched=definition then return; end if;
  execute patched;
end $patch$;
