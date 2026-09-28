-- /city/malay is Boracay, and it published a French village of 225 people.
--
-- Found by the coordinate sweep in 99991790619179, which flagged it at 11,018.8 km.
-- It is the thirteenth row of this class (11 in 99991790358713, two by hand in
-- 20261102100000) and it corrects a claim I made in that earlier work: I wrote that
-- the ~156-row residue "has prose still correct for the row". That is FALSE for this
-- row and for at least one other. My word-boundary classifier could not see it,
-- because the row is named `Malay` and the wrong entity is ALSO labelled `Malay` --
-- the names agree perfectly and only the PLACES differ, which no name heuristic can
-- separate. Distance found it; venues proved it.
--
-- GROUND TRUTH IS THE VENUES, the same instrument 20261102100000 used to keep Lugano
-- out of Ticino. This row carries 27 venues and they are unambiguous:
--   Argonauta Boracay · Hue Hotels and Resorts Boracay · Red Coco Inn de Boracay
--   The District Boracay · Villa Caemilla Beach Boutique Hotel · Jony's Beach Resort
--   Roger's Place Gay Guesthouse · White Beach (Boracay Station 2-3)
-- with country_id PH and coordinates 11.9002 / 121.9100. That is Malay, Aklan, the
-- Philippine municipality that contains Boracay -- a significant queer travel
-- destination, and `seo_indexable`.
--
-- WHAT IT WAS SERVING. `wikidata_qid` Q548370 is `Malay, Saône-et-Loire`, a commune
-- in Burgundy, 11,019 km away. The row published that commune's article
-- ("Malay (French pronunciation: [malɛ]) is a commune in the Saône-et-Loire
-- department...") and had taken its POPULATION: 225. Malay, Aklan has roughly 55,000
-- residents, so 225 is not a stale figure for this place -- it is a different place's
-- figure.
--
-- POPULATION IS CLEARED HERE, unlike in 99991790358713. That is not inconsistency,
-- it is the rule applied per row: there the populations (Frisco 154,407, Kos 19,244)
-- were each the row's OWN, because the wrong value was only ever a provenance
-- candidate that fill-if-empty never applied. Here the wrong value IS in the column.
-- 20261102100000 cleared population for exactly this reason on Geneva, Alabama.
-- Repair only the wrong FIELDS -- which means checking which ones are wrong.
--
-- `wikipedia_title` goes with it: city-factual-backfill/index.ts:451 re-fetches the
-- article BY that cached title independently of the QID, so leaving
-- `Malay, Saône-et-Loire` there would have the next nightly pass rewrite the French
-- commune's description back in. Both columns, every time.
--
-- Nothing is repointed. Malay, Aklan is Q41075 in Wikidata, but this migration does
-- not adopt it: the backfill re-resolves a null QID on its next visit under the class
-- and coordinate guards, and an identifier written by hand here would bypass both.
-- Prefer NULL to a guess, even a well-researched one.
--
-- The row keeps `needs_attention` and its `wikidata_coords` disagree stamp from
-- 99991790619179. Clearing the identifier drains it from
-- `city_wikidata_signals().coord_disagree` automatically, because that count is
-- scoped to rows still holding the id their verdict was about -- 156 -> 155 with no
-- second write, which is the self-draining property working.

update public.cities c
set wikidata_qid    = null,
    wikipedia_title = null,
    description     = null,
    population      = null,
    needs_attention = true,
    updated_at      = now(),
    field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
      || jsonb_build_object(
           'wikidata_qid',
           coalesce(c.field_provenance->'wikidata_qid', '{}'::jsonb)
             || jsonb_build_object(
                  'retracted_value', 'Q548370',
                  'retracted_wikipedia_title', 'Malay, Saône-et-Loire',
                  'reason', 'Q548370 is Malay, Saône-et-Loire, a commune in Burgundy 11,019 km away. '
                            || 'This row is Malay, Aklan, Philippines -- the municipality containing '
                            || 'Boracay -- proven by its 27 venues (Argonauta Boracay, White Beach '
                            || 'Station 2-3, Hue Hotels Boracay), country PH and coordinates '
                            || '11.9002/121.9100. population 225 was the commune''s and was copied '
                            || 'into the column. wikipedia_title cleared too: the backfill re-fetches '
                            || 'the article by that cached title regardless of the QID.',
                  'at', now(),
                  'by', 'migration:99991790619764'))
      || jsonb_build_object(
           'description',
           coalesce(c.field_provenance->'description', '{}'::jsonb)
             || jsonb_build_object('retracted', jsonb_build_object(
                  'from', to_jsonb(c.description),
                  'reason', 'article of Malay, Saône-et-Loire, not of this row',
                  'at', now(),
                  'by', 'migration:99991790619764')))
      || jsonb_build_object(
           'population',
           coalesce(c.field_provenance->'population', '{}'::jsonb)
             || jsonb_build_object('retracted', jsonb_build_object(
                  'from', to_jsonb(c.population),
                  'reason', 'population of Malay, Saône-et-Loire (225), not of Malay, Aklan (~55,000)',
                  'at', now(),
                  'by', 'migration:99991790619764')))
where c.slug = 'malay'
  -- Soft on preconditions: if a concurrent session already repaired this row, skip
  -- rather than aborting `db push` for the whole repo.
  and c.wikidata_qid is not distinct from 'Q548370';

do $verify$
declare
  v_repaired  int;
  v_preserved int;
  v_venues    int;
  v_burj      int;
begin
  select count(*) into v_repaired
    from public.cities
   where slug = 'malay'
     and wikidata_qid is null
     and wikipedia_title is null
     and description is null
     and population is null
     and field_provenance->'wikidata_qid'->>'by' = 'migration:99991790619764';

  -- Retraction must PRESERVE all three values, never merely delete them.
  select count(*) into v_preserved
    from public.cities
   where slug = 'malay'
     and field_provenance->'description'->'retracted'->'from' is not null
     and field_provenance->'population'->'retracted'->'from' is not null
     and field_provenance->'wikidata_qid'->>'retracted_value' = 'Q548370';

  -- CONTROL: the evidence this repair rests on must still be attached to the row. If
  -- the venues moved, the justification recorded above no longer describes it.
  select count(*) into v_venues
    from public.venues v join public.cities c on c.id = v.city_id
   where c.slug = 'malay';

  -- CONTROL: the hand-excluded row keeps its CORRECT identifier. Asserts this pass
  -- did not widen into the rest of the 156.
  select count(*) into v_burj
    from public.cities where slug = 'burj-hammoud' and wikidata_qid = 'Q895235';

  if v_repaired <> 1 then
    raise exception 'malay was not repaired (found %) -- already fixed, or the row moved', v_repaired;
  end if;
  if v_preserved <> 1 then
    raise exception 'malay retraction did not preserve all three prior values';
  end if;
  if v_venues < 20 then
    raise exception 'malay carries only % venues -- the Boracay evidence for this repair is gone', v_venues;
  end if;
  if v_burj <> 1 then
    raise exception 'burj-hammoud lost its CORRECT identifier -- this pass widened beyond malay';
  end if;

  raise notice 'malay: Q548370 cleared, 3 values preserved, % Boracay venues intact', v_venues;
end
$verify$;
