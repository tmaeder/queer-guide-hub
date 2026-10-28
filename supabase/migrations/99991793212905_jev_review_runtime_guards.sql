-- Correct runtime alias ambiguity and reject missing or out-of-range model evidence.
-- Jev images are explicitly experimental; visual judgments remain visible for a person.
create or replace function api_private.jev_context(p_case uuid,p_lock boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.admin_review_cases; q text;t text;s jsonb;e jsonb;rel jsonb:='{}';rawrel jsonb:='{}';
 candidates jsonb:='[]';urls jsonb;blocker text;entity_table text;source_table text;full_input jsonb;research jsonb;
begin
 select * into c from public.admin_review_cases where id=p_case and active;
 if not found then raise exception 'Case is no longer active' using errcode='40001';end if;
 q:=c.item->>'queue_type';
 -- Consent, private membership and mandatory human publication gates are not factual model decisions.
 if q=any(array['group-requests','moderation','submissions','automation','feedback','trip-geography']) then blocker:='private_consent_or_moderation';
 elsif q=any(array['content','sensitive-tags','tag-editorial','tag-restoration','brand-ownership','venue-kind','personality-publication','editorial']) then blocker:='mandatory_human_publication_review';end if;
 if c.family='artwork' then blocker:='visual_evidence_requires_human_review';end if;
 if blocker is not null then return jsonb_build_object('item',jsonb_build_object('queue_type',q),'record',null,'proposal',null,'related','{}'::jsonb,'candidates','[]'::jsonb,'urls','[]'::jsonb,'input_hash',md5(c.fingerprint),'blocker',blocker);end if;
 select coalesce(r.lock_table,case
 when q in ('quality-city','quality-venue','quality-village','quality-personality','quality-marketplace','quality-tag','quality-other') then 'entity_review_queue'
 when q in ('tag-enrichment','ai-suggestions') then 'ai_suggestions'
 when q='dedup-review' then 'dedup_review_queue' when q='event-quality' then 'event_quality_issues'
 when q='milestone-review' then 'milestone_review_queue' when q='milestone-links' then 'milestone_link_proposals'
 when q='milestone-duplicates' then 'milestone_duplicate_candidates' when q='entity-links' then 'entity_link_review'
 when q='staging' then 'ingestion_staging' when q='duplicates' then 'scraper_dedupe_decisions'
 when q='news-quality' then 'news_articles' when q='tags' then 'tag_suggestions' end)
 into source_table from public.admin_review_sources r where queue_key=q and active;
 s:=api_private.jev_record(source_table,(c.item->>'id')::uuid,p_lock);
 entity_table:=c.item->>'entity_table';
 entity_table:=case entity_table when 'venue' then 'venues' when 'city' then 'cities' when 'country' then 'countries' when 'event' then 'events' when 'organization' then 'organizations' else entity_table end;
 e:=api_private.jev_record(entity_table,nullif(c.item->>'entity_id','')::uuid,p_lock);
 select outcome into research from public.admin_review_research_jobs where case_id=c.id and fingerprint=c.fingerprint;
 if q='staging' then
 -- Only source content projections, never raw scraped metadata or user submissions.
 rel:=jsonb_build_object('normalized',api_private.jev_public_record(s->'normalized_data'),'enriched',api_private.jev_public_record(s->'enriched_data'));
 s:=s-'raw_data'-'normalized_data'-'enriched_data' || jsonb_build_object('source_content',rel);
 end if;
 if entity_table='events' then
 select jsonb_build_object('publisher_sources',coalesce(jsonb_agg(jsonb_build_object('source_url',z.source_url,'captured',api_private.jev_public_record(coalesce(z.payload->'raw',z.payload->'normalized')))),'[]')) into rawrel from(select source_url,payload from public.event_sources where event_id=(c.item->>'entity_id')::uuid order by id limit 2)z;
 end if;
 if q='org-link-review' then rawrel:=jsonb_build_object('organization',api_private.jev_record('organizations',nullif(s->>'organization_id','')::uuid,p_lock));
 elsif q in ('dedup-review','tag-merges') then
 t:=case when q='tag-merges' then 'unified_tags' when s->>'entity_type'='venue' then 'venues' when s->>'entity_type'='city' then 'cities' else null end;
 rawrel:=jsonb_build_object('canonical',api_private.jev_record(t,coalesce(nullif(s->>'keep_id',''),nullif(s->>'canonical_id',''))::uuid,p_lock),'duplicate',api_private.jev_record(t,coalesce(nullif(s->>'drop_id',''),nullif(s->>'duplicate_id',''))::uuid,p_lock));
 elsif q='milestone-duplicates' then rawrel:=jsonb_build_object('first',api_private.jev_record('milestones',(s->>'milestone_id_1')::uuid,p_lock),'second',api_private.jev_record('milestones',(s->>'milestone_id_2')::uuid,p_lock));
 end if;
 select coalesce(jsonb_object_agg(key,case when key='publisher_sources' then value else api_private.jev_public_record(value) end),'{}') into rel from jsonb_each(rawrel);
 rel:=rel||jsonb_build_object('location',jsonb_build_object('city',(select name from public.cities where id=(e->>'city_id')::uuid),'country',(select name from public.countries where id=(e->>'country_id')::uuid)));
 full_input:=jsonb_build_object('case_fingerprint',c.fingerprint,'members',c.members,'source',s,'record',e,'related',rawrel,'research',research);
 if q in ('geography','business-quality','cms-issues','general-review') then
 candidates:=jsonb_build_array(jsonb_build_object('id','recheck','action','recheck','payload','{}'::jsonb,'explanation','Re-run the existing invariant checker. Resolve only if the actual defect is gone; otherwise keep researching.'));
 elsif q='event-quality' then
 if c.item#>>'{meta,issue_code}'='CATEGORY_UNRESOLVED' then
 select jsonb_agg(jsonb_build_object('id','category_'||x,'action','approve','payload',jsonb_build_object('event_type',x),'explanation','Set the explicit source-supported activity category to '||x)) into candidates
 from unnest(array['party','drag','concert','festival','pride','workshop','social','sports','art','theatre','film','comedy','karaoke','bingo','meetup','other'])x;
 elsif c.item#>>'{meta,issue_code}' in ('DESCRIPTION_REUSED','IMAGE_REUSED','IMAGE_CONTENT_REUSED') then
 candidates:=jsonb_build_array(jsonb_build_object('id','accept_series_reuse','action','reject','payload','{}'::jsonb,'explanation','Accept legitimate reuse for the same verified recurring programme; preserve every independent date, image, venue and completeness finding.'));
 else candidates:=jsonb_build_array(jsonb_build_object('id','recheck','action','recheck','payload','{}'::jsonb,'explanation','Recheck the actual invariant, never waive it.'));end if;
 elsif q='liveness' then
 candidates:=jsonb_build_array(jsonb_build_object('id','reject','action','reject','payload','{}'::jsonb,'explanation','Retain the exact entity because current source evidence establishes it is operating. A dead URL alone is not evidence either way.'));
 else
 candidates:=jsonb_build_array(jsonb_build_object('id','reject','action','reject','payload','{}'::jsonb,'explanation','Reject this demonstrably invalid or contradicted proposal, preserving the existing record and its other quality findings.'));
 if q not in ('entity-links','duplicates','tags','news-quality','tag-enrichment','ai-suggestions') and s is not null then
 candidates:=candidates||jsonb_build_array(jsonb_build_object('id','approve','action','approve','payload','{}'::jsonb,'explanation','Apply exactly the existing proposal after its identity, field values and relationship are corroborated by source evidence.'));
 end if;
 -- Staging approval cannot promote or publish around the pipeline quality gate.
 if q='staging' and api_private.review_news_machine_outcome((select enriched_data from public.ingestion_staging where id=(c.item->>'id')::uuid))='publish' then
 candidates:=candidates||jsonb_build_array(jsonb_build_object('id','approve','action','approve','payload','{}'::jsonb,'explanation','Approve the existing completed passing publication gate; retain the native commit pipeline and duplicate guards.'));end if;
 end if;
 -- Bounded canonical venue candidates; exact identities are revalidated again when applied.
 if c.family='venue' and e->>'venue_id' is null then
 select coalesce(jsonb_agg(to_jsonb(v)),'[]') into rawrel from(select v.id,v.name,v.address,v.website,v.city_id,v.country_id from public.venues v
 where v.city_id=(e->>'city_id')::uuid and v.country_id=(e->>'country_id')::uuid and v.duplicate_of_id is null and v.closed_at is null
 and (lower(btrim(v.name))=lower(btrim(e->>'venue_name')) or v.id::text in(select x->>'id'from jsonb_array_elements(coalesce(research->'candidates','[]'))x))order by v.id limit 5)v;
 rel:=rel||jsonb_build_object('venue_candidates',rawrel);
 full_input:=full_input||jsonb_build_object('venue_candidates',rawrel);
 select coalesce(jsonb_agg(jsonb_build_object('id','venue_'||(x->>'id'),'action','approve','payload',jsonb_build_object('venue_id',x->>'id'),
 'explanation','Link the event to '||(x->>'name')||' at '||coalesce(x->>'address','unknown address')||' only if publisher evidence establishes this exact canonical venue.')),'[]')into candidates from jsonb_array_elements(rawrel)x;
 end if;
 if q='general-review' and c.item#>>'{meta,review_type}'='date_mismatch' then
 candidates:=jsonb_build_array(jsonb_build_object('id','retain_current_date','action','reject','payload','{}'::jsonb,
 'explanation','Reject the conflicting extraction ONLY if live publisher evidence for this exact occurrence confirms the current stored start date, including year and local date. Do not reject because the source is unavailable.'));
 end if;
 -- Never overwrite protected review or infer a safety-critical field.
 if q like 'quality-%' and s is not null and public._review_risk_blocked(s->>'entity_type',s->>'field',(s->>'entity_id')::uuid) then
 select jsonb_agg(x) into candidates from jsonb_array_elements(candidates)x where x->>'action'<>'approve';end if;
 select coalesce(jsonb_agg(distinct x),'[]') into urls from (
 select jsonb_path_query(jsonb_build_object('record',api_private.jev_public_record(e),'proposal',api_private.jev_public_record(s),'related',rel,'meta',c.item->'meta'),'strict $.**.url')x
 union all select jsonb_path_query(rel,'strict $.**.source_url')
 union all select jsonb_path_query(s->'source_content','strict $.**.url')
 union all select jsonb_path_query(s->'source_content','strict $.**.source_url')
 union all select to_jsonb(e->>'website') where e->>'website' ~ '^https?://'
 union all select to_jsonb(e->>'source_url') where e->>'source_url' ~ '^https?://'
 union all select to_jsonb(c.item#>>'{meta,details,page}') where c.item#>>'{meta,details,page}' ~ '^https?://'
 )u where jsonb_typeof(x)='string' and x#>>'{}' ~ '^https?://';
 return jsonb_build_object('item',c.item-'reporter_id','record',api_private.jev_public_record(e),'proposal',api_private.jev_public_record(s),'related',rel,
 'research',research,'candidates',coalesce(candidates,'[]'),'urls',urls,'input_hash',md5(full_input::text));
end $$;

create or replace function public.finish_jev_review_job(p_case_id uuid,p_lease_token uuid,p_input_hash text,p_result jsonb,p_evidence jsonb default '[]',p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.admin_review_automation_jobs;c public.admin_review_cases;ctx jsonb;after_ctx jsonb;k jsonb;a jsonb;n text;threshold numeric;
 selected text;note text;result jsonb;v_reason text;v_status text;attempt integer;
begin
 perform api_private.assert_jev_internal();
 select * into j from public.admin_review_automation_jobs where case_id=p_case_id for update;
 if j.status<>'running' or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now()then return jsonb_build_object('status','stale');end if;
 select * into c from public.admin_review_cases where id=j.case_id and active for update;
 if not found or c.fingerprint<>j.fingerprint then
 update public.admin_review_automation_jobs set status='queued',lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now()where case_id=j.case_id;
 return jsonb_build_object('status','stale');end if;
 if not exists(select 1 from public.admin_automations where slug='review_jev' and enabled)then
 update public.admin_review_automation_jobs set status='queued',lease_token=null,lease_expires_at=null,updated_at=now()where case_id=j.case_id;
 return jsonb_build_object('status','paused');end if;
 if p_result ? 'retry' then v_status:='retry';v_reason:=left(p_result->>'retry',300);
 else
 perform pg_advisory_xact_lock(hashtextextended((c.item->>'queue_type')||':'||(c.item->>'id'),0));
 ctx:=api_private.jev_context(c.id,true);
 if ctx->>'input_hash' is distinct from p_input_hash then
 update public.admin_review_automation_jobs set status='queued',next_attempt_at=now(),lease_token=null,lease_expires_at=null,updated_at=now()where case_id=j.case_id;
 return jsonb_build_object('status','stale');end if;
 v_reason:=coalesce(ctx->>'blocker',p_result->>'blocker');
 if v_reason is not null then v_status:='blocked';
 else
 threshold:=case when c.item->>'risk'='safety' then 0.99 else 0.97 end;
 if jsonb_typeof(p_result#>'{evaluation,model}') is distinct from 'string' then raise exception 'Missing model';end if;
 selected:=p_result#>>'{evaluation,answers,decision,choice}';
 foreach n in array array['decision','support','risk','support_'||selected]loop
 a:=p_result#>array['evaluation','answers',n];
 if a->>'type' is distinct from 'choice' or jsonb_typeof(a->'confidence') is distinct from 'number' or ((a->>'confidence')::numeric<threshold or (a->>'confidence')::numeric>1)
 or jsonb_typeof(a#>array['probabilities',a->>'choice']) is distinct from 'number' or ((a#>>array['probabilities',a->>'choice'])::numeric<threshold or (a#>>array['probabilities',a->>'choice'])::numeric>1) then raise exception 'Unverified model confidence';end if;
 end loop;
 if p_result#>>array['evaluation','answers','support_'||selected,'choice'] is distinct from 'supported' or p_result#>>'{evaluation,answers,support,choice}' is distinct from 'supported' or p_result#>>'{evaluation,answers,risk,choice}' is distinct from 'routine'then raise exception 'Model evidence or risk gate refused';end if;
 selected:=p_result#>>'{evaluation,answers,decision,choice}';
 select x into k from jsonb_array_elements(ctx->'candidates')x where x->>'id'=selected;
 if k is null then raise exception 'No permitted candidate';end if;
 if jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0 then
 v_status:='blocked';v_reason:='missing_live_source_evidence';
 elsif exists(select 1 from jsonb_array_elements(p_evidence)x where nullif(x->>'url','') is null or nullif(x->>'text','') is null
 or (x->>'retrieved_at')::timestamptz<now()-interval '30 minutes' or (x->>'retrieved_at')::timestamptz>now()+interval '1 minute')then raise exception 'Invalid or stale source evidence';
 elsif p_dry_run then v_status:='preview';v_reason:='dry_run';
 else
 note:=format('AI: Jev automated %s. %s. Policy jev-review-v1; model %s. Evidence: %s. Machine decision; no human verification asserted.',k->>'action',k->>'explanation',p_result#>>'{evaluation,model}',(select string_agg(x->>'url',', ')from jsonb_array_elements(p_evidence)x));
 begin
 result:=api_private.jev_apply(c,k,ctx,note);
 -- Re-read the source view: a durable decision must actually remove pending source membership.
 declare view_name text;pending boolean;begin
 select s.view_name into view_name from public.admin_review_sources s where s.queue_key=c.item->>'queue_type';
 execute format('select exists(select 1 from public.%I where id=$1)',view_name)into pending using (c.item->>'id')::uuid;
 if pending then raise exception 'source_remains_pending';end if;
 end;
 insert into public.admin_review_decisions(queue_key,item_id,actor_id,decision,notes)values(c.item->>'queue_type',(c.item->>'id')::uuid,null,case when k->>'action'='recheck' then 'approve' else k->>'action' end,note);
 after_ctx:=api_private.jev_context(c.id);
 insert into public.admin_review_automation_audit(case_id,input_hash,policy_version,model,decision,evidence,previous_value,next_value)
 values(c.id,p_input_hash,'jev-review-v1',p_result#>>'{evaluation,model}',p_result,p_evidence,ctx,after_ctx||jsonb_build_object('result',result,'source_pending',false));
 -- Reconcile membership rather than hiding a grouped case with unresolved members.
 perform api_private.jev_reconcile(c.item->>'queue_type',array[(c.item->>'id')::uuid]);
 v_status:='applied';
 exception when others then
 -- The subtransaction rolls back all source changes and audit rows together.
 v_status:=case when sqlstate in ('P0001','42501','22023')then 'blocked'else 'retry'end;v_reason:='application_guard: '||left(sqlerrm,240);
 end;
 end if;
 end if;
 end if;
 update public.admin_review_automation_jobs set status=v_status,outcome=p_result||jsonb_build_object('reason',v_reason,'result',result,'input_hash',p_input_hash,'evidence',p_evidence),
 next_attempt_at=now()+case when v_status='retry' then make_interval(mins=>least(1440,15*(2^least(j.attempts,6))::integer))
 when v_status='blocked'then interval '1 day'when v_status='preview'then interval '1 hour'else interval '100 years'end,
 lease_token=null,lease_expires_at=null,updated_at=now()where case_id=j.case_id;
 return jsonb_build_object('status',v_status,'reason',v_reason);
end $$;

