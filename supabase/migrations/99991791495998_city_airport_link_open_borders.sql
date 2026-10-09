-- Booking airport: allow airports across OPEN borders, and rank by size then
-- distance instead of by Wikipedia prominence.
--
-- run_city_airport_link only considered airports in the city's own country.
-- For a border city that names the wrong airport: Aachen was booked via DUS
-- (74 km) while Maastricht is 27 km away, Basel via ZRH while its own
-- EuroAirport (BSL) sits across the line in France, Trier via HHN instead of
-- LUX, Saint-Genis-Pouilly via NCY instead of Geneva.
--
-- Removing the country filter outright was measured (2026-10-08, 7,398 cities)
-- and REJECTED: 322 cities would move to a foreign airport, and while most of
-- those are improvements, some cross hard borders a traveller cannot simply
-- walk across -- Brahmanbaria (BD) to Agartala (IN), Ras al-Ayn (SY) to
-- Turkey, Nador (MA) to Melilla, Shkoder (AL) to Podgorica. A booking target
-- that needs a visa or a closed land crossing is a broken search.
--
-- So a foreign airport is allowed only when both countries are in the same
-- open-border zone. The zone membership is DATA (`open_border_countries`), not
-- a hardcoded list in the function, so extending it is one INSERT. Seeded with
-- the Schengen area (incl. CH, LI, NO, IS; BG and RO since 2025) plus the
-- microstates with open borders into it (MC, SM, VA). Andorra is NOT included:
-- it keeps border controls.
--
-- Ranking. After `is_local`, the primary key was `sitelinks` (how many
-- Wikipedia editions cover the airport). Within the 65 km window that picks
-- Liege (LGG, medium, 30 editions) over Maastricht (MST, LARGE, 29) for Aachen.
-- Airport size now ranks before prominence: is_local, then large > medium >
-- small, then sitelinks / passenger volume as before, then distance.
--
-- "Size then DISTANCE" was tried first and REJECTED on a prod dry run: it
-- replaces every metro's international gateway with its domestic city airport
-- (New York LGA, Sao Paulo CGH, Shanghai SHA, Buenos Aires AEP, Jakarta HLP),
-- undoing exactly what 20260929100100 fixed. Size-then-prominence, simulated
-- over all 7,401 cities, changes 147 of the 5,147 linked booking airports, 113
-- of them to a Schengen neighbour (Aachen MST, Basel BSL, Trier LUX,
-- Saint-Genis-Pouilly GVA, Vaduz FDH), and leaves JFK, GRU, PVG, ICN, HND,
-- LHR, CDG, EZE, GIG, CGK and IST untouched.

-- The function body is PATCHED from pg_get_functiondef with exactly-once
-- anchors rather than restated, so nothing else in its ~250 lines can drift.
--
-- Recompute: the cron (`city_airport_link`, 25 3 * * *, batch 300) only
-- revisited rows that were never linked or hold a junk code, so a changed rule
-- would never reach the ~5k already-linked cities. Clearing the link stamp on
-- every city in this migration was measured and rejected: ~10 ms per row
-- through the geo-spine trigger, i.e. 70+ s inside `db push`. Instead the stamp
-- now carries `rule`, and the selector re-offers any city whose stamp predates
-- this rule. The nightly batches drain it (populated cities first, the
-- function's own ORDER BY), with no bulk write here.

-- ---------------------------------------------------------------------------
-- 1. Open-border zones
-- ---------------------------------------------------------------------------
create table if not exists public.open_border_countries (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  zone         text not null,
  note         text
);

comment on table public.open_border_countries is
  'Countries whose land borders a traveller can cross without controls, grouped by zone. run_city_airport_link may pick a foreign airport only when both countries share a zone.';

alter table public.open_border_countries enable row level security;
drop policy if exists open_border_countries_read on public.open_border_countries;
create policy open_border_countries_read on public.open_border_countries
  for select using (true);
grant select on public.open_border_countries to anon, authenticated;

insert into public.open_border_countries (country_code, zone, note) values
  ('AT','schengen',null), ('BE','schengen',null), ('BG','schengen','full member since 2025'),
  ('CH','schengen',null), ('CZ','schengen',null), ('DE','schengen',null),
  ('DK','schengen',null), ('EE','schengen',null), ('ES','schengen',null),
  ('FI','schengen',null), ('FR','schengen',null), ('GR','schengen',null),
  ('HR','schengen','since 2023'), ('HU','schengen',null), ('IS','schengen',null),
  ('IT','schengen',null), ('LI','schengen',null), ('LT','schengen',null),
  ('LU','schengen',null), ('LV','schengen',null), ('MT','schengen',null),
  ('NL','schengen',null), ('NO','schengen',null), ('PL','schengen',null),
  ('PT','schengen',null), ('RO','schengen','full member since 2025'),
  ('SE','schengen',null), ('SI','schengen',null), ('SK','schengen',null),
  ('MC','schengen','open border with FR'), ('SM','schengen','open border with IT'),
  ('VA','schengen','open border with IT')
on conflict (country_code) do nothing;

create or replace function public.countries_share_open_border(p_a text, p_b text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.open_border_countries a
      join public.open_border_countries b on b.zone = a.zone
     where a.country_code = p_a and b.country_code = p_b
  )
$$;

grant execute on function public.countries_share_open_border(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Patch run_city_airport_link
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def   text := pg_get_functiondef('public.run_city_airport_link(integer,boolean)'::regprocedure);
  v_count int;
  a_country constant text := 'WHERE s.country_code = r.country_code';
  b_country constant text := 'WHERE (s.country_code = r.country_code
                     OR public.countries_share_open_border(s.country_code, r.country_code))';
  a_window constant text := 'WINDOW w AS (ORDER BY k.is_local DESC,
                                k.sitelinks DESC NULLS LAST,
                                k.pax_per_year DESC NULLS LAST,
                                CASE k.ap_type WHEN ''large_airport'' THEN 0
                                               WHEN ''medium_airport'' THEN 1 ELSE 2 END,
                                k.dist_km, k.iata_code)';
  a_select constant text := 'OR NOT (coalesce(c.enrichment_status, ''{}''::jsonb) ? ''city_airport_link'')';
  b_select constant text := 'OR NOT (coalesce(c.enrichment_status, ''{}''::jsonb) ? ''city_airport_link'')
        -- linked under an older rule (99991791495998)
        OR coalesce(c.enrichment_status->''city_airport_link''->>''rule'', '''') <> ''open_borders_v1''';
  a_stamp constant text := '''retracted'', coalesce(cardinality(v_removed), 0)
        ), true)';
  b_stamp constant text := '''retracted'', coalesce(cardinality(v_removed), 0),
          ''rule'', ''open_borders_v1''
        ), true)';
  b_window constant text := 'WINDOW w AS (ORDER BY k.is_local DESC,
                                -- Size before prominence (99991791495998):
                                -- Aachen MST (large) over LGG (medium).
                                CASE k.ap_type WHEN ''large_airport'' THEN 0
                                               WHEN ''medium_airport'' THEN 1 ELSE 2 END,
                                k.sitelinks DESC NULLS LAST,
                                k.pax_per_year DESC NULLS LAST,
                                k.dist_km, k.iata_code)';
begin
  v_count := (length(v_def) - length(replace(v_def, a_country, ''))) / length(a_country);
  if v_count <> 1 then
    raise exception 'run_city_airport_link patch: country anchor found % times, expected 1', v_count;
  end if;
  v_count := (length(v_def) - length(replace(v_def, a_window, ''))) / length(a_window);
  if v_count <> 1 then
    raise exception 'run_city_airport_link patch: window anchor found % times, expected 1', v_count;
  end if;

  v_count := (length(v_def) - length(replace(v_def, a_select, ''))) / length(a_select);
  if v_count <> 1 then
    raise exception 'run_city_airport_link patch: selector anchor found % times, expected 1', v_count;
  end if;
  v_count := (length(v_def) - length(replace(v_def, a_stamp, ''))) / length(a_stamp);
  if v_count <> 1 then
    raise exception 'run_city_airport_link patch: stamp anchor found % times, expected 1', v_count;
  end if;

  v_def := replace(v_def, a_select, b_select);
  v_def := replace(v_def, a_stamp, b_stamp);
  v_def := replace(v_def, a_country, b_country);
  v_def := replace(v_def, a_window, b_window);
  execute v_def;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 3. Postconditions
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src text := (select prosrc from pg_proc
                  where oid = 'public.run_city_airport_link(integer,boolean)'::regprocedure);
begin
  if position('countries_share_open_border' in v_src) = 0 then
    raise exception 'run_city_airport_link does not consult open_border_countries';
  end if;
  if position('WHERE s.country_code = r.country_code' in v_src) > 0 then
    raise exception 'run_city_airport_link still carries the hard country filter';
  end if;
  if position('open_borders_v1' in v_src) = 0 then
    raise exception 'run_city_airport_link does not stamp/select on the rule version';
  end if;
  if not public.countries_share_open_border('DE', 'NL') then
    raise exception 'DE/NL should share an open border';
  end if;
  if public.countries_share_open_border('BD', 'IN') then
    raise exception 'BD/IN must not share an open border';
  end if;
  if public.countries_share_open_border('AD', 'FR') then
    raise exception 'AD keeps border controls and must not be in a zone';
  end if;
end
$verify$;
