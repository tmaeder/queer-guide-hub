-- Keep the release gate inside PostgREST's statement timeout by reusing the
-- scanner's indexed, lifecycle-managed issue ledger instead of rescanning
-- every event URL and image array on every CI run. assessment_stale remains a
-- live guard: the ledger is only authoritative when that gate is zero.

begin;

create or replace function public.event_quality_gate_checks()
returns table(gate text,severity text,failures bigint,detail jsonb)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  with rollout as (
    select enforcement_enabled from public.event_quality_rollout where singleton
  ), open_issue_counts as materialized (
    select issue_code, count(*)::bigint as failures
    from public.event_quality_issues
    where status='open'
    group by issue_code
  ), g as (
    select 'geo_null_island' gate,'critical' desired,
      coalesce((select failures from open_issue_counts where issue_code='GEO_NULL_ISLAND'),0) failures
    union all select 'geo_partial','critical',
      coalesce((select failures from open_issue_counts where issue_code='GEO_PARTIAL'),0)
    union all select 'date_order','critical',
      coalesce((select failures from open_issue_counts where issue_code='DATE_ORDER_INVALID'),0)
    union all select 'city_country_conflict','critical',
      coalesce((select failures from open_issue_counts where issue_code='CITY_COUNTRY_CONFLICT'),0)
    union all select 'venue_city_conflict','critical',
      coalesce((select failures from open_issue_counts where issue_code='VENUE_CITY_CONFLICT'),0)
    union all select 'invalid_urls','critical',
      coalesce((select sum(failures) from open_issue_counts where issue_code in ('WEBSITE_INVALID','TICKET_URL_INVALID')),0)
    union all select 'placeholder_images','critical',
      coalesce((select failures from open_issue_counts where issue_code='IMAGE_PLACEHOLDER'),0)
    union all select 'invalid_image_urls','critical',
      coalesce((select failures from open_issue_counts where issue_code='IMAGE_URL_INVALID'),0)
    union all select 'broken_merge_pointer','critical',(select count(*)
      from public.events e left join public.events p on p.id=e.duplicate_of_id
      where e.duplicate_of_id is not null and (p.id is null or p.duplicate_of_id is not null))
    union all select 'assessment_stale','critical',(select count(*)
      from public.events e left join public.event_quality_current q on q.event_id=e.id
      where e.duplicate_of_id is null and (q.event_id is null or q.input_updated_at<e.updated_at
        or (coalesce(e.end_date,e.start_date)>=now() and q.assessed_at<now()-interval '24 hours')
        or (coalesce(e.end_date,e.start_date)<now() and q.assessed_at<now()-interval '30 days')))
    union all select 'unresolved_quality_gaps','critical',coalesce((select sum(failures)
      from open_issue_counts where issue_code in
        ('NAMED_VENUE_UNLINKED','CATEGORY_UNRESOLVED','DESCRIPTION_REUSED','IMAGE_MISSING')),0)
    union all select 'stale_dedup_reviews','critical',(select count(*)
      from public.dedup_review_queue where entity_type='event' and status='open'
        and created_at<now()-interval '14 days')
    union all select 'old_high_issues','critical',(select count(*)
      from public.event_quality_issues where status='open' and severity in ('critical','high')
        and detected_at<now()-interval '14 days')
    union all select 'source_quality_budgets','high',(select count(*)
      from public.event_source_quality_daily d
      join lateral (select b.* from public.event_source_quality_budgets b
        where b.source_slug in (d.source_slug,'*')
        order by (b.source_slug=d.source_slug) desc limit 1) b on true
      where d.snapshot_date=current_date and (d.assessment_rate<b.minimum_assessment_rate
        or d.defect_rate>b.maximum_defect_rate or d.critical_rate>b.maximum_critical_rate
        or d.missing_source_id_rate>b.maximum_missing_source_id_rate))
    union all select 'upcoming_liveness_slo','critical',(select case when count(*)=0 then 0
      when 100.0*count(*) filter(where e.liveness_status<>'unknown'
        and e.last_verified_at>=now()-interval '7 days')/count(*)>=95 then 0
      else count(*) filter(where e.liveness_status='unknown'
        or e.last_verified_at<now()-interval '7 days') end
      from public.events e where e.duplicate_of_id is null
        and coalesce(e.status,'active')='active'
        and coalesce(e.end_date,e.start_date)>=now()
        and (e.website is not null or e.ticket_url is not null))
  )
  select gate,
    case when desired='critical' and not rollout.enforcement_enabled then 'advisory' else desired end,
    failures,'{}'::jsonb
  from g cross join rollout
$$;

revoke all on function public.event_quality_gate_checks() from public,anon,authenticated;
grant execute on function public.event_quality_gate_checks() to service_role;

insert into public.pipeline_explanations (key,title,body,what_now,severity) values
('pipeline-validate:E_DATE_ORDER_INVALID','Event dates are reversed',
 'The event end date is earlier than its start date, so the published schedule cannot be correct.',
 'Confirm the dates at the source and correct their order.', 'blocking'),
('pipeline-validate:E_END_DATE_INVALID','Event end date is invalid',
 'The supplied event end date cannot be parsed as a valid calendar date.',
 'Correct the source date or remove the unusable value.', 'blocking'),
('pipeline-validate:E_END_TIMEZONE_MISSING','End timezone is missing',
 'A timed event has an end time but no timezone, making the ending instant ambiguous.',
 'Add the venue timezone from the source location.', 'blocking'),
('pipeline-validate:E_GEO_NULL_ISLAND','Coordinates point to Null Island',
 'Both coordinates are zero, a placeholder point in the Gulf of Guinea rather than the event location.',
 'Replace them with verified coordinates or remove both values.', 'blocking'),
('pipeline-validate:E_GEO_PARTIAL','Coordinates are incomplete',
 'Only one coordinate is present; latitude and longitude must always be supplied together.',
 'Add the missing coordinate or remove the incomplete pair.', 'blocking'),
('pipeline-validate:E_IMAGE_PLACEHOLDER','Image is a placeholder',
 'The image URL identifies a default, missing-image, or placeholder asset rather than event artwork.',
 'Choose real event artwork or leave the image empty.', 'blocking'),
('pipeline-validate:E_IMAGE_URL_INVALID','Image link is invalid',
 'The event image value is not a safe public HTTP or HTTPS URL and cannot be loaded.',
 'Replace it with a valid public image URL.', 'blocking'),
('pipeline-validate:E_LATITUDE_RANGE','Latitude is out of range',
 'The latitude falls outside the valid range from minus ninety to ninety degrees.',
 'Correct the coordinate and check whether the pair was swapped.', 'blocking'),
('pipeline-validate:E_LONGITUDE_RANGE','Longitude is out of range',
 'The longitude falls outside the valid range from minus one hundred eighty to one hundred eighty degrees.',
 'Correct the coordinate and check whether the pair was swapped.', 'blocking'),
('pipeline-validate:E_SOURCE_ID_MISSING','Source identifier is missing',
 'The source adapter did not provide a stable upstream identifier, so safe deduplication is impossible.',
 'Fix the adapter mapping before accepting this record.', 'blocking'),
('pipeline-validate:E_SOURCE_NAME_MISSING','Source name is missing',
 'The record does not identify which upstream provider supplied it, so its provenance is incomplete.',
 'Set the adapter source name before accepting this record.', 'blocking'),
('pipeline-validate:E_SOURCE_URL_MISSING','Source link is missing',
 'The record has no upstream source URL, leaving editors without evidence to verify the event.',
 'Add the canonical source page URL.', 'blocking'),
('pipeline-validate:E_START_DATE_INVALID','Event start date is invalid',
 'The supplied event start date cannot be parsed as a valid calendar date.',
 'Correct the source date before accepting the record.', 'blocking'),
('pipeline-validate:E_START_DATE_MISSING','Event start date is missing',
 'The record has no start date, so it cannot be placed on the calendar or assessed for freshness.',
 'Add the verified start date from the source.', 'blocking'),
('pipeline-validate:E_START_TIMEZONE_MISSING','Start timezone is missing',
 'A timed event has a start time but no timezone, making its actual start instant ambiguous.',
 'Add the venue timezone from the source location.', 'blocking'),
('pipeline-validate:E_TITLE_INVALID','Event title is invalid',
 'The event title is empty or too short to identify the event reliably to readers.',
 'Use the full event title from the source.', 'blocking'),
('pipeline-validate:E_URL_INVALID','Event link is invalid',
 'The event URL is not a safe public HTTP or HTTPS address and cannot support verification.',
 'Replace it with the canonical public event URL.', 'blocking'),
('pipeline-validate:W_DESCRIPTION_MISSING_OR_THIN','Description needs detail',
 'The event description is missing or too brief to explain what attendees should expect.',
 'Add factual detail from the event source without inventing claims.', 'warning'),
('pipeline-validate:W_IMAGE_MISSING','Event image is missing',
 'The source record does not include usable event artwork, so the listing will have no visual.',
 'Add verified event artwork when the source provides it.', 'warning'),
('pipeline-validate:W_LOCATION_MISSING','Event location is missing',
 'The source record has no venue, city, address, or coordinates that identify where the event happens.',
 'Add the most specific verified location available.', 'warning')
on conflict (key) do nothing;

commit;
