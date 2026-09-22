begin;

insert into public.review_field_registry
  (entity_type,field,label,target_table,target_column,value_key,apply_mode,apply_args,batchable,risk_gate,active)
values
  ('personality','description','Description','personalities','description','value','text',
   '{"touch":["updated_at"]}'::jsonb,false,null,true),
  ('personality','image_url','Portrait URL','personalities','image_url','value','text',
   '{"touch":["updated_at"]}'::jsonb,false,null,true)
on conflict(entity_type,field) do update set active=true;

-- Explicitly unavailable is a resolved image state, not a publication failure.
-- Rejected images remain blocking until an editor supplies a corroborated image.
create or replace function public.personality_publication_failures(p_id uuid)
returns text[]
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select array_remove(array[
    case when p.duplicate_of_id is not null then 'duplicate' end,
    case when coalesce(p.review_status,'') in ('archived','rejected') then 'inactive' end,
    case when p.wikidata_status='resolved' and p.wikidata_qid is null then 'wikidata_state_mismatch' end,
    case when p.wikidata_qid is not null and p.wikidata_qid !~ '^Q[0-9]+$' then 'invalid_wikidata_qid' end,
    case when p.birth_date is not null and p.death_date is not null and p.birth_date>p.death_date
      then 'birth_after_death' end,
    case when coalesce(p.is_living,false) and p.death_date is not null then 'living_with_death_date' end,
    case when not (
      (p.description is not null and length(btrim(p.description)) between 120 and 240)
      or (p.bio is not null and length(btrim(p.bio))>120)
    ) then 'summary_or_bio_too_thin' end,
    case when p.image_status='rejected' or (
      p.image_status <> 'unavailable'
      and p.image_url is null
      and not exists (
        select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
        where l.entity_type='personality' and l.entity_id=p.id and l.role='cover'
          and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
      )
    ) then 'image_unavailable' end,
    case when p.lgbti_connection is not null and p.lgbti_connection not in ('','none_known','unclear')
      and not exists (
        select 1 from public.personality_claim_sources cs
        where cs.personality_id=p.id and cs.field_name in ('lgbti_connection','lgbti_details')
          and cs.verification_status in ('pending','verified')
      ) then 'unsupported_lgbti_claim' end,
    case when p.is_adult
      and coalesce(p.enrichment_status->'promotion'->>'consent_confirmed','false')<>'true'
      then 'adult_consent_required' end,
    case when coalesce(p.enrichment_status->'personhood'->>'verdict','')='non_person'
      then 'non_person' end
  ],null)::text[]
  from public.personalities p where p.id=p_id;
$$;
revoke all on function public.personality_publication_failures(uuid)
  from public, anon, authenticated;
grant execute on function public.personality_publication_failures(uuid) to service_role;

create or replace function public.backfill_personality_public_claim_sources(p_limit int default 500)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_linked int := 0; v_queued int := 0;
begin
  with candidates as materialized (
    select p.id,p.wikidata_qid,p.lgbti_connection
    from public.personalities p
    where p.visibility='public' and p.duplicate_of_id is null
      and coalesce(p.review_status,'') not in ('archived','rejected')
      and p.lgbti_connection is not null
      and p.lgbti_connection not in ('','none_known','unclear')
      and not exists (
        select 1 from public.personality_claim_sources cs
        where cs.personality_id=p.id and cs.field_name in ('lgbti_connection','lgbti_details')
          and cs.verification_status in ('pending','verified')
      )
    order by p.updated_at,p.id limit greatest(1,least(p_limit,500))
  )
  update public.personality_sources s
  set source_url='https://www.wikidata.org/wiki/'||c.wikidata_qid,
      last_seen_at=now()
  from candidates c
  where s.personality_id=c.id and c.wikidata_qid is not null
    and nullif(btrim(s.source_url),'') is null
    and (s.source_slug ilike '%wikidata%' or s.source_entity_id=c.wikidata_qid);

  with candidates as materialized (
    select p.id,p.wikidata_qid
    from public.personalities p
    where p.visibility='public' and p.wikidata_qid is not null
      and p.lgbti_connection is not null
      and p.lgbti_connection not in ('','none_known','unclear')
      and not exists (
        select 1 from public.personality_claim_sources cs
        where cs.personality_id=p.id and cs.field_name in ('lgbti_connection','lgbti_details')
          and cs.verification_status in ('pending','verified')
      )
    order by p.updated_at,p.id limit greatest(1,least(p_limit,500))
  )
  insert into public.personality_sources
    (personality_id,source_slug,source_entity_id,source_url,confidence,is_primary,last_seen_at,raw)
  select c.id,'wikidata-claim',c.wikidata_qid,
    'https://www.wikidata.org/wiki/'||c.wikidata_qid,0.5,false,now(),
    jsonb_build_object('purpose','pending LGBTQ+ claim corroboration')
  from candidates c
  where not exists (
    select 1 from public.personality_sources s
    where s.personality_id=c.id and nullif(btrim(s.source_url),'') is not null
  );

  with candidates as materialized (
    select p.id,p.lgbti_connection
    from public.personalities p
    where p.visibility='public' and p.duplicate_of_id is null
      and coalesce(p.review_status,'') not in ('archived','rejected')
      and p.lgbti_connection is not null
      and p.lgbti_connection not in ('','none_known','unclear')
      and not exists (
        select 1 from public.personality_claim_sources cs
        where cs.personality_id=p.id and cs.field_name in ('lgbti_connection','lgbti_details')
          and cs.verification_status in ('pending','verified')
      )
    order by p.updated_at,p.id limit greatest(1,least(p_limit,500))
  ), inserted as (
    insert into public.personality_claim_sources
      (personality_id,field_name,source_id,confidence,verification_status,checked_at)
    select c.id,'lgbti_connection',src.id,
      least(0.75,coalesce(src.confidence,0.5)),'pending',null
    from candidates c
    cross join lateral (
      select s.id,s.confidence from public.personality_sources s
      where s.personality_id=c.id and nullif(btrim(s.source_url),'') is not null
      order by s.is_primary desc nulls last,s.confidence desc nulls last,s.last_seen_at desc nulls last
      limit 1
    ) src
    on conflict do nothing returning personality_id,source_id
  ) select count(*) into v_linked from inserted;

  with queued as (
    insert into public.entity_review_queue
      (entity_type,entity_id,field,proposed_value,citations,confidence,model,status)
    select 'personality',p.id,'lgbti_connection',to_jsonb(p.lgbti_connection),
      jsonb_build_array(jsonb_build_object('source_id',cs.source_id,'state','pending_verification')),
      cs.confidence,'personality-quality-v2','open'
    from public.personalities p
    join public.personality_claim_sources cs on cs.personality_id=p.id
      and cs.field_name='lgbti_connection' and cs.verification_status='pending'
    where p.visibility='public' and not exists (
      select 1 from public.entity_review_queue q
      where q.entity_type='personality' and q.entity_id=p.id
        and q.field='lgbti_connection' and q.status='open'
    )
    on conflict do nothing returning id
  ) select count(*) into v_queued from queued;

  return jsonb_build_object('linked',v_linked,'queued',v_queued);
end;
$$;
revoke all on function public.backfill_personality_public_claim_sources(int)
  from public,anon,authenticated;
grant execute on function public.backfill_personality_public_claim_sources(int) to service_role;

create or replace function public.backfill_personality_public_quality_queues(p_limit int default 500)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_images int := 0; v_reviews int := 0;
begin
  with candidates as materialized (
    select p.id,to_jsonb(p.image_status) old_value
    from public.personalities p
    where p.visibility='public' and p.image_url is null
      and p.image_status in ('pending','needs_review')
      and not exists (
        select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
        where l.entity_type='personality' and l.entity_id=p.id and l.role='cover'
          and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
      )
    order by p.updated_at,p.id limit greatest(1,least(p_limit,500))
  ), audit as (
    insert into private.personality_remediation_audit
      (batch_key,personality_id,field_name,old_value,new_value,reason)
    select 'personality-image-unavailable-v1',id,'image_status',old_value,
      to_jsonb('unavailable'::text),'no usable portrait after placeholder quarantine'
    from candidates on conflict do nothing returning personality_id
  ), upd as (
    update public.personalities p set image_status='unavailable',updated_at=now()
    from candidates c where p.id=c.id returning p.id
  ) select count(*) into v_images from upd;

  with issues as (
    select p.id,'description'::text field,to_jsonb(p.description) proposed,
      'summary outside 120-240 character contract' reason
    from public.personalities p
    where p.visibility='public'
      and public.personality_publication_failures(p.id)@>array['summary_or_bio_too_thin']
    union all
    select p.id,'image_url',to_jsonb(p.image_url),'rejected image needs corroborated replacement'
    from public.personalities p
    where p.visibility='public' and p.image_status='rejected'
    union all
    select p.id,'verification_status',to_jsonb(p.verification_status),'pending state lacked an actionable queue row'
    from public.personalities p
    where p.review_status='pending'
      and not exists(select 1 from public.entity_review_queue q
        where q.entity_type='personality' and q.entity_id=p.id and q.status='open')
      and not exists(select 1 from public.personality_tag_review_queue q
        where q.personality_id=p.id and q.status='open')
  ), queued as (
    insert into public.entity_review_queue
      (entity_type,entity_id,field,proposed_value,citations,confidence,model,status,reviewer_note)
    select 'personality',i.id,i.field,coalesce(i.proposed,'null'::jsonb),'[]'::jsonb,
      0,'personality-quality-v2','open',i.reason
    from issues i
    where not exists(select 1 from public.entity_review_queue q
      where q.entity_type='personality' and q.entity_id=i.id and q.field=i.field and q.status='open')
    on conflict do nothing returning id
  ) select count(*) into v_reviews from queued;

  update public.personalities p set needs_attention=true
  where p.visibility='public' and cardinality(public.personality_publication_failures(p.id))>0;
  return jsonb_build_object('images_marked_unavailable',v_images,'reviews_queued',v_reviews);
end;
$$;
revoke all on function public.backfill_personality_public_quality_queues(int)
  from public,anon,authenticated;
grant execute on function public.backfill_personality_public_quality_queues(int) to service_role;

commit;
