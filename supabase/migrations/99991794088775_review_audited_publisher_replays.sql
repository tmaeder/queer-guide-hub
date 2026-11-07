-- Reuse an audited rejection only when the source and normalized JSON match.
create index admin_review_repairs_publisher_replay_seed_idx
on public.admin_review_repairs (entity_id)
where entity_type='ingestion_staging' and reason='previously_reviewed_publisher_replay:v1';
create function api_private.reconcile_audited_publisher_replays(p_batch integer, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
 candidate record;
 after_row jsonb;
 repaired_ids uuid[] := '{}';
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then
  raise exception 'Internal actor required';
 end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled) then
  return jsonb_build_object('skipped','paused');
 end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then
  return jsonb_build_object('skipped','already_running');
 end if;

 for candidate in
  with audited as materialized (
   select r.entity_id, r.next_value->'dedup_details'->'reviewed_source_replay'->>'prior_staging_id' prior_id,
    r.next_value->>'review_notes' review_notes, r.next_value->'raw_data' raw_data,
    r.next_value->'normalized_data' normalized_data
   from public.admin_review_repairs r
   where r.entity_type='ingestion_staging' and r.reason='previously_reviewed_publisher_replay:v1'
    and r.next_value->>'review_status'='rejected' and r.next_value->>'disposition'='rejected'
  )
  select s.id, prior.id prior_id, to_jsonb(s) old_row
  from public.admin_review_cases w
  join public.ingestion_staging s on s.id=case when w.item->>'queue_type'='staging'
   and pg_input_is_valid(w.item->>'id','uuid') then (w.item->>'id')::uuid end
  join lateral (
   select seed.id, a.prior_id, a.normalized_data, a.review_notes, a.raw_data
   from public.ingestion_staging seed
   join audited a on a.entity_id=seed.id and a.raw_data=seed.raw_data
    and a.normalized_data=seed.normalized_data and a.review_notes=seed.review_notes
   where seed.source_name=s.source_name and seed.source_entity_id=s.source_entity_id
    and seed.source_type=s.source_type and seed.target_table=s.target_table
    and seed.created_at<s.created_at and seed.disposition='rejected' and seed.review_status='rejected'
    and seed.raw_data=s.raw_data and seed.target_record_id is null
    and not coalesce(seed.dedup_details,'{}') ? 'manual_hold'
   order by seed.created_at desc, seed.id
   limit 1
  ) proof on true
  join public.ingestion_staging seed on seed.id=proof.id and seed.disposition='rejected'
   and seed.review_status='rejected' and seed.raw_data=proof.raw_data and seed.target_record_id is null
   and seed.normalized_data=proof.normalized_data and seed.review_notes=proof.review_notes
  join public.ingestion_staging prior on prior.id=case when pg_input_is_valid(proof.prior_id,'uuid') then proof.prior_id::uuid end
   and prior.source_name=s.source_name and prior.source_type=s.source_type and prior.source_entity_id=s.source_entity_id
   and prior.target_table=s.target_table and prior.raw_data=s.raw_data
   and prior.disposition='rejected' and prior.review_status='rejected'
   and prior.reviewed_at<seed.created_at and prior.updated_at<=seed.processed_at
   and nullif(prior.review_notes,'') is not null
   and prior.target_record_id is null and not coalesce(prior.dedup_details,'{}') ? 'manual_hold'
  where w.active and w.item->>'queue_type'='staging'
   and s.source_name in ('gaybasel','eventfrog','milchjugend','queerde','queer-kalender','haz-ch')
   and s.target_table in ('venues','events')
   and (s.normalized_data=seed.normalized_data or s.normalized_data=prior.normalized_data)
   and s.disposition='pending' and s.review_status='pending_review' and s.target_record_id is null
   and s.reviewed_at is null and s.reviewed_by is null and s.review_notes is null and s.enriched_data is null
   and s.dedup_status='pending' and s.dedup_match_id is null
   and jsonb_typeof(coalesce(s.dedup_details,'{}'))='object'
   and not coalesce(s.dedup_details,'{}') ? 'manual_hold'
   and not exists (
    select 1 from public.content_revisions h where h.source_table='ingestion_staging'
     and h.source_id=s.id and h.actor_kind='human'
   )
   and not exists (
    select 1 from public.ingestion_staging later
    where later.source_name=s.source_name and later.source_entity_id=s.source_entity_id
     and later.source_type=s.source_type and later.target_table=s.target_table and later.raw_data=s.raw_data
     and later.id not in (s.id,seed.id,prior.id) and later.updated_at>prior.reviewed_at
     and (later.target_record_id is not null or later.review_status in ('approved','auto')
      or coalesce(later.dedup_details,'{}') ? 'manual_hold')
   )
   and not exists (
    select 1 from public.admin_review_cases c join public.admin_review_automation_jobs j on j.case_id=c.id
    where c.active and c.item->>'queue_type'='staging' and c.item->>'id'=s.id::text
     and j.status='running' and j.lease_expires_at>now()
   )
  order by s.created_at,s.id
  limit greatest(0,least(coalesce(p_batch,0),100))
  for update of s skip locked
  for share of seed,prior skip locked
 loop
  repaired_ids:=array_append(repaired_ids,candidate.id);
  if p_dry_run is distinct from false then
   continue;
  end if;
  update public.ingestion_staging s set
   disposition='rejected', review_status='rejected', processed_at=now(), updated_at=now(),
   review_notes='Auto-resolution: this identical publisher capture repeats staging record '||candidate.prior_id||
    '. The audited rejection applies to this version. Source data is retained.',
   dedup_details=coalesce(s.dedup_details,'{}')||jsonb_build_object('reviewed_source_replay',jsonb_build_object(
    'prior_staging_id',candidate.prior_id,'raw_payload_hash',md5(s.raw_data::text),
    'normalized_payload_hash',md5(s.normalized_data::text),'human_reviewed',false))
  where s.id=candidate.id returning to_jsonb(s) into after_row;

  if after_row-array['disposition','review_status','processed_at','updated_at','review_notes','dedup_details']
   is distinct from candidate.old_row-array['disposition','review_status','processed_at','updated_at','review_notes','dedup_details'] then
   raise exception 'Unexpected staging mutation %',candidate.id;
  end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
  values('ingestion_staging',candidate.id,'audited_publisher_replay:v2',candidate.old_row,after_row);
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'rejected_replays',cardinality(repaired_ids),'staging_ids',to_jsonb(repaired_ids));
end $function$;

revoke all on function api_private.reconcile_audited_publisher_replays(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.reconcile_audited_publisher_replays(integer,boolean) to service_role;

do $hook$
declare
 definition text:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 code_definition text:=regexp_replace(pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
 anchor text:=$anchor$jsonb_build_object('dry_run',p_dry_run,$anchor$;
begin
 if (length(code_definition)-length(replace(code_definition,anchor,'')))/length(anchor)<>1
    or (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'Automatic resolution return contract changed';
 end if;
 execute replace(definition,anchor,'jsonb_build_object(''audited_publisher_replays'',api_private.reconcile_audited_publisher_replays(v_limit,p_dry_run)) || '||anchor);
end $hook$;
