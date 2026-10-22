-- A batch is a global commit budget, not a separate budget for every job.
-- Preserve the ordinary committer's ordering while bounding the combined work.
do $patch$
declare s text; anchor text:='public.news_commit_staging_batch(v_job,null,v_limit)';
begin
 s:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'News commit budget anchor changed'; end if;
 execute replace(s,anchor,'public.news_commit_staging_batch(v_job,null,
    least(v_limit,(select count(*)::integer from unnest(v_jobs) queued_job where queued_job=v_job)))');
end $patch$;
