-- A venue may use a different name in the catalogue, especially when a
-- publisher names a room. Include street-address evidence in the comparison.
do $patch$
declare
  definition text:=pg_get_functiondef('api_private.get_event_venue_review_context(uuid,text)'::regprocedure);
  change record;
begin
  for change in select * from (values
    ($old$declare e public.events; result jsonb;$old$,
     $new$declare e public.events; result jsonb; event_street text;$new$),
    ($old$ select * into strict e from public.events where id=p_event_id;$old$,
     $new$ select * into strict e from public.events where id=p_event_id;
 if e.address ~ '^[[:space:]]*[0-9]+[[:alnum:]-]*[[:space:]]+[[:alpha:]]' then
   event_street:=btrim(regexp_replace(public.city_canonical_key(e.address),'[^[:alnum:]]+',' ','g'));
 end if;$new$),
    ($old$    public.normalize_name(v.name)=public.normalize_name(e.venue_name) name_exact,$old$,
     $new$    public.normalize_name(v.name)=public.normalize_name(e.venue_name) name_exact,
    street.overlaps street_address_overlap,$new$),
    ($old$   from public.venues v where v.city_id=e.city_id$old$,
     $new$   from public.venues v
   cross join lateral (
    select btrim(regexp_replace(public.city_canonical_key(v.address),'[^[:alnum:]]+',' ','g')) as key
   ) address_key
   cross join lateral (
    select coalesce(event_street is not null
      and v.address ~ '^[[:space:]]*[0-9]+[[:alnum:]-]*[[:space:]]+[[:alpha:]]'
      and (starts_with(address_key.key||' ',event_street||' ')
        or starts_with(event_street||' ',address_key.key||' ')),false) as overlaps
   ) street
   where v.city_id=e.city_id$new$),
    ($old$      else extensions.similarity(public.normalize_name(v.name),public.normalize_name(e.venue_name))>=0.35 end$old$,
     $new$      else street.overlaps or extensions.similarity(public.normalize_name(v.name),public.normalize_name(e.venue_name))>=0.35 end$new$),
    ($old$   order by (public.normalize_name(v.name)=public.normalize_name(e.venue_name)) desc,
    extensions.similarity(public.normalize_name(v.name),public.normalize_name(e.venue_name)) desc,v.id limit 20$old$,
     $new$   order by (public.normalize_name(v.name)=public.normalize_name(e.venue_name)) desc nulls last,
    street.overlaps desc,extensions.similarity(public.normalize_name(v.name),public.normalize_name(e.venue_name)) desc nulls last,
    v.id limit 20$new$)
  ) changes(before_text,after_text) loop
    if (length(definition)-length(replace(definition,change.before_text,'')))/length(change.before_text)<>1 then
      raise exception 'Venue comparison contract changed';
    end if;
    definition:=replace(definition,change.before_text,change.after_text);
  end loop;
  execute definition;
end $patch$;
