-- Fresh own-CDN logo proofs require an automated recognizable-brand selection,
-- not just successful image decoding. Unknown marks never enter the proof list.
-- Default dry run; matching.business_logo_proofs supplies the bounded evidence.
begin;
set local statement_timeout='30s';set local lock_timeout='2s';
set local app.actor='system:inherit-verified-primary-logo:v1';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;r record;after_row jsonb;changed integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 for r in
 with input as(
 select * from jsonb_to_recordset(coalesce(nullif(current_setting('matching.business_logo_proofs',true),''),'[]')::jsonb)
 as x(organization_id uuid,venue_id uuid,expected_business_updated_at timestamptz,expected_venue_updated_at timestamptz,
  logo_url text,observed_at timestamptz,http_status integer,mime_type text,byte_size integer,width integer,height integer,
  content_hash text,decoded boolean,selected_brand_identity boolean,selection text,human_reviewed boolean)
 ), eligible as materialized(select f.id finding_id,o.id organization_id,o.name,o.updated_at expected_business_updated_at,v.id venue_id,v.updated_at expected_venue_updated_at,v.logo_url,v.website,v.logo_on_ink,o.city_id,o.country_id
from organizations o join venues v on v.id=o.primary_venue_id and v.organization_id=o.id
join entity_quality_findings f on f.entity_type='organization' and f.entity_id=o.id and f.dimension='media' and f.state='fail' and f.waived_at is null
where o.status='active' and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
and o.claimed_by is null and o.claim_status='unclaimed' and o.last_verified_at is null and o.roles=array['venue']::text[]
and lower(btrim(o.name))=lower(btrim(v.name)) and o.city_id=v.city_id and o.country_id=v.country_id
and o.field_provenance#>>'{identity,source}'='unified_location' and o.field_provenance#>>'{identity,venue_id}'=v.id::text
and o.logo_url is null and o.cover_image_url is null and coalesce(cardinality(o.images),0)=0
and not(o.field_provenance?'logo_url') and not(o.field_provenance?'images') and not(o.field_provenance?'cover_image_url')
and not exists(select 1 from jsonb_each(o.field_provenance) p where p.value->>'human_reviewed'='true' or nullif(p.value->>'reviewed_by','')is not null)
and not exists(select 1 from content_revisions revision where revision.source_table='organizations' and revision.source_id=o.id and revision.actor_kind='human' and revision.changed_fields&&array['images','logo_url','cover_image_url'])
and not exists(select 1 from venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
and v.logo_url~'^https://img[.]queer[.]guide/logos/[a-f0-9]{64}[.]png$'
and public.platform_website_class(v.website)is null and not public.logo_mark_denied(v.logo_url)
and v.enrichment_status->'logo' is null and nullif(btrim(v.website),'')is not null
and (o.website is null or lower(substring(o.website from '^https?://(?:www[.])?([^/:?#]+)'))=lower(substring(v.website from '^https?://(?:www[.])?([^/:?#]+)')))
)
 select e.*,to_jsonb(o) old_row,to_jsonb(v) source_venue,to_jsonb(x) proof
 from eligible e join organizations o on o.id=e.organization_id join venues v on v.id=e.venue_id
 join entity_quality_findings finding on finding.id=e.finding_id and finding.waived_at is null and finding.state='fail'
 join input x on x.organization_id=o.id and x.venue_id=v.id and x.logo_url=v.logo_url
 where o.updated_at=x.expected_business_updated_at and v.updated_at=x.expected_venue_updated_at
 and x.observed_at between now()-interval '1 hour' and now()+interval '5 minutes'
 and x.http_status=200 and x.mime_type='image/png' and x.byte_size between 100 and 1048576
 and x.width between 32 and 2048 and x.height between 32 and 2048 and x.decoded
 and x.content_hash=public.logo_mark_sha256(v.logo_url) and x.selected_brand_identity
 and x.selection='automated_recognizable_same_business_brand:v1' and x.human_reviewed=false
 and not exists(select 1 from input other where other.organization_id=o.id and other.logo_url<>x.logo_url)
 order by o.id limit greatest(0,least(batch_size,100)) for update of o,v,finding skip locked
 loop
  changed:=changed+1;if dry_run then continue;end if;
  insert into business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
  values('organization',r.organization_id,'media',jsonb_build_object('logo_url',r.old_row->'logo_url'),
   jsonb_build_object('logo_url',r.logo_url,'source_venue_id',r.venue_id,'proof',r.proof,'human_reviewed',false),'verified_primary_venue_logo');
  update organizations set logo_url=r.logo_url,field_provenance=field_provenance||jsonb_build_object('logo_url',
   jsonb_build_object('source','verified_primary_venue_logo','source_table','venues','source_id',r.venue_id,
    'source_url',r.logo_url,'content_hash',r.proof->>'content_hash','observed_at',r.proof->>'observed_at',
    'source_updated_at',r.expected_venue_updated_at,'inherited_at',now(),'human_reviewed',false))
   where id=r.organization_id;
  select to_jsonb(o)into after_row from organizations o where id=r.organization_id;
  if after_row-'logo_url'-'field_provenance'-'updated_at'-'quality_checked_at' is distinct from r.old_row-'logo_url'-'field_provenance'-'updated_at'-'quality_checked_at'
   or (after_row->'field_provenance')-'logo_url' is distinct from r.old_row->'field_provenance'
   or after_row->>'logo_url' is distinct from r.logo_url
  then raise exception 'Unexpected business mutation %',r.organization_id;end if;
  if exists(select 1 from venues v where id=r.venue_id and to_jsonb(v)is distinct from r.source_venue)
  then raise exception 'Source venue changed %',r.venue_id;end if;
 end loop;
 perform set_config('matching.business_logo_result',jsonb_build_object('dry_run',dry_run,'candidates',changed)::text,false);
end $repair$;
select current_setting('matching.business_logo_result')::jsonb result;
commit;
