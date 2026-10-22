-- Resolve machine dead ends using current evidence, never manufacture facts.
insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,action,lifecycle_state)
values('review_automatic_resolution','Resolve mechanical review cases',
 'Apply completed news verdicts, retry empty extraction twice, discard failed proposals and retire inactive unused geography checks.',
 'system',true,'{"type":"schedule"}','{"type":"rpc","fn":"run_review_automatic_resolution"}','active')
on conflict(slug) do nothing;

create function api_private.review_news_machine_outcome(e jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare d jsonb:=e->'quality_decision';
begin
 if jsonb_typeof(d)<>'object' or jsonb_typeof(d->'confidence')<>'number'
  or jsonb_typeof(d->'relevanceScore')<>'number' or jsonb_typeof(d->'qualityScoreAfter')<>'number'
  or d->>'needsManualReview' is distinct from 'false' then return null; end if;
 if (d->>'confidence')::numeric<0.7 then return null; end if;
 if e->>'quality_status'='passed' and e->>'auto_publish'='true'
  and e->'auto_publish_blocked_reasons'='[]'::jsonb and d->>'isRelevant'='true'
  and (d->>'relevanceScore')::numeric>=0.75 and (d->>'qualityScoreAfter')::numeric>=0.7
  and d->>'isSatire'='false' and d->>'isAdvertorial'='false' then return 'publish'; end if;
 if e->>'quality_status'='rejected' and length(btrim(coalesce(d->>'title','')||coalesce(d->>'cleanedBody','')))>0
  and ((d->>'isRelevant'='false' and (d->>'relevanceScore')::numeric<0.3)
   or (e->'auto_publish_blocked_reasons' ? 'critical_paywall' and (d->>'qualityScoreAfter')::numeric<0.5))
 then return 'reject'; end if;
 return null;
end $$;

create function api_private.review_inactive_city_unlinked(p_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if not exists(select 1 from public.cities where id=p_id and shell_status='ghost'
   and seo_indexable=false and duplicate_of_id is null) then return false; end if;
 -- Even historical relationships keep the case open. Audit/source-only rows do
 -- not create public city content. Never detach children to satisfy this rule.
 return not (
 exists(select 1 from public.venues where city_id=p_id) or exists(select 1 from public.events where city_id=p_id)
 or exists(select 1 from public.organizations where city_id=p_id) or exists(select 1 from public.hotels where city_id=p_id)
 or exists(select 1 from public.queer_villages where city_id=p_id) or exists(select 1 from public.geo_places where parent_id=p_id)
 or exists(select 1 from public.news_article_cities where city_id=p_id)
 or exists(select 1 from public.news_articles where city_ids @> array[p_id])
 or exists(select 1 from public.personalities where city_id=p_id or death_city_id=p_id)
 or exists(select 1 from public.festivals where city_id=p_id) or exists(select 1 from public.guides where city_id=p_id)
 or exists(select 1 from public.milestones where city_id=p_id)
 or exists(select 1 from public.competition_editions where host_city_id=p_id)
 or exists(select 1 from public.competition_entrants where city_id=p_id)
 or exists(select 1 from public.trip_destinations where city_id=p_id) or exists(select 1 from public.trip_places where city_id=p_id)
 or exists(select 1 from public.reservations where city_id=p_id) or exists(select 1 from public.city_favorites where city_id=p_id)
 or exists(select 1 from public.user_place_marks where city_id=p_id) or exists(select 1 from public.user_presence_location where city_id=p_id)
 or exists(select 1 from public.intimate_cruising_mode where city_id=p_id));
end $$;

alter table public.geo_cms_verifications drop constraint geo_cms_verifications_status_check;
alter table public.geo_cms_verifications add constraint geo_cms_verifications_status_check
 check(status in ('verified','review','missing','stale','country_checked','not_applicable'));
create function api_private.review_geography_applicability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.geo_places where id=new.place_id and place_type='city')
  and api_private.review_inactive_city_unlinked(new.place_id) then
  new.status:='not_applicable';
  new.checks:=coalesce(new.checks,'{}')||jsonb_build_object('identity_verified',false,
   'applicability','inactive_unlinked_city','reason','Archived unused city: settlement verification is not applicable; no identity verification is claimed.');
 elsif new.status='not_applicable' or (tg_op='UPDATE' and old.status='not_applicable') then
  new.status:='review';
  new.checks:=coalesce(new.checks,'{}')||jsonb_build_object('applicability','reopened',
   'identity_verified',false,'reason','Archived city was reactivated or acquired a linked record; inspect identity and geography.');
 end if;
 return new;
end $$;
create trigger review_geography_applicability before insert or update on public.geo_cms_verifications
 for each row execute function api_private.review_geography_applicability();

create function api_private.review_reopen_geography() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(new)->tg_argv[0]; candidate text;
begin
 for candidate in select jsonb_array_elements_text(case when jsonb_typeof(v)='array' then v
  when v is null or v='null'::jsonb then '[]'::jsonb else jsonb_build_array(v) end) loop
  -- Fast path: most records never refer to an archived verification.
  if exists(select 1 from public.geo_cms_verifications where place_id=candidate::uuid and status='not_applicable')
    and not api_private.review_inactive_city_unlinked(candidate::uuid) then
   update public.geo_cms_verifications set status='review',checked_at=now() where place_id=candidate::uuid;
  end if;
 end loop;
 return new;
end $$;
do $triggers$
declare r record;
begin
 for r in select * from (values
 ('cities','id','shell_status,seo_indexable,duplicate_of_id'),('geo_places','parent_id','parent_id'),
 ('venues','city_id','city_id'),('events','city_id','city_id'),('organizations','city_id','city_id'),
 ('hotels','city_id','city_id'),('queer_villages','city_id','city_id'),('news_article_cities','city_id','city_id'),
 ('news_articles','city_ids','city_ids'),('personalities','city_id','city_id'),('personalities','death_city_id','death_city_id'),
 ('festivals','city_id','city_id'),('guides','city_id','city_id'),('milestones','city_id','city_id'),
 ('competition_editions','host_city_id','host_city_id'),('competition_entrants','city_id','city_id'),
 ('trip_destinations','city_id','city_id'),('trip_places','city_id','city_id'),('reservations','city_id','city_id'),
 ('city_favorites','city_id','city_id'),('user_place_marks','city_id','city_id'),
 ('user_presence_location','city_id','city_id'),('intimate_cruising_mode','city_id','city_id')) t(tab,col,cols) loop
  execute format('create trigger %I after insert or update of %s on public.%I for each row execute function api_private.review_reopen_geography(%L)',
   'review_geo_reopen_'||r.col,r.cols,r.tab,r.col);
 end loop;
end $triggers$;

create function api_private.run_review_automatic_resolution(p_batch integer default 200,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v_limit integer:=greatest(0,least(500,p_batch)); v_outcome text; v_after jsonb;
 v_geo integer:=0; v_images integer:=0; v_dates integer:=0; v_pass integer:=0; v_reject integer:=0; v_retry integer:=0;
 v_commit jsonb; v_jobs uuid[]:='{}'; v_job uuid; v_committed integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then return '{"skipped":"already_running"}'; end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled)
 then return '{"skipped":"paused"}'; end if;
 for r in select v.* from public.geo_cms_verifications v join public.cities c on c.id=v.place_id
  where v.status in ('review','stale') and c.shell_status='ghost' and c.seo_indexable=false
   and api_private.review_inactive_city_unlinked(c.id) order by v.place_id limit v_limit for update of v skip locked loop
  v_geo:=v_geo+1;
  if not p_dry_run then
   update public.geo_cms_verifications set status='not_applicable',checked_at=now(),fingerprint=public.geo_cms_fingerprint(r.place_id)
    where place_id=r.place_id returning to_jsonb(geo_cms_verifications) into v_after;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('city',r.place_id,'inactive_unlinked_geography_not_applicable',to_jsonb(r),v_after);
  end if;
 end loop;
 for r in select * from public.review_queue where status='pending' and resolved_by is null and (
   review_type='CITY_IMAGE_AMBIGUOUS' and details->>'reason' in ('no_candidates','insufficient_identity_margin','asset_validation_failed','asset_already_used_by_city')
   or review_type='date_mismatch' and details->>'source'='event-agentic-enrich'
    and details->>'page' ~ '^https?://[^/]+/?$' and not details ? 'matched_event_title'
  ) order by id limit v_limit for update skip locked loop
  v_outcome:=case when r.review_type='CITY_IMAGE_AMBIGUOUS' then 'failed_image_search_discarded' else 'homepage_date_proposal_discarded' end;
  if r.review_type='CITY_IMAGE_AMBIGUOUS' then v_images:=v_images+1; else v_dates:=v_dates+1; end if;
  if not p_dry_run then
   update public.review_queue set status='rejected',resolved_at=now(),resolved_by=null,
    details=details||jsonb_build_object('auto_resolution',v_outcome,'human_reviewed',false,
     'resolution_note','Unsupported machine proposal discarded. Existing record values remain unchanged; no image or event date is verified.')
    where id=r.id returning to_jsonb(review_queue) into v_after;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('review_queue',r.id,v_outcome,to_jsonb(r),v_after);
  end if;
 end loop;
 for r in select * from public.ingestion_staging s where target_table='news_articles' and source_name='rss-news'
  and disposition='pending' and review_status='pending_review' and reviewed_by is null and reviewed_at is null
  and review_notes is null and api_private.review_news_machine_outcome(enriched_data) is not null
  order by created_at,id limit v_limit for update skip locked loop
  v_outcome:=api_private.review_news_machine_outcome(r.enriched_data);
  if v_outcome='publish' then v_pass:=v_pass+1; else v_reject:=v_reject+1; end if;
  if not p_dry_run then
   update public.ingestion_staging set review_status=case when v_outcome='publish' then 'auto' else 'rejected' end,
    disposition=case when v_outcome='publish' then 'pending' else 'rejected' end,
    review_notes='auto-policy: apply completed quality gate '||v_outcome||'; no human review claimed',updated_at=now()
    where id=r.id returning to_jsonb(ingestion_staging) into v_after;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('ingestion_staging',r.id,'completed_news_gate_'||v_outcome,to_jsonb(r),v_after);
   if v_outcome='publish' and r.job_id is not null then v_jobs:=array_append(v_jobs,r.job_id); end if;
  end if;
 end loop;
 -- Empty extraction is a failed machine attempt, not a negative verdict. Retry
 -- only untouched rows with source text available, twice with a six-hour gap.
 for r in select * from public.ingestion_staging where target_table='news_articles' and source_name='rss-news'
  and disposition='pending' and review_status='pending_review' and reviewed_by is null and reviewed_at is null and review_notes is null
  and enrichment_status='enriched' and enriched_data->>'quality_status'='review'
  and enriched_data->'auto_publish_blocked_reasons' ? 'empty_extraction'
  and enriched_data#>>'{quality_decision,confidence}'='0'
  and btrim(coalesce(enriched_data#>>'{quality_decision,title}','')||coalesce(enriched_data#>>'{quality_decision,cleanedBody}','')||coalesce(enriched_data#>>'{quality_decision,excerpt}',''))=''
  and length(coalesce(normalized_data->>'content',normalized_data->>'description',''))>=80
  and coalesce((enriched_data#>>'{review_auto_retry,attempts}')::integer,0)<2
  and coalesce((enriched_data#>>'{review_auto_retry,last_at}')::timestamptz,'epoch')<now()-interval '6 hours'
  order by created_at,id limit v_limit for update skip locked loop
  v_retry:=v_retry+1;
  if not p_dry_run then
   update public.ingestion_staging set enriched_data=(enriched_data
     -'quality_status'-'quality_decision'-'auto_publish'-'auto_publish_blocked_reasons')||jsonb_build_object('review_auto_retry',jsonb_build_object(
      'attempts',coalesce((r.enriched_data#>>'{review_auto_retry,attempts}')::integer,0)+1,'last_at',now(),'reason','empty_extraction')),
    updated_at=now() where id=r.id returning to_jsonb(ingestion_staging) into v_after;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('ingestion_staging',r.id,'empty_news_extraction_retry_queued',to_jsonb(r),v_after);
  end if;
 end loop;
 if not p_dry_run then
  -- Use the existing committer and all its duplicate, quality and merge guards.
  for v_job in select distinct j from unnest(v_jobs) j loop
   select to_jsonb(c) into v_commit from public.news_commit_staging_batch(v_job,null,v_limit) c;
   if coalesce((v_commit->>'errors')::integer,0)>0 then raise exception 'Native news commit failed: %',v_commit; end if;
   v_committed:=v_committed+coalesce((v_commit->>'inserted')::integer,0)+coalesce((v_commit->>'updated')::integer,0);
  end loop;
  update public.admin_automations set last_run_at=now(),last_run_status='success' where slug='review_automatic_resolution';
 end if;
 return jsonb_build_object('dry_run',p_dry_run,'geography_not_applicable',v_geo,'failed_image_proposals',v_images,
  'homepage_date_proposals',v_dates,'news_passed',v_pass,'news_rejected',v_reject,'news_committed',v_committed,'extraction_retries_queued',v_retry);
end $$;
create function public.run_review_automatic_resolution(p_batch integer default 200,p_dry_run boolean default true)
returns jsonb language sql set search_path='' as $$ select api_private.run_review_automatic_resolution(p_batch,p_dry_run) $$;
revoke all on function public.run_review_automatic_resolution(integer,boolean) from public,anon,authenticated;
grant execute on function public.run_review_automatic_resolution(integer,boolean) to service_role;
revoke all on function api_private.review_news_machine_outcome(jsonb),api_private.review_inactive_city_unlinked(uuid),
 api_private.review_geography_applicability(),api_private.review_reopen_geography(),api_private.run_review_automatic_resolution(integer,boolean)
 from public,anon,authenticated;
grant execute on function api_private.run_review_automatic_resolution(integer,boolean),api_private.review_news_machine_outcome(jsonb),
 api_private.review_inactive_city_unlinked(uuid) to service_role;

-- The ordinary worklist refresh already runs every five minutes and respects
-- its pause flag. Reuse it rather than adding another competing full scan.
do $patch$
declare s text; anchor text:=' for r in select b.id,b.product_count';
begin
 s:=pg_get_functiondef('public.repair_admin_review_mechanical(integer,boolean)'::regprocedure);
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Mechanical repair anchor changed'; end if;
 execute replace(s,anchor,E' perform api_private.run_review_automatic_resolution(p_batch,p_dry_run);\n'||anchor);
end $patch$;

