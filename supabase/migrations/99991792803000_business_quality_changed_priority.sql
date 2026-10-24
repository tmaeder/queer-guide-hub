-- Fresh source corrections must be reassessed before the daily stale backlog.
-- The existing eligibility, batch bound, producer lease and scoring are intact.
do $patch$
declare target regprocedure:='public.refresh_business_brand_quality()'::regprocedure;src text;code text;
 old_order text:='ORDER BY quality_checked_at NULLS FIRST,id LIMIT 2000';
 new_order text:='ORDER BY CASE WHEN updated_at>quality_checked_at THEN 0 WHEN quality_checked_at IS NULL THEN 1 ELSE 2 END,quality_checked_at NULLS FIRST,id LIMIT 2000';
begin
 src:=pg_get_functiondef(target);
 code:=regexp_replace(src,'--[^'||chr(10)||']*','','g');
 if(length(code)-length(replace(code,old_order,'')))/length(old_order)<>1 then
  raise exception 'Business quality priority selector changed';
 end if;
 execute replace(src,old_order,new_order);
 code:=regexp_replace(pg_get_functiondef(target),'--[^'||chr(10)||']*','','g');
 if position(new_order in code)=0 then raise exception 'Business quality priority patch missing';end if;
end $patch$;
