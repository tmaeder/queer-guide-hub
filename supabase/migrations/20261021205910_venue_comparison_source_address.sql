-- Keep the source street address beside live catalogue candidates.
-- This extends an admin-only read response; access and write behavior are unchanged.
do $patch$
declare src text; target regprocedure;
 before_text text:='''source_url'',coalesce(e.website,e.ticket_url)';
 after_text text:='''address'',e.address,''source_url'',coalesce(e.website,e.ticket_url)';
begin
 target:=coalesce(to_regprocedure('api_private.get_event_venue_review_context(uuid,text)'),'public.get_event_venue_review_context(uuid,text)'::regprocedure);
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,before_text,'')))/length(before_text)<>1 then
  raise exception 'Venue comparison source address anchor changed'; end if;
 execute replace(src,before_text,after_text);
end $patch$;
