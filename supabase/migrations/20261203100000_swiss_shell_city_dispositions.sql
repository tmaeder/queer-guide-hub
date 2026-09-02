-- The four Swiss rows that are not cities, and they are four DIFFERENT problems.
--
-- They surfaced together as "the cities with no canton" after 20261126100000
-- filled the other 38, and it is tempting to close them together as non-places.
-- That would file two false claims. Measured, one is a real city in the wrong
-- country and one is a duplicate; only two are non-places. Each gets the
-- disposition its evidence supports, and every one is reversible.
--
--   Weimar        pop 63,477, coordinates 50.98111/11.32944 -- and Wikidata
--                 Q3955 (Weimar, Thuringia) carries P625 50.98111/11.32944,
--                 identical to five decimals, with P17 including Germany. The
--                 row is a REAL CITY that was geocoded correctly and filed under
--                 the wrong country. Archiving it as "not a city" would be
--                 false, so it moves to Germany instead. No Weimar row exists
--                 under DE, so this is a move and not a merge. Q3955 is
--                 unclaimed and is adopted, which is what lets
--                 city-factual-backfill maintain the row afterwards.
--
--   Biel          no coordinates, `tmp-` slug, from the personality-birth-place
--                 cohort -- and `Biel/Bienne` already exists as a real row. This
--                 is a DUPLICATE, not a non-place. It merges, because
--                 merge_cities repoints the personality born there onto the
--                 survivor and leaves a redirect; archiving would strand that
--                 person pointing at a ghost.
--
--   Westschweiz   "Western Switzerland" is a region. No coordinates, no
--                 population, nothing to geocode. A genuine non-place.
--
--   Bunt          coordinates 47.30567/9.08850, identical to Wattwil's to five
--                 decimals -- a hamlet the geocoder minted as a city. A genuine
--                 non-place. It ALREADY reads shell_status='ghost', but by the
--                 content classifier rather than by disposition, which is not
--                 the same thing: 20260820192709 records the nightly recompute
--                 flipping archived rows back to 'placeholder' because they
--                 carried no disposition marker. Archiving stamps that marker,
--                 so the recompute leaves it alone.
--
-- WHY NOT DELETE. `20261001120000` deleted 57 non-place cities and is the only
-- hard DELETE on this table; it needed a full jsonb snapshot table to be
-- reversible at all, because `cities.id` has almost no foreign keys left and a
-- delete silently leaves dangling uuids. Three of these four are referenced by
-- `personalities.city_id` right now. The reversible paths already exist
-- (unarchive_city, unmerge_cities), so they are used.
--
-- SEARCH IS THE POINT, not seo_indexable. All three placeholder rows are live in
-- `search_documents` today despite seo_indexable=false: that flag governs
-- crawlers and the sitemap, not site search, so "Westschweiz" is a search result
-- right now.
--
-- CLAUDE.md says the city indexer "filters only duplicate_of_id", which would
-- mean archiving cannot remove them. That is STALE -- read live, 2026-09-02,
-- `search_documents_index_cities` filters
--     c.duplicate_of_id is null
--     and coalesce(c.shell_status::text,'real') not in ('ghost','merged')
-- so ghost and merged rows are both excluded and these four do leave search.
-- The removal is ASYNCHRONOUS: the write enqueues into search_reindex_queue and
-- `search_reindex_drain` applies it within the minute, which is why a
-- rolled-back dry run still shows them indexed. Verified after apply, not here.

do $$
declare
  v_weimar      uuid := '067c964d-6cf5-433b-b46e-424e50a60260';
  v_biel        uuid := 'da681393-1619-4872-ac29-b5d4b0ee38b4';
  v_biel_bienne uuid := '0f9fe48d-c019-4131-894a-be588ea02df5';
  v_westschweiz uuid := '823a0937-2955-48a3-85fe-c3eb4867d22b';
  v_bunt        uuid := 'dedd8eec-4afc-4ce8-be5b-de61392acf39';
  v_de          uuid := (select id from public.countries where code = 'DE');
  v_ch          uuid := (select id from public.countries where code = 'CH');
  v_n           integer;
begin
  if v_de is null or v_ch is null then
    raise exception 'missing country row (DE=%, CH=%)', v_de, v_ch;
  end if;

  ------------------------------------------------------------------- Weimar
  -- Guarded on it still being the Swiss-filed row at the reviewed coordinate,
  -- so a country corrected by any other path wins and this declines.
  update public.cities c
     set country_id   = v_de,
         region_name  = 'Thuringia',
         wikidata_qid = coalesce(c.wikidata_qid, 'Q3955'),
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'country_id', jsonb_build_object(
             'value', 'DE', 'previous', 'CH', 'source', 'wikidata:Q3955',
             'reason', 'Q3955 P625 is 50.98111/11.32944, identical to this row''s stored coordinate; P17 includes Germany. A real city filed under the wrong country, not a non-place.',
             'at', now(), 'by', 'migration:20261203100000')),
         updated_at = now()
   where c.id = v_weimar
     and c.country_id = v_ch
     and round(c.latitude::numeric, 5) = 50.98111;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Weimar: expected 1 Swiss-filed row at the reviewed coordinate, updated %', v_n;
  end if;

  --------------------------------------------------------------------- Biel
  -- Same country, so the cross-country confirmation is not being bypassed.
  if (select country_id from public.cities where id = v_biel) is distinct from v_ch
     or (select country_id from public.cities where id = v_biel_bienne) is distinct from v_ch then
    raise exception 'Biel merge: both rows must still be Swiss';
  end if;
  perform public.merge_cities(v_biel_bienne, v_biel, false);

  ------------------------------------------------------- genuine non-places
  perform public.archive_city_as_nonplace(
    v_westschweiz,
    'Westschweiz is the German name for Romandy, the French-speaking REGION of Switzerland, not a city. No coordinates, no population; minted from a personality birth-place free-text field.',
    jsonb_build_object('data_source', 'personality-birth-place', 'has_coordinates', false,
                       'kind', 'region', 'reviewed_by', 'migration:20261203100000'));

  perform public.archive_city_as_nonplace(
    v_bunt,
    'Bunt is a hamlet; its coordinates 47.30567/9.08850 are identical to Wattwil''s to five decimals, i.e. the geocoder resolved a locality inside Wattwil and minted a city for it.',
    jsonb_build_object('data_source', 'nominatim-geocode', 'duplicate_point_of', 'Wattwil',
                       'kind', 'hamlet', 'reviewed_by', 'migration:20261203100000'));

  ----------------------------------------------------------------- asserts
  -- Weimar is in Germany and keeps the people born there.
  if (select co.code from public.cities c join public.countries co on co.id = c.country_id
       where c.id = v_weimar) is distinct from 'DE' then
    raise exception 'Weimar did not land in Germany';
  end if;
  if (select count(*) from public.personalities where city_id = v_weimar) <> 2 then
    raise exception 'Weimar lost its birth-place links';
  end if;

  -- Biel is merged and its person moved to the survivor rather than vanishing.
  if (select duplicate_of_id from public.cities where id = v_biel) is distinct from v_biel_bienne then
    raise exception 'Biel did not merge into Biel/Bienne';
  end if;
  if (select count(*) from public.personalities where city_id = v_biel) <> 0 then
    raise exception 'Biel still holds birth-place links after the merge';
  end if;

  -- The two non-places carry a DISPOSITION, which is what survives the nightly
  -- recompute; shell_status alone does not.
  if (select count(*) from public.cities
       where id in (v_westschweiz, v_bunt)
         and enrichment_status->'disposition'->>'state' = 'not_a_city') <> 2 then
    raise exception 'a non-place is missing its disposition marker';
  end if;

  -- No LIVE Swiss city may be left without a canton. Archived non-places are
  -- excluded, and that exclusion is the point rather than a convenience:
  -- `archive_city_as_nonplace` sets shell_status and the disposition marker, not
  -- region_name, because a region and a hamlet HAVE no canton to record. The
  -- same `disposition.state = 'not_a_city'` guard is what cities_due_for_refresh
  -- and both nightly recompute functions use to leave these rows alone.
  if (select count(*) from public.cities c join public.countries co on co.id = c.country_id
       where co.code = 'CH' and c.duplicate_of_id is null and c.region_name is null
         and coalesce(c.enrichment_status->'disposition'->>'state', '') is distinct from 'not_a_city') <> 0 then
    raise exception 'a live Swiss city still has no canton: %',
      (select string_agg(c.name, ', ') from public.cities c join public.countries co on co.id = c.country_id
        where co.code = 'CH' and c.duplicate_of_id is null and c.region_name is null
          and coalesce(c.enrichment_status->'disposition'->>'state', '') is distinct from 'not_a_city');
  end if;
end $$;
