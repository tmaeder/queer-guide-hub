-- Zürich: resolve three addresses where a club changed name or operator.
--
-- Each address carried several live venue rows for one room, all from the
-- 2026-08-22 display-magazin / gay-ch imports, all with zero events. Checked
-- against current external sources (the display-magazin venue pages the rows
-- cite are dead and redirect to the magazine's homepage):
--
-- Langstrasse 84 -- Eventhaus Langstrasse (the building) hosts the club room
--   "Wunderbox" (zuerich.com, 2026). "Club 04" is that room's earlier name:
--   zuri.net's listing `club04-17918` is now titled "Wunderbox". gay-ch's
--   label "Club 04 (Ehemals Wunderbox)" states the rename backwards, but all
--   three rows are one room. Merge both Club 04 rows into "wunderbox", set the
--   category to club. Eventhaus Langstrasse stays its own venue.
--
-- Militärstrasse 84 -- three operators in sequence: Lexy (opened spring 2016,
--   up for sale after ~1.5 years, 20 Minuten), Club Variété (until end of May
--   2023), Space 2.0 (since 2023, Resident Advisor). Different businesses, so
--   the predecessors are CLOSED, not merged: permanently_closed with a cited
--   closed_on at honest precision. The two Space 2.0 rows are merged and the
--   survivor's name cleaned to "Space 2.0". "RUPAUL'S WERQ THE WORLD
--   AFTERPARTY" at this address is an event, not a place: archived as a
--   non-venue (reversible).
--
-- Hardstrasse 219 -- Härterei was rebranded "MÄX" under new management at the
--   same club (zuerich.com, maexzuerich.com). Merge "Härterei" into the Mäx row
--   and clean its name to "Mäx", website maexzuerich.com. Maag Halle is another
--   hall on the same site and stays.
--
-- Renames do not move a venue's slug (auto_slug_from_name only fills an empty
-- slug). _venue_merge_core copies no fields, so survivor fields are set
-- explicitly. Soft on preconditions (moved rows are skipped with a NOTICE),
-- hard on postconditions.

select set_config('app.actor', 'migration:99991791318321_zuerich_renamed_venues', true);

do $zh$
declare
  c_city        constant uuid := '35d1d772-8ce7-4c05-92a5-95ea7053b4bf';
  -- Langstrasse 84
  v_wunderbox   constant uuid := '8839db81-e919-45ba-a031-e18723944314';
  v_club04      constant uuid := '66a4b4f9-d294-44c1-932c-a88d5dbeab1f';
  v_club04_ew   constant uuid := 'ca818d2b-044e-43e5-92e1-988da391be56';
  -- Militärstrasse 84
  v_space       constant uuid := '22b75f18-fb40-459f-8391-9232dc62db6b';
  v_space_ev    constant uuid := 'dda709aa-a1b4-4654-90e4-475c28a2e0d3';
  v_variete     constant uuid := 'a340dd5d-cdc7-434d-9c03-b842aa9c54d3';
  v_lexy        constant uuid := '47e10a23-8b6a-45dc-bbd1-c26f5dd7f9ae';
  v_rupaul      constant uuid := '904f2222-aa62-4640-bd84-1e5c5fa441eb';
  -- Hardstrasse 219
  v_maex        constant uuid := 'a6279150-a9e4-4427-aab3-4634ec8455f6';
  v_haerterei   constant uuid := '8a325a2b-3018-4157-8e2e-2ae050c809ba';

  p   record;
  v_res jsonb;
begin
  -- 1) Merges.
  for p in
    select * from (values
      (v_wunderbox, v_club04),
      (v_wunderbox, v_club04_ew),
      (v_space,     v_space_ev),
      (v_maex,      v_haerterei)
    ) t(keep_id, drop_id)
  loop
    if exists (select 1 from public.venues k, public.venues d
                where k.id = p.keep_id and d.id = p.drop_id
                  and k.duplicate_of_id is null and d.duplicate_of_id is null
                  and k.closed_at is null and d.closed_at is null
                  and k.city_id = c_city and d.city_id = c_city) then
      perform public._venue_merge_core(p.keep_id, p.drop_id, null);
    else
      raise notice 'skip merge %<-%: a row moved, merged or closed', p.keep_id, p.drop_id;
    end if;
  end loop;

  -- 2) Survivor fields (the merge core copies none).
  update public.venues set category = 'club', updated_at = now()
   where id = v_wunderbox and duplicate_of_id is null and category is distinct from 'club';

  update public.venues set name = 'Space 2.0', category = 'club', updated_at = now()
   where id = v_space and duplicate_of_id is null and name = 'space2.0.';

  update public.venues
     set name = 'Mäx', category = 'club', website = 'https://maexzuerich.com/', updated_at = now()
   where id = v_maex and duplicate_of_id is null and name = 'Mäx (ehemals: Härterei)';

  -- 3) Predecessors at Militärstrasse 84: permanently closed, cited.
  update public.venues
     set closure_status = 'permanently_closed',
         closed_on = date '2023-05-01', closed_on_precision = 'month',
         closure_source = 'https://de.ra.co/clubs/183945',
         updated_at = now()
   where id = v_variete and closure_status in ('open', 'unknown') and duplicate_of_id is null;

  update public.venues
     set closure_status = 'permanently_closed',
         closed_on = date '2017-01-01', closed_on_precision = 'year',
         closure_source = 'https://www.20min.ch/schweiz/zuerich/story/Club-Lexy-steht-nach-1-5-Jahren-wieder-zum-Verkauf-18236717',
         updated_at = now()
   where id = v_lexy and closure_status in ('open', 'unknown') and duplicate_of_id is null;

  -- 4) The RuPaul afterparty is an event, not a place.
  if exists (select 1 from public.venues where id = v_rupaul
               and review_status is distinct from 'archived'
               and name = 'RUPAUL’S WERQ THE WORLD AFTERPARTY') then
    v_res := public.decide_venue_nonvenue(v_rupaul, true,
      'Event ingested as a venue: a one-off afterparty at Militärstrasse 84, Zürich, '
      || 'not a place. Reversible via restore_venue_from_nonvenue(). '
      || 'Batch: zuerich-renamed-venues-2026-10-06.');
    if not coalesce((v_res->>'ok')::boolean, false) then
      raise notice 'rupaul afterparty not archived: %', v_res::text;
    end if;
  end if;

  delete from public.search_documents sd
   using public.venues v
   where sd.entity_type = 'venue' and sd.entity_id = v.id
     and v.id in (v_rupaul) and v.review_status = 'archived';
end
$zh$;

do $verify$
declare
  v_bad int;
begin
  -- P1: no merge pair still live side by side in Zürich.
  select count(*) into v_bad
    from (values
      ('8839db81-e919-45ba-a031-e18723944314'::uuid, '66a4b4f9-d294-44c1-932c-a88d5dbeab1f'::uuid),
      ('8839db81-e919-45ba-a031-e18723944314'::uuid, 'ca818d2b-044e-43e5-92e1-988da391be56'::uuid),
      ('22b75f18-fb40-459f-8391-9232dc62db6b'::uuid, 'dda709aa-a1b4-4654-90e4-475c28a2e0d3'::uuid),
      ('a6279150-a9e4-4427-aab3-4634ec8455f6'::uuid, '8a325a2b-3018-4157-8e2e-2ae050c809ba'::uuid)
    ) t(keep_id, drop_id)
    join public.venues k on k.id = t.keep_id
    join public.venues d on d.id = t.drop_id
   where k.duplicate_of_id is null and d.duplicate_of_id is null
     and k.closed_at is null and d.closed_at is null
     and k.city_id = d.city_id;
  if v_bad <> 0 then
    raise exception 'P1 failed: % rename pair(s) still live side by side', v_bad;
  end if;

  -- P2: every merge made here is reversible.
  select count(*) into v_bad
    from public.venues d
   where d.id in ('66a4b4f9-d294-44c1-932c-a88d5dbeab1f', 'ca818d2b-044e-43e5-92e1-988da391be56',
                  'dda709aa-a1b4-4654-90e4-475c28a2e0d3', '8a325a2b-3018-4157-8e2e-2ae050c809ba')
     and d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = d.id and a.keep_id = d.duplicate_of_id
                        and a.undone_at is null and a.details ->> 'schema' = '1');
  if v_bad <> 0 then
    raise exception 'P2 failed: % merge(s) without a reversible audit row', v_bad;
  end if;

  -- P3: the predecessors are not published as trading.
  select count(*) into v_bad
    from public.venues
   where id in ('a340dd5d-cdc7-434d-9c03-b842aa9c54d3', '47e10a23-8b6a-45dc-bbd1-c26f5dd7f9ae')
     and duplicate_of_id is null
     and (closure_status in ('open', 'unknown') or seo_indexable);
  if v_bad <> 0 then
    raise exception 'P3 failed: % predecessor(s) still read as trading or indexable', v_bad;
  end if;

  -- P4: the afterparty is not served as a venue.
  select count(*) into v_bad
    from public.venues v
   where v.id = '904f2222-aa62-4640-bd84-1e5c5fa441eb'
     and v.name = 'RUPAUL’S WERQ THE WORLD AFTERPARTY'
     and (v.review_status is distinct from 'archived'
          or v.seo_indexable
          or exists (select 1 from public.search_documents sd
                      where sd.entity_type = 'venue' and sd.entity_id = v.id));
  if v_bad <> 0 then
    raise exception 'P4 failed: RuPaul afterparty still served as a venue';
  end if;
end
$verify$;
