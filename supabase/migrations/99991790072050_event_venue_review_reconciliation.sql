-- Keep the event-to-venue relationship invariant current as new events arrive:
-- every upcoming public event with a venue name is linked or reviewable.

create unique index if not exists uq_event_venue_link_review_pending
on public.review_queue (entity_type, entity_id, review_type)
where status = 'pending'
  and entity_type = 'event'
  and review_type = 'venue_link_candidate';

create or replace function public.reconcile_event_venue_link_reviews()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $reconcile$
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
    and nullif(btrim(e.venue_name), '') is not null
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
    and nullif(btrim(e.venue_name), '') is not null
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
$reconcile$;

revoke all on function public.reconcile_event_venue_link_reviews()
  from public, anon, authenticated;
grant execute on function public.reconcile_event_venue_link_reviews()
  to service_role;

update public.admin_automations
set enabled = true,
    schedule = '25 * * * *',
    description = 'Hourly precision-gated event-to-venue linking followed by review reconciliation; ambiguous and no-signal names remain explicitly reviewable.',
    action = jsonb_build_object(
      'type', 'cron',
      'jobname', 'event_venue_link',
      'command', 'SELECT public.run_event_venue_link(); SELECT public.reconcile_event_venue_link_reviews();'
    ),
    updated_at = now()
where slug = 'event_venue_link';

select public.sync_automations_to_cron(true);
select public.reconcile_event_venue_link_reviews();

do $assert$
begin
  if exists (
    select 1
    from public.events e
    where e.is_public
      and e.duplicate_of_id is null
      and e.start_date >= now() - interval '1 day'
      and nullif(btrim(e.venue_name), '') is not null
      and e.venue_id is null
      and not exists (
        select 1 from public.review_queue q
        where q.entity_type = 'event'
          and q.entity_id = e.id
          and q.review_type = 'venue_link_candidate'
          and q.status = 'pending'
      )
  ) then
    raise exception 'upcoming named event is neither linked nor reviewable';
  end if;
end;
$assert$;
