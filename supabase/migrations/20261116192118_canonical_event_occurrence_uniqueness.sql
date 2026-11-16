-- Merged rows retain source relationships for audit/undo. They cannot reserve a
-- canonical occurrence's unique venue slot after duplicate_of_id is assigned.
-- The old index already guarantees uniqueness for the new index's strict subset.
set local lock_timeout='5s';
drop index public.events_title_venue_start_unique;
create unique index events_title_venue_start_unique
 on public.events(lower(trim(title)),venue_id,start_date)
 where venue_id is not null and start_date is not null
  and status<>'archived' and duplicate_of_id is null;
comment on index public.events_title_venue_start_unique is
 'Canonical occurrence uniqueness: same title, venue and start; merged source rows are retained outside the active set.';

-- Keep the explicit admin collision check aligned with the database constraint.
do $patch$
declare definition text; anchor text:='and other.start_date=e.start_date and other.status<>''archived'') then';
begin
 definition:=pg_get_functiondef('api_private.admin_review_link_event_venue(text,uuid,uuid,timestamptz,text)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'Venue review collision guard changed; inspect before patching';
 end if;
 execute replace(definition,anchor,'and other.start_date=e.start_date and other.status<>''archived'' and other.duplicate_of_id is null) then');
end $patch$;
