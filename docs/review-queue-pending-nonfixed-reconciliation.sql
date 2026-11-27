-- Reference copy promoted after the coordinated migration hold was released.
-- Authoritative migration: supabase/migrations/99991795038004_review_pending_nonfixed_manual_holds.sql
do $patch$
declare raw_definition text := pg_get_functiondef('public.reconcile_event_venue_link_reviews()'::regprocedure);
  definition text; patched text;
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
  definition := regexp_replace(raw_definition, '--[^' || chr(10) || ']*', '', 'g');
  patched:=raw_definition;
  if not (position(new_resolution in definition)>0 and position(addition in definition)>0) then
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
      or (length(definition)-length(replace(definition,old_resolution,'')))/length(old_resolution)<>1 then
      raise exception 'Event venue review reconciliation changed; inspect before applying';
    end if;
    patched:=replace(replace(raw_definition,anchor,addition),old_resolution,new_resolution);
  end if;
  if position(guarded_queue in definition)=0 then
    if (length(definition)-length(replace(definition,queue_anchor,'')))/length(queue_anchor)<>1 then
      raise exception 'Event venue closing predicate changed; inspect before applying';
    end if;
    patched:=replace(patched,queue_anchor,guarded_queue);
  end if;
  if patched=raw_definition then return; end if;
  execute patched;
end $patch$;
