-- A calendar page can describe several occurrences. Reject a date proposal
-- only when it selects a separately captured occurrence of the same programme.
create function api_private.reconcile_calendar_sibling_dates(
  p_batch integer default 100, p_dry_run boolean default true
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  r record;
  after_row jsonb;
  ids uuid[]:='{}';
begin
  perform public.assert_admin_or_internal();
  if auth.uid() is not null then raise exception 'Internal actor required'; end if;
  if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled)
  then return jsonb_build_object('skipped','paused'); end if;
  if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))
  then return jsonb_build_object('skipped','already_running'); end if;

  for r in
    with pending as materialized (
      select q.*
      from public.review_queue q
      where q.entity_type='event' and q.review_type='date_mismatch' and q.status='pending'
        and q.resolved_by is null and q.resolved_at is null
        and q.details->>'source'='event-agentic-enrich'
        and q.details->>'extracted_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and not (q.details ?| array['source_status','auto_resolution','matched_event_title'])
        and not exists (
          select 1 from jsonb_each_text(q.details) flag
          where flag.key in ('manual_hold','hard_blocker','requires_confirm','force_review','human_reviewed','manual_review_required')
            and lower(flag.value)='true'
        )
    ), occurrences as materialized (
      select e.id,e.data_source,e.external_id,lower(btrim(e.title)) title,e.city_id,e.country_id,
        e.start_date,(e.start_date at time zone 'Europe/Berlin')::date local_date,
        s.id source_id,s.source_url,s.payload_hash,
        md5(to_jsonb(e)::text) event_fingerprint,md5(to_jsonb(s)::text) source_fingerprint,
        case e.data_source when 'bka-theater' then s.payload#>>'{normalized,metadata,production_id}'
          else s.source_url end programme
      from public.events e
      join public.event_sources s on s.event_id=e.id and s.source_slug=e.data_source
        and s.source_entity_id=e.external_id and s.is_primary
      where e.data_source in ('bka-theater','lab-oratory') and e.duplicate_of_id is null
        and e.status in ('active','completed') and e.timezone='Europe/Berlin'
        and e.city_id is not null and e.country_id is not null
        and nullif(btrim(e.title),'') is not null
        and not (coalesce(e.field_provenance,'{}') ?| array['start_date','timezone'])
        and not exists (
          select 1 from public.content_revisions h
          where h.source_table='events' and h.source_id=e.id and h.actor_kind='human'
            and h.changed_fields && array['start_date','timezone','external_id','data_source']
        )
        and s.payload_hash~'^[a-f0-9]{64}$'
        and s.payload#>>'{raw,source}'=e.data_source and s.payload#>>'{raw,url}'=s.source_url
        and s.payload#>>'{normalized,metadata,source}'=e.data_source
        and s.payload#>>'{normalized,metadata,url}'=s.source_url
        and s.payload#>>'{normalized,sourceId}'=e.external_id
        and lower(btrim(s.payload#>>'{normalized,title}'))=lower(btrim(e.title))
        and case when s.payload#>>'{normalized,start_date}' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
            and pg_input_is_valid(s.payload#>>'{normalized,start_date}','timestamptz')
          then (s.payload#>>'{normalized,start_date}')::timestamptz=e.start_date else false end
        and (
          e.data_source='lab-oratory'
          and e.external_id ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
          and s.payload#>>'{normalized,metadata,block_id}'=e.external_id
          and s.source_url ~ '^https://www[.]lab-oratory[.]de/[a-z0-9-]+$'
          or e.data_source='bka-theater'
          and s.payload#>>'{normalized,metadata,production_id}' ~ '^[1-9][0-9]*$'
          and e.external_id=(s.payload#>>'{normalized,metadata,production_id}')||':'||
            to_char(e.start_date at time zone 'Europe/Berlin','YYYY-MM-DD"T"HH24:MI')
          and split_part(s.source_url,'&tid=',1)='https://www.bka-theater.de/content_start.php?id='||
            (s.payload#>>'{normalized,metadata,production_id}')
          and s.source_url ~ '&tid=[1-9][0-9]*$'
        )
    ), matching as (
      select q.id review_id,q.details,o.id event_id,o.source_id,p.id sibling_id,p.source_id sibling_source_id,
        count(*) over (partition by q.id) peer_count
      from pending q join occurrences o on o.id=q.entity_id
      join occurrences p on p.data_source=o.data_source and p.programme=o.programme and p.title=o.title
        and p.city_id=o.city_id and p.country_id=o.country_id and p.id<>o.id and p.external_id<>o.external_id
        and p.payload_hash<>o.payload_hash and p.local_date::text=q.details->>'extracted_date'
        and p.local_date<>o.local_date and (o.data_source<>'bka-theater' or p.source_url<>o.source_url)
      where q.details->>'page'=o.source_url
        and case when pg_input_is_valid(q.details->>'start_date','timestamptz')
          then (q.details->>'start_date')::timestamptz=o.start_date else false end
    )
    select q.id,to_jsonb(q) previous_review,m.event_id,o.start_date,o.source_id,o.source_url,o.payload_hash,
      p.id sibling_id,p.source_id sibling_source_id,p.source_url sibling_url,p.payload_hash sibling_hash,p.start_date sibling_start
    from matching m
    join public.review_queue q on q.id=m.review_id and q.status='pending' and q.resolved_at is null and q.resolved_by is null
    join occurrences o on o.id=m.event_id and o.source_id=m.source_id
    join occurrences p on p.id=m.sibling_id and p.source_id=m.sibling_source_id
    join public.events e on e.id=o.id join public.events peer on peer.id=p.id
    join public.event_sources s on s.id=o.source_id join public.event_sources ps on ps.id=p.source_id
    where m.peer_count=1 and q.details=m.details
      and md5(to_jsonb(e)::text)=o.event_fingerprint and md5(to_jsonb(peer)::text)=p.event_fingerprint
      and md5(to_jsonb(s)::text)=o.source_fingerprint and md5(to_jsonb(ps)::text)=p.source_fingerprint
    order by q.id limit greatest(0,least(coalesce(p_batch,0),200))
    for update of q skip locked for share of e,peer,s,ps skip locked
  loop
    ids:=array_append(ids,r.id);
    if p_dry_run is distinct from false then continue; end if;
    update public.review_queue q set status='rejected',resolved_at=now(),resolved_by=null,
      details=q.details||jsonb_build_object(
        'auto_resolution','calendar_sibling_date_proposal_discarded','human_reviewed',false,
        'resolution_note','The extracted date belongs to another captured occurrence of the same programme. The saved date remains unchanged.',
        'saved_occurrence',jsonb_build_object('source_id',r.source_id,'source_url',r.source_url,
          'payload_hash',r.payload_hash,'start',r.start_date),
        'other_occurrence',jsonb_build_object('event_id',r.sibling_id,'source_id',r.sibling_source_id,
          'source_url',r.sibling_url,'payload_hash',r.sibling_hash,'start',r.sibling_start)
      )
    where q.id=r.id returning to_jsonb(q) into after_row;
    insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
      values('review_queue',r.id,'calendar_sibling_date_proposal_discarded',r.previous_review,after_row);
  end loop;
  return jsonb_build_object('matched',cardinality(ids),'review_ids',to_jsonb(ids),'dry_run',p_dry_run is distinct from false);
end $fn$;

revoke all on function api_private.reconcile_calendar_sibling_dates(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.reconcile_calendar_sibling_dates(integer,boolean) to service_role;

-- Reuse the existing bounded review sweep, pause state and run journal.
do $hook$
declare
  definition text:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
  anchor text:=$anchor$jsonb_build_object('dry_run',p_dry_run,$anchor$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
  then raise exception 'Automatic resolution return contract changed'; end if;
  execute replace(definition,anchor,
    'jsonb_build_object(''calendar_sibling_dates'',api_private.reconcile_calendar_sibling_dates(v_limit,p_dry_run)) || '||anchor);
end $hook$;
