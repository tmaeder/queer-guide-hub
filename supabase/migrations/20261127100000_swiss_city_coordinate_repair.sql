-- Two Swiss cities are pinned in a neighbouring municipality.
--
-- HOW THEY WERE FOUND. Zug's coordinate sat ~11 km east and that is what made
-- its canton read as Zurich; fixing it raised the question of how many others
-- are wrong. So every Swiss city was measured against two authorities rather
-- than the two rows I happened to trip over: 149 rows, 121 of which have both a
-- unique Wikidata municipality name match and a postal-directory place of the
-- same name.
--
-- THE FIRST CUT WAS WRONG AND IS WORTH RECORDING. It compared the stored point
-- against BOTH authorities and called a row disputed when the authorities
-- disagreed with each other. But Wikidata P625 is a SETTLEMENT point while the
-- GeoNames postal lat/lon is a DELIVERY-AREA CENTROID, and for a large rural
-- municipality those legitimately differ -- Sachseln by 4.0 km, Amden by 2.4 km.
-- Read that way, Sachseln looked like a source dispute and Amden looked like a
-- defect; neither was true. The postal directory corroborates WHICH
-- MUNICIPALITY a row belongs to, which is how the canton pass used it, and it is
-- not a second opinion on the precise point. Amden, at 1.8 km from its
-- settlement point, is fine and is not touched.
--
-- THE TEST. Distance alone does not separate a wrong point from a big
-- municipality: Koniz sits 2.8 km from its own centre and Vernier 2.2 km, and
-- both are correct. Nor does "nearest municipality is a different one", which in
-- the dense cantons flags Koniz (nearest: Bern) and Vernier (nearest: Meyrin)
-- for the ordinary reason that a 2 km offset in a built-up area lands near a
-- neighbour's centre. A row is only repaired when BOTH hold: it is more than
-- 3 km from its own municipality's point, AND it is at least 1.4x closer to a
-- DIFFERENT municipality than to its own -- i.e. it does not merely sit off
-- centre, it demonstrably sits somewhere else.
--
--   city        own      nearest other        ratio   verdict
--   Sachseln    7.71 km  Giswil     5.27 km   1.46    repaired
--   Ebikon      3.93 km  Emmen      1.34 km   2.93    repaired
--   Lauperswil  3.24 km  Landiswil  2.79 km   1.16    left alone
--   Freienbach  2.95 km  Altendorf  2.69 km   1.10    left alone
--   Koniz       2.76 km  Bern       2.09 km   1.32    left alone
--   Muhleberg   2.49 km  (its own)                    left alone
--   Vernier     2.22 km  Meyrin     1.75 km   1.27    left alone
--   Unterengstringen 2.19 km Urdorf 1.76 km   1.25    left alone
--
-- Ebikon's stored point is 1.3 km from the centre of EMMEN and 3.9 km from its
-- own; Sachseln's is nearer to Giswil and sits about 8 km south of the village,
-- past the end of the lake. Both rows are `data_source = 'nominatim-geocode'`,
-- the same cohort that produced the Zug offset and the Lugano/Ravenna row.
--
-- The new values are Wikidata P625, which is the coordinate source every Swiss
-- city created by 20261102100100 already uses, so this makes the corpus
-- consistent rather than introducing a third convention.
--
-- SACHSELN ALSO GAINS ITS QID. It had none, Q64614 is claimed by no row, the
-- name matches exactly one current Swiss municipality, and the postal directory
-- independently places 6072 Sachseln in municipality Sachseln, canton Obwalden,
-- which is the canton already on the row. That is the same two-signal bar the
-- rest of this work used, and a QID is what lets city-factual-backfill maintain
-- the row instead of leaving it inert. Ebikon already carries Q14566, which is
-- the same municipality this repair matched -- corroboration, so its identity is
-- not rewritten.

do $$
declare
  v_ch uuid := (select id from public.countries where code = 'CH');
  v_n  integer;
begin
  if v_ch is null then raise exception 'no country row for CH'; end if;

  -------------------------------------------------------------------- Sachseln
  update public.cities c
     set latitude  = 46.867778,
         longitude = 8.238611,
         wikidata_qid = coalesce(c.wikidata_qid, 'Q64614'),
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'latitude', jsonb_build_object(
             'value', 46.867778, 'previous', 46.798562, 'source', 'wikidata:Q64614',
             'reason', 'stored point sat ~7.7 km south of the village, nearer to Giswil',
             'at', now(), 'by', 'migration:20261127100000'),
           'longitude', jsonb_build_object(
             'value', 8.238611, 'previous', 8.231974, 'source', 'wikidata:Q64614',
             'at', now(), 'by', 'migration:20261127100000')),
         updated_at = now()
   where c.id = '9601af40-44d3-4666-934c-fb102d57ab1d'
     and c.country_id = v_ch
     -- Guarded on the value being repaired, so a coordinate corrected by any
     -- other path between review and apply wins and this declines.
     and round(c.latitude::numeric, 4) = 46.7986;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Sachseln: expected 1 row at the reviewed coordinate, updated %', v_n;
  end if;

  ---------------------------------------------------------------------- Ebikon
  update public.cities c
     set latitude  = 47.083889,
         longitude = 8.343056,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'latitude', jsonb_build_object(
             'value', 47.083889, 'previous', 47.065176, 'source', 'wikidata:Q14566',
             'reason', 'stored point sat 1.3 km from the centre of Emmen and 3.9 km from Ebikon',
             'at', now(), 'by', 'migration:20261127100000'),
           'longitude', jsonb_build_object(
             'value', 8.343056, 'previous', 8.299032, 'source', 'wikidata:Q14566',
             'at', now(), 'by', 'migration:20261127100000')),
         updated_at = now()
   where c.id = 'ded318c6-4565-4a76-aad9-ee0449b00601'
     and c.country_id = v_ch
     and round(c.latitude::numeric, 4) = 47.0652;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Ebikon: expected 1 row at the reviewed coordinate, updated %', v_n;
  end if;

  --------------------------------------------------------------------- asserts
  -- Each repaired row must now sit within 1 km of its municipality's own point.
  if (select public.haversine_m(latitude::numeric, longitude::numeric, 46.867778, 8.238611)
        from public.cities where id = '9601af40-44d3-4666-934c-fb102d57ab1d') > 1000 then
    raise exception 'Sachseln did not land on its municipality point';
  end if;
  if (select public.haversine_m(latitude::numeric, longitude::numeric, 47.083889, 8.343056)
        from public.cities where id = 'ded318c6-4565-4a76-aad9-ee0449b00601') > 1000 then
    raise exception 'Ebikon did not land on its municipality point';
  end if;

  -- The QID must identify exactly one row, or the identity claim is worse than
  -- the null it replaced.
  if (select count(*) from public.cities where wikidata_qid = 'Q64614') <> 1 then
    raise exception 'Q64614 is claimed by % rows',
      (select count(*) from public.cities where wikidata_qid = 'Q64614');
  end if;

  -- Neither row's canton may move: the coordinate is being corrected, not the
  -- municipality it belongs to.
  if (select region_name from public.cities where id = '9601af40-44d3-4666-934c-fb102d57ab1d') is distinct from 'Obwalden'
     or (select region_name from public.cities where id = 'ded318c6-4565-4a76-aad9-ee0449b00601') is distinct from 'Lucerne' then
    raise exception 'a canton changed while repairing coordinates';
  end if;
end $$;
