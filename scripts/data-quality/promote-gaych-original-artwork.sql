-- Default dry run. Replace only an unreviewed historical source-owned thumbnail.
-- The ordinary scanner owns all finding transitions and quality scores.
begin;
set local statement_timeout='30s';set local lock_timeout='2s';
set local app.actor='system:gaych-published-event-original:v1';
do $repair$
#variable_conflict use_column
declare input jsonb:=coalesce(nullif(current_setting('matching.gaych_original_proofs',true),''),'[]')::jsonb;
 dry_run boolean:=coalesce(nullif(current_setting('matching.gaych_original_dry_run',true),''),'true')::boolean;
 token uuid:=gen_random_uuid();p jsonb;j jsonb;r record;after_row jsonb;eligible integer:=0;ids uuid[]:='{}';new_images text[];
begin
 perform public.assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal publisher evidence only';end if;
 if jsonb_typeof(input)<>'array'or jsonb_array_length(input)>20 then raise exception 'At most twenty fresh publisher proofs';end if;
 if not dry_run then
  perform public.claim_event_image_quality_candidates(token,0);
  if not exists(select 1 from public.event_quality_worker_leases where worker='event-image-quality'and lease_token=token and lease_until>clock_timestamp())then
   perform set_config('matching.gaych_original_result','{"skipped":true,"reason":"native_image_worker_busy"}',true);return;
  end if;
 end if;
 for p in select value from jsonb_array_elements(input)loop
  if p->>'contract'is distinct from 'gaych_published_event_original:v1'or p->>'human_reviewed'is distinct from 'false'
   or p->>'source_http_status'is distinct from '200'or p->>'source_final_url'is distinct from p->>'source_url'
   or coalesce(p->>'source_url','')!~'^https://gay[.]ch/parties/[A-Za-z0-9%_.-]+$'
   or strpos(coalesce(p->>'url',''),(p->>'source_url')||'/@@download/image/')<>1
   or substring(p->>'url'from char_length(p->>'source_url')+1)!~'^/@@download/image/[^/?#]+$'
   or not public.event_quality_url_is_safe(p->>'url')
   or not coalesce(pg_input_is_valid(p->>'id','uuid'),false)
   or not coalesce(pg_input_is_valid(p->>'source_id','uuid'),false)
   or not coalesce(pg_input_is_valid(p->>'issue_id','uuid'),false)
   or not coalesce(pg_input_is_valid(p->>'expected_updated_at','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p->>'source_observed_at','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p#>>'{probe,observed_at}','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p->>'source_json_text','jsonb'),false)
   or encode(extensions.digest(p->>'source_json_text','sha256'),'hex')is distinct from p->>'source_json_sha256'
   or coalesce(p->>'source_html_sha256','')!~'^[a-f0-9]{64}$'
   or coalesce(p->>'source_payload_hash','')!~'^[a-f0-9]{64}$'
   or coalesce(p#>>'{probe,sha256}','')!~'^[a-f0-9]{64}$'
   or p#>>'{probe,status}'is distinct from '200'or p#>>'{probe,passed}'is distinct from 'true'
   or not coalesce(pg_input_is_valid(p#>>'{probe,width}','integer'),false)
   or not coalesce(pg_input_is_valid(p#>>'{probe,height}','integer'),false)
   or not coalesce(pg_input_is_valid(p#>>'{probe,bytes}','bigint'),false)
   then continue;end if;
  if(p->>'source_observed_at')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'
   or(p#>>'{probe,observed_at}')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'
   or(p#>>'{probe,width}')::integer<800 or(p#>>'{probe,height}')::integer<450
   or(p#>>'{probe,bytes}')::bigint not between 20000 and 12582912
   or(p#>>'{probe,bytes}')::numeric/((p#>>'{probe,width}')::numeric*(p#>>'{probe,height}')::numeric)<.05
   or(case p#>>'{probe,format}'when 'jpeg'then p#>>'{probe,mime}'is distinct from 'image/jpeg'
     when 'png'then p#>>'{probe,mime}'is distinct from 'image/png'when 'webp'then p#>>'{probe,mime}'is distinct from 'image/webp'else true end)
   or(select count(*)from jsonb_array_elements(input)x where x->>'id'=p->>'id')<>1 then continue;end if;
  j:=(p->>'source_json_text')::jsonb;
  if j->>'@type'is distinct from 'Event'or coalesce(j->>'@context','')not in('https://schema.org','http://schema.org')
   or not coalesce(pg_input_is_valid(j->>'startDate','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(left(j->>'startDate',10),'date'),false)then continue;end if;
  -- Preserve the auditor's content-reuse threshold across existing and supplied observations.
  if(select count(*)from(select event_id,image_url from public.event_image_quality_observations where content_hash=p#>>'{probe,sha256}'
   union select(x->>'id')::uuid,x->>'url'from jsonb_array_elements(input)x where x#>>'{probe,sha256}'=p#>>'{probe,sha256}')all_observations)>=10 then continue;end if;
  select e.id,to_jsonb(e)old_event,to_jsonb(s)old_source,to_jsonb(i)old_issue,
   coalesce((select jsonb_agg(to_jsonb(decision)order by decision.id)from public.event_quality_issues decision where decision.event_id=e.id
    and(decision.reviewed_by is not null or decision.reviewed_at is not null)),'[]')old_reviews into r
  from public.events e join public.event_sources s on s.event_id=e.id and s.id=(p->>'source_id')::uuid
  join public.event_quality_issues i on i.event_id=e.id and i.id=(p->>'issue_id')::uuid
  where e.id=(p->>'id')::uuid and e.updated_at=(p->>'expected_updated_at')::timestamptz
   and e.duplicate_of_id is null and coalesce(e.status,'active')not in('archived','rejected','cancelled')
   and coalesce(e.end_date,e.start_date)<now()-interval '30 days'
   and e.images[1]=p->>'old_image_url'and strpos(e.images[1],s.source_url||'/@@images/')=1
   and e.title=p->>'title'and btrim(regexp_replace(lower(extensions.unaccent(e.title)),'[^[:alnum:]]+',' ','g'))
     =btrim(regexp_replace(lower(extensions.unaccent(j->>'name')),'[^[:alnum:]]+',' ','g'))
   and abs((e.start_date at time zone 'UTC')::date-left(j->>'startDate',10)::date)<=1
   and s.source_slug='gay-ch'and s.source_url=p->>'source_url'and s.payload_hash=p->>'source_payload_hash'
   and i.status='open'and i.detector='event-image-quality'and i.dimension='media'and i.issue_code='IMAGE_LOW_RESOLUTION'
   and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null and i.evidence_hash=p->>'expected_issue_hash'
   and i.evidence->>'url'=e.images[1]and coalesce(i.evidence->>'image_role','event_artwork')in('event_artwork','cover','hero')
   and not(i.evidence?'governance_resolution')
   -- Retain older accepted archival gaps as history. A reviewed candidate asset
   -- itself, a human image edit or human image provenance still blocks promotion.
   and not exists(select 1 from public.event_quality_issues decision where decision.event_id=e.id and decision.dimension='media'
     and decision.evidence->>'url'=p->>'url'and(decision.reviewed_by is not null or decision.reviewed_at is not null))
   and exists(select 1 from public.event_image_quality_observations o where o.event_id=e.id and o.image_url=e.images[1])
   and not exists(select 1 from public.content_revisions revision where revision.source_table='events'and revision.source_id=e.id
     and revision.actor_kind='human'and revision.changed_fields&&array['images','field_provenance'])
   and(coalesce(e.field_provenance->'images','null'::jsonb)in('null'::jsonb,'{}'::jsonb)
     or(e.field_provenance#>>'{images,source}'in('gay-ch','source-gay-ch','pipeline','event-gap-worker')
       and coalesce(e.field_provenance#>>'{images,human_reviewed}','false')='false'
       and e.field_provenance#>>'{images,reviewed_by}'is null and e.field_provenance#>>'{images,actor_kind}'is distinct from 'human'))
   and not exists(select 1 from public.image_assets a where(a.url=p->>'url'or a.content_hash=p#>>'{probe,sha256}')and(a.is_flagged or a.status is distinct from 'active'))
   and not exists(select 1 from public.image_assets a join public.image_asset_links link on link.asset_id=a.id
     where(a.url=p->>'url'or a.content_hash=p#>>'{probe,sha256}')and link.entity_id<>e.id)
  for update of e,i skip locked for share of s skip locked;
  if not found then continue;end if;
  eligible:=eligible+1;ids:=array_append(ids,r.id);if dry_run then continue;end if;
  if not exists(select 1 from public.event_quality_worker_leases where worker='event-image-quality'and lease_token=token and lease_until>clock_timestamp())then raise exception 'Native image lease lost';end if;
  new_images:=array[p->>'url']||array(select value from jsonb_array_elements_text(r.old_event->'images')value where value<>p->>'old_image_url'and value<>p->>'url');
  update public.events set images=new_images,updated_at=now(),field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('images',
   jsonb_build_object('source','gaych-published-event-original:v1','source_id',p->>'source_id','source_url',p->>'source_url',
    'source_payload_hash',p->>'source_payload_hash','source_observed_at',p->>'source_observed_at','source_json_sha256',p->>'source_json_sha256',
    'source_html_sha256',p->>'source_html_sha256','source_event',j,'probe',p->'probe','value',to_jsonb(new_images),
    'previous_value',r.old_event->'images','previous_provenance',r.old_event#>'{field_provenance,images}','human_reviewed',false))where id=r.id;
  select to_jsonb(e)into after_row from public.events e where e.id=r.id;
  if after_row-array['images','field_provenance','updated_at']is distinct from r.old_event-array['images','field_provenance','updated_at']
   or(after_row->'field_provenance')-'images'is distinct from coalesce(nullif(r.old_event->'field_provenance','null'::jsonb),'{}')-'images'
   or after_row->'images'is distinct from to_jsonb(new_images)
   or exists(select 1 from public.event_sources s where s.id=(p->>'source_id')::uuid and to_jsonb(s)is distinct from r.old_source)
   or exists(select 1 from public.event_quality_issues i where i.id=(p->>'issue_id')::uuid and to_jsonb(i)is distinct from r.old_issue)
   or coalesce((select jsonb_agg(to_jsonb(decision)order by decision.id)from public.event_quality_issues decision where decision.event_id=r.id
     and(decision.reviewed_by is not null or decision.reviewed_at is not null)),'[]')is distinct from r.old_reviews
   then raise exception 'Unrelated event, source, score or finding changed';end if;
  -- Retain the actual passing observation, so later batches see content reuse.
  insert into public.event_image_quality_observations(event_id,image_url,url_hash,content_hash,http_status,mime_type,byte_size,width,height,probe_status,failure_reason,checked_at)
   values(r.id,p->>'url',encode(extensions.digest(p->>'url','sha256'),'hex'),p#>>'{probe,sha256}',200,p#>>'{probe,mime}',
    (p#>>'{probe,bytes}')::bigint,(p#>>'{probe,width}')::integer,(p#>>'{probe,height}')::integer,'pass',null,(p#>>'{probe,observed_at}')::timestamptz)
   on conflict(event_id,image_url)do update set url_hash=excluded.url_hash,content_hash=excluded.content_hash,http_status=excluded.http_status,
    mime_type=excluded.mime_type,byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,probe_status=excluded.probe_status,
    failure_reason=excluded.failure_reason,checked_at=excluded.checked_at;
  delete from public.event_quality_current where event_id=r.id;
 end loop;
 if not dry_run then perform public.release_event_quality_worker_lease('event-image-quality',token);end if;
 perform set_config('matching.gaych_original_result',jsonb_build_object('dry_run',dry_run,'eligible',eligible,'promoted',case when dry_run then 0 else eligible end,'event_ids',to_jsonb(ids))::text,true);
end $repair$;
select current_setting('matching.gaych_original_result')::jsonb result;
commit;
