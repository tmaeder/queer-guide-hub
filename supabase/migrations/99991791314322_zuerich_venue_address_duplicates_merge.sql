-- Zürich: merge 14 live venue duplicates that share a street address.
--
-- A hand-read audit of Zürich (city 35d1d772-…, slug `zuerich`) found live
-- venues that are the same place under a second spelling of its name:
-- "Helsinki" / "Helsinki Klub", "Komplex" / "Komplex Klub" / "Komplex 457",
-- "Dynamo" / "Jugendkulturhaus Dyamo" (typo), and so on. The nightly dedup
-- sweep keys on the despaced NAME, so a name variant at the same address is
-- invisible to it. Every pair below was read by hand: same address, same city,
-- same business.
--
-- Deliberately NOT included:
--   * "Club Q" / "Queens Club" (Förrlibuckstrasse 151): Club Q may be a party
--     series run at Queens Club rather than a second row for the club.
--   * Renames at one address (Wunderbox -> Club 04, Variété -> Space 2.0,
--     Härterei -> Mäx): successor vs. duplicate is an editorial decision.
--   * Several businesses under one address (Kaufleuten Club / Backstage / Hof,
--     Labor5 / Blok Club at Schiffbaustrasse 3): not duplicates.
--
-- `_venue_merge_core` reparents children (events, sources, check-ins, slug
-- redirect, and rows already merged into the drop) but copies NO fields, so the
-- keep row is filled-if-empty from the drop BEFORE each merge: website, and the
-- category where the keep only says 'other'. `merge_venues` is admin-gated on
-- the JWT and a migration has none, so the core is called directly.
--
-- Soft on preconditions, hard on postconditions: a pair whose rows have moved
-- since authoring (already merged, closed, relocated) is skipped with a NOTICE
-- rather than aborting `db push` for the whole repo. The verify block asserts
-- the DEFECT is gone (no pair remains live side by side) and that every merge
-- this pair set produced is reversible (`details.schema = 1`).
--
-- Reversible per pair: `select unmerge_venues(<venue_merge_audit.id>, false)`.

select set_config('app.actor', 'migration:99991791314322_zuerich_venue_address_duplicates_merge', true);

create temp table _zh_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _zh_pairs (keep_id, drop_id) values
  ('b2809f36-0c14-49a6-b949-f4580d0149da', 'ed50b926-4654-4669-9a19-a424f992b1b1'), -- Bagatelle Club <- Bagatelle 93
  ('60a2f890-1a17-40f3-8486-d091d6029142', 'eb8d95ac-a43f-4ee1-b887-2d086a6fa724'), -- barfussbar <- Barfussbar in der Frauenbadi
  ('025720aa-c9de-4d3d-ad1a-038a5bb23691', 'a914e626-248b-40f5-945c-b7f128804c34'), -- Bibliothek zur Gleichstellung <- … im Stadthaus
  ('fc5513ca-4403-4da4-a9dd-6f3fb4566650', 'bc8eb315-f57f-483f-ac9d-552fec7442d3'), -- Bronx Club <- Bronx Club (ehemals Les Garçons)
  ('2ba0c050-295b-4660-86a6-ef730f009a7f', '001a916c-7b99-4453-8966-6efd2e4f2000'), -- Dynamo <- Jugendkulturhaus Dyamo
  ('9be65a2c-a21d-4e68-b968-83db9192c4b9', '45b10462-5e08-4414-bf36-6c031b16b716'), -- Folium <- Folium (Alte Sihlpapierfabrik)
  ('23035907-c690-437a-8147-d3627cc6ecfb', '5fc66620-fde1-431c-985e-8c5afaacc599'), -- Helsinki <- Helsinki Klub
  ('734861c6-305c-4664-b609-acf06e275a05', '218e802b-65cc-49f7-9d02-8d5fe8f8b6c3'), -- Komplex <- Komplex Klub
  ('734861c6-305c-4664-b609-acf06e275a05', '2b87175e-a59a-4431-bdec-c4b570e829db'), -- Komplex <- Komplex 457
  ('d0463ceb-cc78-48b9-8901-e711458fa0cb', 'c01b02ff-5a65-41c9-b80c-0d26e5cfde84'), -- Mascotte <- Palais Mascotte
  ('4cbcc091-6b63-41cf-96cd-a043062cf8d7', 'ffce8557-48f1-4a70-9016-d99ee7b800fc'), -- Papiersaal <- Papiersaal / (Sihlcity)
  ('92afbdb5-4432-4c2d-a8d1-7a0bff8a40ba', 'd1ebafcd-9988-450b-8d95-8b38a631046f'), -- Samigo <- Samigo Amusement
  ('1db9a34d-e4e5-4ebf-b209-02e046f50340', 'bc6336e6-26f3-4486-9b4a-56611626f53e'), -- Theater am Neumarkt <- Theater Neumarkt, Zürich
  ('e7907a31-1c89-4507-b019-a34fc0b86fae', '562b7394-8cb4-426a-9b71-84599f3074f8'); -- tibits <- Tibits im NZZ Bistro

do $merge$
declare
  p record;
  k public.venues%rowtype;
  d public.venues%rowtype;
  v_merged int := 0;
  v_skipped int := 0;
begin
  for p in select keep_id, drop_id from _zh_pairs loop
    select * into k from public.venues where id = p.keep_id;
    select * into d from public.venues where id = p.drop_id;

    if k.id is null or d.id is null then
      raise notice 'skip %<-%: row missing', p.keep_id, p.drop_id;
      v_skipped := v_skipped + 1; continue;
    end if;
    if d.duplicate_of_id is not null then
      raise notice 'skip %<-%: drop already merged into %', k.name, d.name, d.duplicate_of_id;
      v_skipped := v_skipped + 1; continue;
    end if;
    if k.duplicate_of_id is not null or k.closed_at is not null or d.closed_at is not null then
      raise notice 'skip %<-%: keep merged or a side closed', k.name, d.name;
      v_skipped := v_skipped + 1; continue;
    end if;
    if k.city_id is distinct from d.city_id then
      raise notice 'skip %<-%: city moved', k.name, d.name;
      v_skipped := v_skipped + 1; continue;
    end if;
    -- Same address, or one side has none (Komplex 457).
    if nullif(regexp_replace(lower(coalesce(k.address, '')), '[^a-z0-9]', '', 'g'), '') is not null
       and nullif(regexp_replace(lower(coalesce(d.address, '')), '[^a-z0-9]', '', 'g'), '') is not null
       and regexp_replace(lower(k.address), '[^a-z0-9]', '', 'g')
           <> regexp_replace(lower(d.address), '[^a-z0-9]', '', 'g') then
      raise notice 'skip %<-%: addresses diverged', k.name, d.name;
      v_skipped := v_skipped + 1; continue;
    end if;

    -- Fill-if-empty: the merge core copies no fields.
    update public.venues v
       set website  = case when nullif(btrim(v.website), '') is null then nullif(btrim(d.website), '') else v.website end,
           category = case when coalesce(v.category, 'other') = 'other' and coalesce(d.category, 'other') <> 'other'
                           then d.category else v.category end
     where v.id = k.id
       and (   (nullif(btrim(v.website), '') is null and nullif(btrim(d.website), '') is not null)
            or (coalesce(v.category, 'other') = 'other' and coalesce(d.category, 'other') <> 'other'));

    perform public._venue_merge_core(k.id, d.id, null);
    v_merged := v_merged + 1;
  end loop;

  raise notice 'zuerich venue duplicates: merged %, skipped %', v_merged, v_skipped;
end
$merge$;

do $verify$
declare
  v_bad int;
begin
  -- P1: the defect is gone — no pair is still live side by side.
  select count(*) into v_bad
    from _zh_pairs p
    join public.venues k on k.id = p.keep_id
    join public.venues d on d.id = p.drop_id
   where k.duplicate_of_id is null and d.duplicate_of_id is null
     and k.closed_at is null and d.closed_at is null
     and k.city_id is not distinct from d.city_id;
  if v_bad <> 0 then
    raise exception 'P1 failed: % pair(s) still live side by side', v_bad;
  end if;

  -- P2: every pair merged into its keep has a reversible audit row.
  select count(*) into v_bad
    from _zh_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id = p.keep_id
     and not exists (
       select 1 from public.venue_merge_audit a
        where a.keep_id = p.keep_id and a.drop_id = p.drop_id
          and a.undone_at is null
          and a.details ->> 'schema' = '1');
  if v_bad <> 0 then
    raise exception 'P2 failed: % merge(s) without a reversible audit row', v_bad;
  end if;

  -- P3: no event still points at a merged drop.
  select count(*) into v_bad
    from _zh_pairs p
    join public.venues d on d.id = p.drop_id
    join public.events e on e.venue_id = d.id
   where d.duplicate_of_id is not null;
  if v_bad <> 0 then
    raise exception 'P3 failed: % event(s) still on a merged drop', v_bad;
  end if;
end
$verify$;
