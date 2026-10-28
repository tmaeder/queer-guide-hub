-- Service-only machine decisions. Never impersonate staff or assert human review.
create table public.admin_review_automation_jobs (
 case_id uuid primary key references public.admin_review_cases(id) on delete cascade,
 fingerprint text not null, policy_version text not null default 'jev-review-v1',
 status text not null default 'queued' check(status in ('queued','running','retry','blocked','applied','preview')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_token uuid, lease_expires_at timestamptz, outcome jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
alter table public.admin_review_automation_jobs enable row level security;
revoke all on public.admin_review_automation_jobs from public,anon,authenticated;
grant all on public.admin_review_automation_jobs to service_role;
create index admin_review_automation_due on public.admin_review_automation_jobs(next_attempt_at) where status in ('queued','retry','running');
create table public.admin_review_automation_audit (
 id bigint generated always as identity primary key,case_id uuid not null,input_hash text not null,
 policy_version text not null,model text not null,decision jsonb not null,evidence jsonb not null,
 previous_value jsonb not null,next_value jsonb not null,created_at timestamptz not null default now()
);
alter table public.admin_review_automation_audit enable row level security;
revoke all on public.admin_review_automation_audit from public,anon,authenticated;
grant select,insert on public.admin_review_automation_audit to service_role;
grant usage on sequence public.admin_review_automation_audit_id_seq to service_role;

create function api_private.assert_jev_internal() returns void language plpgsql set search_path='' as $$
begin
 if nullif(current_setting('request.jwt.claims',true),'') is not null
 and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 then raise exception 'Service actor required' using errcode='42501';end if;
end $$;

-- Explicit public-record projection. No author/reporter/user IDs, emails or private payloads leave for Jev.
create function api_private.jev_public_record(j jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(key,case when jsonb_typeof(value)='string' then to_jsonb(left(value#>>'{}',18000)) else value end)
 from jsonb_each(coalesce(j,'{}')) where key=any(array['id','name','title','description','short_description','long_description',
 'body','content','website','source_url','url','address','city_id','country_id','latitude','longitude','start_date','end_date',
 'venue_name','venue_id','event_type','category','entity_type','entity_id','field','proposed_value','current_value','citations',
 'locale','suggestion_type','keep_id','drop_id','organization_id','milestone_id','canonical_id','duplicate_id','series_key',
 'data_source','external_id','status','review_status','disposition','quality_status','shell_status','duplicate_of_id','closed_at',
 'human_reviewed','seo_indexable','publication_role','image_url','image_license','image_attribution','reason','issue_code',
 'evidence','source_content','source_url','normalized_data','enriched_data','confidence','proposed_role_kind','milestone_id_1','milestone_id_2']);
$$;

create function api_private.jev_record(p_table text,p_id uuid,p_lock boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j jsonb;
begin
 if p_id is null then return null;end if;
 if p_table is null or p_table<>all(array['events','venues','cities','countries','queer_villages','organizations','unified_tags','milestones',
 'news_articles','marketplace_listings','marketplace_brands','personalities','hotels','festivals','guides',
 'ingestion_staging','ai_suggestions','org_link_suggestions','milestone_review_queue','entity_review_queue',
 'dedup_review_queue','tag_merge_review','milestone_link_proposals','milestone_duplicate_candidates','entity_link_review',
 'event_quality_issues','review_queue','cms_review_queue','editorial_drafts','tag_suggestions','scraper_dedupe_decisions']) then return null;end if;
 execute format('select to_jsonb(r) from public.%I r where id=$1%s',p_table,case when p_lock then ' for update' else '' end)into j using p_id;
 return j;
end $$;

create function api_private.jev_context(p_case uuid,p_lock boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.admin_review_cases; q text;t text;s jsonb;e jsonb;rel jsonb:='{}';rawrel jsonb:='{}';
 candidates jsonb:='[]';urls jsonb;blocker text;entity_table text;v text;source_table text;full_input jsonb;research jsonb;
begin
 select * into c from public.admin_review_cases where id=p_case and active;
 if not found then raise exception 'Case is no longer active' using errcode='40001';end if;
 q:=c.item->>'queue_type';
 -- Consent, private membership and mandatory human publication gates are not factual model decisions.
 if q=any(array['group-requests','moderation','submissions','automation','feedback','trip-geography']) then blocker:='private_consent_or_moderation';
 elsif q=any(array['content','sensitive-tags','tag-editorial','tag-restoration','brand-ownership','venue-kind','personality-publication','editorial']) then blocker:='mandatory_human_publication_review';end if;
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
 union all select to_jsonb(e->>'website') where e->>'website' like 'https://%'
 union all select to_jsonb(e->>'source_url') where e->>'source_url' like 'https://%'
 union all select to_jsonb(c.item#>>'{meta,details,page}') where c.item#>>'{meta,details,page}' like 'https://%'
 )u where jsonb_typeof(x)='string' and x#>>'{}' like 'https://%';
 return jsonb_build_object('item',c.item-'reporter_id','record',api_private.jev_public_record(e),'proposal',api_private.jev_public_record(s),'related',rel,
 'research',research,'candidates',coalesce(candidates,'[]'),'urls',urls,'input_hash',md5(full_input::text));
end $$;

create function public.claim_jev_review_jobs(p_batch integer default 8) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform api_private.assert_jev_internal();
 if not exists(select 1 from public.admin_automations where slug='review_jev' and enabled)then return '[]';end if;
 insert into public.admin_review_automation_jobs(case_id,fingerprint)
 select id,fingerprint from public.admin_review_cases where active
 on conflict(case_id)do update set fingerprint=excluded.fingerprint,policy_version='jev-review-v1',status='queued',attempts=0,
 next_attempt_at=now(),lease_token=null,lease_expires_at=null,outcome='{}',updated_at=now()
 where admin_review_automation_jobs.fingerprint<>excluded.fingerprint or admin_review_automation_jobs.policy_version<>'jev-review-v1';
 update public.admin_review_automation_jobs set status='retry',lease_token=null,lease_expires_at=null,
 next_attempt_at=now()+interval '1 hour',outcome=jsonb_build_object('reason','worker_lease_expired'),updated_at=now()
 where status='running' and lease_expires_at<now();
 -- Fair across sources: large city queues cannot starve smaller Review queues.
 with eligible as(select j.case_id,row_number()over(partition by c.item->>'queue_type' order by j.attempts,j.next_attempt_at,c.created_at,c.id)rank,
 j.attempts,j.next_attempt_at from public.admin_review_automation_jobs j join public.admin_review_cases c on c.id=j.case_id
 where c.active and c.fingerprint=j.fingerprint and j.status in ('queued','retry','blocked','preview') and j.next_attempt_at<=now()),
 due as(select j.case_id from eligible e join public.admin_review_automation_jobs j on j.case_id=e.case_id order by e.rank,e.attempts,e.next_attempt_at,j.case_id
 limit greatest(0,least(16,p_batch))for update of j skip locked),
 claimed as(update public.admin_review_automation_jobs j set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
 lease_expires_at=now()+interval '8 minutes',updated_at=now() from due where due.case_id=j.case_id returning j.*)
 select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('queue_type',c.item->>'queue_type')),'[]')into result from claimed j join public.admin_review_cases c on c.id=j.case_id;
 return result;
end $$;
create function public.get_jev_review_context(p_case_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform api_private.assert_jev_internal();
 if not exists(select 1 from public.admin_review_automation_jobs where case_id=p_case_id and status='running' and lease_token=p_lease_token and lease_expires_at>now())then raise exception 'Lease is stale' using errcode='40001';end if;
 return api_private.jev_context(p_case_id);
end $$;

-- Candidate payloads come exclusively from a fresh server-built context, not the model.
create function api_private.jev_apply(c public.admin_review_cases,k jsonb,ctx jsonb,note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=c.item->>'queue_type';a text:=k->>'action';i uuid:=(c.item->>'id')::uuid;e uuid:=nullif(c.item->>'entity_id','')::uuid;
 p jsonb:=ctx->'proposal';r jsonb;v text;reg public.review_field_registry;proposal public.entity_review_queue;keep_attention boolean;provenance_table text;
begin
 perform api_private.assert_jev_internal();
 perform set_config('app.actor','ai:jev:review-automation',true);
 if c.family='venue' and k#>>'{payload,venue_id}' is not null then
 if not exists(select 1 from public.venues v join public.events ev on ev.id=e where v.id=(k#>>'{payload,venue_id}')::uuid and v.city_id=ev.city_id and v.country_id=ev.country_id and ev.venue_id is null and v.duplicate_of_id is null and v.closed_at is null)then raise exception 'canonical_venue_conflict';end if;
 if exists(select 1 from public.events other join public.events ev on ev.id=e where other.id<>e and other.venue_id=(k#>>'{payload,venue_id}')::uuid and lower(btrim(other.title))=lower(btrim(ev.title)) and other.start_date=ev.start_date and other.status<>'archived')then raise exception 'venue_occurrence_collision';end if;
 update public.events set venue_id=(k#>>'{payload,venue_id}')::uuid,field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('venue_id',jsonb_build_object('source','jev-review-v1','human_reviewed',false,'at',now(),'note',note))where id=e;
 update public.event_quality_issues set status='resolved',resolved_at=now(),resolution=note,reviewed_at=now(),reviewed_by=null where event_id=e and issue_code='NAMED_VENUE_UNLINKED'and status='open';
 update public.review_queue set status='resolved',resolved_at=now(),resolved_by=null,details=coalesce(details,'{}')||jsonb_build_object('resolution','jev_venue_link','review_note',note)where entity_type='event' and entity_id=e and review_type='venue_link_candidate'and status='pending';
 elsif q='event-quality' then
 if a='approve' and c.item#>>'{meta,issue_code}'='CATEGORY_UNRESOLVED' then
 if exists(select 1 from public.events where id=e and field_provenance#>>'{event_type,human_reviewed}'='true') then raise exception 'protected_human_field';end if;
 update public.events set event_type=k#>>'{payload,event_type}',field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('event_type',
 jsonb_build_object('source','jev-review-v1','human_reviewed',false,'previous',event_type,'at',now(),'note',note))where id=e;
 perform public.decide_event_quality_issue(i,'resolved',note);
 elsif a='reject' and c.item#>>'{meta,issue_code}' in ('DESCRIPTION_REUSED','IMAGE_REUSED','IMAGE_CONTENT_REUSED') then
 if c.item#>>'{meta,issue_code}'<>'DESCRIPTION_REUSED' then raise exception 'visual_evidence_required';end if;
 perform public.decide_event_quality_issue(i,'accepted',note);
 else raise exception 'invariant_still_requires_repair';end if;
 elsif q='org-link-review' then
 if a='approve' and p->>'organization_id' is null then raise exception 'missing_canonical_organization';end if;
 r:=public.decide_org_adoption(i,a='approve',nullif(p->>'organization_id','')::uuid,note);
 elsif q='venue-category' then r:=public.decide_venue_category(i,a='approve',null,note);
 elsif q='dedup-review' then
 if a='approve' then
 if p->>'entity_type' not in ('venue','city')then raise exception 'personal_identity_requires_human_review';end if;
 if p->>'entity_type'='venue' then select needs_attention into keep_attention from public.venues where id=(p->>'keep_id')::uuid;end if;
 r:=public.approve_dedup_review(i,(p->>'keep_id')::uuid);
 if keep_attention then update public.venues set needs_attention=true where id=(p->>'keep_id')::uuid;end if;
 else perform public.reject_dedup_review(i,note);end if;
 elsif q='tag-merges' then
 if a='approve' then perform public.approve_tag_merge(i,'ai:jev');else perform public.reject_tag_merge(i,false,'ai:jev');end if;
 elsif q like 'quality-%' then
 select * into strict proposal from public.entity_review_queue where id=i and status='open' for update;
 if a='approve' then
 if public._review_risk_blocked(proposal.entity_type,proposal.field,proposal.entity_id)then raise exception 'protected_destination_requires_confirmation';end if;
 if ctx#>>'{record,human_reviewed}'='true' then raise exception 'protected_human_field';end if;
 if proposal.field not in ('name','title','description','short_description','long_description','website','address','category','event_type','best_time_to_visit')then raise exception 'safety_or_unregistered_field_requires_review';end if;
 select * into strict reg from public.review_field_registry where entity_type=proposal.entity_type and field=proposal.field and active;
 perform public._apply_review_value(reg,proposal.entity_id,proposal.proposed_value);
 -- The staff helper writes llm+human; machine provenance must use a separate explicit actor.
 provenance_table:=case proposal.entity_type when 'city'then 'cities'when 'venue'then 'venues'when 'village'then 'queer_villages'when 'marketplace'then 'marketplace_listings'when 'personality'then 'personalities' end;
 if provenance_table is not null and exists(select 1 from information_schema.columns where table_schema='public'and table_name=provenance_table and column_name='field_provenance')then
 execute format('update public.%I set field_provenance=jsonb_set(coalesce(field_provenance,''{}''::jsonb),array[$1],$2,true)where id=$3',provenance_table)using proposal.field,jsonb_build_object('source','jev-review-v1','human_reviewed',false,'value',proposal.proposed_value->'value','citations',proposal.citations,'at',now()),proposal.entity_id;end if;
 end if;
 update public.entity_review_queue set status=case when a='approve' then 'approved' else 'rejected' end,reviewer_id=null,reviewed_at=now(),reviewer_note=note where id=i;
 perform public._review_write_audit(proposal.entity_type,proposal.entity_id,proposal.field,proposal.proposed_value,proposal.confidence,
 case when a='approve' then 'auto_commit' else 'no_change' end,'llm',jsonb_build_object('actor','ai:jev','human_reviewed',false,'note',note,'citations',proposal.citations));
 elsif q='milestone-review' then
 if a='approve' then
 if p->>'field'='category' then
 update public.milestones set category=p#>>'{proposed_value,value}',field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('category',jsonb_build_object('source','jev-review-v1','human_reviewed',false,'at',now()))where id=e;
 perform public.backfill_milestone_topic_tags(1,false,e);
 elsif p->>'field'='description' and length(trim(coalesce(p#>>'{proposed_value,replacement}','')))>30 then
 update public.milestones set description=p#>>'{proposed_value,replacement}'where id=e;
 else raise exception 'missing_supported_replacement';end if;end if;
 update public.milestone_review_queue set status=case when a='approve' then 'approved' else 'rejected' end,reviewer_id=null,reviewed_at=now(),reviewer_note=note where id=i and status='open';
 update public.milestones set last_verified_at=null where id=e;
 elsif q='milestone-links' then
 if a='approve' then perform public.approve_milestone_link_proposal(i,null);else perform public.reject_milestone_link_proposal(i);end if;
 elsif q='milestone-duplicates' then
 -- Confirming this candidate does not merge two occurrences.
 update public.milestone_duplicate_candidates set status=case when a='approve' then 'confirmed' else 'dismissed' end,reviewed_by=null,reviewed_at=now(),reviewer_note=note where id=i and status='pending';
 elsif q in ('ai-suggestions','tag-enrichment') then
 if a<>'reject' then raise exception 'suggestion_requires_atomic_application';end if;
 update public.ai_suggestions set status='rejected',reviewer_id=null,rejected_at=now(),review_notes=note where id=i and status in ('pending','approved');
 elsif q='staging' then
 if a='approve' and api_private.review_news_machine_outcome((select enriched_data from public.ingestion_staging where id=i)) is distinct from 'publish' then raise exception 'publication_gate_not_passed';end if;
 update public.ingestion_staging set review_status=case when a='approve' then 'approved' else 'rejected' end,
 disposition=case when a='reject' then 'rejected' else disposition end,reviewed_by=null,reviewed_at=now(),review_notes=note where id=i;
 elsif q='entity-links' and a='reject' then
 update public.entity_link_review set status='rejected',resolved_by=null,resolved_at=now()where id=i;
 elsif q='tags' and a='reject' then
 update public.tag_suggestions set status='rejected',reviewed_by=null,reviewed_at=now()where id=i;
 elsif q='duplicates' and a='reject' then
 update public.scraper_dedupe_decisions set decision='not_duplicate',decided_by='ai:jev'where id=i;
 elsif q='news-quality' and a='reject' then update public.news_articles set quality_status='rejected'where id=i;
 elsif q='liveness' and a='reject' then
 -- A source-backed machine rejection is not an admin-alive signal; preserve other attention flags.
 update public.entity_existence_audit set reverted_at=now(),reverted_by=null,reason=note where id=(c.item#>>'{meta,audit_id}')::bigint and action='flag' and reverted_at is null;
 elsif q='geography' then
 r:=public.geo_cms_verify((c.item#>>'{meta,place_id}')::uuid);
 if r->>'verification_status' in ('review','missing','stale') then raise exception 'geography_evidence_still_missing';end if;
 elsif q='business-quality' then
 perform public.refresh_business_brand_quality();
 if exists(select 1 from public.entity_quality_findings where id=(c.item#>>'{meta,finding_id}')::bigint and state in ('fail','pending')and waived_at is null)then raise exception 'business_invariant_still_failed';end if;
 elsif q='general-review' and k->>'id'='retain_current_date' then
 update public.review_queue set status='rejected',resolved_at=now(),resolved_by=null,details=coalesce(details,'{}')||jsonb_build_object('resolution','jev_current_date_source_supported','review_note',note)where id=i;
 elsif q='general-review' and c.item#>>'{meta,review_type}'='CITY_LIFECYCLE_UNRESOLVED' then
 if exists(select 1 from public.city_quality_profile p where p.id=e and not('CITY_LIFECYCLE_UNRESOLVED'=any(p.issue_codes)))then
 update public.review_queue set status='resolved',resolved_at=now(),resolved_by=null,details=coalesce(details,'{}')||jsonb_build_object('resolution','jev_recheck_signal_cleared','review_note',note)where id=i;
 else raise exception 'city_identity_still_requires_corroboration';end if;
 elsif q in ('general-review','cms-issues') then
 -- Generic recheck never dismisses or marks an uncorrected source finding resolved.
 raise exception 'specific_record_correction_required';
 else raise exception 'mandatory_human_workflow';end if;
 return coalesce(r,jsonb_build_object('ok',true));
end $$;

create function api_private.jev_reconcile(p_queue text,p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare c public.admin_review_cases;m jsonb;remaining jsonb;view_name text;pending boolean;
begin
 for c in select * from public.admin_review_cases where active and exists(select 1 from jsonb_array_elements(members)x where x->>'queue_type'=p_queue and (x->>'id')::uuid=any(p_ids))for update loop
 remaining:='[]';
 for m in select value from jsonb_array_elements(c.members)loop
 select s.view_name into view_name from public.admin_review_sources s where s.active and s.queue_key=m->>'queue_type';
 if view_name is null then pending:=true;else
 execute format('select exists(select 1 from public.%I where id=$1)',view_name)into pending using (m->>'id')::uuid;end if;
 if pending then remaining:=remaining||jsonb_build_array(m);end if;
 end loop;
 update public.admin_review_cases set members=remaining,item=coalesce(remaining->0,item),fingerprint=md5(remaining::text),active=jsonb_array_length(remaining)>0 where id=c.id;
 end loop;
end $$;
revoke all on function api_private.jev_reconcile(text,uuid[])from public,anon,authenticated;

create function public.finish_jev_review_job(p_case_id uuid,p_lease_token uuid,p_input_hash text,p_result jsonb,p_evidence jsonb default '[]',p_dry_run boolean default true)
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
 if jsonb_typeof(p_result#>'{evaluation,model}')<>'string' then raise exception 'Missing model';end if;
 selected:=p_result#>>'{evaluation,answers,decision,choice}';
 foreach n in array array['decision','support','risk','support_'||selected]loop
 a:=p_result#>array['evaluation','answers',n];
 if a->>'type'<>'choice' or jsonb_typeof(a->'confidence')<>'number' or (a->>'confidence')::numeric<threshold
 or jsonb_typeof(a#>array['probabilities',a->>'choice'])<>'number' or (a#>>array['probabilities',a->>'choice'])::numeric<threshold then raise exception 'Unverified model confidence';end if;
 end loop;
 if p_result#>>array['evaluation','answers','support_'||selected,'choice']<>'supported' or p_result#>>'{evaluation,answers,support,choice}'<>'supported' or p_result#>>'{evaluation,answers,risk,choice}'<>'routine'then raise exception 'Model evidence or risk gate refused';end if;
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

-- Staff can inspect machine evidence; writes and leases remain service-only.
create function public.get_jev_review_status(p_case_id uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_role_jwt('admin'::public.app_role)then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object('enabled',(select enabled from public.admin_automations where slug='review_jev'),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]')from public.admin_review_automation_jobs j where p_case_id is not null and j.case_id=p_case_id),
 'counts',(select jsonb_object_agg(status,n)from(select status,count(*)n from public.admin_review_automation_jobs group by status)s));
end $$;

revoke all on function api_private.assert_jev_internal(),api_private.jev_public_record(jsonb),api_private.jev_record(text,uuid,boolean),api_private.jev_context(uuid,boolean),api_private.jev_apply(public.admin_review_cases,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.claim_jev_review_jobs(integer),public.get_jev_review_context(uuid,uuid),public.finish_jev_review_job(uuid,uuid,text,jsonb,jsonb,boolean),public.get_jev_review_status(uuid)from public,anon,authenticated;
grant execute on function public.claim_jev_review_jobs(integer),public.get_jev_review_context(uuid,uuid),public.finish_jev_review_job(uuid,uuid,text,jsonb,jsonb,boolean)to service_role;
grant execute on function public.get_jev_review_status(uuid)to authenticated;

insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,schedule,action,lifecycle_state)
values('review_jev','Jev Review automation','Evaluate all Review sources; apply source-supported machine decisions with immutable evidence, current input checks and visible blockers.',
'system',false,'{"type":"schedule"}','4-59/5 * * * *','{"type":"cron","jobname":"review_jev"}','active')on conflict(slug)do nothing;
select cron.schedule('review_jev','4-59/5 * * * *',$cron$
do $dispatch$declare v_run_id bigint;begin
v_run_id:=public.admin_automation_run_begin('review_jev',1);
if v_run_id is not null then
perform public.automation_http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/review-automation',headers:=jsonb_build_object(
'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key'),
'X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret'),'Content-Type','application/json'),
body:=jsonb_build_object('batch',8,'dry_run',false,'run_id',v_run_id),timeout_milliseconds:=240000);
end if;end $dispatch$;
$cron$);

-- Existing queue counts and filters include real Jev blockers; source rows remain pending.
create or replace view public.admin_review_case_worklist with(security_invoker=true) as
 select c.id,c.case_key,c.family,c.stage,c.required_role,c.item,c.members,c.fingerprint,c.active,c.created_at,c.updated_at,coalesce(a.status,j.status) research_status,coalesce(a.attempts,j.attempts) attempts,
 coalesce(a.updated_at,j.last_attempt_at)last_attempt_at,coalesce(a.next_attempt_at,j.next_attempt_at)next_attempt_at,
 coalesce(a.outcome,j.outcome)outcome,
 case when a.status='blocked'then 'blocked' when a.status in ('queued','running','retry')then 'research'
 when c.stage='ready' or j.fingerprint=c.fingerprint and j.outcome->>'decision_ready'='true'then 'ready'
 when j.fingerprint=c.fingerprint and j.status='blocked'then 'blocked'else 'research'end work_stage,c.source_keys
 from public.admin_review_cases c left join public.admin_review_research_jobs j on j.case_id=c.id
 left join public.admin_review_automation_jobs a on a.case_id=c.id and a.fingerprint=c.fingerprint and a.policy_version='jev-review-v1'
 where c.active;
revoke all on public.admin_review_case_worklist from public,anon,authenticated;
grant select on public.admin_review_case_worklist to service_role;

create function public.set_jev_review_enabled(p_enabled boolean)returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_role_jwt('admin'::public.app_role)then raise exception 'Admin required'using errcode='42501';end if;
 update public.admin_automations set enabled=p_enabled,consecutive_failures=0,updated_at=now()where slug='review_jev';
end $$;
revoke all on function public.set_jev_review_enabled(boolean)from public,anon,authenticated;
grant execute on function public.set_jev_review_enabled(boolean)to authenticated;
