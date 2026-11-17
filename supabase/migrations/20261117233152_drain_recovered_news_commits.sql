-- Source recovery can finish quality before the reconciler clears its review.
-- Drain only existing machine publish verdicts, through the native committer.
do $migration$
declare definition text;previous text;replacement text;
begin
 select pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure)into definition;
 if position('news_recovered_commit_ready'in definition)>0 then return;end if;
 if position('matching.news_commit_staging_ids'in pg_get_functiondef('public.news_commit_staging_batch(uuid,uuid,integer)'::regprocedure))=0 then raise exception 'Scoped native committer required';end if;
 previous:='v_commit jsonb;';
 replacement:='v_commit jsonb; v_staging_ids uuid[]:=''{}''; v_commit_scope text; v_recovered_ready integer:=0;';
 if(length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Reconciler declaration changed';end if;
 definition:=replace(definition,previous,replacement);
 previous:='v_jobs:=array_append(v_jobs,r.job_id);';
 replacement:=previous||' v_staging_ids:=array_append(v_staging_ids,r.id);';
 if(length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Reconciler new-approval collection changed';end if;
 definition:=replace(definition,previous,replacement);
 previous:=substring(definition from '([[:space:]]if not p_dry_run then[[:space:]]+(--[^\n]*\n[[:space:]]*)?for v_job in select distinct j from unnest\(v_jobs\) j loop)');
 if previous is null or(length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Reconciler commit loop changed';end if;
 replacement:=$cohort$
 for r in select s.*from public.ingestion_staging s
  where s.target_table='news_articles'and s.source_name='rss-news'and s.disposition='pending'
   and s.job_id is not null and s.review_status in('auto','approved')
   and s.reviewed_by is null and s.reviewed_at is null
   and(s.review_notes is null or s.review_notes='auto-policy: apply completed quality gate publish; no human review claimed')
   and s.enrichment_status in('enriched','completed')
   and s.enriched_data#>>'{review_source_text_recovery,contract}'='news_source_text_recovery.v1'
   and s.enriched_data#>>'{review_source_text_recovery,status}'='recovered'
   and s.normalized_data#>>'{extraction_meta,recovery_contract}'='news_source_text_recovery.v1'
   and s.normalized_data#>>'{extraction_meta,applied}'='true'
   and api_private.review_news_machine_outcome(s.enriched_data)='publish'
   and exists(select 1 from public.news_quality_settings where id=1 and enabled)
   and not exists(select 1 from public.content_revisions cr where cr.source_table='ingestion_staging'and cr.source_id=s.id and cr.actor_kind='human')
  order by s.created_at,s.id limit greatest(0,v_limit-v_pass)for update of s skip locked
 loop
  v_recovered_ready:=v_recovered_ready+1;
  if not p_dry_run then
   v_jobs:=array_append(v_jobs,r.job_id);v_staging_ids:=array_append(v_staging_ids,r.id);
  end if;
 end loop;
$cohort$||replace(previous,'for v_job in',E'v_commit_scope:=current_setting(''matching.news_commit_staging_ids'',true);\n  perform set_config(''matching.news_commit_staging_ids'',(select coalesce(array_agg(id),''{}''::uuid[])::text from unnest(v_staging_ids)id\n   where nullif(v_commit_scope,'''')is null or id=any(nullif(v_commit_scope,'''')::uuid[])),true);\n  for v_job in');
 definition:=replace(definition,previous,replacement);
 previous:=substring(definition from 'end loop;[[:space:]]+update public.admin_automations set last_run_at=now\(\),last_run_status=');
 if previous is null or(length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Reconciler commit completion changed';end if;
 replacement:=replace(previous,'update public.admin_automations',E'perform set_config(''matching.news_commit_staging_ids'',coalesce(v_commit_scope,''''),true);\n  update public.admin_automations');
 definition:=replace(definition,previous,replacement);
 previous:='''news_committed'',v_committed,';
 replacement:=previous||'''news_recovered_commit_ready'',v_recovered_ready,';
 if(length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then raise exception 'Reconciler result changed';end if;
 execute replace(definition,previous,replacement);
end $migration$;
