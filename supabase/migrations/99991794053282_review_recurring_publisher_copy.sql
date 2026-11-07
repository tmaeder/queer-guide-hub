-- A description may intentionally be repeated across a publisher's separately
-- dated occurrences. Match the captured occurrence itself and two other
-- dates of the same series, place and copy before suppressing the reuse finding.
create function api_private.event_recurring_publisher_copy(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
with targets as materialized (
 select e.id,e.title,e.data_source,public.event_quality_description_fingerprint(e.description) fingerprint
 from public.events e
 where e.id=p_id and e.duplicate_of_id is null
 and e.data_source in ('haz-ch','milchjugend','siegessaeule','lgbtnetwork','ticketcorner')
 and length(btrim(coalesce(e.description,'')))>=20
 and not exists (select 1 from public.content_revisions h where h.source_table='events' and h.source_id=e.id
  and h.actor_kind='human' and h.changed_fields&&array['description','title','start_date','external_id','data_source'])
 and not exists (select 1 from public.event_quality_issues held where held.event_id=e.id
  and held.issue_code='DESCRIPTION_REUSED' and held.status='open'
  and (held.reviewed_by is not null or held.reviewed_at is not null
   or coalesce(held.evidence,'{}') ?| array['manual_hold','manual_review_required']))
), cluster_events as materialized (
 select e.* from targets t
 join public.events e on public.event_quality_description_fingerprint(e.description)=t.fingerprint and e.duplicate_of_id is null and length(btrim(coalesce(e.description,'')))>=20
), publisher as materialized (
 select e.id,s.id source_id,s.source_url,s.payload_hash,
  public.event_quality_description_fingerprint(e.description) fingerprint,
  e.title,e.start_date,e.data_source,e.city_id,e.country_id,
  (e.start_date at time zone case
   when e.data_source in ('haz-ch','milchjugend') then 'Europe/Zurich'
   when e.data_source in ('siegessaeule','ticketcorner') then 'Europe/Berlin'
   when e.data_source='lgbtnetwork' then 'America/New_York'
  end)::date occurrence_date,
  public.city_canonical_key(coalesce(ci.name,e.city)) location_city,
  coalesce(s.payload#>>'{normalized,metadata,venue_source_id}',s.payload#>>'{normalized,venue_name}') location_key,
  coalesce(s.payload#>>'{normalized,location,address}','') location_address,
  case
   when e.data_source='haz-ch' and co.code='CH' and s.source_url='https://haz.ch/event/'||e.external_id||'/'
    and s.payload#>>'{raw,slug}'=e.external_id and s.payload#>>'{raw,title}'=e.title
    and s.payload#>>'{normalized,location,timezone}'='Europe/Zurich'
    and e.external_id~'^[a-z0-9-]+$' and nullif(s.payload#>>'{normalized,metadata,venue_source_id}','') is not null
    then regexp_replace(e.external_id,'-[0-9]+$','')
   when e.data_source='milchjugend' and co.code='CH'
    and e.external_id~'^[a-z0-9-]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and s.payload#>>'{raw,key}'=e.external_id and s.payload#>>'{raw,title}'=e.title
    and s.payload#>>'{normalized,metadata,milchjugend_key}'=e.external_id
    and s.payload#>>'{normalized,location,timezone}'='Europe/Zurich'
    and split_part(e.external_id,':',2)=to_char(e.start_date at time zone 'Europe/Zurich','YYYY-MM-DD')
    and s.source_url='https://milchjugend.ch/event/'||replace(e.external_id,':','/')||'/'
    and s.payload#>>'{normalized,metadata,venue_source_id}'~'^venue-[1-9][0-9]*$'
    then split_part(e.external_id,':',1)
   when e.data_source='siegessaeule' and co.code='DE' and s.payload#>>'{raw,source}'='siegessaeule'
    and s.payload#>>'{normalized,location,timezone}'='Europe/Berlin'
    and s.payload#>>'{normalized,metadata,series}'~'^[a-z0-9-]+/([a-z0-9-]|%[A-F0-9]{2})+$'
    and s.payload#>>'{normalized,metadata,series}'!~*'%(2f|5c|2e|25|3f|23)'
    and e.external_id=(s.payload#>>'{normalized,metadata,series}')||'/'||to_char(e.start_date at time zone 'Europe/Berlin','YYYY-MM-DD/HH24:MI')
    and s.source_url='https://www.siegessaeule.de/termine/'||e.external_id||'/'
    then s.payload#>>'{normalized,metadata,series}'
   when e.data_source='lgbtnetwork' and co.code='US' and s.payload#>>'{raw,id}'=e.external_id and s.payload#>>'{raw,title}'=e.title
    and s.payload#>>'{normalized,metadata,wp_id}'=e.external_id
    and s.payload#>>'{normalized,location,timezone}'='America/New_York'
    and nullif(s.payload#>>'{normalized,location,address}','') is not null
    and s.payload#>>'{raw,slug}'~'^[a-z0-9-]+$'
    and s.source_url='https://lgbtnetwork.org/events/'||(s.payload#>>'{raw,slug}')||'/'
    then regexp_replace(s.payload#>>'{raw,slug}','-[0-9]+$','')
   when e.data_source='ticketcorner' and co.code='DE' and s.payload#>>'{raw,source}'='ticketcorner'
    and e.external_id~'^[1-9][0-9]*$'
    and s.payload#>>'{normalized,location,timezone}'='Europe/Berlin'
    and nullif(s.payload#>>'{normalized,location,address}','') is not null
    and s.source_url~'^https://www[.]ticketcorner[.]ch/event/[a-z0-9-]+/$'
    and s.source_url like '%-'||e.external_id||'/'
    then regexp_replace(s.source_url,'-[0-9]+/$','')
  end series
 from cluster_events e
 join public.event_sources s on s.event_id=e.id and s.source_slug=e.data_source and s.source_entity_id=e.external_id
 join public.countries co on co.id=e.country_id
 left join public.cities ci on ci.id=e.city_id and ci.country_id=e.country_id and ci.duplicate_of_id is null
 where s.payload_hash~'^[0-9a-f]{64}$' and s.payload#>>'{raw,url}'=s.source_url
 and s.payload#>>'{normalized,sourceId}'=s.source_entity_id
 and s.payload#>>'{normalized,metadata,source}'=s.source_slug and s.payload#>>'{normalized,metadata,url}'=s.source_url
 and s.payload#>>'{normalized,title}'=e.title and s.payload#>>'{normalized,description}'=e.description
 and s.payload#>>'{normalized,location,country}'=co.code
 and (e.city_id is null or ci.id is not null)
 and (public.city_canonical_key(s.payload#>>'{normalized,location,city}') in (public.city_canonical_key(ci.name),public.city_canonical_key(e.city))
   or (co.code='CH' and ci.name='Biel/Bienne' and s.payload#>>'{normalized,location,city}' in ('Biel','Bienne')))
 and case when pg_input_is_valid(s.payload#>>'{normalized,start_date}','timestamptz')
   then (s.payload#>>'{normalized,start_date}')::timestamptz=e.start_date else false end
 and not exists(select 1 from public.event_sources peer where peer.event_id=e.id and peer.source_slug=s.source_slug and peer.source_entity_id=s.source_entity_id and peer.id<>s.id)
), eligible as (
select t.id,t.title,t.data_source, p.series,p.location_key,p.location_address,p.location_city,p.source_id,p.source_url,p.payload_hash,p.fingerprint,
 count(distinct other.occurrence_date) occurrence_count,
 jsonb_agg(jsonb_build_object('id',other.source_id,'url',other.source_url,'payload_hash',other.payload_hash,
  'start_date',other.start_date,'occurrence_date',other.occurrence_date) order by other.start_date) captures
from targets t join publisher p on p.id=t.id
join publisher other on other.fingerprint=p.fingerprint and other.data_source=p.data_source and other.series=p.series
 and other.city_id is not distinct from p.city_id and other.country_id=p.country_id
 and other.location_city=p.location_city and other.location_key=p.location_key and other.location_address=p.location_address and other.title=p.title
where p.series is not null and nullif(btrim(p.location_key),'') is not null and nullif(p.location_city,'') is not null
group by t.id,t.title,t.data_source,p.series,p.location_key,p.location_address,p.location_city,p.source_id,p.source_url,p.payload_hash,p.fingerprint
having count(distinct other.occurrence_date)>=3 and count(distinct other.source_url)>=3
)
select jsonb_build_object(
 'series',p.series,'source_url',p.source_url,'payload_hash',p.payload_hash,'occurrence_count',p.occurrence_count,
 'examples',(select jsonb_agg(sample.entry order by sample.entry->>'start_date') from (
  select distinct on(entry->>'occurrence_date') entry from jsonb_array_elements(p.captures) entry
  order by entry->>'occurrence_date',entry->>'start_date',entry->>'id' limit 3
 ) sample)
) from eligible p;
$fn$;
revoke all on function api_private.event_recurring_publisher_copy(uuid) from public,anon,authenticated;
grant execute on function api_private.event_recurring_publisher_copy(uuid) to service_role;

-- Reuse the existing detector, bounded sweep, and audit journal.
do $patch$
declare
 definition text;
 anchor text:=$anchor$from subject e cross join siblings s group by e.publisher_series),false);$anchor$;
begin
 definition:=pg_get_functiondef('api_private.event_description_reuse_expected(uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Publisher description detector changed';end if;
 execute replace(definition,anchor,
  'from subject e cross join siblings s group by e.publisher_series),false) or api_private.event_recurring_publisher_copy(p_id) is not null;');

 definition:=pg_get_functiondef('api_private.reconcile_publisher_event_copy(integer,boolean)'::regprocedure);
 anchor:=$anchor$'publisher_series',api_private.event_publisher_copy_identity(r.event_id),'human_reviewed',false,$anchor$;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Publisher copy sweep changed';end if;
 definition:=replace(definition,anchor,$replace$
    'publisher_series',api_private.event_publisher_copy_identity(r.event_id),'human_reviewed',false,
    'publisher_occurrences',api_private.event_recurring_publisher_copy(r.event_id),
 $replace$);
 anchor:=$anchor$and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null$anchor$;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Publisher copy review guard changed';end if;
 execute replace(definition,anchor,anchor||' and not coalesce(i.evidence,''{}'') ?| array[''manual_hold'',''manual_review_required'']');
end $patch$;
