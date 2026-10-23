-- A good poster may already occur later in the gallery. Promoting it must
-- retain it once, rather than prepending a second copy to the same gallery.
-- Keep the existing lease, lifecycle, URL and previous-images guards intact.
do $migration$
declare target regprocedure;src text;anchor text;replacement text;
begin
 target:=coalesce(to_regprocedure('api_private.finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb)'),
  to_regprocedure('public.finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb)'));
 src:=pg_get_functiondef(target);
 anchor:=$anchor$select u from unnest(coalesce(e.images,'{}')) u where not exists($anchor$;
 replacement:=$replacement$select u from unnest(coalesce(e.images,'{}')) u
        where not (p_patch->'images' @> jsonb_build_array(u)) and not exists($replacement$;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then
  raise exception 'Unexpected event image completion definition';
 end if;
 execute replace(src,anchor,replacement);
end $migration$;

