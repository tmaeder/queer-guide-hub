-- Liveness cleanup must not run unrelated venue/artwork/source detectors.
-- Preserve the detector's exact freshness predicate and every review gate.
do $patch$
declare definition text:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 detector text:=pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure);
 anchor1 text:='not exists(select 1 from public.event_quality_findings(i.event_id) f where f.issue_code=i.issue_code)';
 anchor2 text:='not exists(select 1 from public.event_quality_findings(r.event_id) f where f.issue_code=''LIVENESS_STALE'')';
 predicate text:=$predicate$not coalesce(coalesce(e.end_date,e.start_date)>=now()
   and coalesce(e.status,'active')='active'
   and(e.website is not null or e.ticket_url is not null)
   and(e.last_verified_at is null or e.last_verified_at<now()-interval '7 days'),false)$predicate$;
begin
 if position($detector$from e where event_scope='current' and coalesce(status,'active')='active'
        and (website is not null or ticket_url is not null)
        and (last_verified_at is null or last_verified_at<now()-interval '7 days')$detector$in detector)=0
 or position($scope$case when coalesce(ev.end_date,ev.start_date) >= now() then 'current' else 'historical' end$scope$in detector)=0
 then raise exception 'Liveness detector changed; inspect before optimizing';end if;
 if position(anchor1 in definition)=0 and position(anchor2 in definition)=0
  and position(predicate in definition)>0 then return;end if;
 if (length(definition)-length(replace(definition,anchor1,'')))/length(anchor1)<>1
 or (length(definition)-length(replace(definition,anchor2,'')))/length(anchor2)<>1
 then raise exception 'Unexpected liveness cleanup definition';end if;
 definition:=replace(definition,anchor1,predicate);
 definition:=replace(definition,anchor2,'exists(select 1 from public.events e where e.id=r.event_id and '||predicate||')');
 execute definition;
end $patch$;
