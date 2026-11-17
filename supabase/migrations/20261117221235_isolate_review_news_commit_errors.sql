-- Declared native row failures must remain durable and isolated.
-- Unexpected exceptions still fail the run; no publication gate changes.
do $migration$
declare definition text;previous text;replacement text;
begin
 select pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure) into definition;
 if position('news_commit_failed_jobs' in definition)>0 then return;end if;
 previous:=$old0$v_commit jsonb;$old0$;
 replacement:=$new0$v_commit jsonb; v_commit_errors integer:=0; v_failed_jobs jsonb:='[]';$new0$;
 if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Unexpected reconciler anchor 0; inspect before replacing';end if;
 definition:=replace(definition,previous,replacement);
 previous:=$old1$if coalesce((v_commit->>'errors')::integer,0)>0 then raise exception 'Native news commit failed: %',v_commit; end if;$old1$;
 replacement:=$new1$if coalesce((v_commit->>'errors')::integer,0)>0 then
    -- Native row failures already have durable staging diagnostics. Keep them
    -- visible without rolling back unrelated repairs or successful articles.
    v_commit_errors:=v_commit_errors+(v_commit->>'errors')::integer;
    v_failed_jobs:=v_failed_jobs||jsonb_build_array(jsonb_build_object('job_id',v_job,'errors',(v_commit->>'errors')::integer));
   end if;$new1$;
 if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Unexpected reconciler anchor 1; inspect before replacing';end if;
 definition:=replace(definition,previous,replacement);
 previous:=$old2$v_committed:=v_committed+coalesce((v_commit->>'inserted')::integer,0)+coalesce((v_commit->>'updated')::integer,0);$old2$;
 replacement:=$new2$-- Counters can include an insert later rolled back by a native row
   -- subtransaction. Details are appended only after a complete row succeeds.
   v_committed:=v_committed+(select count(*)::integer from jsonb_array_elements(v_commit->'details') d
     where d->>'action' in ('inserted','updated'));$new2$;
 if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Unexpected reconciler anchor 2; inspect before replacing';end if;
 definition:=replace(definition,previous,replacement);
 previous:=$old3$last_run_status='success' where slug='review_automatic_resolution';$old3$;
 replacement:=$new3$last_run_status=case when v_commit_errors>0 then 'partial' else 'success' end where slug='review_automatic_resolution';$new3$;
 if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Unexpected reconciler anchor 3; inspect before replacing';end if;
 definition:=replace(definition,previous,replacement);
 previous:=$old4$'news_committed',v_committed,$old4$;
 replacement:=$new4$'news_committed',v_committed,'news_commit_errors',v_commit_errors,'news_commit_failed_jobs',v_failed_jobs,$new4$;
 if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Unexpected reconciler anchor 4; inspect before replacing';end if;
 definition:=replace(definition,previous,replacement);
 execute definition;
end $migration$;
