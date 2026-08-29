-- Two tags were retracted to empty and left indexable, breaking a zero-invariant.
--
-- NOT part of the UCSF pass. `20261012090500_tag_wrong_sense_hand_retractions`
-- (merged to main while this branch was open) correctly cleared wrong-sense prose
-- from `furniture` (which described IKEA-style household furniture) and
-- `clothing-optional` (which described a nude BIKE RIDE on the page for a venue
-- policy). Preferring NULL to a wrong claim is the right call and is not undone
-- here.
--
-- What it left behind is the problem. Both rows stayed `status='active'` with
-- `seo_indexable=true` and NO description of any kind, which is exactly what
-- `tag_hygiene_stats().indexable_without_description` exists to forbid — measured
-- live 2026-08-29 14:44 UTC, 0 -> 2, and it reds EVERY open PR because that gate
-- reads prod rather than the branch. Main's own Data Quality Gates run is
-- scheduled and last succeeded at 05:22, so nothing on main would have reported
-- this until the next nightly pass.
--
-- That retraction's header says the community sense "re-enters through the
-- sense-anchored fill", i.e. a later automated backfill. The gap between
-- retraction and refill is the defect: `clothing-optional` is not an obscure row,
-- it is on **1,690 live venues**, and until the fill runs every one of them links
-- to a published, indexable page with nothing on it.
--
-- So this writes the community sense by hand rather than waiting. Both are
-- ordinary vocabulary that needs no source beyond knowing the domain, and neither
-- gets a `wikidata_id` back: the retraction cleared those deliberately because the
-- linked entities were the wrong concept, and guessing a replacement identifier is
-- how the namesake-chimera class started (20261008100000). Prose only.
--
-- GUARDED ON STILL-EMPTY, so this is a no-op if a sibling session's fill lands
-- first — several are editing this table concurrently, and clobbering a better
-- description with this one would be a regression of its own.

select set_config('app.actor', 'admin:refill-retracted-indexable-20260829', true);

update public.unified_tags
   set description =
         'A venue policy: clothing is not required. How far that goes, and where in the venue it applies, varies from a nude sauna floor to a clothing-optional patio on certain nights.',
       short_description = 'A venue where clothing is not required.',
       updated_at = now()
 where slug = 'clothing-optional'
   and status = 'active'
   and coalesce(nullif(btrim(description), ''), short_description) is null;

update public.unified_tags
   set description =
         'Purpose-built furniture for bondage and play: slings, benches, spanking horses, crosses, cages and similar. Listed as gear a venue or a host provides, rather than as a practice.',
       short_description = 'Purpose-built furniture for bondage and play.',
       updated_at = now()
 where slug = 'furniture'
   and status = 'active'
   and coalesce(nullif(btrim(description), ''), short_description) is null;

do $verify$
declare v_n int; v_bad text;
begin
  -- The invariant itself, restored. Deliberately checked across the WHOLE corpus
  -- rather than just these two slugs: the point is the metric, and a third row in
  -- the same state should fail here rather than in someone else's PR.
  select count(*), string_agg(slug, ', ') into v_n, v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_n > 0 then
    raise exception 'indexable_without_description is % (must be 0): %', v_n, v_bad;
  end if;

  -- and the retraction is not undone: no identifier came back with the prose
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('clothing-optional','furniture')
     and (wikidata_id is not null or wikipedia_url is not null);
  if v_bad is not null then
    raise exception 'refill re-added a retracted identifier on: %', v_bad;
  end if;
end
$verify$;
