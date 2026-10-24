-- Restore an omitted reference from its own original registered payload.
-- No new source URL, venue fact, quality pass or publication is inferred.
-- Default preview; at most 100 sources. Whole-row assertions guard each write.
begin;
set local statement_timeout='30s';set local lock_timeout='2s';
set local app.actor='system:restore-registered-source-links:v1';
do $repair$
declare dry_run boolean:=coalesce(current_setting('matching.restore_source_links_apply',true),'false')is distinct from 'true';
 r record;after_source jsonb;changed int:=0;ready int:=0;ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal source reference repair only';end if;
 if not pg_try_advisory_xact_lock(hashtext('restore_registered_spartacus_source_links'))then raise exception 'Source repair already running';end if;
 for r in
 select s.id,s.venue_id,s.payload#>>'{raw,url}' original_url,to_jsonb(s)old_source,to_jsonb(v)old_venue,to_jsonb(o)old_org
 from public.venue_sources s join public.venues v on v.id=s.venue_id
 join public.organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
 where s.source_slug='spartacus'and s.source_url is null and s.payload#>>'{raw,source}'='spartacus'
 and s.source_entity_id~'^[1-9][0-9]*$'
 and s.payload#>>'{raw,url}'~'^https://spartacus[.]gayguide[.]travel/(goingout|saunas)/[^?#[:space:]<>]+/[1-9][0-9]*_[^/?#[:space:]<>]+$'
 and substring(s.payload#>>'{raw,url}'from '/([1-9][0-9]*)_[^/]+$')=s.source_entity_id
 and s.payload#>>'{raw,url}'!~*'(%(00|0a|0d|2f|5c)|(^|/)\.\.(/|$))'
 and s.payload_hash~'^[a-f0-9]{64}$'
 and v.duplicate_of_id is null and v.closed_at is null and o.duplicate_of_id is null
 and o.status='active'and o.claim_status='unclaimed'and o.claimed_by is null and o.last_verified_at is null
 and o.field_provenance#>>'{identity,source}'='unified_location'
 and lower(btrim(o.name))=lower(btrim(v.name))
 and not exists(select 1 from public.content_revisions x where x.actor_kind='human'
  and((x.source_table='venue_sources'and x.source_id=s.id)or(x.source_table='venues'and x.source_id=v.id))
  and x.changed_fields&&array['source_url','sources'])
 order by s.id limit 100 for update of s,v,o skip locked
 loop
  ready:=ready+1;if dry_run then continue;end if;
  update public.venue_sources set source_url=r.original_url where id=r.id and source_url is null;
  if not found then raise exception 'Locked source changed';end if;
  select to_jsonb(s)into after_source from public.venue_sources s where s.id=r.id;
  if after_source is distinct from jsonb_set(r.old_source,'{source_url}',to_jsonb(r.original_url))then raise exception 'Unrelated source field changed';end if;
  if r.old_venue is distinct from(select to_jsonb(v)from public.venues v where v.id=r.venue_id)then raise exception 'Venue facts changed';end if;
  if(r.old_org-array['quality_checked_at','updated_at'])is distinct from
    (select to_jsonb(o)-array['quality_checked_at','updated_at']from public.organizations o where o.id=(r.old_org->>'id')::uuid)then raise exception 'Organization facts changed';end if;
  insert into public.business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
  values('organization',(r.old_org->>'id')::uuid,'linkage',jsonb_build_object('source_id',r.id,'source_url',null,'payload_hash',r.old_source->'payload_hash'),
   jsonb_build_object('source_id',r.id,'source_url',r.original_url,'source_path','venue_sources.payload.raw.url','human_reviewed',false),'registered_source_reference_restored');
  changed:=changed+1;ids:=array_append(ids,r.id);
 end loop;
 perform set_config('matching.source_link_restore_result',jsonb_build_object('dry_run',dry_run,'candidates',ready,'restored',changed,'source_ids',ids)::text,true);
end $repair$;
select current_setting('matching.source_link_restore_result')::jsonb result;
commit;
