-- ============================================================================
-- Observances Phase 3: a source for observance events, and two linker fixes.
-- ----------------------------------------------------------------------------
-- MEASURED 2026-11-22, nine days before World AIDS Day 2026 (Tue 1 Dec):
--   * 1,329 live events in the day's window; FIVE name it (all Swiss: gaybasel,
--     display-magazin, milchjugend). 3 linked, 1 missed by the linker, 1 merged.
--   * ingestion_staging holds no stuck World AIDS Day row: every one of the 11
--     staged in 90 days committed.
--   * Every linked World AIDS Day event before 2025 came from the 2010-16
--     Wayback gaycities import; 2025 had 2. The corpus never had live coverage.
-- So the bottleneck is MISSING SOURCES, not the prefilters and not the linker.
-- These events are not on one feed; they sit on organiser pages, one per event.
--
-- 1. observance_event_seeds — hand-curated organiser URLs per observance, read
--    by source-observance-events, which stages each page's own schema.org Event
--    JSON-LD. The 30 seeded below were found by web search and each was fetched
--    and confirmed to carry a 2026 Event before it went in (15 more candidates
--    were dropped: 403/202 bot walls, or no Event JSON-LD).
-- 2. World AIDS Day match_terms: `welt-?aids-?tag` missed the spaced spelling
--    "Welt Aids Tag 2026/ Gedenkspaziergang" (Zürich, live, unlinked), and the
--    French term missed "journée mondiale de lutte contre le VIH/sida".
-- 3. World AIDS Day window_days_after 3 -> 10. Organisers hold galas, brunches
--    and town halls titled "World AIDS Day 2026" on the following weekend (seeded:
--    4, 5, 6, 9, 11 Dec). Title AND date are still both required. Measured over
--    the whole corpus, the wider window adds exactly two historical links,
--    "World AIDS Day Rally/March Pittsburgh" (+4) and "World AIDS Day" Chicago
--    (+5), both real; "Life After World AIDS Day" (+14) stays out.
-- ============================================================================

create table if not exists public.observance_event_seeds (
  url             text primary key check (url ~ '^https?://'),
  observance_id   uuid not null references public.observances(id) on delete cascade,
  note            text,
  added_at        timestamptz not null default now(),
  last_fetched_at timestamptz,
  last_status     text,
  last_events     integer
);
alter table public.observance_event_seeds enable row level security;
revoke all on public.observance_event_seeds from anon, authenticated;
grant select, insert, update, delete on public.observance_event_seeds to service_role;

comment on table public.observance_event_seeds is
  'Organiser pages carrying schema.org Event JSON-LD for an observance; read by source-observance-events. last_status: ok | no_jsonld_event | http_<n> | error.';

-- Seeds whose observance occurs within the horizon. A day just past rolls to next
-- year in observance_next_dates, so its seeds rest until then.
create or replace function public.observance_event_seed_worklist(p_horizon_days int default 60)
returns table (url text, observance_slug text)
language sql stable security invoker set search_path = public as $$
  select s.url, o.slug
  from public.observance_event_seeds s
  join public.observances o on o.id = s.observance_id and o.status = 'published'
  where exists (select 1 from public.observance_next_dates(o.id) d
                where d.starts <= current_date + p_horizon_days)
  order by s.url
$$;
revoke all on function public.observance_event_seed_worklist(int) from public, anon, authenticated;
grant execute on function public.observance_event_seed_worklist(int) to service_role;

insert into public.observance_event_seeds (url, observance_id, note)
select v.url, o.id, v.note
from public.observances o
cross join (values
  ('https://www.eventbrite.com/e/2026-nyc-world-aids-day-tickets-2001675419062', 'New York'),
  ('https://www.eventbrite.com/e/world-aids-day-national-observance-2026-tickets-2003471889353', 'San Francisco, National AIDS Memorial'),
  ('https://www.eventbrite.com/e/2026-world-aids-day-awareness-event-tickets-2003307365257', 'Chattanooga'),
  ('https://www.eventbrite.com/e/world-aids-day-2026-tickets-2003086031241', 'Detroit'),
  ('https://www.eventbrite.com/e/world-aids-day-2026-tickets-2004376156039', 'Warren OH'),
  ('https://www.eventbrite.com/e/dallas-county-2026-world-aids-day-symposium-and-celebration-tickets-2004391237147', 'Dallas, 9 Dec'),
  ('https://www.eventbrite.com/e/world-aids-day-2026-seeds-in-a-dying-colony-visualaids-daywithoutart-tickets-2004182064506', 'Washington DC'),
  ('https://www.eventbrite.com/e/world-aids-day-observance-tickets-2002304640079', 'Denver'),
  ('https://www.eventbrite.com/e/world-aids-day-2026-tickets-2003847172836', 'Laguna Beach'),
  ('https://www.eventbrite.com/e/2026-memorial-wreath-laying-ceremony-in-honor-of-world-aids-day-tickets-2005100449420', 'New Orleans, 4 Dec'),
  ('https://www.eventbrite.com/e/maaca-world-aids-day-2026-tickets-2003643286005', 'Port Richey FL, 6 Dec'),
  ('https://www.eventbrite.com/e/world-aids-day-gala-2026-a-celebration-of-purpose-impact-legacy-tickets-2004392416675', 'Montgomery AL, 5 Dec'),
  ('https://www.eventbrite.com/e/5th-annual-world-aids-day-community-celebration-tickets-2003626358374', 'online'),
  ('https://www.eventbrite.com/e/brunch-workshop-for-world-aids-day-2026-in-charleston-tickets-2003617198978', 'North Charleston, 5 Dec'),
  ('https://www.eventbrite.com/e/world-aids-day-2026-luncheon-tickets-2005048422807', 'Jonesboro GA, 2 Dec'),
  ('https://www.eventbrite.com/e/world-aids-day-pretty-powerful-pivot-to-power-tickets-2004664856550', 'Washington DC'),
  ('https://www.eventbrite.com/e/world-aids-day-2026-an-afternoon-of-remembrance-and-hope-tickets-2004212313983', 'Plymouth UK'),
  ('https://www.eventbrite.com/e/world-aids-day-peer-power-up-teen-town-hall-tickets-2003213034110', 'Brooklyn, 11 Dec'),
  ('https://www.eventbrite.com/e/world-aids-day-open-mic-tickets-2003146769912', 'Charlotte'),
  ('https://www.eventbrite.co.uk/e/world-aids-day-2026-fighting-stigma-with-science-tickets-2002082354216', 'London'),
  ('https://eccmaine.org/calendar/2026/12/1/world-aids-day-vigil', 'Portland ME'),
  ('https://www.oaklandcountymi.gov/events/2026/12/01/default-calendar/world-aids-day', 'Ferndale MI'),
  ('https://www.meetup.com/outdoorsyadventureteam/events/317517471/', 'Jacksonville FL'),
  ('https://events.humanitix.com/requiem-for-a-lost-generation', 'Chicago'),
  ('https://prismacare.org/event/5066/', 'Phoenix'),
  ('https://www.rivercityprideindiana.org/events/world-aids-day-y44jh', 'Indiana'),
  ('https://eventscalendar.lehigh.edu/event/legacies-of-care-a-world-aids-day-commemoration-quilt-panel-workshop-with-the-pride-center-at-lehigh-university', 'Bethlehem PA'),
  ('https://www.stuttgart.de/en/veranstaltungskalender/veranstaltungen/welt-aids-tag-2026-in-stuttgart-534641', 'Stuttgart'),
  ('https://csd-kiel.de/veranstaltungen/lichtergang-2025-des-csd-kiel-e-v-am-01-12-2026/', 'Kiel'),
  ('https://www.aidshilfe-rlp.de/events/schlagwort/welt-aids-tag/2026-12/', 'AIDS-Hilfe Rheinland-Pfalz, tag listing')
) as v(url, note)
where o.slug = 'world-aids-day'
on conflict (url) do nothing;

update public.observances
   set match_terms = array['world aids day', 'welt[- ]?aids[- ]?tag',
                           'journ[ée]e mondiale (de (la )?lutte contre le )?(vih/)?sida',
                           'd[ií]a mundial (de la lucha contra el )?sida',
                           'giornata mondiale (contro l.)?aids'],
       window_days_after = 10
 where slug = 'world-aids-day';

-- Registry is canonical; sync_automations_to_cron() derives the run-tracking wrap.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'source_observance_events',
  'Stage observance events from organiser pages',
  'Daily 01:20: source-observance-events reads observance_event_seeds (organiser URLs, hand-curated per observance), fetches only seeds whose observance occurs within 60 days, and stages each page''s schema.org Event JSON-LD. Runs before observance_link (03:25) so committed rows are linked the same night. A page without Event JSON-LD stages nothing and is recorded in last_status. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','source_observance_events','command',
$$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-observance-events',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key'),
      'Content-Type','application/json',
      'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
    ),
    body := jsonb_build_object('triggered_by', 'cron'),
    timeout_milliseconds := 120000
  ) as request_id;
$$),
  '20 1 * * *'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, schedule = excluded.schedule,
      action = excluded.action, enabled = excluded.enabled;

do $$ begin
  begin perform cron.unschedule('source_observance_events'); exception when others then null; end;
end $$;
select cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
from public.admin_automations a where a.slug = 'source_observance_events';

insert into public.ingestion_sources (name, slug, source_type, target_table, edge_function, is_enabled, requires_api_key, schedule)
values ('Observance organiser pages', 'observance-seed', 'scraper', 'events', 'source-observance-events', true, false, '20 1 * * *')
on conflict (slug) do update
  set name = excluded.name, source_type = excluded.source_type, target_table = excluded.target_table,
      edge_function = excluded.edge_function, is_enabled = excluded.is_enabled, schedule = excluded.schedule, updated_at = now();

do $verify$
declare v int;
begin
  select count(*) into v from public.observance_event_seeds s
    join public.observances o on o.id = s.observance_id where o.slug = 'world-aids-day';
  if v < 30 then raise exception 'observance_event_seeds: expected >= 30 World AIDS Day seeds, got %', v; end if;

  select count(*) into v from public.observances
   where slug = 'world-aids-day' and window_days_after >= 10
     and 'Welt Aids Tag 2026/ Gedenkspaziergang' ~* ('\m(' || array_to_string(match_terms, '|') || ')\M')
     and 'Journée mondiale de lutte contre le VIH/SIDA' ~* ('\m(' || array_to_string(match_terms, '|') || ')\M');
  if v <> 1 then raise exception 'world-aids-day match_terms/window not in the expected state'; end if;

  select count(*) into v from cron.job where jobname = 'source_observance_events';
  if v <> 1 then raise exception 'source_observance_events cron not scheduled'; end if;

  if has_table_privilege('anon', 'public.observance_event_seeds', 'select') then
    raise exception 'observance_event_seeds readable by anon';
  end if;
end $verify$;
