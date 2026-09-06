-- Merge the duplicate city row "Zurich" (filed United States) into "Zürich"
-- (Switzerland), and retract the geo that was derived from the wrong one.
--
-- THE DEFECT. `cities` held TWO live rows whose city_name_key is 'zurich', both
-- shell_status='real', neither marked a duplicate of the other:
--
--   eafd0504…  "Zurich"  slug=zurich   country=United States     10 events,   7 venues
--   35d1d772…  "Zürich"  slug=zuerich  country=Switzerland     3,260 events, 383 venues
--
-- Every piece of content on the US row is unambiguously Swiss. The venues sit at
-- Turbinenstrasse 46, Bellerivestrasse 200-214, Badenerstrasse 254, Zollstrasse
-- 121, Hohlstrasse 48 and Mühlegasse 11; one is literally "Werdinsel,
-- Zürich-Höngg"; Sauna Paragonya, MZ-Shop (Männerzone) and Badi Tiefenbrunnen are
-- known Zürich venues. All TEN events carry `country = 'CH'` while sitting on a
-- city row whose country is the United States — the row contradicts itself. The
-- events include Pink Apple (Zürich's LGBT film festival) and Zurich Lake
-- Crossing. A real Zurich, Kansas exists and holds none of this.
--
-- WHY IT MATTERS BEYOND ONE CITY PAGE. Three consequences, and the second is the
-- one that took a session to find:
--   1. One city published as two pages: /city/zurich (10 events) beside
--      /city/zuerich (3,260).
--   2. EVERY city-keyed dedup arm is blind across the pair, because all of them
--      require a shared city_id. Concretely "Lila" (patroc, on the US row) and
--      "lila Queer Festival" (display-magazin, on the Swiss row) are the same
--      festival and cannot be detected while they sit on different city rows.
--   3. Wrong-country attribution. No safety consequence here — CH and US are both
--      non-criminalizing — but the same shape in a criminalizing country WOULD
--      have one, because `safety_gated` is derived from country_id.
--
-- WHY THE STANDARD COLLISION QUERY DOES NOT FIND IT. Grouping cities by
-- (city_name_key, country_id) returns ZERO collision groups, because the defect IS
-- the differing country. A detector for this class has to group on the name key
-- ACROSS countries and then discriminate on content — cross-country name
-- collisions are mostly legitimate (Cambridge UK/US), so the signal is content
-- that contradicts the assigned country, not the collision itself.
--
-- THE MERGE ALONE IS NOT ENOUGH, MEASURED. Running merge_cities() in a rolled-back
-- transaction and then reading the rows shows it repoints city_id and the derive
-- trigger fixes `country` to Switzerland — but three events keep `state='Kansas'`
-- and coordinates 39.944121,-99.5232832, which is Zurich, KANSAS. Pink Apple would
-- publish on the map in the American Midwest. `trg_events_geo_derive` FILLS an
-- empty field; it does not overwrite a populated wrong one, and merge_cities()
-- never touches latitude/longitude at all. This is the same class as the 86
-- safety_notes that described another country's laws: a derived value outlives the
-- input it was derived from, and nothing rechecks it.
--
-- The tell was internal contradiction: those rows carry `timezone='Europe/Zurich'`
-- alongside Kansas coordinates and state='Kansas'. Note also that the US row's
-- `region_name` is NULL, so "Kansas" did not come from the city at all — it was
-- reverse-geocoded FROM the wrong coordinates, i.e. the error propagated a second
-- hop before anyone looked.
--
-- THE REPAIR KEYS ON PROVENANCE, NOT ON POSITION. Only rows that (a) provenance
-- proves we derived (`field_provenance.latitude.source = 'derived:city_centroid'`)
-- AND (b) sit on the dropped row's EXACT centroid are rewritten. A
-- source-provided coordinate is never touched — the other seven events carry real
-- venue coordinates around 47.36N 8.54E and must survive untouched.

do $migrate$
declare
  v_keep  uuid := '35d1d772-8ce7-4c05-92a5-95ea7053b4bf';  -- Zürich, Switzerland
  v_drop  uuid := 'eafd0504-bbb2-46ef-a201-b230342d9385';  -- Zurich, United States
  v_drop_lat numeric := 39.944121;
  v_drop_lng numeric := -99.5232832;
  v_already boolean;
  v_merge jsonb;
  v_fixed integer;
begin
  select duplicate_of_id is not null into v_already from public.cities where id = v_drop;

  if v_already is null then
    raise notice 'merge_zurich: drop row % no longer exists — nothing to do', v_drop;
    return;
  end if;

  if v_already then
    raise notice 'merge_zurich: already merged — skipping the merge, still running the geo repair';
  else
    -- p_confirm_cross_country is REQUIRED here and is the whole point of the flag:
    -- merge_cities() refuses a CH/US merge by default precisely because same-name
    -- cities in different countries are usually distinct places. This one is not,
    -- on the evidence in the header.
    select public.merge_cities(v_keep, v_drop, true) into v_merge;
    raise notice 'merge_zurich: %', v_merge;
  end if;

  -- Retract geo derived from the DROPPED city's centroid and re-derive from the
  -- kept one. Keyed on provenance + exact centroid so a real venue coordinate
  -- cannot be caught by it.
  update public.events e
     set latitude  = k.latitude,
         longitude = k.longitude,
         state     = k.region_name,
         field_provenance = jsonb_set(
           jsonb_set(
             coalesce(e.field_provenance, '{}'::jsonb),
             '{latitude}',
             jsonb_build_object(
               'value', k.latitude, 'source', 'derived:city_centroid',
               'confidence', 0.3, 'at', now(),
               'corrected_from', jsonb_build_object(
                 'value', v_drop_lat, 'reason', 'derived from duplicate city row Zurich/US, merged into Zürich/CH')
             )),
           '{longitude}',
           jsonb_build_object(
             'value', k.longitude, 'source', 'derived:city_centroid',
             'confidence', 0.3, 'at', now(),
             'corrected_from', jsonb_build_object(
               'value', v_drop_lng, 'reason', 'derived from duplicate city row Zurich/US, merged into Zürich/CH')
           ))
    from public.cities k
   where k.id = v_keep
     and e.city_id = v_keep
     and e.field_provenance->'latitude'->>'source' = 'derived:city_centroid'
     and round(e.latitude::numeric, 6)  = round(v_drop_lat, 6)
     and round(e.longitude::numeric, 6) = round(v_drop_lng, 6);

  get diagnostics v_fixed = row_count;
  raise notice 'merge_zurich: % event(s) re-derived off the wrong centroid', v_fixed;
end
$migrate$;

do $verify$
declare
  v_dup_rows   integer;
  v_kansas     integer;
  v_us_linked  integer;
  v_zurich_ev  integer;
  v_real_coords integer;
begin
  -- Exactly one live 'zurich' row remains.
  select count(*) into v_dup_rows
  from public.cities c
  where public.city_name_key(c.name) = public.city_name_key('Zürich')
    and c.duplicate_of_id is null
    and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged');

  if v_dup_rows <> 1 then
    raise exception 'merge_zurich: expected exactly 1 live zurich city row, found %', v_dup_rows;
  end if;

  -- No event anywhere still sits on the Kansas centroid.
  select count(*) into v_kansas
  from public.events
  where round(latitude::numeric, 6) = 39.944121
    and round(longitude::numeric, 6) = -99.523283;

  if v_kansas > 0 then
    raise exception 'merge_zurich: % event(s) still at the Zurich/Kansas centroid', v_kansas;
  end if;

  -- No Swiss event still claims a US state.
  select count(*) into v_us_linked
  from public.events e
  where e.city_id = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf'
    and e.state = 'Kansas';

  if v_us_linked > 0 then
    raise exception 'merge_zurich: % event(s) still stamped state=Kansas', v_us_linked;
  end if;

  -- Positive control: the checks above all pass on an empty city too. Assert the
  -- content actually arrived, and that the SEVEN events carrying real venue
  -- coordinates were left alone rather than flattened onto the city centroid.
  select count(*) into v_zurich_ev
  from public.events
  where city_id = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf' and duplicate_of_id is null;

  if v_zurich_ev < 3000 then
    raise exception 'merge_zurich: only % events on Zürich — content did not survive the merge', v_zurich_ev;
  end if;

  select count(*) into v_real_coords
  from public.events
  where city_id = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf'
    and duplicate_of_id is null
    and latitude::numeric between 47.30 and 47.45
    and longitude::numeric between 8.45 and 8.60
    and coalesce(field_provenance->'latitude'->>'source', '') <> 'derived:city_centroid';

  if v_real_coords < 5 then
    raise exception
      'merge_zurich: only % Zürich events retain a non-derived venue coordinate — the repair over-reached',
      v_real_coords;
  end if;

  raise notice 'merge_zurich: 1 live zurich row, % events, 0 Kansas coords, 0 Kansas states, % real venue coords intact',
    v_zurich_ev, v_real_coords;
end
$verify$;
