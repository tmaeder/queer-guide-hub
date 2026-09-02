-- Disposition the four cities the city_country_mismatch gate has been counting.
--
-- All four sat at enrichment_status.country_repair.state = 'data_unavailable',
-- stamped by a one-shot pass on 2026-08-04. That means the repair attempt ran and
-- could not resolve them, not that a correction is pending. The gate counts
-- ('proposed','blocked_coord_name_conflict','data_unavailable') and treats
-- 'verified'/'resolved'/'coords_cleared'/'archived_nonplace' as settled; it is
-- warning-only by design, because as its own comment says, resolving one is a
-- per-city human geo decision. This migration is that decision, made four times.
--
-- Evidence came from testing each row's coordinates against the corpus itself
-- (nearest cities with a known country, ST_DistanceSphere), plus each row's own
-- provenance. Nothing here was resolved by name.
--
-- 1. Sibonga (VE) -- KEEP Venezuela, clear the coordinates.
--    This is the one that looked most obviously "wrong" and is the one where
--    acting on the obvious reading would have done real damage. Its coordinates
--    (10.03, 123.57) sit 40 km from Toledo and Cebu City: unambiguously Cebu,
--    Philippines. But those coordinates have NO provenance -- field_provenance
--    carries no latitude or longitude entry at all -- while the country is
--    corroborated by the personality the row was minted from, whose nationality
--    is "Venezuela" and whose bio describes a Venezuelan performer. The row is a
--    'personality-birth-place' shell with a tmp- slug. So the coordinates are the
--    untrustworthy side: something resolved the bare string "Sibonga", hit the
--    Philippine municipality of that name, and stamped its coordinates onto a
--    Venezuelan birthplace. That is the name-collision class this repo has been
--    bitten by repeatedly (Portland ME/OR, Charleston SC/IL): never resolve an
--    entity by name alone when the reference table cannot represent the ambiguity.
--    Repairing the country to PH would have made the row self-consistent by
--    adopting the bad half, AND rewritten a named person's recorded birth country,
--    because apply_city_country_repair repropagates to personalities.country_id
--    and this person's birth_place text is NULL -- the city link is the only
--    record there is. The coordinates go; the country and the note stay.
--
-- 2. Samba (AO) -- KEEP Angola, clear the coordinates.
--    latitude = longitude = -8.83801, the same value written into both columns.
--    That places it in the South Atlantic, 859 km from Jamestown, Saint Helena.
--    The latitude is plausible for Angola on its own, so the corruption is the
--    longitude; the true value is not recoverable, so the pair is cleared rather
--    than guessed. Country, geonames provenance and wikidata_qid are untouched.
--
-- 3. Elelim (ID) -- KEEP Indonesia, mark verified. Nothing was wrong.
--    Its nearest corpus neighbour is Port Moresby at 1,039 km, which reads like
--    Papua New Guinea until you check the longitude: 139.708 E is WEST of the
--    141 E border that splits New Guinea, so the row is in Indonesian Papua and
--    the existing link is correct. The nearest-neighbour signal was weak here
--    only because the corpus holds no Indonesian Papua cities -- absence of a
--    near neighbour is not evidence of a wrong country.
--
-- 4. Pacific (US) -- archive as a non-place, reversibly.
--    Coordinates (0, -160) are open ocean, 1,620 km from Fakaofo, Tokelau. It is
--    a 'personality-birth-place' shell with a tmp- slug, minted from the free-text
--    birth place "Pacific". Note the residual ambiguity honestly: Pacific,
--    Missouri is a real US city, so the STRING may be meaningful even though this
--    ROW is not usable as a place. Nothing is lost either way -- archiving is the
--    reversible disposition (unarchive_city restores the snapshot it takes), the
--    personality keeps its city link, and that person's birth_place text "Pacific"
--    is intact on their own row.
--
-- Durability: no cron and no function other than the manual
-- apply_city_country_repair writes country_repair, so these states are not
-- re-stamped nightly. Verified against pg_proc and cron.job.

do $$
declare
  v_elelim  uuid := '5627e23b-b52c-4b3a-97b6-987363de7b81';
  v_pacific uuid := '47ed0a44-9de6-4977-a7cc-c08bd9e79f2c';
  v_samba   uuid := 'dc1dc781-8684-4735-a2ef-2e540f42b253';
  v_sibonga uuid := '2a3d04cd-6c22-40fa-893f-6c714c7ee915';
  v_res     jsonb;
begin
  -- 1 + 2: coordinates were never trustworthy; the country is. Clear the coords,
  -- keep the link, and record why on the row itself.
  update public.cities c
     set latitude  = null,
         longitude = null,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
           || jsonb_build_object('latitude', jsonb_build_object(
                'value', null, 'source', 'derived:coords_cleared',
                'previous', c.latitude, 'at', now()))
           || jsonb_build_object('longitude', jsonb_build_object(
                'value', null, 'source', 'derived:coords_cleared',
                'previous', c.longitude, 'at', now())),
         enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('country_repair', jsonb_build_object(
                'state', 'coords_cleared',
                'reason', case when c.id = v_sibonga
                               then 'unprovenanced coords resolved the bare name to Sibonga, Cebu (PH); '
                                    'country corroborated by the linked personality nationality (VE)'
                               else 'latitude and longitude held the same value (-8.83801); '
                                    'longitude unrecoverable' end,
                'at', now()))
   where c.id in (v_sibonga, v_samba);

  -- 3: the link was right all along.
  update public.cities c
     set enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('country_repair', jsonb_build_object(
                'state', 'verified',
                'reason', 'longitude 139.708 E lies west of the 141 E New Guinea border, '
                          'so Indonesian Papua; existing country_id correct',
                'at', now()))
   where c.id = v_elelim;

  -- 4: reversible archival, through the repo's own RPC so the restore snapshot
  -- is taken the way unarchive_city expects.
  v_res := public.archive_city_as_nonplace(
    v_pacific,
    'coordinates (0, -160) are open ocean 1,620 km from the nearest land city; '
    || 'personality-birth-place shell with a tmp- slug',
    jsonb_build_object('nearest_city', 'Fakaofo, TK', 'nearest_km', 1620,
                       'latitude', 0, 'longitude', -160,
                       'note', 'the string "Pacific" may still be meaningful (Pacific, Missouri); '
                               || 'this ROW is not usable as a place')
  );
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'archive_city_as_nonplace failed for Pacific: %', v_res;
  end if;

  -- archive_city_as_nonplace writes enrichment_status.disposition, not
  -- country_repair, so the gate would keep counting this row without this.
  update public.cities c
     set enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('country_repair', jsonb_build_object(
                'state', 'archived_nonplace', 'at', now()))
   where c.id = v_pacific;
end $$;

-- The gate must now report zero. If a row was resolved by someone else between
-- authoring and apply, this fails loudly rather than reporting a false clean.
do $$
declare n bigint;
begin
  select failures into n from public.release_gate_checks() where gate = 'city_country_mismatch';
  if n <> 0 then
    raise exception 'city_country_mismatch still reports % row(s) after disposition', n;
  end if;
end $$;
