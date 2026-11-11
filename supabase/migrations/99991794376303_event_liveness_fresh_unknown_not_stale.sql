-- A successful attempt can be fresh even when the remote source blocks the
-- server-side probe. Keep `unknown` as a freshness-score penalty, but do not
-- label a check performed within the seven-day SLO as stale.

do $migration$
declare
  v_definition text;
  v_old text := 'and (last_verified_at is null or last_verified_at<now()-interval ''7 days'' or liveness_status=''unknown'')';
  v_new text := 'and (last_verified_at is null or last_verified_at<now()-interval ''7 days'')';
begin
  select pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure)
    into v_definition;

  if position(v_old in v_definition) = 0 then
    if position(v_new in v_definition) > 0 then
      return;
    end if;
    raise exception 'event_quality_findings liveness predicate has an unexpected shape';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;

comment on function public.event_quality_findings(uuid) is
  'Returns rubric findings for one canonical event. A fresh inconclusive liveness probe remains score-penalised but is not classified as stale.';
