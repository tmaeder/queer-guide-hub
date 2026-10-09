-- Cities minted by backfill-venue-cities from an ADMINISTRATIVE label.
--
-- WHY
-- backfill-venue-cities (reverse path, #4218/#4220) hands Photon's `city`
-- property to city_resolve_or_create, which mints a city when nothing matches.
-- In 40 hours (2026-10-07 18:00 → 10-09) it minted 3,950 cities, 3,903 of them
-- carrying venues. Hand-sampled, the bulk are real towns. Three classes are not:
--
-- 1. A WRAPPER around a town that already exists, so the name match missed and
--    the town was minted a second time beside the real row:
--      "Heraklion Municipal Unit" (15 venues) 2.0 km from "Irákleion" (Q160544),
--      "Chișinău Municipality" (10 venues) beside Chișinău (Q21197),
--      "Municipal Unit of Rhodes", "The Borough District of Wexford", …
--    and, from the same producer in May, Mexico City as THREE rows:
--      "Mexico City" 136 venues + 177 events, no QID;
--      "Ciudad de México " (trailing space) 131 venues, carrying Q1489;
--      "CDMX" 2 venues.
--    → merged into the existing row (merge_cities, reversible, schema:1).
-- 2. A wrapper around a town with NO existing row ("Thira Municipal Unit",
--    "Overstrand Local Municipality", "Town of Rab") → renamed to the bare name,
--    the old label kept as a city_aliases row.
-- 3. A city SUBDIVISION ("Botanica Sector", "Cukarica Urban Municipality",
--    "Chaoyang District", "Zone 9") or a local-script name ("Σμίξη") → flagged
--    needs_attention only. Which parent city each belongs to is a per-row
--    decision; guessing it is how this class arose.
--
-- The producer is fixed in the same change (_shared/admin-unit-name.ts):
-- wrappers are stripped before matching, and subdivisions / non-Latin names may
-- only link to an existing city, never create one.
--
-- US/CA "Township", "Charter Township", "Parish" are real municipalities and
-- are left alone, matching the TS classifier.
--
-- Soft on preconditions (a row that moved is skipped and reported), hard on
-- postconditions.

do $apply$
declare
  r record;
  v_merged int := 0;
  v_renamed int := 0;
  v_flagged int := 0;
  v_skipped text[] := '{}';
  v_new text;
begin
  perform set_config('app.actor', 'migration:99991791528780_venue_geocode_city_admin_unit_repair', true);

  -- ------------------------------------------------------------ 1. merges
  create temp table _merge (keep_id uuid, drop_id uuid, drop_name text) on commit drop;
  insert into _merge values
    ('6bba8a1e-1899-408f-a892-b723398b9979', '2625c108-0e1b-48eb-9260-0e0ae273faee', 'Ciudad de México '),
    ('6bba8a1e-1899-408f-a892-b723398b9979', '2da3fe75-4548-44c3-b356-992390e94ed1', 'CDMX'),
    ('b572d68d-5eb9-4833-9090-0791cdabd643', '3017b656-a9ef-4ef0-9aad-41635ee55f88', 'Heraklion Municipal Unit'),
    ('447cac98-66ec-43e4-9f60-ed7b006ba9b5', 'd9be4be7-cf7d-4967-90f5-46db5f2f633b', 'Chișinău Municipality'),
    ('38d5b340-0895-42d0-bf4d-a1ab7c1cf8b7', 'f03a446f-0e34-4dca-a20c-c8e9abe88107', 'Municipal Unit of Rhodes'),
    ('c118ac96-c0bc-4665-a877-b11c133af9bf', '2bdcbba4-86d5-4af8-a0a8-2fd9026d4030', 'The Borough District of Wexford'),
    ('f1f0c179-4160-4d15-a6b1-bd5d96bfcb24', '6bf5e989-efd8-42a5-86dd-c80935c11716', 'The Municipal District of Arklow'),
    ('2c15716a-e8c2-4ae5-ad21-0570a9480345', '0bd15691-9cc0-4aaf-8e41-663f8d6f563b', 'Municipal District of Macroom'),
    ('85db67d7-8e6c-4565-97c7-8600ca8d8a9b', 'e6b3ec42-9708-4f6b-87a2-8d2b6757f4e4', 'Rustenburg Local Municipality'),
    ('c110bda9-1af3-4a66-bb9b-201d724da177', 'c55ac101-f2ff-4d7e-8bf4-9ba3b5a14d52', 'District of North Vancouver'),
    ('2aeb118d-b5c9-4370-9ca6-a8668ace8f66', 'c104b781-0ab6-4f3a-92ea-5d6b7991295b', 'Cotswold District');

  for r in select * from _merge loop
    if exists (select 1 from public.cities where id = r.drop_id and duplicate_of_id is null and name = r.drop_name)
       and exists (select 1 from public.cities where id = r.keep_id and duplicate_of_id is null) then
      perform public.merge_cities(r.keep_id, r.drop_id, false);
      v_merged := v_merged + 1;
    else
      v_skipped := v_skipped || format('merge %s: already merged or changed', r.drop_name);
    end if;
  end loop;

  -- Mexico City: the QID sat on the duplicate. uq_cities_wikidata_qid only
  -- covers live rows, so it can move once the duplicate is merged away.
  update public.cities
     set wikidata_qid = 'Q1489',
         field_provenance = coalesce(field_provenance, '{}'::jsonb)
           || jsonb_build_object('wikidata_qid', jsonb_build_object(
                'value', 'Q1489', 'source', 'merged_duplicate:2625c108-0e1b-48eb-9260-0e0ae273faee',
                'by', 'migration:99991791528780', 'at', now())),
         updated_at = now()
   where id = '6bba8a1e-1899-408f-a892-b723398b9979' and wikidata_qid is null
     and not exists (select 1 from public.cities o where o.wikidata_qid = 'Q1489' and o.duplicate_of_id is null);

  -- Heraklion: name is English (enwiki "Heraklion"). Without this the cleaned
  -- geocoder label "Heraklion" would not match "Irákleion" and mint again.
  if exists (select 1 from public.cities where id = 'b572d68d-5eb9-4833-9090-0791cdabd643' and name = 'Irákleion' and duplicate_of_id is null)
     and not exists (select 1 from public.cities t join public.cities h on h.id = 'b572d68d-5eb9-4833-9090-0791cdabd643'
                     where t.id <> h.id and t.country_id = h.country_id and lower(t.name) = 'heraklion'
                       and coalesce(t.region_code,'') = coalesce(h.region_code,'')) then
    update public.cities
       set name = 'Heraklion',
           field_provenance = coalesce(field_provenance, '{}'::jsonb)
             || jsonb_build_object('name', coalesce(field_provenance->'name', '{}'::jsonb)
                  || jsonb_build_object('anglicized', jsonb_build_object(
                       'from', 'Irákleion', 'to', 'Heraklion', 'qid', 'Q160544',
                       'source', 'enwiki_title', 'by', 'migration:99991791528780', 'at', now()))),
           updated_at = now()
     where id = 'b572d68d-5eb9-4833-9090-0791cdabd643';
    insert into public.city_aliases (city_id, alias, locale)
    values ('b572d68d-5eb9-4833-9090-0791cdabd643', 'Irákleion', null)
    on conflict (city_id, alias_key) do nothing;
  else
    v_skipped := v_skipped || 'rename Irákleion: changed or name taken';
  end if;

  -- ------------------------------------------------------------ 2. renames
  -- Mirrors PREFIX / SUFFIX / SUBDIVISION in _shared/admin-unit-name.ts.
  create temp table _rename on commit drop as
  select c.id, c.name as old_name, c.country_id, c.region_code,
         btrim(regexp_replace(regexp_replace(btrim(regexp_replace(c.name, '\s+', ' ', 'g')),
           '^(the\s+)?(municipal\s+unit|municipal\s+district|borough\s+district|municipality|town|city|district|county)\s+of\s+', '', 'i'),
           '\s+(municipal\s+unit|local\s+municipality|district\s+municipality|metropolitan\s+municipality|municipality|municipal\s+borough\s+district|municipal\s+district|metropolitan\s+district)$', '', 'i')) as new_name
    from public.cities c
   where c.duplicate_of_id is null
     and c.data_source = 'nominatim-geocode'
     and c.name !~* 'urban\s+municipality$';

  delete from _rename where new_name = old_name or new_name = ''
     or new_name ~* '(\m(sector|ward|subdistrict|sub-district|community|district|arrondissement|borough)$|^zone\s+\d+$|central\s+business\s+district|\msector\s+)';

  create temp table _rename_slugs on commit drop as
    select c.id, c.slug from public.cities c join _rename using (id);

  for r in select * from _rename loop
    if exists (select 1 from public.cities t
               where t.id <> r.id and t.country_id = r.country_id
                 and coalesce(t.region_code,'') = coalesce(r.region_code,'')
                 and (lower(t.name) = lower(r.new_name)
                      or (t.duplicate_of_id is null and t.name_normalized = public.normalize_name(r.new_name)))) then
      v_skipped := v_skipped || format('rename %s: "%s" already taken', r.old_name, r.new_name);
      continue;
    end if;
    update public.cities
       set name = r.new_name,
           field_provenance = coalesce(field_provenance, '{}'::jsonb)
             || jsonb_build_object('name', coalesce(field_provenance->'name', '{}'::jsonb)
                  || jsonb_build_object('admin_unit_stripped', jsonb_build_object(
                       'from', r.old_name, 'to', r.new_name,
                       'by', 'migration:99991791528780', 'at', now()))),
           updated_at = now()
     where id = r.id;
    insert into public.city_aliases (city_id, alias, locale)
    values (r.id, r.old_name, null)
    on conflict (city_id, alias_key) do nothing;
    v_renamed := v_renamed + 1;
  end loop;

  -- ------------------------------------------------------------ 3. flags
  with f as (
    select c.id,
           case when c.name ~ '[Ͱ-᷿ἀ-῿Ⰰ-￿]' then 'non_latin_name' else 'subdivision' end as reason
      from public.cities c
     where c.duplicate_of_id is null
       and c.data_source = 'nominatim-geocode'
       and not coalesce(c.needs_attention, false)
       and (c.name ~ '[Ͱ-᷿ἀ-῿Ⰰ-￿]'
            or c.name ~* 'urban\s+municipality$'
            or c.name ~* '(\m(sector|ward|subdistrict|sub-district|community|district|arrondissement|borough)$|^zone\s+\d+$|central\s+business\s+district|\msector\s+)')
  )
  update public.cities c
     set needs_attention = true,
         enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('admin_unit_review', jsonb_build_object(
                'reason', f.reason,
                'detail', 'minted by backfill-venue-cities from a geocoder label that is a city subdivision or not in English; decide the parent city by hand',
                'by', 'migration:99991791528780', 'at', now())),
         updated_at = now()
    from f where f.id = c.id;
  get diagnostics v_flagged = row_count;

  raise notice 'admin-unit repair: merged %, renamed %, flagged %, skipped %: %',
    v_merged, v_renamed, v_flagged, coalesce(array_length(v_skipped, 1), 0), v_skipped;

  -- ------------------------------------------------------------ verify
  -- P1: no merge pair is still split.
  if exists (select 1 from _merge m join public.cities c on c.id = m.drop_id
             where c.duplicate_of_id is null) then
    raise exception 'P1 failed: a merge drop row is still live';
  end if;

  -- P2: Mexico City holds Q1489 (unless another live row already does).
  if not exists (select 1 from public.cities where wikidata_qid = 'Q1489' and duplicate_of_id is null) then
    raise exception 'P2 failed: Q1489 was lost in the Mexico City merge';
  end if;

  -- P3: every renamed row kept its old label as an alias, and no slug moved.
  if exists (select 1 from _rename a join public.cities c using (id)
             where c.name = a.new_name
               and not exists (select 1 from public.city_aliases x
                               where x.city_id = a.id and x.alias_key = public.city_canonical_key(a.old_name))) then
    raise exception 'P3 failed: a renamed city lost its old label (no alias)';
  end if;
  if exists (select 1 from _rename_slugs s join public.cities c using (id) where c.slug is distinct from s.slug) then
    raise exception 'P3 failed: a rename moved a slug';
  end if;

  -- P4: no live geocode-minted city still carries a wrapper unless a
  -- collision explains it (those are named in the NOTICE).
  if exists (select 1 from _rename a join public.cities c using (id)
             where c.duplicate_of_id is null and c.name = a.old_name
               and not exists (select 1 from public.cities t
                               where t.id <> a.id and t.country_id = a.country_id
                                 and coalesce(t.region_code,'') = coalesce(a.region_code,'')
                                 and (lower(t.name) = lower(a.new_name)
                                      or (t.duplicate_of_id is null and t.name_normalized = public.normalize_name(a.new_name))))) then
    raise exception 'P4 failed: a wrapper name survived with no collision to explain it';
  end if;

  -- P5: US/CA townships and parishes were not touched.
  if exists (select 1 from _rename where old_name ~* '\m(township|parish)\M') then
    raise exception 'P5 failed: a township or parish entered the rename set';
  end if;
end
$apply$;
