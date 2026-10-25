-- Filter source records for the current venue before expensive capture validation.
-- The SQL planner may otherwise hoist validation across unrelated Overture rows.
do $patch$
declare target regprocedure:='public.organization_facts_only_source(uuid)'::regprocedure;src text;
 anchor text:='not exists(select 1 from public.venue_sources supplement where supplement.venue_id=v.id and supplement.source_slug=''overture'' and not api_private.overture_phone_source_is_contact_only(supplement))';
 replacement text:='not exists(with matching_supplements as materialized(select source_row as source_record from public.venue_sources source_row where source_row.venue_id=v.id and source_row.source_slug=''overture'') select 1 from matching_supplements where not api_private.overture_phone_source_is_contact_only(source_record))';
begin
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Contact supplement validation anchor changed';end if;
 execute replace(src,anchor,replacement);
end $patch$;
