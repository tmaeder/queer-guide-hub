-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928144353 with no repo file — the signature of
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
-- Terminal no-postal outcomes must remain in geo_address_queue as negative
-- cache entries. The enqueue job excludes rows present in this table; deleting
-- them would recreate an hourly probe loop. Restore those rows from the durable
-- outcome ledger and expose terminal vs transient parked counts separately.

insert into public.geo_address_queue(
  entity_type,entity_id,reason,latitude,longitude,attempts,last_error,
  enqueued_at,next_attempt_at
)
select entity_type,entity_id,reason,latitude,longitude,
  greatest(attempts,4)::smallint,source_error,decided_at,decided_at
from public.geo_address_terminal_outcomes
where outcome='source_reports_no_postal_code'
on conflict(entity_type,entity_id) do update
set attempts=greatest(public.geo_address_queue.attempts,excluded.attempts),
    last_error=excluded.last_error,
    latitude=coalesce(public.geo_address_queue.latitude,excluded.latitude),
    longitude=coalesce(public.geo_address_queue.longitude,excluded.longitude);

create or replace function public.geo_address_gap_counts()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'venues',(
      select jsonb_build_object(
        'live',count(*),
        'missing_country_id',count(*) filter(where country_id is null),
        'missing_state',count(*) filter(where state is null),
        'missing_postal',count(*) filter(where postal_code is null)
      )
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and coalesce(review_status,'')<>'archived'
    ),
    'events',(
      select jsonb_build_object(
        'live',count(*),
        'missing_country_id',count(*) filter(where country_id is null),
        'missing_state',count(*) filter(where state is null),
        'missing_postal',count(*) filter(
          where postal_code is null
            and (end_date>=current_date or (end_date is null and start_date>=current_date)))
      )
      from public.events
      where duplicate_of_id is null and status in ('active','completed')
        and review_status='approved'
    ),
    'hotels',(
      select jsonb_build_object(
        'live',count(*),
        'missing_country_id',count(*) filter(where country_id is null),
        'missing_state',count(*) filter(where state is null),
        'missing_postal',count(*) filter(where postal_code is null)
      )
      from public.hotels where duplicate_of_id is null
    ),
    'organizations',(
      select jsonb_build_object(
        'live',count(*),
        'missing_country_id',count(*) filter(where country_id is null),
        'missing_state',count(*) filter(where state is null),
        'missing_postal',count(*) filter(where postal_code is null)
      )
      from public.organizations
      where duplicate_of_id is null and status='active'
    ),
    'cities',(
      select jsonb_build_object(
        'live',count(*),
        'missing_region_name',count(*) filter(where region_name is null),
        'geocodable_gap',count(*) filter(
          where region_name is null and latitude is not null
            and (slug is null or slug not like 'tmp-%'))
      )
      from public.cities where duplicate_of_id is null
    ),
    'queue',(
      select jsonb_build_object(
        'depth',count(*) filter(where attempts<4),
        'parked',count(*) filter(
          where attempts>=4 and last_error is distinct from 'no_postal_for_coordinates'),
        'terminal',count(*) filter(
          where attempts>=4 and last_error='no_postal_for_coordinates'),
        'oldest_enqueued_at',min(enqueued_at) filter(where attempts<4)
      )
      from public.geo_address_queue
    )
  );
$$;

do $$
declare
  v_terminal bigint;
  v_cached bigint;
begin
  select count(*) into v_terminal
  from public.geo_address_terminal_outcomes
  where outcome='source_reports_no_postal_code';
  select count(*) into v_cached
  from public.geo_address_queue
  where attempts>=4 and last_error='no_postal_for_coordinates';
  if v_terminal<>v_cached then
    raise exception 'terminal postal outcomes (%) do not match queue memory rows (%)',
      v_terminal,v_cached;
  end if;
end;
$$;
;
