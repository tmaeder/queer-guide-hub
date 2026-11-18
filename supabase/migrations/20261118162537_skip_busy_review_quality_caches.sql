-- Quality scanning updates cache rows without locking the corresponding event.
-- Avoid letting that unrelated cache writer consume a whole Review timeout.
-- Lock an existing cache version without waiting, skip its issue while busy,
-- and update only the exact locked version. Missing caches remain optional.
do $patch$
declare signature text; definition text; declaration text; counter text; update_anchor text; replacement text;
 cache_lock text:=$lock$v_review_cache_ctid:=null;
  select q.ctid into v_review_cache_ctid from public.event_quality_current q
   where q.event_id=r.event_id for update skip locked;
  if v_review_cache_ctid is null and exists(select 1 from public.event_quality_current q where q.event_id=r.event_id)
  then continue;end if;
  $lock$;
begin
 foreach signature in array array['api_private.run_review_automatic_resolution(integer,boolean)','public.repair_admin_review_mechanical(integer,boolean)']loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('v_review_cache_ctid tid;'in definition)>0 and position(cache_lock in definition)>0 then continue;end if;
  if signature like 'api_private.%'then
   declaration:='v_liveness integer:=0;';
   counter:='v_liveness:=v_liveness+1;';
   update_anchor:=E'where event_id=r.event_id;\n   insert into public.admin_review_repairs';
   replacement:=E'where event_id=r.event_id and ctid=v_review_cache_ctid;\n   insert into public.admin_review_repairs';
  else
   declaration:='v_neutral integer:=0;';
   counter:='v_neutral:=v_neutral+1;';
   update_anchor:='where event_id=r.event_id;';
   replacement:='where event_id=r.event_id and ctid=v_review_cache_ctid;';
  end if;
  if(length(definition)-length(replace(definition,declaration,'')))/length(declaration)<>1
   or(length(definition)-length(replace(definition,counter,'')))/length(counter)<>1
   or(length(definition)-length(replace(definition,update_anchor,'')))/length(update_anchor)<>1
  then raise exception 'Review cache update shape changed: %',signature;end if;
  definition:=replace(definition,declaration,'v_review_cache_ctid tid; '||declaration);
  definition:=replace(definition,counter,cache_lock||counter);
  definition:=replace(definition,update_anchor,replacement);
  execute definition;
 end loop;
end $patch$;
