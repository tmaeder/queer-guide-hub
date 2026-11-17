-- Optional backend transaction scope can only narrow native eligible rows.
do $migration$
declare definition text;previous text;replacement text;
begin
 select pg_get_functiondef('public.news_commit_staging_batch(uuid,uuid,integer)'::regprocedure)into definition;
 if position('matching.news_commit_staging_ids'in definition)>0 then return;end if;
 previous:='WHERE job_id = p_job_id AND target_table = ''news_articles'' AND disposition = ''pending''';
 replacement:=previous||E'\n       AND (nullif(current_setting(''matching.news_commit_staging_ids'',true),'''') is null\n         OR id=ANY(nullif(current_setting(''matching.news_commit_staging_ids'',true),'''')::uuid[]))';
 if(length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Native news selection anchor changed';end if;
 execute replace(definition,previous,replacement);
end $migration$;
