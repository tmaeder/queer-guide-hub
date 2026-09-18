-- One reported tag, five defects, and only ONE of them is the reported kind.
--
-- `/tags/friedrichstadt-palast` (129 uses, indexable) served Wikipedia's entry for a Berlin revue
-- theatre under the category "Drag & Performance". The venue already exists at
-- **/venues/friedrichstadt-palast** — same slug, category `theater`, Friedrichstr. 107, live and
-- 200 — so the tag was a second page about the same building. That is the same duplicate-surface
-- defect as the place tags, one entity type over.
--
-- Chasing it with the class signal found FOUR MORE tags on a building QID, and none of those is a
-- duplicate: they are WRONG-ENTITY links, the namesake chimera CLAUDE.md documents.
--
-- ============================================================================
-- WHY THE NAME SWEEP THAT WORKED FOR CITIES IS USELESS HERE
-- ============================================================================
-- For cities and countries, name-match against a live row plus corroboration was decisive. For
-- venues it is worthless, because venue names are arbitrary strings drawn from ordinary language.
-- Measured: matching active tags against live `venues` by name returns `queer` (13,053 uses),
-- `pride` (10,524), `transgender`, `lgbtq`, `nightlife`, `sauna`, `club`, `beach`, `church`,
-- `marriage` and `play` — every one a core glossary concept that merely shares a name with some
-- venue someone opened. A name test here would deindex the glossary.
--
-- The signal that works is the same one that found the Berlin districts: the P31 class of the
-- tag's own Wikidata entity. `Q565670` is `theatre building` — a SPECIFIC built thing, which a
-- glossary term never is.
--
-- ============================================================================
-- THE FIVE ROWS, AND WHY EACH GETS A DIFFERENT TREATMENT
-- ============================================================================
-- 1. friedrichstadt-palast  129 uses  Q565670 `theatre building`
--    The QID is CORRECT and the prose is about the right subject. Nothing here is wrong except
--    that the page exists at all. Deindexed + redirected to the venue; the identifier and the
--    prose are left exactly as they are. Its 129 assignments are all events and ALL 129 already
--    carry `venue_id` for that venue, so unlike the Berlin districts there is no information on
--    the tag that the entity is missing — nothing to migrate.
--
-- 2. hotel-bar  40 uses  Q5911239 = **Hotel Barcelona Princess**
--    A generic venue-feature tag ("a bar inside a hotel") linked to one specific Barcelona
--    skyscraper. `short_description` reads "Hotel in Barcelona, Spain", `long_description` is that
--    hotel's encyclopedia entry, and `wikipedia_url` points at *List_of_hotels_in_Spain*.
--
-- 3. city-center  11 uses  Q5122942 = a partly-built **Helsinki redevelopment plan**
--    `description` is that plan's text, on a tag meaning "in the middle of town".
--
-- 4. munch  0 uses  Q844926 = the **Munch Museum, Oslo**
--    The tag is the BDSM social meet-up, and ALL THREE prose fields already say so correctly.
--    Only the identifier is wrong. Prose is untouched.
--
-- 5. power-exchange  0 uses  Q44633684 = **The Screening Room**, a defunct SF movie theater
--    `description` ("Transfer of control between partners") is correct and is KEPT;
--    `short_description` ("Defunct San Francisco movie theater") and the long body about the
--    theater are the wrong subject and go.
--
-- PREFER NULL TO A GUESS. No identifier is re-resolved. `tag_medical_codes_sync` and
-- `tag_wikidata_hierarchy` rebuild from `wikidata_id` weekly, so a plausible-but-wrong QID
-- regenerates wrong data forever while a null one regenerates nothing.
--
-- ONLY THE WRONG FIELDS. The `casting`/`trauma`/`watersports` rule: `munch` keeps everything,
-- `power-exchange` keeps its `description`. Retracting a correct field to tidy up is the same
-- error in the other direction.
--
-- hotel-bar and city-center are left with NO prose at all, which is honest — they are bare
-- venue-feature facets. `enforce_tag_thin_page_gate` will stamp them `thin` on this very UPDATE,
-- which is the correct reason for them: they are not duplicates of anything, they are simply
-- empty, and a later description SHOULD bring them back.
--
-- `venue-duplicate` is a NEW reason string, deliberately not `place-duplicate`. The reason is the
-- mechanism (default-deny against the thin-page reindexer) and it is also the record: stamping a
-- theatre as a "place duplicate" would mislead whoever next audits that reason, which is exactly
-- why 20270501180000 excluded `cuauhtemoc` by name rather than let it dilute the bucket.
--
-- REVERSE
--   update public.unified_tags set seo_indexable = true, seo_deindex_reason = null
--    where slug = 'friedrichstadt-palast';
--   -- the nulled identifiers and retracted prose are in tag_change_log.before_data

do $$
declare
  v_deindexed int; v_cleared int; v_leak int; v_kept int;
begin
  -- `munch` and `power-exchange` are human_reviewed=true, and log_unified_tag_change() RAISEs when
  -- an undeclared `system:%` actor modifies such a row. Verified live, not assumed.
  perform set_config('app.actor', 'migration:venue_duplicate_and_wrong_building_tags', true);

  -- 1. The venue duplicate. Identifier and prose untouched.
  update public.unified_tags
     set seo_indexable = false, seo_deindex_reason = 'venue-duplicate', updated_at = now()
   where status = 'active' and slug = 'friedrichstadt-palast'
     and (seo_indexable is true or seo_deindex_reason = 'thin')
     and seo_deindex_reason is distinct from 'venue-duplicate';
  get diagnostics v_deindexed = row_count;
  raise notice 'venue duplicate deindexed: %', v_deindexed;

  -- 2. The wrong-entity identifiers. Content-guarded on the value being removed, so a human who
  --    has already relinked one of these keeps their work.
  update public.unified_tags
     set wikidata_id = null, wikipedia_url = null, updated_at = now()
   where status = 'active'
     and (slug, wikidata_id) in (('hotel-bar','Q5911239'), ('city-center','Q5122942'),
                                 ('munch','Q844926'), ('power-exchange','Q44633684'));
  get diagnostics v_cleared = row_count;
  raise notice 'wrong-entity identifiers nulled: %', v_cleared;

  -- 3. The prose those identifiers produced, per row and per FIELD.
  update public.unified_tags set short_description = null, long_description = null, updated_at = now()
   where slug = 'hotel-bar'
     and short_description ilike '%Hotel in Barcelona%';

  update public.unified_tags set description = null, updated_at = now()
   where slug = 'city-center'
     and description ilike '%Helsinki%';

  update public.unified_tags set short_description = null, long_description = null, updated_at = now()
   where slug = 'power-exchange'
     and short_description ilike '%movie theater%';

  -- 4. Postconditions. Assert the reached state, and assert what must SURVIVE — the half that
  --    protects correct prose from a future pass reading this as "clear everything".
  select count(*) into v_leak from public.unified_tags
   where status = 'active' and slug = 'friedrichstadt-palast' and seo_indexable is true;
  if v_leak > 0 then raise exception 'friedrichstadt-palast is still indexable'; end if;

  select count(*) into v_leak from public.unified_tags
   where status = 'active' and wikidata_id in ('Q5911239','Q5122942','Q844926','Q44633684');
  if v_leak > 0 then raise exception '% wrong-entity identifiers survived', v_leak; end if;

  -- munch must keep all three prose fields; power-exchange must keep its description.
  select count(*) into v_kept from public.unified_tags
   where slug = 'munch'
     and description ilike '%BDSM%' and short_description is not null and long_description is not null;
  if v_kept <> 1 then raise exception 'munch prose was destroyed — only its identifier was wrong'; end if;

  select count(*) into v_kept from public.unified_tags
   where slug = 'power-exchange' and description = 'Transfer of control between partners';
  if v_kept <> 1 then raise exception 'power-exchange lost its correct description'; end if;

  -- The wrong prose must be gone.
  select count(*) into v_leak from public.unified_tags
   where (slug = 'hotel-bar' and coalesce(short_description,'') ilike '%Barcelona%')
      or (slug = 'city-center' and coalesce(description,'') ilike '%Helsinki%')
      or (slug = 'power-exchange' and coalesce(short_description,'') ilike '%movie theater%');
  if v_leak > 0 then raise exception '% wrong-entity prose fields survived', v_leak; end if;
end $$;
