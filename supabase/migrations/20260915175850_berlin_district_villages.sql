-- Berlin's queer districts become villages, and their events follow them.
--
-- Berlin holds 1,015 venues and exactly ONE village (Schöneberg, 12 venues). The districts that
-- carry the city's queer life — Kreuzberg, Neukölln, Friedrichshain, Prenzlauer Berg, Mitte —
-- existed only as glossary tags minted from Siegessäule hashtags (see 81000101100000). This
-- creates the five missing districts and moves the information the tag was carrying onto the
-- entity that is supposed to carry it.
--
-- ============================================================================
-- WHICH DISTRICTS, AND WHY NOT THE OTHER THREE
-- ============================================================================
-- Measured on prod: venues and recent events within 1,500 m of each district centroid.
--
--   Mitte            136 venues   2,647 events   create
--   Kreuzberg         81 venues     231 events   create
--   Friedrichshain    56 venues      75 events   create
--   Prenzlauer Berg   53 venues       0 events   create
--   Neukölln          34 venues       0 events   create
--   Schöneberg        37 venues      15 events   ALREADY EXISTS — relinked below, not created
--   Steglitz           9 venues       0 events   NOT created
--   Spandau            2 venues       0 events   NOT created
--   Tempelhof          1 venue        0 events   NOT created
--
-- The last three are ordinary residential districts with no queer scene in our corpus. Creating
-- them would mint pages that run_village_trust_recompute classifies `ghost` and deindexes on the
-- first nightly pass (20260928100100), i.e. three dead URLs and a worse completeness dashboard.
-- Their tags are still refiled and deindexed by 81000101100000; they simply get no entity.
--
-- ============================================================================
-- `prenzlauer` IS NOT THE NAME OF A PLACE
-- ============================================================================
-- The district is PRENZLAUER BERG. The tag is `prenzlauer` because it is a hashtag, truncated at
-- the space, and it carries no wikidata_id and no description — unlike its four siblings, which
-- all carry a real QID. The village is named for the place, not for the hashtag; the tag redirects
-- to it in part C.
--
-- ============================================================================
-- description vs history — the house split, copied from Schöneberg
-- ============================================================================
-- The existing Schöneberg row separates them: `description` is one editorial line ("One of
-- Europe's oldest gay neighbourhoods."), `history` holds the encyclopaedic paragraph. Same split
-- here. `history` is the prose the tag already carried; `description` is written for this
-- corpus and is grounded in venues WE HOLD, not in recollection:
--   Kreuzberg      Boiler (Mehringdamm 34), Möbel-Olfe, Luzia, Südblock (Oranienstraße axis)
--   Friedrichshain Berghain / Panorama Bar / Lab.Oratory, the RAW site on Revaler Straße
-- Neukölln, Prenzlauer Berg and Mitte get deliberately general lines: our corpus does not yet
-- support a specific claim about them, and inventing one is the failure this repo keeps
-- recording. The village enrichment pipeline can improve them later.
--
-- ============================================================================
-- WHY EVENTS ARE RELINKED HERE AND VENUES ARE NOT
-- ============================================================================
-- `run_village_relink_batch` (cron `village_relink`, 20 3 * * *) handles VENUES ONLY — CLAUDE.md
-- states it and the function confirms it. So venues need nothing from this migration: the nightly
-- cron picks the five new villages up on its own and relinks by radius.
--
-- Events have no such engine, and events are the ONLY thing these tags tag. Measured:
--   kreuzberg 494 · schoneberg 814 · prenzlauer 322 · mitte 221 · neukolln 185 · friedrichshain 163
--   — all `entity_type='event'`, and ZERO venues carry any district tag.
-- So without this step every new village would publish as an empty district while the 2,199
-- events that name it stay on the tag. The hashtag IS the district assertion the importer
-- captured; this moves it onto `events.queer_village_id`, where the village page, the trust
-- recompute and the geo spine can all see it.
--
-- Schöneberg is included because its village already existed with 814 tagged events and ZERO
-- linked — the same gap, one district older.
--
-- ============================================================================
-- WHY ONE STATEMENT PER DISTRICT
-- ============================================================================
-- `statement_timeout` is armed once, when the TOP-LEVEL statement starts, and a function cannot
-- raise it from inside (measured, see the note in run_tag_medical_codes_sync). The cluster default
-- is 2 min, and `SET LOCAL statement_timeout` in a migration file is a no-op (WARNING 25P01 —
-- db push does not open a transaction block), so a single oversized block has no way to buy more
-- time. Separate top-level statements each get their own fresh timer.
--
-- DO NOT SIZE THIS AGAINST THE "14.6 s per 300 events" FIGURE. That number is pre-decoupling,
-- when `trg_search_documents_event` indexed inline. Since the P1 pipeline overhaul the trigger
-- only ENQUEUES into `search_reindex_queue`, and the real cost is ~0.96 s per 300 rows. Measured
-- here on prod in a rolled-back transaction: **all 494 Kreuzberg events relinked in 1,376 ms.**
-- The per-district split is therefore cheap insurance rather than a necessity — it is kept
-- because it costs nothing and removes the ceiling from the question entirely.
--
-- The inserts are safe in one block: 5 rows, and `trg_sync_geo_spine` mirrors each into
-- `geo_places` + `geo_village_profiles` on AFTER INSERT — which is what makes the FK on
-- `events.queer_village_id -> geo_village_profiles(place_id)` resolvable by the UPDATEs below.
--
-- REVERSE
--   update public.events set queer_village_id = null where queer_village_id in
--     (select id from public.queer_villages where slug in
--      ('kreuzberg','neukoelln','friedrichshain','prenzlauer-berg','mitte','schoeneberg'));
--   delete from public.queer_villages where slug in
--     ('kreuzberg','neukoelln','friedrichshain','prenzlauer-berg','mitte');

-- ---------------------------------------------------------------------------
-- 1. The five districts.
-- ---------------------------------------------------------------------------
do $$
declare
  v_berlin  uuid := '5761c6c4-3ed6-4429-832b-025e508db544';  -- cities: Berlin, Germany
  v_germany uuid := 'fd9997de-bf8f-49a5-a641-9240a39541ff';  -- countries: Germany (DE)
  v_made int;
begin
  -- Soft precondition: verify the parents rather than assume them. A wrong city_id would file
  -- five districts under the wrong Berlin (there is a Berlin, US at slug `berlin-1`).
  if not exists (select 1 from public.cities c
                  where c.id = v_berlin and lower(c.name) = 'berlin' and c.country_id = v_germany) then
    raise exception 'parent city is not Berlin, Germany — refusing to create districts under it';
  end if;

  insert into public.queer_villages (name, slug, city_id, country_id, description, history,
                                     latitude, longitude, seo_indexable)
  select v.name, v.slug, v_berlin, v_germany, v.description,
         -- The encyclopaedic paragraph the tag already carried, where it has one. Prenzlauer Berg
         -- has none (its tag is a truncated hashtag with no QID), so it starts with a null history.
         (select t.description from public.unified_tags t
           where t.slug = v.tag_slug and nullif(trim(t.description), '') is not null),
         v.lat, v.lon, true
    from (values
      ('Kreuzberg', 'kreuzberg', 'kreuzberg',
       'Berlin''s busiest queer nightlife district, running from the saunas and bars around Mehringdamm to the Oranienstraße strip.',
       52.4977, 13.4031),
      ('Neukölln', 'neukoelln', 'neukolln',
       'A younger, less commercial queer scene immediately south-east of Kreuzberg.',
       52.4750, 13.4410),
      ('Friedrichshain', 'friedrichshain', 'friedrichshain',
       'Club territory on the north bank of the Spree, including Berghain and the venues on the RAW site at Revaler Straße.',
       52.5150, 13.4540),
      ('Prenzlauer Berg', 'prenzlauer-berg', 'prenzlauer',
       'A quieter residential district north of Mitte with a long-standing lesbian and feminist scene.',
       52.5400, 13.4240),
      -- MITTE'S ANCHOR IS DELIBERATELY NOT THE GEOMETRIC CENTRE. Mitte's natural centroid is
      -- 52.5200,13.4050, which is byte-identical to `cities.latitude/longitude` for Berlin — the
      -- value a FAILED GEOCODE falls back to. 25 Berlin venues sit on that exact point with no
      -- real location, and `run_village_relink_batch` relinks by an 800 m radius, so anchoring
      -- Mitte there would silently adopt all 25 placeholder venues on the first nightly pass.
      -- Rosenthaler Platz is a real Mitte queer anchor, sits 1,096 m clear of the fallback
      -- (outside the relink radius), captures ZERO placeholder venues and still has 37 genuine
      -- venues within 800 m. Measured, not chosen for tidiness.
      ('Mitte', 'mitte', 'mitte',
       'Berlin''s central borough; its queer venues sit among the city''s main cultural institutions.',
       52.5296, 13.4014)
    ) as v(name, slug, tag_slug, description, lat, lon)
   -- Idempotent, and soft: a concurrent session that already created one of these keeps its row.
   where not exists (select 1 from public.queer_villages q where q.slug = v.slug);
  get diagnostics v_made = row_count;
  raise notice 'districts created: % (of 5; any shortfall already existed)', v_made;
end $$;

