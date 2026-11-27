-- Observances phase 3 (last step): a coverage gap becomes an inbox item, not silence.
--
-- Measured 2026-11-22 before writing this:
--   * run_event_coverage_radar() only knows is_major_city cities and upserts
--     event_coverage_gaps ON CONFLICT (city_id). An observance has no city, so it cannot
--     live there without making city_id nullable and adding a second key.
--   * Nothing in src/ reads event_coverage_gaps (303 rows). A new arm there would be a
--     second write-only list.
--   * observance_signals() already warns (< 5 within 14 days), but only in the scheduled
--     pipeline-health log.
-- So the gap is computed where the admin already looks: a triage source in /admin/inbox.
--
-- Shape: no table. observance_coverage_gaps() computes the list on read; an item leaves the
-- inbox on its own once its occurrence has >= p_min linked upcoming events or its date
-- passes. There is nothing to approve or reject, so the queue carries external_console and
-- the panel shows no action bar. Nothing here fetches, stages or invents events.
--
-- Suggested queries are plain phrases a human types into a search engine: the observance
-- name plus every match term that is not a regex, each with the year (and the country for a
-- country-specific rule). Keyword search on generic ticketing sources finds ~0 awareness-day
-- events (99991795363706: Ticketmaster "World AIDS Day" = 0 in 7 countries), so the useful
-- output is organiser pages for observance_event_seeds, which source-observance-events
-- fetches daily at 01:20.
--
-- created_at = the day the occurrence entered the 30-day horizon, so the queue's SLA
-- (336 h) marks an item overdue once fewer than 16 days remain.

-- ===== 1. the work list =====
create or replace function public.observance_coverage_gaps(p_horizon_days int default 30, p_min int default 5)
returns table (
  observance_id uuid, slug text, name text, country_id uuid, country_name text,
  starts date, ends date, linked_upcoming bigint, needed int,
  search_queries text[], seeded_pages bigint, seeded_pages_ok bigint
)
language sql stable set search_path to 'public' as $fn$
  with nxt as (
    select o.id, o.slug, o.name, o.match_terms, o.window_days_before as wb, o.window_days_after as wa,
           d.country_id, d.country_name, d.starts, d.ends
      from public.observances o
      cross join lateral public.observance_next_dates(o.id) d
     where o.status = 'published'
       and d.starts between current_date and current_date + p_horizon_days
  ),
  cov as (
    -- ponytail: a global row also counts events in countries that have their own rule;
    -- split by country only if a day ever has both.
    select n.*,
           (select count(*) from public.event_observances eo
              join public.events e on e.id = eo.event_id
             where eo.observance_id = n.id and eo.status = 'linked'
               and e.duplicate_of_id is null
               and e.start_date::date >= current_date
               and e.start_date::date between n.starts - n.wb and n.ends + n.wa
               and (n.country_id is null or e.country_id = n.country_id)) as linked_upcoming
      from nxt n
  )
  select c.id, c.slug, c.name, c.country_id, c.country_name, c.starts, c.ends,
         c.linked_upcoming, p_min,
         (select array_agg(distinct q.term || ' ' || extract(year from c.starts)::int
                           || coalesce(' ' || c.country_name, ''))
            from (select lower(c.name) as term
                  union select t from unnest(c.match_terms) t
                   where t !~ '[][()?|*+\\.{}^$]') q),
         (select count(*) from public.observance_event_seeds s where s.observance_id = c.id),
         (select count(*) from public.observance_event_seeds s
           where s.observance_id = c.id and s.last_status = 'ok')
    from cov c
   where c.linked_upcoming < p_min
   order by c.starts
$fn$;
revoke all on function public.observance_coverage_gaps(int, int) from public, anon, authenticated;
grant execute on function public.observance_coverage_gaps(int, int) to service_role;

-- ===== 2. the inbox source =====
create or replace view public.triage_src_observance_coverage as
select md5(g.observance_id::text || coalesce(g.country_id::text, ''))::uuid as id,
       'observance-coverage'::text as queue_type,
       'observance'::text as content_type,
       ('Find sources for ' || g.name || coalesce(' (' || g.country_name || ')', ''))::text as title,
       (to_char(g.starts, 'YYYY-MM-DD') || ' · ' || g.linked_upcoming || ' of ' || g.needed
          || ' linked upcoming events')::text as subtitle,
       'open'::text as status,
       null::numeric(3,2) as confidence_score,
       (g.starts - 30)::timestamptz as created_at,
       'observance-coverage'::text as source,
       g.observance_id as entity_id,
       'observances'::text as entity_table,
       false as has_diff,
       null::uuid as reporter_id,
       jsonb_build_object(
         'observance', g.name, 'hub', '/days/' || g.slug, 'date', g.starts,
         'country', g.country_name, 'linked_upcoming', g.linked_upcoming, 'needed', g.needed,
         'search_queries', to_jsonb(g.search_queries),
         'seeded_pages', g.seeded_pages, 'seeded_pages_ok', g.seeded_pages_ok,
         'how_to_fill', 'Find organiser pages that list real events for this day and add them to '
           || 'observance_event_seeds (fetched daily at 01:20). Never create events by hand.') as meta,
       null::text as flag_type,
       '{}'::jsonb as risk_flags
  from public.observance_coverage_gaps(30, 5) g;

revoke all on public.triage_src_observance_coverage from anon, authenticated;

insert into public.triage_sources
  (queue_key, view_name, label, priority_weight, sla_hours, count_key, capabilities, active,
   count_prefix, low_confidence_weight)
values ('observance-coverage', 'triage_src_observance_coverage', 'Observance coverage', 20, 336,
        'observance_coverage',
        jsonb_build_object(
          'can_reopen', false,
          'external_console', '/days',
          'external_console_note',
          'Nothing to approve: this item closes on its own once 5 upcoming events are linked or the date passes.'),
        true, 'review_', 1)
on conflict (queue_key) do update
  set view_name = excluded.view_name, label = excluded.label, sla_hours = excluded.sla_hours,
      capabilities = excluded.capabilities, active = true;

-- ===== 3. postconditions =====
do $verify$
declare
  v_cols text;
  v_n int;
begin
  -- P1 column base types match the other sources (the 2026-09-14 UNION outage)
  select string_agg(a.attname || ':' || a.atttypid::regtype::text, ',' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = 'public.triage_src_observance_coverage'::regclass and a.attnum > 0;
  if v_cols is distinct from (
       select string_agg(a.attname || ':' || a.atttypid::regtype::text, ',' order by a.attnum)
         from pg_attribute a where a.attrelid = 'public.triage_src_entity_links'::regclass and a.attnum > 0) then
    raise exception 'P1 failed: column shape differs from triage_src_entity_links: %', v_cols;
  end if;
  -- P2 the union of every active source still executes
  if not coalesce((public.triage_queue_signals()->>'probe_ok')::boolean, false) then
    raise exception 'P2 failed: triage_queue_signals probe is not ok: %', public.triage_queue_signals();
  end if;
  -- P3 anon reaches neither the view nor the function
  if has_table_privilege('anon', 'public.triage_src_observance_coverage', 'select')
     or has_function_privilege('anon', 'public.observance_coverage_gaps(int,int)', 'execute') then
    raise exception 'P3 failed: anon can read the observance coverage work list';
  end if;
  -- P4 the list is not structurally empty: over a whole year every published observance
  -- with a next date appears once p_min exceeds any real count
  select count(*) into v_n from public.observance_coverage_gaps(366, 1000000);
  if v_n < (select count(*) from public.observances where status = 'published') then
    raise exception 'P4 failed: a 366-day, unreachable-minimum list returned only % rows', v_n;
  end if;
end
$verify$;
