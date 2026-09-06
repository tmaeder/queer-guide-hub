-- Event series grouping: collapse a recurring series to ONE card in the browse
-- feed, without deleting or merging a single row.
--
-- THE PROBLEM, MEASURED ON PROD. 2,181 of 3,076 upcoming live events (70.9%) are
-- repeat dates of 289 same-title/same-city groups. A Zürich library's opening
-- hours ("Regenbogenhaus & Bibliothek geöffnet") appear 112 times; "Blinded by
-- Delight" 75; "Lesben Stammtisch" 30. The events dedup engine correctly leaves
-- them alone — they are distinct occurrences, not duplicates — so the feed reads
-- as broken while every layer behaves as designed.
--
-- WHY NOT MERGE THEM. This was the obvious fix and it is WRONG, and the
-- measurement that says so is the reason this migration exists at all. Within a
-- series the rows are NOT redundant:
--   * "Pride and Prejudice" (Pleasant Grove, 20 rows) has 20 DISTINCT
--     descriptions — a theatre run where every night differs. "Blinded by
--     Delight" has 29 across 75; "Platypus" 15 across 21.
--   * `count(distinct ticket_url) = row count` on almost every series: each date
--     carries its own booking link.
-- `event_occurrences` cannot hold either of those — it has override_title,
-- override_description and override_venue_id, and NO ticket column. A merge would
-- silently destroy per-date content and 112 live booking links. Check what a
-- series member actually carries before collapsing it into a sibling.
--
-- WHY NOT event_occurrences. That model is master + generated occurrences: one
-- `events` row plus N occurrence rows. Adopting it means DELETING 2,181 `events`
-- rows and the URL of each. Non-starter, and unnecessary — nothing here needs the
-- rows gone, only the feed to stop showing all of them at once.
--
-- WHY A STORED FLAG AND NOT A QUERY-TIME `distinct on`. The /events listing runs
-- through PostgREST: useEvents.tsx only takes the `search_events` RPC path when
-- the sole filters are city/dateRange, and falls back to a direct client query
-- otherwise. PostgREST cannot express `distinct on`. A stored boolean composes
-- with every existing filter, BOTH query paths, `.range()` pagination and
-- `count: 'exact'` — none of which survive collapsing a paginated result set on
-- the client (a series straddling a page boundary collapses differently per page
-- and leaves ragged page sizes).
--
-- series_next DEFAULTS TO TRUE, and that is load-bearing. A row in no series, and
-- a row inserted between two recompute runs, must both appear. The flag can only
-- ever hide a row it has positively identified as a repeat, so the failure mode
-- is "feed shows too much" — never "an event silently disappeared".
--
-- THRESHOLD 3, measured: >=3 hides 1,790 rows across 208 series (feed 3,076 ->
-- 1,286, -58%); >=2 hides only 83 more across 83 extra groups, and a 2-member
-- group is exactly where "series or duplicate pair?" is ambiguous — that question
-- belongs to the dedup engine, not to a display heuristic.

alter table public.events
  add column if not exists series_key  text,
  add column if not exists series_size integer,
  add column if not exists series_next boolean not null default true;

comment on column public.events.series_key is
  'Identity of a recurring-series group (md5 of despaced title|city_id|venue). NULL when the row belongs to no series. Written only by run_event_series_recompute().';
comment on column public.events.series_size is
  'Number of UPCOMING live members of this row''s series, for the "+N more dates" affordance. NULL outside a series.';
comment on column public.events.series_next is
  'False only for a series member that is NOT the next upcoming occurrence, i.e. hidden from the collapsed browse feed. Defaults TRUE so an unclassified or brand-new row is always visible.';

-- Supports the "other dates in this series" lookup on the event page.
create index if not exists idx_events_series_key
  on public.events (series_key, start_date)
  where series_key is not null;

create or replace function public.run_event_series_recompute(p_batch integer default 4000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_updated  integer := 0;
  v_series   integer := 0;
  v_members  integer := 0;
begin
  with live as (
    select e.id,
           e.start_date,
           md5(
             public.dedup_despace(e.title) || '|' ||
             coalesce(e.city_id::text, '~') || '|' ||
             coalesce(e.venue_id::text, nullif(btrim(lower(e.venue_name)), ''), '~')
           ) as k
    from public.events e
    where e.duplicate_of_id is null
      and e.status = 'active'
      and e.start_date >= now()
      and e.title is not null
  ),
  grp as (
    select k, count(*)::integer as n
    from live
    group by k
    having count(*) >= 3
  ),
  target as (
    -- Members of a qualifying group: exactly one keeps series_next. The ORDER BY
    -- carries `l.id` as a tie-break so two occurrences sharing a timestamp cannot
    -- make the representative flip between runs (which would churn the search
    -- reindex queue forever on an unscoped trigger).
    select l.id,
           g.k                                        as series_key,
           g.n                                        as series_size,
           (row_number() over (partition by g.k
                               order by l.start_date, l.id) = 1) as series_next
    from live l
    join grp g on g.k = l.k

    union all

    -- Upcoming rows in no qualifying group return to the default visible state.
    select l.id, null::text, null::integer, true
    from live l
    where not exists (select 1 from grp g where g.k = l.k)

    union all

    -- A row whose date has passed leaves the browse feed by date anyway. Reset it
    -- so the `includePast` feed — which deliberately does NOT filter on this flag
    -- — is never shaped by a stale grouping, and so the column keeps meaning
    -- "hidden from the upcoming feed" instead of accumulating dead state.
    select e.id, null::text, null::integer, true
    from public.events e
    where e.start_date < now()
      and (e.series_key is not null or e.series_next = false)
  ),
  changed as (
    -- IS DISTINCT FROM is load-bearing: trg_search_documents_event is UNSCOPED
    -- (AFTER INSERT OR DELETE OR UPDATE, no `UPDATE OF`), so every row written
    -- here enqueues a search reindex. Steady state must be near zero.
    select t.*
    from target t
    join public.events e on e.id = t.id
    where e.series_key  is distinct from t.series_key
       or e.series_size is distinct from t.series_size
       or e.series_next is distinct from t.series_next
    limit p_batch
  ),
  upd as (
    update public.events e
       set series_key  = c.series_key,
           series_size = c.series_size,
           series_next = c.series_next
      from changed c
     where e.id = c.id
    returning 1
  )
  select count(*)::integer into v_updated from upd;

  select count(*)::integer, coalesce(sum(n), 0)::integer
    into v_series, v_members
  from (
    select count(*) as n
    from public.events
    where duplicate_of_id is null
      and status = 'active'
      and start_date >= now()
      and series_key is not null
    group by series_key
  ) s;

  return jsonb_build_object(
    'updated', v_updated,
    'series', v_series,
    'members', v_members,
    -- A full batch means work may remain; the hourly cron drains the rest.
    'capped', v_updated >= p_batch
  );
end;
$$;

comment on function public.run_event_series_recompute(integer) is
  'Recomputes events.series_key/series_size/series_next so a recurring series shows as one card in the browse feed. Non-destructive: never merges, deletes or reparents a row.';

revoke all on function public.run_event_series_recompute(integer) from public, anon, authenticated;
grant execute on function public.run_event_series_recompute(integer) to service_role;

-- Hourly, not nightly: the representative is "the next upcoming occurrence", so a
-- purely nightly job leaves a passed date at the head of its series for up to 24h.
-- The IS DISTINCT FROM guard above makes an hourly no-op run genuinely free.
-- `trigger` and `managed_by` are both explicit: `trigger` is NOT NULL with NO
-- default, so omitting it fails the insert outright, and `managed_by` defaults to
-- 'user' while every scheduled sibling is 'system'.
insert into public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
values (
  'event_series_recompute',
  'Event series recompute',
  'Marks the next upcoming occurrence of each recurring event series so the browse feed shows one card per series instead of every date.',
  '40 * * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_event_series_recompute',
    -- `command` is carried even though the type is rpc: sync_automations_to_cron()
    -- branch (d) can only recreate a missing cron job from action->>'command', and
    -- a bare rpc row is structurally unschedulable by the reconciler.
    'command', 'SELECT public.run_event_series_recompute(4000);',
    'jobname', 'event_series_recompute'
  ),
  true,
  3
)
on conflict (slug) do update
  set schedule = excluded.schedule,
      action   = excluded.action,
      enabled  = true;

select cron.schedule(
  'event_series_recompute',
  '40 * * * *',
  'SELECT public.run_event_series_recompute(4000);'
);

-- Populate immediately so the fix is live with the migration rather than up to an
-- hour later.
select public.run_event_series_recompute(20000);

do $verify$
declare
  v_bad_series   integer;
  v_hidden       integer;
  v_visible      integer;
begin
  -- THE invariant: every series has exactly one visible representative. A series
  -- with zero would vanish from the feed completely — the one way this feature
  -- can lose content rather than merely group it.
  select count(*) into v_bad_series
  from (
    select series_key, count(*) filter (where series_next) as reps
    from public.events
    where duplicate_of_id is null and status = 'active'
      and start_date >= now() and series_key is not null
    group by series_key
  ) s
  where reps <> 1;

  if v_bad_series > 0 then
    raise exception 'event_series_grouping: % series do not have exactly one visible representative', v_bad_series;
  end if;

  select count(*) filter (where not series_next),
         count(*) filter (where series_next)
    into v_hidden, v_visible
  from public.events
  where duplicate_of_id is null and status = 'active' and start_date >= now();

  -- Positive control: "zero bad series" also passes on a corpus where nothing was
  -- grouped at all, which is exactly the state this migration exists to change.
  if v_hidden = 0 then
    raise exception 'event_series_grouping: recompute grouped nothing — the feed is unchanged, so the migration did not do its job';
  end if;

  raise notice 'event_series_grouping: % upcoming rows visible, % collapsed into their series', v_visible, v_hidden;
end
$verify$;
