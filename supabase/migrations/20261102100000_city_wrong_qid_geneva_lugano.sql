-- Two cities carry another city's Wikidata identity, and a third carries none.
--
-- FOUND WHILE resolving the aids-ch health registry's city strings. That work
-- needs `city_resolve_or_create`, whose FIRST probe is the QID and which
-- deliberately does not scope that probe to the country -- a QID match across a
-- border is evidence the caller's country is wrong, not evidence of a second
-- city. So passing Q71 for a Geneva clinic returns `qid_country_mismatch`
-- pointing at ALABAMA, and passing Q7024 for a Lugano clinic points at Italy.
-- The registry could be routed around both, but routing around a known-false
-- identity claim leaves it in place for the next caller.
--
-- WHAT IS ACTUALLY WRONG. Neither row is a duplicate and neither is in the wrong
-- country; each is a real, distinct place wearing a Swiss city's identity.
--
--   Geneva, Alabama   carries Q71 (Geneva, Switzerland) AND population 209,061,
--                     which is Swiss Geneva's. Its coordinates (31.09/-85.80)
--                     and its venues are genuinely in Alabama.
--   Lugano (IT)       carries Q7024 (Lugano, Ticino) with region_name
--                     "Emilia-Romagna" and coordinates 44.38/12.20. That is a
--                     frazione of RAVENNA, and its venues settle it: "Gothic
--                     Sauna" at Vicolo Vecchio 3, postal 48124, plus two venues
--                     addressed Ravenna. A first draft of this migration moved
--                     the row to Switzerland; the venues are what caught it.
--                     Moving it would have dragged three Ravenna venues into
--                     Ticino.
--   Geneva (CH)       has no QID at all, which is why nothing ever noticed.
--
-- This is the class CLAUDE.md already records for Albany (the stored QID is
-- Albany, TEXAS) and for Dresden, Erfurt, Potsdam, Saarbrucken and Wiesbaden.
-- Nothing detects it, because a wrong QID is only visible when someone probes by
-- QID and gets a surprise.
--
-- PREFER NULL TO A GUESS. The two wrong QIDs and the population copied with one
-- are cleared, not replaced: `city-factual-backfill` re-resolves a null QID on
-- its next visit, whereas a plausible-but-wrong one regenerates wrong facts
-- forever -- the same reason the tag wrong-entity repair nulled rather than
-- re-resolved. Swiss Geneva's own population (500,000, an agglomeration figure)
-- is left alone: it is arguable, not a false identity claim, and this migration
-- is scoped to identity.
--
-- Each UPDATE asserts the value it expects to find, so a row that moved on
-- production fails the migration loudly instead of being repaired blind.

do $$
declare
  v_geneva_al uuid := '990ee844-269a-4260-aaa5-42f2afbb1ed9';
  v_lugano_it uuid := '6618a1f5-d3e8-47e3-b9c8-9fee96323dbf';
  v_geneva_ch uuid := '4a0387c6-8b78-495a-9b75-723b2718935c';
  v_n         integer;
begin
  ---------------------------------------------------------------- Geneva, AL
  update public.cities c
     set wikidata_qid = null,
         population   = null,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'wikidata_qid', jsonb_build_object(
             'retracted_value', 'Q71',
             'reason', 'Q71 is Geneva, Switzerland; this row is Geneva, Alabama. population 209061 was copied with it.',
             'at', now(), 'by', 'migration:20261102100000')),
         updated_at = now()
   where c.id = v_geneva_al
     and c.wikidata_qid = 'Q71';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'expected Geneva, Alabama (%) to carry Q71, updated % rows', v_geneva_al, v_n;
  end if;

  ---------------------------------------------------------------- Lugano, IT
  update public.cities c
     set wikidata_qid = null,
         population   = null,
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'wikidata_qid', jsonb_build_object(
             'retracted_value', 'Q7024',
             'reason', 'Q7024 is Lugano, Ticino; this row is Lugano, a frazione of Ravenna (coordinates 44.38/12.20, venues addressed Ravenna). Deliberately NOT moved to Switzerland.',
             'at', now(), 'by', 'migration:20261102100000')),
         updated_at = now()
   where c.id = v_lugano_it
     and c.wikidata_qid = 'Q7024';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'expected Lugano (IT) (%) to carry Q7024, updated % rows', v_lugano_it, v_n;
  end if;

  ---------------------------------------------------------------- Geneva, CH
  -- Only now can Q71 be attached: uq_cities_wikidata_qid is partial on
  -- `duplicate_of_id IS NULL`, so the Alabama row had to release it first.
  update public.cities c
     set wikidata_qid = 'Q71',
         field_provenance = coalesce(c.field_provenance, '{}'::jsonb) || jsonb_build_object(
           'wikidata_qid', jsonb_build_object(
             'value', 'Q71', 'source', 'wikidata',
             'reason', 'Q71 is Geneva, Switzerland; it was stranded on Geneva, Alabama.',
             'at', now(), 'by', 'migration:20261102100000')),
         updated_at = now()
   where c.id = v_geneva_ch
     and c.wikidata_qid is null
     and c.country_id = (select id from public.countries where code = 'CH');
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'expected Geneva (CH) (%) to have a null QID, updated % rows', v_geneva_ch, v_n;
  end if;

  -- The point of the whole migration: exactly one row may claim each of these.
  if (select count(*) from public.cities where wikidata_qid = 'Q71') <> 1 then
    raise exception 'Q71 is claimed by % rows', (select count(*) from public.cities where wikidata_qid = 'Q71');
  end if;
  if (select count(*) from public.cities where wikidata_qid = 'Q7024') <> 0 then
    raise exception 'Q7024 should be unclaimed, found %', (select count(*) from public.cities where wikidata_qid = 'Q7024');
  end if;
end $$;
