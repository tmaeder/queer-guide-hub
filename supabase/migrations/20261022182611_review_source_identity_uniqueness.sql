-- Do not pick an arbitrary approved article if legacy duplicate URLs exist.
do $patch$
declare s text; anchor text:='and a.quality_status=''passed'' and coalesce(cardinality(a.auto_publish_blocked_reasons),0)=0';
begin
 s:=pg_get_functiondef('api_private.recover_review_news_source(integer,boolean)'::regprocedure);
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Canonical recovery identity anchor changed'; end if;
 s:=replace(s,anchor,anchor||'
   and not exists(select 1 from public.news_articles other where other.url=a.url and other.source_id=a.source_id and other.id<>a.id)');
 execute s;
end $patch$;
