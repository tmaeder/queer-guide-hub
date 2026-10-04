-- map_outcome_signals() — is the map ecosystem producing outcomes at all?
--
-- STANDALONE, not a key on `analytics_hygiene_stats()`. That body is long and a
-- `create or replace` to add a counter is a merge-collision surface — the same
-- reason `tag_merge_graph_signals`, `news_quality_signals`, `venue_dup_signals`
-- and `event_dup_signals` are each their own function.
--
-- SERVICE_ROLE ONLY. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every member, and this one reads `user_events`, which carries
-- `user_id` plus an `entity_id` trail through venues, events and the intimate
-- features. The counts are harmless; the grant is the thing that would not be.
--
-- KEY ORDER IS LOAD-BEARING. `probe_ok` first and separate from every count,
-- then `map_events_total_ever` — THE DENOMINATOR — before any per-metric
-- number. Four zeroes from a table nothing has ever written read exactly like
-- four zeroes from a healthy corpus, and the denominator is the only thing that
-- tells them apart.
--
-- `event_types_present_7d` IS A SET, NOT A COUNT, for the same reason: a type
-- the app emits but the corpus never shows must appear as a MISSING MEMBER,
-- which a reassuring zero cannot express.
--
-- `map_events_no_actor_24h` IS THE CONSENT-BYPASS DETECTOR, ported from the
-- `country IS NULL` trick. `useTrackEvent` always resolves either a
-- `session_id` or a `user_id` and never neither, so a row with BOTH null can
-- only have come from a writer that skipped the hook — and therefore skipped
-- `analyticsAllowed()`. It must be 0.

create or replace function public.map_outcome_signals()
returns jsonb
language sql
security definer
set search_path = public
stable
as $fn$
  with k as (
    select array[
      'map_detail_open','map_station_save','map_trip_add',
      'map_route_open','map_route_copy','map_handoff'
    ]::text[] as types
  ),
  ev as (
    select e.event_type, e.metadata, e.created_at, e.user_id, e.session_id
    from public.user_events e, k
    where e.event_type = any (k.types)
  ),
  present as (
    select array_agg(distinct event_type order by event_type) as t
    from ev where created_at > now() - interval '7 days'
  )
  select jsonb_build_object(
    -- 1. The probe answered. A missing key and `false` are different states and
    -- the reader hard-fails on both, separately.
    'probe_ok', true,

    -- 2. THE DENOMINATOR, before any count.
    'map_events_total_ever', (select count(*) from ev),
    'map_events_24h', (select count(*) from ev where created_at > now() - interval '24 hours'),
    'map_events_7d', (select count(*) from ev where created_at > now() - interval '7 days'),

    -- 3. Per metric, 7d. Named rather than a histogram so a reader can gate on
    -- one of them without parsing.
    'map_detail_open_7d', (select count(*) from ev where event_type='map_detail_open' and created_at > now() - interval '7 days'),
    'map_station_save_7d', (select count(*) from ev where event_type='map_station_save' and created_at > now() - interval '7 days'),
    'map_trip_add_7d', (select count(*) from ev where event_type='map_trip_add' and created_at > now() - interval '7 days'),
    'map_route_open_7d', (select count(*) from ev where event_type='map_route_open' and created_at > now() - interval '7 days'),
    'map_route_copy_7d', (select count(*) from ev where event_type='map_route_copy' and created_at > now() - interval '7 days'),
    'map_handoff_7d', (select count(*) from ev where event_type='map_handoff' and created_at > now() - interval '7 days'),

    -- 4. A SET, so an absent type is a missing member rather than a zero.
    'event_types_present_7d', coalesce((select to_jsonb(t) from present), '[]'::jsonb),
    'types_never_seen', (
      select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
      from (select unnest(types) as x from k) a
      where not exists (select 1 from ev where ev.event_type = a.x)
    ),

    -- 5. THE BYPASS DETECTOR. Both null is unreachable through the gated hook.
    'map_events_no_actor_24h', (
      select count(*) from ev
      where created_at > now() - interval '24 hours'
        and user_id is null and session_id is null
    ),

    -- 6. A map event with no `surface` cannot be read per surface, which is the
    -- whole point of carrying metadata. Counted rather than gated at first,
    -- because the emitters land before the readers.
    'map_detail_open_missing_surface_24h', (
      select count(*) from ev
      where event_type = 'map_detail_open'
        and created_at > now() - interval '24 hours'
        and coalesce(metadata->>'surface','') = ''
    ),

    -- 7. Which surfaces the map is producing outcomes from, so a surface that
    -- silently stopped is visible as an absence.
    'surfaces_7d', coalesce((
      select jsonb_agg(distinct metadata->>'surface' order by metadata->>'surface')
      from ev
      where created_at > now() - interval '7 days' and metadata->>'surface' is not null
    ), '[]'::jsonb),

    -- 8. Routes: a published route whose stop went orphaned overnight. The
    -- nightly `guide_picks_maintain()` janitor tombstones a deleted target, so
    -- a published route CAN acquire a gap with no editor action — named here
    -- rather than patched into the janitor, which would re-open what it was
    -- built to avoid.
    --
    -- Guarded on the column existing so this function is installable before
    -- (or without) the guides route migration, rather than erroring.
    'published_routes_with_orphaned_stops', (
      case when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='guides' and column_name='is_route'
      ) then (
        select count(distinct g.id)
        from public.guides g
        join public.guide_picks p on p.guide_id = g.id
        where g.status = 'published'
          and (to_jsonb(g)->>'is_route')::boolean
          and p.is_orphaned
      ) else null end
    ),

    'generated_at', now()
  );
$fn$;

comment on function public.map_outcome_signals() is
  'Map-ecosystem outcome telemetry over user_events. probe_ok and '
  'map_events_total_ever (the denominator) come FIRST and separately, because '
  'zeroes from an unwritten table read identically to zeroes from a healthy '
  'one. event_types_present_7d is a SET so an absent type is a missing member '
  'rather than a zero. map_events_no_actor_24h is the consent-bypass detector: '
  'useTrackEvent always sets a session_id or a user_id, so both-null means a '
  'writer skipped the gate. Read by scripts/check-pipeline-health.mjs.';

revoke all on function public.map_outcome_signals() from public;
grant execute on function public.map_outcome_signals() to service_role;

-- ── postconditions ───────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
  v_required text[] := array[
    'probe_ok','map_events_total_ever','map_events_24h','map_events_7d',
    'map_detail_open_7d','map_station_save_7d','map_trip_add_7d',
    'map_route_open_7d','map_route_copy_7d','map_handoff_7d',
    'event_types_present_7d','types_never_seen','map_events_no_actor_24h',
    'map_detail_open_missing_surface_24h','surfaces_7d',
    'published_routes_with_orphaned_stops','generated_at'
  ];
  v_missing text[] := '{}';
  v_k text;
  v_anon boolean;
  v_auth boolean;
begin
  -- P1: it ANSWERS. A sentinel first executed in CI, on real drift, with
  -- someone already blocked, is not a sentinel.
  select public.map_outcome_signals() into v;
  if v is null then
    raise exception 'P1 failed: map_outcome_signals() returned null';
  end if;
  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'P1 failed: probe_ok is not true';
  end if;

  -- P2: EVERY key the health script reads is present. Without this, a renamed
  -- key silently disables the check it was added for — and the script reads a
  -- missing key as a hard failure precisely so this cannot happen quietly.
  foreach v_k in array v_required loop
    if not (v ? v_k) then v_missing := v_missing || v_k; end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'P2 failed: missing keys %', v_missing;
  end if;

  -- P3: the two set-valued keys are ARRAYS, not counts. A number here would
  -- pass P2 and destroy the one property they exist for.
  if jsonb_typeof(v->'event_types_present_7d') <> 'array' then
    raise exception 'P3 failed: event_types_present_7d is not an array';
  end if;
  if jsonb_typeof(v->'types_never_seen') <> 'array' then
    raise exception 'P3 failed: types_never_seen is not an array';
  end if;

  -- P4: the bypass detector is zero RIGHT NOW. If it is not, something is
  -- already writing map events around the consent gate and that is the finding.
  if (v->>'map_events_no_actor_24h')::bigint <> 0 then
    raise exception
      'P4 failed: % map events in 24h have neither user_id nor session_id — a '
      'writer is bypassing analyticsAllowed()', v->>'map_events_no_actor_24h';
  end if;

  -- P5: anon and authenticated are BOTH denied. A definer aggregate over
  -- user_events granted to authenticated is granted to every member.
  select has_function_privilege('anon', 'public.map_outcome_signals()', 'EXECUTE') into v_anon;
  select has_function_privilege('authenticated', 'public.map_outcome_signals()', 'EXECUTE') into v_auth;
  if v_anon then raise exception 'P5 failed: anon can execute map_outcome_signals()'; end if;
  if v_auth then raise exception 'P5 failed: authenticated can execute map_outcome_signals()'; end if;
  if not has_function_privilege('service_role', 'public.map_outcome_signals()', 'EXECUTE') then
    raise exception 'P5 failed: service_role CANNOT execute it, so the health script is blind';
  end if;

  -- P6: the arming state is reported honestly rather than asserted away. Six
  -- types unseen is the EXPECTED state the day this lands — no emitter has
  -- shipped yet — so this is a notice, not a failure. The health script is
  -- what gates on it, after a date.
  raise notice
    'map_outcome_signals installed. denominator=% types_never_seen=%',
    v->>'map_events_total_ever', v->>'types_never_seen';
end $verify$;
