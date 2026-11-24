-- Small, explicitly shared experiences. Never changes trips.is_public or presence.
-- Private implementations are outside the Data API; public RPCs are invoker wrappers.
create schema if not exists travel_meet_private;
revoke all on schema travel_meet_private from public, anon;
grant usage on schema travel_meet_private to authenticated;

create table public.travel_meet_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.geo_places(id),
  trip_id uuid references public.trips(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  title text not null check (length(btrim(title)) between 3 and 100),
  description text not null default '' check (length(description) <= 600),
  activity text not null check (activity in ('coffee','culture','outdoors','nightlife','event')),
  host_kind text not null check (host_kind in ('traveller','local')),
  start_date date not null,
  end_date date not null check (end_date >= start_date and end_date - start_date <= 31),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index travel_meet_plans_city_dates on public.travel_meet_plans(city_id, end_date, start_date) where cancelled_at is null;
create index travel_meet_plans_owner on public.travel_meet_plans(owner_id, created_at desc);
create index travel_meet_plans_trip on public.travel_meet_plans(trip_id) where trip_id is not null;
create index travel_meet_plans_event on public.travel_meet_plans(event_id) where event_id is not null;

create table public.travel_meet_requests (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.travel_meet_plans(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(plan_id, requester_id)
);
create index travel_meet_requests_requester on public.travel_meet_requests(requester_id);
create index travel_meet_requests_conversation on public.travel_meet_requests(conversation_id) where conversation_id is not null;

create table public.travel_meet_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.geo_places(id),
  start_date date not null,
  end_date date not null check (end_date >= start_date and end_date - start_date <= 31),
  activity text not null default '' check (activity in ('','coffee','culture','outdoors','nightlife','event')),
  created_at timestamptz not null default now(),
  unique(user_id, city_id, start_date, end_date, activity)
);
create index travel_meet_alerts_city on public.travel_meet_alerts(city_id, end_date);

alter table public.travel_meet_plans enable row level security;
alter table public.travel_meet_requests enable row level security;
alter table public.travel_meet_alerts enable row level security;
revoke all on public.travel_meet_plans, public.travel_meet_requests, public.travel_meet_alerts from public, anon, authenticated;
-- Raw access is limited to your own records. Discovery uses a redacted RPC,
-- so other members cannot obtain private trip ids or requesters' identities.
grant select on public.travel_meet_plans, public.travel_meet_requests, public.travel_meet_alerts to authenticated;
create policy own_plans on public.travel_meet_plans for select to authenticated using (owner_id = (select auth.uid()));
create policy own_requests on public.travel_meet_requests for select to authenticated using (requester_id = (select auth.uid()));
create policy own_alerts on public.travel_meet_alerts for select to authenticated using (user_id = (select auth.uid()));

create function travel_meet_private.city_allowed(p_city uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.geo_places g
    join public.geo_country_profiles c on c.place_id = g.country_id
    where g.id = p_city and g.place_type = 'city'
      -- Unknown legal position is not evidence that discovery is safe.
      and c.lgbti_criminalization->>'legal' = 'true'
      and not public.location_is_high_risk(g.country_id, g.id)
      and public.death_penalty_risk(c.lgbti_criminalization) = 'none'
  );
$$;

create function travel_meet_private.plan_allowed(p public.travel_meet_plans) returns boolean
language sql stable security definer set search_path = '' as $$
  select travel_meet_private.city_allowed(p.city_id)
    and (p.trip_id is null or not exists (
      select 1 from public.trips t where t.id = p.trip_id and (
        t.primary_city_id is distinct from p.city_id
        or not travel_meet_private.city_allowed(t.primary_city_id)
        or public.location_is_high_risk(t.primary_country_id, t.primary_city_id)
        or exists (select 1 from public.trip_places tp where tp.trip_id = t.id
          and (public.location_is_high_risk(tp.country_id, tp.city_id)
            or exists (select 1 from public.geo_country_profiles c where c.place_id = tp.country_id
              and public.death_penalty_risk(c.lgbti_criminalization) <> 'none')))
      )
    ));
$$;

create function travel_meet_private.list_plans(p_city uuid, p_start date, p_end date, p_activity text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_allowed boolean; v_feed jsonb; v_own jsonb;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  v_allowed := travel_meet_private.city_allowed(p_city);
  select coalesce(jsonb_agg(x.row order by x.start_date, x.created_at desc), '[]') into v_feed from (
    select p.start_date, p.created_at, jsonb_build_object(
      'id', p.id, 'owner_id', p.owner_id, 'title', p.title, 'description', p.description,
      'activity', p.activity, 'host_kind', p.host_kind, 'start_date', p.start_date, 'end_date', p.end_date,
      'city_name', g.name, 'city_id', p.city_id,
      'display_name', coalesce(pr.display_name, 'Member'), 'avatar_url', pr.avatar_url,
      'event_id', e.id, 'event_title', e.title, 'event_slug', e.slug,
      'request', (select jsonb_build_object('id', r.id, 'status', r.status, 'conversation_id', r.conversation_id)
        from public.travel_meet_requests r where r.plan_id = p.id and r.requester_id = v_uid)
    ) as row
    from public.travel_meet_plans p
    join public.geo_places g on g.id = p.city_id
    join public.profiles pr on pr.user_id = p.owner_id
    left join public.events e on e.id = p.event_id and e.status = 'published' and not coalesce(e.safety_gated, false)
    where v_allowed and p.city_id = p_city and p.owner_id <> v_uid
      and p.cancelled_at is null and p.end_date >= current_date
      and p.start_date <= p_end and p.end_date >= p_start
      and (coalesce(p_activity, '') = '' or p.activity = p_activity)
      and not public.is_blocked(v_uid, p.owner_id)
      and travel_meet_private.plan_allowed(p)
    order by p.start_date, p.created_at desc limit 60
  ) x;
  select coalesce(jsonb_agg(x.row order by x.created_at desc), '[]') into v_own from (
    select p.created_at, jsonb_build_object(
      'id', p.id, 'title', p.title, 'description', p.description, 'city_name', g.name,
      'activity', p.activity, 'start_date', p.start_date, 'end_date', p.end_date,
      'cancelled', p.cancelled_at is not null, 'expired', p.end_date < current_date,
      'allowed', travel_meet_private.plan_allowed(p),
      'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'conversation_id', r.conversation_id,
        'display_name', coalesce(pr.display_name, 'Member'), 'requester_id', r.requester_id
      ) order by r.created_at) from public.travel_meet_requests r
        join public.profiles pr on pr.user_id = r.requester_id
        where r.plan_id = p.id and not public.is_blocked(v_uid, r.requester_id)), '[]')
    ) as row
    from public.travel_meet_plans p join public.geo_places g on g.id = p.city_id
    where p.owner_id = v_uid order by p.created_at desc limit 30
  ) x;
  return jsonb_build_object('allowed', v_allowed, 'plans', v_feed, 'own_plans', v_own,
    'alert_id', (select a.id from public.travel_meet_alerts a where a.user_id = v_uid
      and a.city_id = p_city and a.start_date = p_start and a.end_date = p_end
      and a.activity = coalesce(p_activity, '')));
end;
$$;

-- All mutations go through one transactional boundary. No arbitrary row writes.
create function travel_meet_private.act(p_action text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_plan public.travel_meet_plans; v_request public.travel_meet_requests;
  v_id uuid; v_city uuid; v_start date; v_end date; v_conv uuid; v_alert record;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  -- Serialize per actor for rate checks and duplicate submissions.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 724));
  if p_action in ('create', 'alert') then
    v_city := (p_data->>'city_id')::uuid;
    v_start := (p_data->>'start_date')::date; v_end := (p_data->>'end_date')::date;
    if v_start is null or v_end is null or v_start < current_date or v_end < v_start or v_end - v_start > 31 then
      raise exception 'Choose future dates within a 31-day window';
    end if;
    if not travel_meet_private.city_allowed(v_city) then raise exception 'Travel connections unavailable for this destination' using errcode = '42501'; end if;
  end if;
  if p_action = 'create' then
    if (select count(*) from public.travel_meet_plans where owner_id = v_uid and created_at > now() - interval '1 day') >= 10
      or (select count(*) from public.travel_meet_plans where owner_id = v_uid and cancelled_at is null and end_date >= current_date) >= 5 then
      raise exception 'You can have up to five active invitations and publish ten per day';
    end if;
    if nullif(p_data->>'trip_id', '') is not null and not exists (
      select 1 from public.trips t where t.id = (p_data->>'trip_id')::uuid and t.owner_id = v_uid
        and t.status in ('planning','active') and t.primary_city_id = v_city
        and (t.start_date is null or v_start >= t.start_date) and (t.end_date is null or v_end <= t.end_date)
    ) then raise exception 'Choose dates and a destination within your own active trip' using errcode = '42501'; end if;
    if nullif(p_data->>'event_id', '') is not null and not exists (
      select 1 from public.events e where e.id = (p_data->>'event_id')::uuid and e.city_id = v_city
        and e.status = 'published' and not coalesce(e.safety_gated, false)
        and e.start_date::date <= v_end and coalesce(e.end_date, e.start_date)::date >= v_start
    ) then raise exception 'Choose a published event within these dates'; end if;
    insert into public.travel_meet_plans(owner_id, city_id, trip_id, event_id, title, description, activity, host_kind, start_date, end_date)
    values(v_uid, v_city, nullif(p_data->>'trip_id', '')::uuid, nullif(p_data->>'event_id', '')::uuid,
      btrim(p_data->>'title'), btrim(coalesce(p_data->>'description','')), p_data->>'activity', p_data->>'host_kind', v_start, v_end)
    returning * into v_plan;
    if not travel_meet_private.plan_allowed(v_plan) then raise exception 'Travel connections unavailable for this trip' using errcode = '42501'; end if;
    -- In-app alerts are explicitly subscribed, date bounded, and contain no location in the notification preview.
    for v_alert in select distinct a.user_id from public.travel_meet_alerts a
      where a.city_id = v_city and a.user_id <> v_uid and a.end_date >= current_date
        and a.start_date <= v_end and a.end_date >= v_start
        and (a.activity = '' or a.activity = v_plan.activity) and not public.is_blocked(a.user_id, v_uid)
    loop
      insert into public.notifications(user_id, type, title, content, action_url, related_id, read)
      values(v_alert.user_id, 'system', 'A new travel invitation matches your alert', '',
        '/meet/travel?cityId=' || v_city::text || '&start=' || v_start::text || '&end=' || v_end::text,
        v_plan.id, false);
    end loop;
    return jsonb_build_object('id', v_plan.id);
  elsif p_action = 'alert' then
    select id into v_id from public.travel_meet_alerts where user_id = v_uid and city_id = v_city
      and start_date = v_start and end_date = v_end and activity = coalesce(p_data->>'activity','');
    if v_id is not null then return jsonb_build_object('id', v_id); end if;
    if (select count(*) from public.travel_meet_alerts where user_id = v_uid and end_date >= current_date) >= 10 then raise exception 'You can save up to ten active alerts'; end if;
    insert into public.travel_meet_alerts(user_id, city_id, start_date, end_date, activity)
      values(v_uid, v_city, v_start, v_end, coalesce(p_data->>'activity',''))
      on conflict(user_id, city_id, start_date, end_date, activity) do update set created_at = now()
      returning id into v_id;
    return jsonb_build_object('id', v_id);
  elsif p_action = 'remove_alert' then
    delete from public.travel_meet_alerts where id = (p_data->>'id')::uuid and user_id = v_uid;
    return '{}'::jsonb;
  end if;

  if p_action in ('request','cancel') then
    select * into v_plan from public.travel_meet_plans where id = (p_data->>'id')::uuid for update;
  else
    -- Consistent lock order (plan then request) avoids accept/cancel races.
    select p.* into v_plan from public.travel_meet_plans p join public.travel_meet_requests r on r.plan_id = p.id
      where r.id = (p_data->>'id')::uuid for update of p;
    select * into v_request from public.travel_meet_requests where id = (p_data->>'id')::uuid for update;
  end if;
  if v_plan.id is null then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
  if p_action = 'cancel' and v_plan.owner_id = v_uid then
    if v_plan.cancelled_at is null then
      insert into public.notifications(user_id, type, title, content, action_url, related_id, read)
        select r.requester_id, 'system', 'A travel invitation you responded to was cancelled', '',
          '/meet/travel', v_plan.id, false
        from public.travel_meet_requests r where r.plan_id = v_plan.id
          and r.status in ('pending','accepted') and not public.is_blocked(v_uid, r.requester_id);
    end if;
    update public.travel_meet_plans set cancelled_at = coalesce(cancelled_at, now()) where id = v_plan.id;
    update public.travel_meet_requests set status = 'declined', responded_at = now() where plan_id = v_plan.id and status = 'pending';
    return '{}'::jsonb;
  elsif p_action = 'withdraw' and v_request.requester_id = v_uid and v_request.status = 'pending' then
    update public.travel_meet_requests set status = 'withdrawn', responded_at = now() where id = v_request.id;
    return '{}'::jsonb;
  end if;
  if v_plan.cancelled_at is not null or v_plan.end_date < current_date or not travel_meet_private.plan_allowed(v_plan) then
    raise exception 'Invitation expired or unavailable' using errcode = '42501';
  end if;
  if p_action = 'request' and v_plan.owner_id <> v_uid and not public.is_blocked(v_uid, v_plan.owner_id) then
    select * into v_request from public.travel_meet_requests where plan_id = v_plan.id and requester_id = v_uid;
    if v_request.id is not null then return jsonb_build_object('id', v_request.id); end if;
    if (select count(*) from public.travel_meet_requests where requester_id = v_uid and created_at > now() - interval '1 day') >= 10 then raise exception 'You can send ten requests per day'; end if;
    insert into public.travel_meet_requests(plan_id, requester_id) values(v_plan.id, v_uid) returning id into v_id;
    insert into public.notifications(user_id, type, title, content, action_url, related_id, read)
    values(v_plan.owner_id, 'system', 'Someone asked to join your travel plan', '', '/meet/travel', v_plan.id, false);
    return jsonb_build_object('id', v_id);
  elsif p_action in ('accept','decline') and v_plan.owner_id = v_uid and not public.is_blocked(v_uid, v_request.requester_id) then
    if v_request.status = 'accepted' and p_action = 'accept' then return jsonb_build_object('conversation_id', v_request.conversation_id); end if;
    if v_request.status <> 'pending' then raise exception 'Request already resolved'; end if;
    if p_action = 'accept' then
      -- Same helper as existing friendship/DM flows; a private itinerary is never joined.
      perform pg_advisory_xact_lock(hashtextextended(least(v_uid::text, v_request.requester_id::text) || '/' || greatest(v_uid::text, v_request.requester_id::text), 725));
      v_conv := public.ensure_conversation_between(v_uid, v_request.requester_id, 'direct');
    end if;
    update public.travel_meet_requests set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
      conversation_id = v_conv, responded_at = now() where id = v_request.id;
    insert into public.notifications(user_id, type, title, content, action_url, related_id, read)
    values(v_request.requester_id, 'system', case when p_action = 'accept' then 'Your travel request was accepted' else 'Your travel request was declined' end, '',
      case when v_conv is not null then '/messages?conversation=' || v_conv::text else '/meet/travel' end, v_plan.id, false);
    return jsonb_build_object('conversation_id', v_conv);
  end if;
  raise exception 'Action unavailable' using errcode = '42501';
end;
$$;

revoke all on all functions in schema travel_meet_private from public, anon, authenticated;
grant execute on function travel_meet_private.list_plans(uuid,date,date,text), travel_meet_private.act(text,jsonb) to authenticated;
create function public.travel_meet_list(p_city uuid, p_start date, p_end date, p_activity text default '') returns jsonb
language sql security invoker set search_path = '' as $$ select travel_meet_private.list_plans(p_city, p_start, p_end, p_activity); $$;
create function public.travel_meet_action(p_action text, p_data jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select travel_meet_private.act(p_action, p_data); $$;
revoke all on function public.travel_meet_list(uuid,date,date,text), public.travel_meet_action(text,jsonb) from public, anon;
grant execute on function public.travel_meet_list(uuid,date,date,text), public.travel_meet_action(text,jsonb) to authenticated;
