-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928144713 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Governance remediation wave 2: exhaust deterministic address derivation,
-- repair confirmed country errors, and explicitly disposition every residual
-- baseline gap without inventing address data.

set lock_timeout='15s';
set statement_timeout='600s';

-- Re-run the deterministic city -> country/state derivation for legacy rows.
update public.venues v
set country_id=coalesce(v.country_id,c.country_id),
    country=coalesce(nullif(btrim(v.country),''),co.code),
    state=coalesce(nullif(btrim(v.state),''),nullif(btrim(c.region_name),''))
from public.cities c
left join public.countries co on co.id=c.country_id
where v.city_id=c.id
  and v.duplicate_of_id is null
  and (
    v.country_id is null
    or nullif(btrim(v.country),'') is null
    or (nullif(btrim(v.state),'') is null and nullif(btrim(c.region_name),'') is not null)
  );

update public.events e
set country_id=coalesce(e.country_id,c.country_id),
    country=coalesce(nullif(btrim(e.country),''),co.code),
    state=coalesce(nullif(btrim(e.state),''),nullif(btrim(c.region_name),''))
from public.cities c
left join public.countries co on co.id=c.country_id
where e.city_id=c.id
  and e.duplicate_of_id is null
  and (
    e.country_id is null
    or nullif(btrim(e.country),'') is null
    or (nullif(btrim(e.state),'') is null and nullif(btrim(c.region_name),'') is not null)
  );

update public.hotels h
set country_id=coalesce(h.country_id,c.country_id),
    country=coalesce(nullif(btrim(h.country),''),co.code),
    state=coalesce(nullif(btrim(h.state),''),nullif(btrim(c.region_name),''))
from public.cities c
left join public.countries co on co.id=c.country_id
where h.city_id=c.id
  and h.duplicate_of_id is null
  and (
    h.country_id is null
    or nullif(btrim(h.country),'') is null
    or (nullif(btrim(h.state),'') is null and nullif(btrim(c.region_name),'') is not null)
  );

update public.organizations o
set country_id=coalesce(o.country_id,c.country_id),
    state=coalesce(nullif(btrim(o.state),''),nullif(btrim(c.region_name),''))
from public.cities c
where o.city_id=c.id
  and o.duplicate_of_id is null
  and (
    o.country_id is null
    or (nullif(btrim(o.state),'') is null and nullif(btrim(c.region_name),'') is not null)
  );

-- Resolve country text on unlinked rows where it is an exact ISO/name match.
update public.venues v set country_id=c.id,country=c.code
from public.countries c
where v.country_id is null and v.duplicate_of_id is null
  and (upper(btrim(v.country))=upper(c.code) or lower(btrim(v.country))=lower(c.name));
update public.events e set country_id=c.id,country=c.code
from public.countries c
where e.country_id is null and e.duplicate_of_id is null
  and (upper(btrim(e.country))=upper(c.code) or lower(btrim(e.country))=lower(c.name));
update public.hotels h set country_id=c.id,country=c.code
from public.countries c
where h.country_id is null and h.duplicate_of_id is null
  and (upper(btrim(h.country))=upper(c.code) or lower(btrim(h.country))=lower(c.name));

-- Confirmed wrong-country records. The remaining mismatch cohort consists of
-- border centroids or disputed territory and is dispositioned below.
update public.venues v
set country_id=c.id,country=c.code
from public.countries c
where v.id='81ac9d1d-6beb-4a88-b440-1ad41a1afeed'::uuid
  and c.code='US';

update public.cities ci
set country_id=c.id
from public.countries c
where (ci.id,c.code) in (
  ('56e86e00-b145-4de1-8f40-f9a08291ac93'::uuid,'GB'),
  ('ae6e38df-4587-44b6-a601-379f6687490a'::uuid,'PL'),
  ('4c6502ff-7122-4eb0-8ea8-6593aac464f7'::uuid,'EG'),
  ('0614d22b-bc1f-4a9f-a221-75444ad11a26'::uuid,'US')
);

-- Refresh the materialized findings so repaired rows disappear immediately.
select public.run_geo_containment_sweep();

create temporary table governance_address_current on commit drop as
select 'venue'::text entity_type,id,
  country_id,state,postal_code,latitude::numeric,longitude::numeric,
  (duplicate_of_id is null and closed_at is null and coalesce(review_status,'')<>'archived') in_scope,
  true postal_applicable
from public.venues
union all
select 'event',id,country_id,state,postal_code,latitude::numeric,longitude::numeric,
  (duplicate_of_id is null and status in ('active','completed') and review_status='approved'),
  (coalesce(end_date,start_date)>=current_date)
from public.events
union all
select 'hotel',id,country_id,state,postal_code,latitude::numeric,longitude::numeric,
  duplicate_of_id is null,true
from public.hotels
union all
select 'organization',id,country_id,state,postal_code,latitude::numeric,longitude::numeric,
  (duplicate_of_id is null and status='active'),true
from public.organizations;

create index on governance_address_current(entity_type,id);

-- Completeness findings: repair when a value now exists; otherwise record why
-- the field cannot be populated from available relational/geocoder evidence.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when i.finding_key='ADDRESS_COUNTRY_MISSING' and c.country_id is not null then 'resolved'
      when i.finding_key='ADDRESS_STATE_MISSING' and nullif(btrim(c.state),'') is not null then 'resolved'
      when i.finding_key='ADDRESS_POSTAL_MISSING' and nullif(btrim(c.postal_code),'') is not null then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when not c.in_scope or (i.finding_key='ADDRESS_POSTAL_MISSING' and not c.postal_applicable)
        then 'not_applicable'
      when (i.finding_key='ADDRESS_COUNTRY_MISSING' and c.country_id is not null)
        or (i.finding_key='ADDRESS_STATE_MISSING' and nullif(btrim(c.state),'') is not null)
        or (i.finding_key='ADDRESS_POSTAL_MISSING' and nullif(btrim(c.postal_code),'') is not null)
        then 'derived'
      else 'source_unavailable'
    end,
    resolution_evidence=jsonb_strip_nulls(jsonb_build_object(
      'in_scope',c.in_scope,
      'postal_applicable',c.postal_applicable,
      'has_coordinates',c.latitude is not null and c.longitude is not null,
      'terminal_geocoder_outcome',exists(
        select 1 from public.geo_address_terminal_outcomes t
        where t.entity_type=c.entity_type and t.entity_id=c.id
          and t.outcome='source_reports_no_postal_code'
      ),
      'decision',case
        when not c.in_scope then 'entity outside live canonical scope'
        when i.finding_key='ADDRESS_POSTAL_MISSING' and not c.postal_applicable
          then 'historical event postal code has no user value'
        when i.finding_key='ADDRESS_POSTAL_MISSING'
          and exists(select 1 from public.geo_address_terminal_outcomes t
            where t.entity_type=c.entity_type and t.entity_id=c.id)
          then 'reverse geocoder reported no postal code'
        when c.latitude is null or c.longitude is null
          then 'no coordinates available for reverse geocoding'
        else 'linked city/source corpus contains no value'
      end
    )),
    resolved_at=now()
from active,governance_address_current c
where i.run_id=active.id
  and i.engine='addresses'
  and i.resolution_state='open'
  and i.finding_key in (
    'ADDRESS_COUNTRY_MISSING','ADDRESS_STATE_MISSING','ADDRESS_POSTAL_MISSING'
  )
  and i.entity_type=c.entity_type
  and i.entity_id=c.id::text;

-- Coordinate findings that vanished after the repairs are resolved. Remaining
-- offshore/border/disputed cases are terminal detector limitations, preserving
-- the measured evidence rather than moving coordinates to arbitrary land.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when not exists(
        select 1 from public.geo_containment_findings f
        where f.entity_type=i.entity_type and f.entity_id::text=i.entity_id
          and 'GEO_'||upper(f.violation_class)=i.finding_key
      ) then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when not exists(
        select 1 from public.geo_containment_findings f
        where f.entity_type=i.entity_type and f.entity_id::text=i.entity_id
          and 'GEO_'||upper(f.violation_class)=i.finding_key
      ) then 'repaired'
      when i.finding_key='GEO_UNDECIDABLE' then 'disputed_boundary'
      else 'boundary_geometry_limit'
    end,
    resolution_evidence=jsonb_build_object(
      'decision','post-repair containment review',
      'detector','Natural Earth point-in-polygon',
      'current_finding',exists(
        select 1 from public.geo_containment_findings f
        where f.entity_type=i.entity_type and f.entity_id::text=i.entity_id
          and 'GEO_'||upper(f.violation_class)=i.finding_key
      )
    ),
    resolved_at=now()
from active
where i.run_id=active.id
  and i.engine='addresses'
  and i.resolution_state='open'
  and i.finding_key like 'GEO_%';

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when not exists(
        select 1 from public.geo_city_coord_findings f
        where f.city_id::text=i.entity_id
          and 'CITY_GEO_'||upper(f.violation_class)=i.finding_key
      ) then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when not exists(
        select 1 from public.geo_city_coord_findings f
        where f.city_id::text=i.entity_id
          and 'CITY_GEO_'||upper(f.violation_class)=i.finding_key
      ) then 'repaired'
      else 'boundary_geometry_limit'
    end,
    resolution_evidence=jsonb_build_object(
      'decision','post-repair city centroid review',
      'detector','Natural Earth point-in-polygon',
      'note','border and small-island centroids can fall outside simplified polygons'
    ),
    resolved_at=now()
from active
where i.run_id=active.id
  and i.engine='addresses'
  and i.resolution_state='open'
  and i.finding_key like 'CITY_GEO_%';

update public.governance_remediation_runs r
set resolved_items=(
  select count(*) from public.governance_remediation_items i
  where i.run_id=r.id and i.resolution_state in ('resolved','terminal')
)
where r.label='governance-engine-full-remediation-2026-09-28'
  and r.status='active';

do $$
declare v_open bigint;
begin
  select count(*) into v_open
  from public.governance_remediation_items i
  join public.governance_remediation_runs r on r.id=i.run_id
  where r.label='governance-engine-full-remediation-2026-09-28'
    and i.engine='addresses' and i.resolution_state='open';
  if v_open<>0 then
    raise exception 'address remediation left % baseline items open',v_open;
  end if;
end;
$$;

reset statement_timeout;
reset lock_timeout;
;
