-- Guard the alternate SQL score writer as well as the native commit RPC.
-- Latest unresolved/negative evidence must not fall back to an older positive.
-- Metadata propagation never deactivates a published listing from a model label.
do $$
declare a record;j record;old_command text;new_command text:=$sql$
  WITH latest AS MATERIALIZED (
    SELECT DISTINCT ON (s.target_record_id)
      s.target_record_id AS lid,s.classification_result AS c,s.disposition,s.review_status
    FROM public.ingestion_staging s
    JOIN public.marketplace_listings l ON l.id=s.target_record_id
    WHERE s.entity_type='marketplace' AND s.classification_result IS NOT NULL
      AND s.target_record_id IS NOT NULL AND l.lgbti_relevance_score IS NULL
    ORDER BY s.target_record_id,s.updated_at DESC,s.id
  ), cand AS (
    SELECT * FROM latest WHERE disposition='committed' AND review_status='approved'
      AND c @> '{"lgbti_relevant":true}'::jsonb
      AND c->>'routing_decision' IS DISTINCT FROM 'review'
      AND CASE WHEN jsonb_typeof(c->'lgbti_relevance_score')='number'
        THEN (c->>'lgbti_relevance_score')::numeric BETWEEN 0.7 AND 1 ELSE false END
    ORDER BY lid LIMIT 200
  )
  UPDATE public.marketplace_listings l SET
    lgbti_relevance_score=(cand.c->>'lgbti_relevance_score')::numeric,
    sensitivity_flags=coalesce(cand.c->'sensitivity_flags','[]'::jsonb),
    classified_at=now(),updated_at=now()
  FROM cand WHERE l.id=cand.lid AND l.lgbti_relevance_score IS NULL;
$sql$;
begin
 select id,slug,action into a from public.admin_automations where slug='mp_drain_propagate' for update;
 if not found then return;end if;
 old_command:=a.action->>'command';
 if old_command=new_command then return;end if;
 if old_command is null or position('WITH cand AS' in old_command)=0
  or position('l.lgbti_relevance_score IS NULL' in old_command)=0
  or position('UPDATE public.marketplace_listings' in old_command)=0 then
  raise exception 'Marketplace propagation command changed; inspect before guarding';end if;
 update public.admin_automations set action=jsonb_set(action,'{command}',to_jsonb(new_command)),updated_at=now() where id=a.id;
 for j in select jobid from cron.job where jobname=coalesce(a.action->>'jobname',a.slug) loop
  perform cron.alter_job(j.jobid,command=>public.admin_automation_effective_command(a.slug,new_command));
 end loop;
end $$;
