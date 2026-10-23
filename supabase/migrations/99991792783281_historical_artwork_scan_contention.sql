-- A concurrent repair can temporarily hold the source contract's lease. Do
-- not create a missing-artwork finding and mark that event fully assessed
-- while its eligible source outcome has been deferred by that lease/row lock.
do $contention$
declare target regprocedure;src text;declaration text:='v_just_resolved int:=0;';
 old_prepare text:=$old$if auth.uid()is null then
      perform public.reconcile_historical_graph_artwork(1,p_dry_run,array[r.id]);
    end if;$old$;
begin
 target:=coalesce(to_regprocedure('api_private.run_event_quality_scan(integer,text,boolean)'),
  to_regprocedure('public.run_event_quality_scan(integer,text,boolean)'));
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,declaration,'')))/length(declaration)<>1
  or(length(src)-length(replace(src,old_prepare,'')))/length(old_prepare)<>1 then
  raise exception 'Historical artwork preparation anchor changed';end if;
 src:=replace(src,declaration,declaration||' v_artwork_preparation jsonb;');
 src:=replace(src,old_prepare,$new$if auth.uid()is null and api_private.historical_graph_artwork_scope(r.id)is not null then
      v_artwork_preparation:=public.reconcile_historical_graph_artwork(1,p_dry_run,array[r.id]);
      if coalesce((v_artwork_preparation->>'skipped')::boolean,false)
        or coalesce((v_artwork_preparation->>'events_examined')::integer,0)=0 then continue;end if;
    end if;$new$);
 execute src;
end $contention$;
