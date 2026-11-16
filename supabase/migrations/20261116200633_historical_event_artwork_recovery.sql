-- Recovered from production migration history. Already applied; do not renumber.
-- Recorded statement digest (MD5): 8eb83841c4155093b5d954383642b566
-- The source-owned original extractor already verifies the dated Event and
-- cover dimensions. Its queue excluded completed events, stranding thumbnails.
-- Expand only the image lane for untouched, publisher-owned gay.ch thumbnails.
do $migration$
declare src text; finish_src text; metrics_src text;
 history text:=$history$(p_lane='image' and e.status='completed' and e.data_source='gay-ch'
  and e.created_by is null and e.field_provenance->'images' is null
  and cardinality(e.images)=1 and exists(select from public.event_sources hs
   where hs.event_id=e.id and hs.source_slug='gay-ch'
    and hs.source_url like 'https://gay.ch/parties/%'
    and e.images[1] like hs.source_url||'/@@images/%'))$history$;
 date_guard text:='(coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)';
 finish_guard text:=$guard$if e.duplicate_of_id is not null or e.status is distinct from 'active'
   or (coalesce(e.end_date,e.start_date)<now()) then$guard$;
 metrics_guard text:=$guard$e.status='active' and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)$guard$;
begin
 src:=pg_get_functiondef('public.claim_event_gaps(text,uuid,integer,uuid[],boolean)'::regprocedure);
 if position('hs.source_slug' in src)>0 then return;end if;
 if (length(src)-length(replace(src,$s$e.status='active'$s$,'')))/length($s$e.status='active'$s$)<>3
  or (length(src)-length(replace(src,date_guard,'')))/length(date_guard)<>3
  or (length(src)-length(replace(src,'order by case when e.start_date','')))/length('order by case when e.start_date')<>2 then
  raise exception 'Gap claim changed; inspect before patching';end if;
 src:=replace(src,$s$e.status='active'$s$,$s$(e.status='active' or $s$||history||')');
 src:=replace(src,date_guard,'('||date_guard||' or '||history||')');
 src:=replace(src,'order by case when e.start_date',
  $s$order by case when e.status='completed' then 1 else 0 end, case when e.start_date$s$);
 execute src;

 finish_src:=pg_get_functiondef('public.finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb)'::regprocedure);
 if position(finish_guard in finish_src)=0 then raise exception 'Gap finish changed; inspect before patching';end if;
 finish_src:=replace(finish_src,finish_guard,
  $s$if e.duplicate_of_id is not null or not ((e.status='active' and $s$||date_guard||') or '||history||') then');
 execute finish_src;

 metrics_src:=pg_get_functiondef('public.event_gap_metrics()'::regprocedure);
 if position(metrics_guard in metrics_src)=0 then raise exception 'Gap metrics changed; inspect before patching';end if;
 -- Only the first occurrence belongs to the tracked queue and has q in scope.
 metrics_src:=overlay(metrics_src placing '('||metrics_guard||' or '||replace(history,'p_lane','q.lane')||')'
  from position(metrics_guard in metrics_src) for length(metrics_guard));
 execute metrics_src;
end $migration$;
;

