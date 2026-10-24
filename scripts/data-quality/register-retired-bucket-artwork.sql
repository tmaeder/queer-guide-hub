-- Default dry run: register verified source responses and record source outcomes.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:retired-source-bucket-artwork:v1';
do $repair$
#variable_conflict use_column
declare p jsonb;r record;outcome jsonb;scope jsonb;inputs jsonb;response_xml xml;
 dry_run boolean:=coalesce(nullif(current_setting('matching.retired_bucket_dry_run',true),''),'true')::boolean;
 ready integer:=0;recorded integer:=0;protected integer:=0;inserted integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal source evidence only';end if;
 if position('gaycities-wayback-retired-bucket-artwork:v1' in pg_get_functiondef('api_private.historical_graph_artwork_scope(uuid)'::regprocedure))=0
  then raise exception 'Retired source contract not deployed';end if;
 if not pg_try_advisory_xact_lock(hashtext('historical_graph_artwork'))then
  perform set_config('matching.retired_bucket_result',jsonb_build_object('dry_run',dry_run,'skipped',true,'reason','native_source_repair_busy',
   'source_denials_registered',0,'source_outcomes_recorded',0)::text,true);
  return;
 end if;
 inputs:=coalesce(nullif(current_setting('matching.retired_bucket_proofs',true),''),'[]')::jsonb;
 if jsonb_typeof(inputs)<>'array'or jsonb_array_length(inputs)>100 then raise exception 'At most one hundred response proofs';end if;
 for p in select value from jsonb_array_elements(inputs)loop
  if coalesce(p->>'event_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or coalesce(p->>'source_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or(select count(*)from jsonb_array_elements(inputs) other where other->>'event_id'=p->>'event_id')<>1
   or p->>'usable_denial'is distinct from 'true'or p->>'human_reviewed'is distinct from 'false'
   or p->>'status'is distinct from '403'or p->>'mime_type'is distinct from 'application/xml'
   or coalesce(p->>'image_url','')!~'^https://gaycities-featured-images-production[.]s3[.]amazonaws[.]com/events/(t/sm/|originals/)?[A-Za-z0-9._-]+[.](jpg|jpeg|png|webp)$'
   or octet_length(coalesce(p->>'response_body',''))not between 1 and 8192
   or coalesce(p->>'response_sha256','')!~'^[a-f0-9]{64}$'
   or encode(extensions.digest(p->>'response_body','sha256'),'hex')is distinct from p->>'response_sha256'
   or not coalesce(pg_input_is_valid(p->>'observed_at','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p->>'expected_updated_at','timestamp with time zone'),false)
   then protected:=protected+1;continue;end if;
  if (p->>'observed_at')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'
   or not xml_is_well_formed_document(p->>'response_body')then protected:=protected+1;continue;end if;
  response_xml:=xmlparse(document p->>'response_body');
  if coalesce((xpath('/Error/Code/text()',response_xml))[1]::text,'')<>'AccessDenied'then protected:=protected+1;continue;end if;
  select evt.id,to_jsonb(evt)old_event,to_jsonb(src)old_source into r
   from public.events evt join public.event_sources src on src.event_id=evt.id
   where evt.id=(p->>'event_id')::uuid and src.id=(p->>'source_id')::uuid
    and evt.title=p->>'title'and evt.updated_at=(p->>'expected_updated_at')::timestamptz
    and evt.duplicate_of_id is null and evt.status='completed'and coalesce(cardinality(evt.images),0)=0
    and src.source_slug='gaycities'and src.source_url=p->>'source_url'and src.payload_hash=p->>'payload_hash'
    and regexp_replace(src.payload#>>'{raw,jsonLd,image,0}','^http:','https:')=p->>'image_url'
    and not exists(select 1 from public.event_image_quality_observations observation where observation.event_id=evt.id
     and regexp_replace(observation.image_url,'^http:','https:')=p->>'image_url')
    and exists(select 1 from public.event_quality_issues issue where issue.event_id=evt.id and issue.status='open'
     and issue.issue_code='IMAGE_MISSING'and issue.reviewed_by is null and issue.reviewed_at is null)
   for update of evt,src skip locked;
  if not found then protected:=protected+1;continue;end if;
  ready:=ready+1;if dry_run then continue;end if;
  insert into public.event_image_quality_observations(event_id,image_url,url_hash,content_hash,http_status,mime_type,byte_size,
   probe_status,failure_reason,checked_at)
   values(r.id,p->>'image_url',encode(extensions.digest(p->>'image_url','sha256'),'hex'),p->>'response_sha256',403,'application/xml',
    octet_length(p->>'response_body'),'fail','retired_source_bucket:AccessDenied',(p->>'observed_at')::timestamptz)
   on conflict(event_id,image_url)do nothing;
  if not found then protected:=protected+1;continue;end if;
  scope:=api_private.historical_graph_artwork_scope(r.id);
  if scope is null then
   delete from public.event_image_quality_observations where event_id=r.id and image_url=p->>'image_url';
   protected:=protected+1;continue;
  end if;
  outcome:=public.reconcile_historical_graph_artwork(1,false,array[r.id]);
  if coalesce((outcome->>'source_outcomes_recorded')::integer,0)=0 then
   delete from public.event_image_quality_observations where event_id=r.id and image_url=p->>'image_url';
   protected:=protected+1;continue;
  end if;
  if exists(select 1 from public.events evt where evt.id=r.id and to_jsonb(evt)is distinct from r.old_event)
   or exists(select 1 from public.event_sources src where src.id=(p->>'source_id')::uuid and to_jsonb(src)is distinct from r.old_source)
   then raise exception 'Canonical/source fields changed during evidence registration';end if;
  inserted:=inserted+1;recorded:=recorded+(outcome->>'source_outcomes_recorded')::integer;
 end loop;
 perform set_config('matching.retired_bucket_result',jsonb_build_object('dry_run',dry_run,'ready_proofs',ready,
  'source_denials_registered',inserted,'source_outcomes_recorded',recorded,'protected_or_changed',protected)::text,true);
end $repair$;
select current_setting('matching.retired_bucket_result')::jsonb result;
commit;
