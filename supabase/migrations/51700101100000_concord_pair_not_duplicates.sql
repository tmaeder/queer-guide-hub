-- The Concord pair: not duplicates. One row is Concord, New Hampshire; the other
-- has no establishable identity. Both were publishing Concord, NORTH CAROLINA.
--
-- `dedup_review_queue` row 67bfd3fb-fa74-4047-a735-f6ff1b1839c5 paired
-- "Concord " (US, 15236843…) with "Concord" (CZ, 31ca20ad…). Its 2026-09-13 note
-- correctly refused to merge on the evidence then available, and correctly said
-- resolving it needed a real identity rather than another inference. This file
-- establishes that identity for one side and records that the other has none.
--
-- WHAT THE EARLIER NOTE GOT WRONG, and why. It read both rows as
-- `personality-birth-place` shells and concluded "the NH coordinates are not
-- evidence". They are, and the two rows have DIFFERENT producers:
--
--   keep  15236843…  data_source = 'venue-city-match'
--   drop  31ca20ad…  data_source = 'personality-birth-place'
--
-- The keep row's name carries a TRAILING SPACE, and that is its origin
-- fingerprint: two live venues carry the byte-identical city text 'Concord ',
-- and both are in NEW HAMPSHIRE (Dos Amigos Burritos; ConvenientMD Urgent Care,
-- geocoded 43.2088/-71.5292, about 1 km from the row's stored point). So the
-- coordinates were written by the venue match BEFORE the North Carolina
-- enrichment, which is exactly why they have no candidate entry beside the NC
-- ones — absence of provenance there is evidence of an EARLIER writer, not of a
-- fabricated value.
--
-- Corroborated against a real source rather than inferred: Wikipedia
-- "Concord, New Hampshire" resolves to Q28249, whose P17 is Q30 (United States,
-- matching this row's own country) and whose P625 is 43.20667/-71.53806 — about
-- 70 m from the stored 43.207178/-71.537476. Its airport codes MHT/PSM are both
-- New Hampshire. Four independent signals, all agreeing.
--
-- THE DROP ROW HAS NO RECOVERABLE IDENTITY, and its country was never a claim
-- about a place: its only referrer is Karl Stevens, an archived draft with
-- birth_place NULL, no sources and no QID, whose `nationality` is 'Czech
-- Republic' — which is where CZ came from. The producer resolved the country
-- from the PERSON, not from the place. Nothing establishes what town it was
-- minted for, so nothing here guesses one.
--
-- THEREFORE THE PAIR IS REJECTED, NOT MERGED. One side is Concord, New
-- Hampshire; the other is not established as anything, so they are not shown to
-- be the same place. `rejected` is also the sweep's permanent memory, which is
-- correct: the sweep cannot decide this pair either.
--
-- BOTH ROWS ARE LIVE IN SITE SEARCH (`shell_status='placeholder'`, and the city
-- indexer excludes only ghost/merged/duplicate), so until now a search for
-- "Concord" returned two cards, both describing Concord, North Carolina, one of
-- them filed under the Czech Republic. That is the harm this file removes.
--
-- The drop row is RETRACTED, not archived and not deleted: archiving asserts
-- "not a place", which is not established either. Stripped of the North Carolina
-- facts it becomes contentless, and the nightly completeness/trust recompute
-- routes a zero-content row to `ghost` with `seo_indexable=false`, which the
-- city indexer excludes — so it leaves search on its own, reversibly, the same
-- self-healing path recorded for Brisbane, California.
--
-- `timezone`, `safety_notes` and `country_id` on the drop row are deliberately
-- NOT touched: they are derived from the country, not from the NC article, and
-- repairing only the wrong fields is the rule this repo already records for
-- `casting`, `trauma` and `watersports`.
--
-- `is_regional_capital` is deliberately NOT set either, though Concord is the
-- New Hampshire state capital (Q28249 P1376 = Q759). That flag is owned by
-- `city-factual-backfill`'s sparql phase, which distinguishes unprobed from
-- probed-negative through `enrichment_status.capital_scope`; writing the value
-- without that bookkeeping would corrupt the distinction. Giving this row its
-- QID is what lets that engine fill it correctly.
--
-- Soft on preconditions, hard on postconditions. Every write is guarded on the
-- defect still being present, so a human who repairs a row first keeps their
-- work and this file no-ops instead of overwriting them.

do $concord$
declare
  v_keep  constant uuid := '15236843-07f0-4e98-af6d-87c6820dc01e';
  v_drop  constant uuid := '31ca20ad-3a55-4221-878f-3df3f4b41f69';
  v_queue constant uuid := '67bfd3fb-fa74-4047-a735-f6ff1b1839c5';
  v_nh    constant text  :=
    'Concord is the capital city of the U.S. state of New Hampshire and the seat of '
 || 'Merrimack County. As of the 2020 United States census the population was 43,976, '
 || 'making it the 3rd most populous city in New Hampshire after Manchester and Nashua.';
  v_repaired int := 0;
  v_retracted int := 0;
  v_closed  int := 0;
  v_bad     int;
  v_txt     text;
begin
  ---------------------------------------------------------------- (1) keep row
  -- becomes Concord, New Hampshire. Guarded on it still carrying no gazetteer
  -- id, so a concurrent relink is not overwritten.
  update public.cities c
     set name           = 'Concord',
         slug           = 'concord',
         wikidata_qid   = 'Q28249',
         wikipedia_title= 'Concord, New Hampshire',
         region_name    = 'New Hampshire',
         population     = 43976,
         description    = v_nh,
         -- the other Concord's artefacts. NULLed rather than replaced with
         -- hand-written New Hampshire numbers: `city-factual-backfill` is
         -- fill-if-empty, so emptying them is what makes them eligible to be
         -- refilled correctly from Q28249. Retraction only ever REMOVES.
         image_url        = null,
         image_metadata   = '{}'::jsonb,
         official_website = null,
         area_km2         = null,
         elevation_m      = null,
         founded_year     = null,
         field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(
           'description', coalesce(c.field_provenance->'description','{}'::jsonb) || jsonb_build_object(
             'value', v_nh,
             'source','wikipedia:Concord, New Hampshire',
             'corrected', jsonb_build_object(
               'by','migration:51700101100000',
               'at', now(),
               'from', c.description,
               'why','row published Concord, North Carolina; identity resolved to Q28249'))))
   where c.id = v_keep
     and c.wikidata_qid is null
     and c.description ilike '%Cabarrus County, North Carolina%';
  get diagnostics v_repaired = row_count;

  ---------------------------------------------------------------- (2) drop row
  -- retract every fact taken from the North Carolina article. Content-guarded.
  update public.cities c
     set description      = null,
         description_i18n = '{}'::jsonb,
         image_url        = null,
         image_metadata   = '{}'::jsonb,
         official_website = null,
         population       = null,
         area_km2         = null,
         elevation_m      = null,
         founded_year     = null,
         latitude         = null,
         longitude        = null,
         needs_attention  = true,
         field_provenance = coalesce(c.field_provenance,'{}'::jsonb) || jsonb_build_object(
           'description', coalesce(c.field_provenance->'description','{}'::jsonb) || jsonb_build_object(
             'retracted', jsonb_build_object(
               'by','migration:51700101100000',
               'at', now(),
               'from', c.description,
               'why','Concord, North Carolina facts on a shell whose identity is unrecoverable')))
   where c.id = v_drop
     and c.description ilike '%Cabarrus County, North Carolina%';
  get diagnostics v_retracted = row_count;

  ------------------------------------------------------------------- (3) queue
  update public.dedup_review_queue q
     set status        = 'rejected',
         reviewed_at   = now(),
         reviewer_note = 'auto-distinct: NOT duplicates. The keep row is Concord, NEW HAMPSHIRE '
                      || '(Q28249) — minted by venue-city-match from two venues whose city text is '
                      || 'byte-identically "Concord " including the trailing space, both in New '
                      || 'Hampshire, one geocoded ~1 km away; its stored coordinates sit ~70 m from '
                      || 'Q28249 P625, and its airports MHT/PSM are both NH. The drop row has no '
                      || 'recoverable identity: its only referrer is an archived draft with a NULL '
                      || 'birth_place, and its CZ country came from that person''s nationality, not '
                      || 'from any place. Both rows had been overwritten with Concord, North '
                      || 'Carolina facts by a bare-name lookup; that contamination is retracted in '
                      || 'migration 51700101100000. Re-open only on a real identity for the drop row.'
   where q.id = v_queue
     and q.status = 'open';
  get diagnostics v_closed = row_count;

  ------------------------------------------------------------ postconditions
  -- 1. the keep row IS Concord, New Hampshire and no longer names North Carolina
  select count(*) into v_bad from public.cities
   where id = v_keep
     and (wikidata_qid is distinct from 'Q28249'
          or name <> 'Concord'
          or region_name is distinct from 'New Hampshire'
          or coalesce(description,'') ilike '%North Carolina%');
  if v_bad <> 0 then
    raise exception 'keep row did not reach the Concord, New Hampshire state';
  end if;

  -- 2. neither row still publishes the North Carolina article
  select count(*) into v_bad from public.cities
   where id in (v_keep, v_drop)
     and (coalesce(description,'') ilike '%Cabarrus County%'
          or coalesce(image_url,'') ~* '(Concord_NC|Concord-Carlisle)'
          or coalesce(image_metadata::text,'') ~* '(Concord_NC|Concord-Carlisle)'
          or coalesce(official_website,'') ilike '%concordnc.gov%'
          or coalesce(area_km2,0) = 159.98
          or coalesce(elevation_m,0) = 215
          or coalesce(founded_year,0) = 1796);
  if v_bad <> 0 then
    raise exception '% row(s) still carry another Concord''s facts', v_bad;
  end if;

  -- 2b. the keep row carries a real slug, not the minted-shell tmp- form.
  --     `cities` has NO slug-redirect table, so a slug move is only safe on a
  --     row with no links; this one has no content and is not indexable.
  select count(*) into v_bad from public.cities where id = v_keep and slug <> 'concord';
  if v_bad <> 0 then
    raise exception 'keep row did not take the concord slug';
  end if;

  -- 3. the pair is closed and was NOT merged in either direction
  select count(*) into v_bad from public.dedup_review_queue
   where id = v_queue and status = 'open';
  if v_bad <> 0 then
    raise exception 'the Concord pair is still open';
  end if;

  select count(*) into v_bad from public.cities
   where id in (v_keep, v_drop) and duplicate_of_id is not null;
  if v_bad <> 0 then
    raise exception 'a Concord row was merged; this pair is distinct and must never be merged';
  end if;

  -- 4. the standing invariant: no OPEN city pair names two different places
  select count(*) into v_bad
  from public.dedup_review_queue q
  join public.cities ka on ka.id = q.keep_id
  join public.cities da on da.id = q.drop_id
  where q.entity_type = 'city' and q.status = 'open'
    and public.dedup_despace(ka.name) <> public.dedup_despace(da.name)
    and public.dedup_despace(regexp_replace(da.name, '\s*,\s*[^,]+$', '')) <> public.dedup_despace(ka.name)
    and public.dedup_despace(regexp_replace(ka.name, '\s*,\s*[^,]+$', '')) <> public.dedup_despace(da.name);
  if v_bad <> 0 then
    raise exception '% open city pairs still name two different places', v_bad;
  end if;

  select name || ' | ' || coalesce(slug,'?') || ' | ' || coalesce(wikidata_qid,'-')
    into v_txt from public.cities where id = v_keep;
  raise notice 'concord: repaired=% retracted=% closed=% keep=[%]',
    v_repaired, v_retracted, v_closed, v_txt;
end
$concord$;
