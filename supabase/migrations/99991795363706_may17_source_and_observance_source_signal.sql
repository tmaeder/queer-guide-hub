-- Observances phase 3: may17.org (IDAHOBIT's own registry of actions) as an event source,
-- and "listed by the observance's own registry" as a name signal for the linker.
--
-- Why a source, measured 2026-11-22: keyword-querying generic ticketing sources finds no
-- awareness-day events (Ticketmaster "World AIDS Day" = 0 in 7 countries; Eventbrite search
-- is gone). may17.org lists 230 IDAHOBIT 2026 events (124 in 2025) against 1 linked here.
--
-- Why a source signal: may17 publishes only actions registered for IDAHOBIT, yet only
-- 116/230 titles name the day (57 only in the description, 57 nowhere). The linker required
-- the name in the TITLE, so half the registry would never reach the hub. An observance now
-- lists the sources whose every event is about it (`source_slugs`); an event from such a
-- source counts as a title match ('source:may17' in evidence.title_term). The DATE WINDOW
-- is still required to auto-link — an essay competition running March to April goes to
-- review, not to the 17 May hub.
--
-- The cron command below is the plain, unwrapped form on purpose; the reconciler derives
-- the run-tracking wrapper (see 20260910163700).

-- ===== 1. source-as-signal =====
alter table public.observances
  add column if not exists source_slugs text[] not null default '{}';
update public.observances set source_slugs = array['may17'] where slug = 'idahobit';

do $patch$
declare
  v_src text := pg_get_functiondef('public.run_observance_link(text,timestamptz)'::regprocedure);
  v_out text;
  a1 text := E'as rx\n    from public.observances ob where ob.status = ''published''';
  b1 text := E'as rx,\n           ob.source_slugs as src\n    from public.observances ob where ob.status = ''published''';
  a2 text := E'           substring(e.title from (''(?i)'' || o.rx)) as title_term,';
  b2 text := E'           coalesce(substring(e.title from (''(?i)'' || o.rx)),\n'
          || E'                    (select ''source:'' || es.source_slug from public.event_sources es\n'
          || E'                      where es.event_id = e.id and es.source_slug = any(o.src) limit 1)) as title_term,';
  a3 text := E'    join o on (e.title ~* o.rx or coalesce(e.description, '''') ~* o.rx)';
  b3 text := E'    join o on (e.title ~* o.rx or coalesce(e.description, '''') ~* o.rx\n'
          || E'               or (cardinality(o.src) > 0 and exists (select 1 from public.event_sources es\n'
          || E'                     where es.event_id = e.id and es.source_slug = any(o.src))))';
  n int;
begin
  if position('ob.source_slugs as src' in v_src) > 0 then
    return;  -- already patched
  end if;
  foreach n in array array[1, 2, 3] loop
    if (length(v_src) - length(replace(v_src, (array[a1, a2, a3])[n], ''))) / length((array[a1, a2, a3])[n]) <> 1 then
      raise exception 'run_observance_link: anchor % not found exactly once', n;
    end if;
  end loop;
  v_out := replace(replace(replace(v_src, a1, b1), a2, b2), a3, b3);
  execute v_out;
end
$patch$;

-- ===== 2. registry + cron + source registry =====
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'ev_fill_may17',
  'Fill IDAHOBIT events from may17.org',
  'Daily 02:50: source-may17 reads may17.org''s public The Events Calendar REST API (/wp-json/tribe/events/v1/events, key-less, 50/page) for the 400 days around today. IDAHOBIT''s own registry of actions: 230 events in 2026, 124 in 2025. The API''s "venue" is a country, a city or "Online", so venue_name is never staged; city/country/address are. observances.source_slugs makes every may17 event an IDAHOBIT name signal for the observance linker (date window still required). Backfill: post {"start_date":"2025-01-01","end_date":"2026-12-31"}. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', 'ev-fill-may17', 'command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-may17',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$),
  '50 2 * * *'
)
on conflict (slug) do update
  set description = excluded.description, action = excluded.action, schedule = excluded.schedule;

select cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
from public.admin_automations a where a.slug = 'ev_fill_may17';

insert into public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
values ('may17.org IDAHOBIT actions', 'may17', 'api', 'events', 'source-may17', true, false, '50 2 * * *')
on conflict (slug) do update
  set name = excluded.name, source_type = excluded.source_type, target_table = excluded.target_table,
      edge_function = excluded.edge_function, is_enabled = excluded.is_enabled,
      schedule = excluded.schedule, updated_at = now();

-- ===== 3. postconditions =====
do $verify$
declare v_def text := pg_get_functiondef('public.run_observance_link(text,timestamptz)'::regprocedure);
begin
  -- P1 the source signal is in the candidate join AND in the title term the decision reads
  if position('es.source_slug = any(o.src))))' in v_def) = 0
     or position('''source:'' || es.source_slug' in v_def) = 0 then
    raise exception 'P1 failed: run_observance_link is not patched with the source signal';
  end if;
  -- P2 the auto-link decision still requires the date window
  if position('s.title_term is not null and s.date_sig then ''linked''' in v_def) = 0 then
    raise exception 'P2 failed: the auto-link decision lost its date-window requirement';
  end if;
  -- P3 IDAHOBIT lists may17
  if not exists (select 1 from public.observances where slug = 'idahobit' and 'may17' = any(source_slugs)) then
    raise exception 'P3 failed: idahobit does not list may17';
  end if;
  -- P4 registry, cron, source registry
  if not exists (select 1 from public.admin_automations where slug = 'ev_fill_may17' and enabled)
     or not exists (select 1 from cron.job where jobname = 'ev-fill-may17' and active)
     or not exists (select 1 from public.ingestion_sources where slug = 'may17' and is_enabled and target_table = 'events') then
    raise exception 'P4 failed: may17 is not fully registered';
  end if;
  -- P5 the registry command is the plain form (the reconciler wraps it)
  if exists (select 1 from public.admin_automations where slug = 'ev_fill_may17'
              and (action->>'command' ilike '%automation_http_post%' or action->>'command' ilike '%admin_automation_run_begin%')) then
    raise exception 'P5 failed: ev_fill_may17 command is pre-wrapped';
  end if;
end
$verify$;
