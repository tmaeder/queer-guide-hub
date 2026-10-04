-- user_events: the six map outcome types
--
-- THIS MIGRATION AND `src/hooks/useTrackEvent.ts` MUST LAND IN ONE COMMIT, and
-- the reason is mechanical rather than stylistic.
-- `src/hooks/__tests__/userEventsVocabularyDrift.test.ts` asserts SET EQUALITY
-- in BOTH directions between the TS unions and this CHECK, so:
--
--   * a TS-only change rejects every map event at the database. PostgREST
--     RESOLVES with `{ error }` rather than throwing, `insertTelemetry`
--     inspects it but the row is already lost — and the resulting zero reads as
--     "nobody opened a detail page from the map". That is verbatim the
--     signup_funnel_events incident in
--     `docs/audits/2026-08-21-signup-consent-gap.md`.
--   * a migration-only change reds the drift test on `main` for everyone,
--     because migrations auto-apply on merge while the frontend deploys on the
--     same push. There is no ordering that makes two PRs safe.
--
-- NO NEW TABLE, deliberately. The consent gate already lives at the single
-- writer (`analyticsAllowed()` in useTrackEvent), `analytics_hygiene_stats()`
-- already reports this table's liveness, and a second telemetry table means a
-- second gate to forget — which is how 98.9% of traffic came to be tracked
-- ungated once already.
--
-- `metadata` CARRIES `{surface, view, line}` AND THEY ARE NOT COLUMNS. Adding
-- three columns for one writer's dimensions would make every other writer's
-- rows carry three nulls, and `user_events` is shared by the whole app.
--
-- The CHECK stays NOT VALID, matching the constraint it replaces: there are
-- ~millions of historical rows and nothing here invalidates any of them, so
-- paying for a full validation scan buys nothing.

-- The full vocabulary, derived from the live constraint plus the six new
-- values. Read off `pg_get_constraintdef` rather than reconstructed from a
-- migration file — the 19 existing values come from several PRs and the newest
-- file defining this constraint is not the whole story.
--
-- Ten of the nineteen are `lib/searchClient.ts`'s `TrackEvent`, not
-- `useTrackEvent`'s `EventType`. The drift test unions BOTH, which is why
-- dropping any of them here would red it even though this hook never emits one.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_events'::regclass
      and conname = 'user_events_event_type_known'
  ) then
    alter table public.user_events drop constraint user_events_event_type_known;
  end if;

  alter table public.user_events
    add constraint user_events_event_type_known
    check (event_type = any (array[
      -- useTrackEvent.EventType, pre-existing
      'page_view', 'search', 'booking_click', 'favorite_add', 'favorite_remove',
      'deal_view', 'trip_create', 'hotel_view', 'activity_view',
      -- searchClient.TrackEvent
      'click', 'view', 'save', 'favorite', 'book', 'attend', 'dismiss',
      'search_submit', 'facet_apply', 'zero_results',
      -- map outcomes (new)
      'map_detail_open', 'map_station_save', 'map_trip_add',
      'map_route_open', 'map_route_copy', 'map_handoff'
    ])) not valid;
end $$;

-- ── postconditions ───────────────────────────────────────────────────────────
do $verify$
declare
  v_def text;
  v_missing text[] := '{}';
  v_t text;
  v_probe_ok boolean := false;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.user_events'::regclass
    and conname = 'user_events_event_type_known';

  if v_def is null then
    raise exception 'P1 failed: user_events_event_type_known is absent';
  end if;

  -- P2: every new value is accepted. Counting the REACHED state, because a
  -- check for "no bad values" returns zero against a constraint that was never
  -- re-created.
  foreach v_t in array array[
    'map_detail_open','map_station_save','map_trip_add',
    'map_route_open','map_route_copy','map_handoff'
  ] loop
    if position('''' || v_t || '''' in v_def) = 0 then
      v_missing := v_missing || v_t;
    end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'P2 failed: the CHECK does not accept %', v_missing;
  end if;

  -- P3: and NOTHING pre-existing was dropped. A widening that loses a value
  -- silently starts rejecting a writer that was working — worse than not
  -- widening at all, and invisible because the insert resolves rather than
  -- throws.
  v_missing := '{}';
  foreach v_t in array array[
    'page_view','search','booking_click','favorite_add','favorite_remove',
    'deal_view','trip_create','hotel_view','activity_view',
    'click','view','save','favorite','book','attend','dismiss',
    'search_submit','facet_apply','zero_results'
  ] loop
    if position('''' || v_t || '''' in v_def) = 0 then
      v_missing := v_missing || v_t;
    end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception
      'P3 failed: widening DROPPED pre-existing values %, which would start '
      'rejecting a writer that works today', v_missing;
  end if;

  -- P4: the constraint is still NOT VALID, so this did not quietly schedule a
  -- full-table validation scan on a large table.
  if position('NOT VALID' in v_def) = 0 then
    raise exception 'P4 failed: the constraint is no longer NOT VALID: %', v_def;
  end if;

  -- P5: BEHAVIOURAL. A source check cannot tell a live constraint from a dead
  -- one, so actually insert a map row and roll it back. Without this the whole
  -- file is a string assertion about a definition.
  begin
    insert into public.user_events (event_type, entity_type, entity_id, session_id, metadata)
    values ('map_detail_open', 'venue', gen_random_uuid(), 'migration-probe',
            jsonb_build_object('surface','discover','view','stations','line','M'));
    v_probe_ok := true;
    -- Remove the probe row in the same transaction. The migration must leave
    -- no telemetry behind: a synthetic row would be counted by every reader.
    delete from public.user_events where session_id = 'migration-probe';
  exception when check_violation then
    raise exception 'P5 failed: the CHECK rejected a map_detail_open insert';
  end;
  if not v_probe_ok then
    raise exception 'P5 failed: the probe insert did not run';
  end if;
  if exists (select 1 from public.user_events where session_id = 'migration-probe') then
    raise exception 'P6 failed: the probe row was not removed';
  end if;

  raise notice 'user_events: 25 event types accepted, probe inserted and removed';
end $verify$;
