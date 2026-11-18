-- Prepared during the coordinated production migration hold.
-- Not applied. Copy to a newly numbered migration only after the hold is released.
-- Existing native proof gates remain authoritative, including human-review holds.
do $patch$
declare definition text; patched text;
  anchor text := E'      or nullif(btrim(e.venue_name), '''') is null\n    );';
  addition text := E'      or nullif(btrim(e.venue_name), '''') is null\n      or api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance)\n    );';
  old_resolution text := 'case when e.venue_id is not null then ''venue_linked'' else ''event_no_longer_actionable'' end';
  new_resolution text := 'case when e.venue_id is not null then ''venue_linked'' when api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance) then ''verified_nonfixed_location'' else ''event_no_longer_actionable'' end';
begin
  definition := pg_get_functiondef('public.reconcile_event_venue_link_reviews()'::regprocedure);
  if position(new_resolution in definition)>0 and position(addition in definition)>0 then return; end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    or (length(definition)-length(replace(definition,old_resolution,'')))/length(old_resolution)<>1 then
    raise exception 'Event venue review reconciliation changed; inspect before applying';
  end if;
  patched:=replace(replace(definition,anchor,addition),old_resolution,new_resolution);
  execute patched;
end $patch$;
