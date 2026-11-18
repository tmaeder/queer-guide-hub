-- Exact production function captured 2026-11-18 before the pending reconciliation fix.
CREATE OR REPLACE FUNCTION public.reconcile_event_venue_link_reviews()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inserted integer := 0;
  v_resolved integer := 0;
  v_pending integer := 0;
  v_unaccounted integer := 0;
begin
  update public.review_queue r
  set status = 'resolved',
      resolved_at = now(),
      details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
        'resolution', case when e.venue_id is not null then 'venue_linked' else 'event_no_longer_actionable' end,
        'venue_id', e.venue_id,
        'resolved_automatically', true
      )
  from public.events e
  where r.entity_type = 'event'
    and r.entity_id = e.id
    and r.review_type = 'venue_link_candidate'
    and r.status = 'pending'
    and (
      e.venue_id is not null
      or e.duplicate_of_id is not null
      or not e.is_public
      or e.start_date < now() - interval '1 day'
      or nullif(btrim(e.venue_name), '') is null
    );
  get diagnostics v_resolved = row_count;

  insert into public.review_queue
    (entity_type, entity_id, review_type, status, details)
  select 'event', e.id, 'venue_link_candidate', 'pending',
    jsonb_build_object(
      'event_venue_name', e.venue_name,
      'candidates', '[]'::jsonb,
      'source', 'venue_quality_v2',
      'resolution', 'no_precision_match',
      'ambiguous', true
    )
  from public.events e
  where e.is_public
    and e.duplicate_of_id is null
    and e.start_date >= now() - interval '1 day'
    and e.venue_id is null
    and nullif(btrim(e.venue_name), '') is not null and not api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address) and not api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance) and not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address) and not api_private.event_source_confirms_ticketmaster_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
    and not exists (
      select 1 from public.review_queue q
      where q.entity_type = 'event'
        and q.entity_id = e.id
        and q.review_type = 'venue_link_candidate'
        and q.status = 'pending'
    )
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  select count(*) into v_pending
  from public.review_queue
  where entity_type = 'event'
    and review_type = 'venue_link_candidate'
    and status = 'pending';

  select count(*) into v_unaccounted
  from public.events e
  where e.is_public
    and e.duplicate_of_id is null
    and e.start_date >= now() - interval '1 day'
    and nullif(btrim(e.venue_name), '') is not null and not api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address) and not api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance) and not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address) and not api_private.event_source_confirms_ticketmaster_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
    and e.venue_id is null
    and not exists (
      select 1 from public.review_queue q
      where q.entity_type = 'event'
        and q.entity_id = e.id
        and q.review_type = 'venue_link_candidate'
        and q.status = 'pending'
    );

  return jsonb_build_object(
    'inserted', v_inserted,
    'resolved', v_resolved,
    'pending', v_pending,
    'unaccounted', v_unaccounted,
    'converged', v_unaccounted = 0
  );
end;
$function$;
