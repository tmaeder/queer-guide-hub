-- Reuse consent-gated user_events and its 90-day retention. No backfill.
alter table public.user_events drop constraint user_events_event_type_known;
alter table public.user_events add constraint user_events_event_type_known check (
  event_type in (
    'page_view','search','booking_click','favorite_add','favorite_remove',
    'deal_view','trip_create','hotel_view','activity_view',
    'click','view','save','favorite','book','attend','dismiss',
    'search_submit','facet_apply','zero_results',
    'map_detail_open','map_station_save','map_trip_add','map_route_open','map_route_copy','map_handoff',
    'travel_meet_browse','travel_meet_request'
  )
) not valid;
alter table public.user_events drop constraint user_events_entity_type_known;
alter table public.user_events add constraint user_events_entity_type_known check (
  entity_type is null or entity_type in (
    'venue','event','city','country','personality','news','tag','marketplace',
    'queer_village','hotel','flight','activity','organization','search','travel_request'
  )
) not valid;

-- Only the two funnel event types are indexed. Operational messages already have
-- a conversation index; no message content is copied into analytics.
create index user_events_travel_funnel on public.user_events(event_type, created_at, user_id)
  where event_type in ('travel_meet_browse','travel_meet_request');

-- An aggregate across members needs privileged reads; keep the implementation
-- outside PostgREST and independently enforce admin authorization on every call.
create function travel_meet_private.funnel_summary(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz;
  v_until timestamptz := now();
  v_browsed bigint; v_requested bigint; v_accepted bigint; v_started bigint;
begin
  if auth.uid() is null or public.has_role_jwt('admin'::public.app_role) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7,30,90) then
    raise exception 'Choose a 7, 30 or 90 day window' using errcode = '22023';
  end if;
  v_since := v_until - make_interval(days => p_days);
  with browsers as (
    select e.user_id, min(e.created_at) as browsed_at
    from public.user_events e
    join public.profiles p on p.user_id = e.user_id
    where e.event_type = 'travel_meet_browse' and e.metadata->>'surface' = 'meet_travel'
      and e.created_at >= v_since and e.created_at <= v_until
      and not coalesce(p.is_test_account, false)
    group by e.user_id
  ), requests as (
    select distinct b.user_id, r.id, r.status, r.responded_at, r.conversation_id, plan.owner_id
    from browsers b
    join public.user_events e on e.user_id = b.user_id
      and e.event_type = 'travel_meet_request' and e.entity_type = 'travel_request'
      and e.metadata->>'surface' = 'meet_travel'
      and e.created_at >= b.browsed_at and e.created_at <= v_until
    -- Validate untrusted identifiers before casting; use the request primary key
    -- and verify ownership instead of trusting an analytics payload.
    join public.travel_meet_requests r on r.id = case
      when e.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then e.entity_id::uuid end and r.requester_id = b.user_id
      and r.created_at >= v_since and r.created_at <= e.created_at
    join public.travel_meet_plans plan on plan.id = r.plan_id
    join public.profiles host on host.user_id = plan.owner_id
      and not coalesce(host.is_test_account, false)
  ), accepted as (
    select * from requests where status = 'accepted' and responded_at <= v_until
  ), started as (
    select a.user_id from accepted a where exists (
      select 1 from public.messages m where m.conversation_id = a.conversation_id
        and m.sender_id in (a.user_id, a.owner_id)
        and m.created_at >= a.responded_at and m.created_at <= v_until
        and m.deleted_at is null and m.message_type is distinct from 'system'
    )
  )
  select (select count(*) from browsers), (select count(distinct user_id) from requests),
         (select count(distinct user_id) from accepted), (select count(distinct user_id) from started)
    into v_browsed, v_requested, v_accepted, v_started;
  return jsonb_build_object(
    'window_days', p_days, 'since', v_since, 'until', v_until,
    'browsed', v_browsed, 'requested', v_requested, 'accepted', v_accepted, 'started', v_started,
    'browse_to_request_pct', round(100.0 * v_requested / nullif(v_browsed, 0), 1),
    'request_to_accept_pct', round(100.0 * v_accepted / nullif(v_requested, 0), 1),
    'accept_to_conversation_pct', round(100.0 * v_started / nullif(v_accepted, 0), 1),
    'browse_to_conversation_pct', round(100.0 * v_started / nullif(v_browsed, 0), 1)
  );
end $$;
revoke all on function travel_meet_private.funnel_summary(integer) from public, anon;
grant execute on function travel_meet_private.funnel_summary(integer) to authenticated;
create function public.travel_meet_funnel_summary(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select travel_meet_private.funnel_summary(p_days);
$$;
revoke all on function public.travel_meet_funnel_summary(integer) from public, anon;
grant execute on function public.travel_meet_funnel_summary(integer) to authenticated;
comment on function public.travel_meet_funnel_summary(integer) is
  'Admin-only unique consented signed-in travellers: loaded results -> tracked request -> accepted -> participant message after acceptance. Stages share one request. No message content returned. No historical backfill.';
