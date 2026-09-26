begin;

insert into public.review_field_registry
  (entity_type,field,label,target_table,target_column,value_key,apply_mode,apply_args,batchable,risk_gate,active)
values
  ('personality','description','Description','personalities','description','value','text',
   '{"touch":["updated_at"]}'::jsonb,false,null,true),
  ('personality','image_url','Portrait URL','personalities','image_url','value','text',
   '{"touch":["updated_at"]}'::jsonb,false,null,true)
on conflict(entity_type,field) do update set active=true;

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
    select p.id,'verification_status',to_jsonb(p.verification_status),
      'pending state lacked an actionable queue row'
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
