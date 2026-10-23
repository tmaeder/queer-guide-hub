-- Provider taxonomy is discovery evidence only. A later city-link update must
-- never be able to republish an unresolved Foursquare-only venue.

create or replace function public.guard_foursquare_provider_only_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.review_status = 'approved'
     and exists (
       select 1
         from public.ingestion_staging s
        where s.target_record_id = new.id
          and s.source_name in ('foursquare', 'foursquare_os')
          and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
     )
     and not (
       new.verified is true
       and new.verified_by is not null
       and nullif(btrim(new.verification_source), '') is not null
       and lower(new.verification_source) not in ('foursquare', 'foursquare_os')
       and coalesce(new.verification_evidence, '{}'::jsonb) <> '{}'::jsonb
     ) then
    new.review_status := 'archived';
    new.needs_attention := true;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_foursquare_provider_only_publication()
  from public, anon, authenticated;

drop trigger if exists zzzzzzz_foursquare_provider_only_guard on public.venues;
create trigger zzzzzzz_foursquare_provider_only_guard
before insert or update on public.venues
for each row execute function public.guard_foursquare_provider_only_publication();

with unresolved as (
  select distinct s.target_record_id
    from public.ingestion_staging s
    join public.venues v on v.id = s.target_record_id
   where s.source_name in ('foursquare', 'foursquare_os')
     and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
     and not (
       v.verified is true
       and v.verified_by is not null
       and nullif(btrim(v.verification_source), '') is not null
       and lower(v.verification_source) not in ('foursquare', 'foursquare_os')
       and coalesce(v.verification_evidence, '{}'::jsonb) <> '{}'::jsonb
     )
)
update public.venues v
   set review_status = 'archived',
       needs_attention = true,
       updated_at = now()
  from unresolved u
 where v.id = u.target_record_id
   and v.review_status is distinct from 'archived';

insert into public.review_queue(entity_type, entity_id, review_type, status, details)
select 'venue', v.id, 'foursquare_independent_corroboration', 'pending',
       jsonb_build_object(
         'source', s.source_name,
         'source_entity_id', s.source_entity_id,
         'staging_id', s.id,
         'reason', 'Provider taxonomy may seed discovery but cannot establish publication eligibility'
       )
  from public.ingestion_staging s
  join public.venues v on v.id = s.target_record_id
 where s.source_name in ('foursquare', 'foursquare_os')
   and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
   and not (
     v.verified is true
     and v.verified_by is not null
     and nullif(btrim(v.verification_source), '') is not null
     and lower(v.verification_source) not in ('foursquare', 'foursquare_os')
     and coalesce(v.verification_evidence, '{}'::jsonb) <> '{}'::jsonb
   )
   and not exists (
     select 1
       from public.review_queue q
      where q.entity_type = 'venue'
        and q.entity_id = v.id
        and q.review_type = 'foursquare_independent_corroboration'
        and q.status = 'pending'
   );

create unique index if not exists uq_review_queue_foursquare_corroboration_pending
  on public.review_queue(entity_type, entity_id, review_type)
  where entity_type = 'venue'
    and review_type = 'foursquare_independent_corroboration'
    and status = 'pending';

create or replace function public.foursquare_data_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'api_budget', coalesce((
      select to_jsonb(b) || jsonb_build_object(
        'remaining', greatest(b.call_limit - b.safety_margin - b.calls_used, 0)
      )
        from public.foursquare_api_budget b
       where b.month_start = date_trunc('month', current_date)::date
    ), jsonb_build_object(
      'month_start', date_trunc('month', current_date)::date,
      'call_limit', 500,
      'safety_margin', 50,
      'calls_used', 0,
      'remaining', 450,
      'by_purpose', '{}'::jsonb
    )),
    'sync_streams', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.stream_key)
        from public.foursquare_sync_state s
    ), '[]'::jsonb),
    'categories', (select count(*) from public.foursquare_categories),
    'redirects', (select count(*) from public.foursquare_place_redirects),
    'linked_venues', (
      select count(*) from public.venues v
       where v.foursquare_id is not null
          or coalesce(v.platform_ids ->> 'foursquare', '') <> ''
    ),
    'source_records', (
      select count(*) from public.venue_sources vs
       where vs.source_slug in ('foursquare', 'foursquare_os')
    ),
    'editorial_review_pending', (
      select count(distinct s.target_record_id)
        from public.ingestion_staging s
        join public.venues v on v.id = s.target_record_id
       where s.source_name in ('foursquare', 'foursquare_os')
         and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
         and not (
           v.verified is true
           and v.verified_by is not null
           and nullif(btrim(v.verification_source), '') is not null
           and lower(v.verification_source) not in ('foursquare', 'foursquare_os')
           and coalesce(v.verification_evidence, '{}'::jsonb) <> '{}'::jsonb
         )
    ),
    'unsafe_published_discoveries', (
      select count(distinct s.target_record_id)
        from public.ingestion_staging s
        join public.venues v on v.id = s.target_record_id
       where s.source_name in ('foursquare', 'foursquare_os')
         and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
         and v.review_status = 'approved'
         and not (
           v.verified is true
           and v.verified_by is not null
           and nullif(btrim(v.verification_source), '') is not null
           and lower(v.verification_source) not in ('foursquare', 'foursquare_os')
           and coalesce(v.verification_evidence, '{}'::jsonb) <> '{}'::jsonb
         )
    ),
    'generated_at', now()
  );
$function$;

revoke all on function public.foursquare_data_health() from public, anon, authenticated;
grant execute on function public.foursquare_data_health() to service_role;

comment on function public.guard_foursquare_provider_only_publication() is
  'Fail-closed publication invariant for provider-only Foursquare discoveries. Explicit independent verification is required before approval.';
