-- hiv-aids: the last recorded open item from the HIV/STI pass, decided.
--
-- 50400101100400 deliberately did NOT touch this row and said why: it describes
-- itself as "HIV/AIDS related news and research", which is what it is USED as,
-- so renaming or merging it is an editorial decision about the news taxonomy
-- rather than a prose correction. Both halves of that decision are made here,
-- and BOTH came out as "no".
--
-- ── NOT MERGED. The data settles it. ────────────────────────────────────────
-- Measured: of its 289 assignments, **288 are news** and the one remaining is a
-- venue (the World AIDS Museum), which is itself legitimately about both. There
-- is no correct single target: `hiv` (active, 580 uses) defines the virus and
-- `aids` (active, 106 uses) defines the syndrome, and an article covering both
-- belongs to neither alone. Merging would point a topic at a definition and
-- destroy 288 topical links — the journalism-deleting move `20260809100000`
-- refused for news duplicates. The row stays as a facet.
--
-- ── NOT RENAMED, and this is the finding worth keeping. ─────────────────────
-- The intended change was `name` "HIV/AIDS" -> "HIV and AIDS", the form UNAIDS
-- prefers and the one this repo started publishing at styleguide v1.3.0
-- (50400101100200). It was written, dry-run on prod, and ABANDONED, because a
-- name update on `unified_tags` does two things nobody asks it to:
--
--   1. IT MOVES THE SLUG. `trg_unified_tags_normalize_slug` is BEFORE UPDATE
--      **OF name, slug**, and the observed result of setting the name was
--      `slug` = `hiv-and-aids`. That is the canonical URL of an indexable page
--      with 289 assignments. Reading `unified_tags_normalize_slug()` alone
--      suggests the opposite — its ASCII branch is
--      `normalize_tag_slug(coalesce(NEW.slug, NEW.name))`, which should keep an
--      existing slug — so this is a case where the source reads one way and the
--      row moves anyway. TRUST THE DRY RUN, NOT THE FUNCTION BODY.
--
--   2. IT TITLE-CASES THE NAME. The value written was "HIV and AIDS"; the value
--      stored was **"HIV And AIDS"** — not English, and not the UNAIDS form the
--      rename existed to adopt. So the rename cannot even achieve its purpose.
--
-- A slug move is survivable (`unified_tags_slug_redirect` exists), but it is
-- not free, and it is a disproportionate price for a solidus. The house style
-- is recorded in the styleguide, which is where a preference about wording
-- belongs; the tag keeps its label. **Do not re-propose this rename without
-- first fixing the title-caser and the slug re-derivation** — a future pass
-- reading only "UNAIDS prefers HIV and AIDS" would walk into both.
--
-- ── WHAT IS ACTUALLY REPAIRED ───────────────────────────────────────────────
-- The `description`, which DEFINES THE TERM WITH THE TERM: "HIV/AIDS related
-- news and research" tells a reader nothing the title did not. That is the
-- defect this repo has recorded three times — `impaired-driving` ("According to
-- Wikidata, impaired driving involves..."), `hardpoint` (description "Toys
-- tag", body "Hardpoint"). The replacement says what the facet covers and
-- states the distinction the solidus hides, which is the substance the UNAIDS
-- guidance is actually about.
--
-- REPLACED, not retracted: the row is ACTIVE, `seo_indexable` and carries 289
-- assignments, so a retraction leaves a live page blank where a replacement
-- leaves it correct (the `darkroom` rule). Content-guarded, so a human who
-- rewrites it first keeps their work; prior text is in `tag_change_log`.
--
-- `long_description` IS LEFT ALONE — 457 characters that correctly distinguish
-- virus from syndrome and then frame both for travellers. Redundant against
-- `hiv` and `aids`, but redundant is not wrong, and the standing rule is to
-- repair only the wrong FIELDS (`casting` / `trauma` / `watersports`).
--
-- `wikidata_id` Q12199 IS LEFT ALONE, checked rather than assumed: it is
-- HIV/AIDS the disease, the topic this facet covers, and it drives 9 rows in
-- `tag_medical_codes`. Nulling it would strip the clinical codes from the one
-- page that aggregates coverage of both.
--
-- ACTOR is declared: `log_unified_tag_change()` RAISEs when a `system:%` actor
-- modifies a human_reviewed row.

select set_config('app.actor', 'migration:51700101100000_hiv_aids_topic_facet', true);

update public.unified_tags set
  description = 'Coverage of HIV and AIDS together — reporting, research, treatment access, activism and commemoration. HIV is the virus and AIDS is the stage it reaches untreated; this tag groups material that concerns both, while the two have their own entries.'
where slug = 'hiv-aids'
  and description ilike '%related news and research%';

-- ── Postcondition ───────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_slug  text;
  v_name  text;
  v_desc  text;
  v_uses  int;
  v_codes int;
BEGIN
  SELECT t.slug, t.name, t.description, t.usage_count
    INTO v_slug, v_name, v_desc, v_uses
    FROM public.unified_tags t WHERE t.slug = 'hiv-aids';

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'no row at slug hiv-aids — the slug moved, which is exactly what this file refuses to do';
  END IF;

  -- The repair.
  IF v_desc ILIKE '%related news and research%' THEN
    RAISE EXCEPTION 'description still defines the term with the term';
  END IF;
  IF v_desc NOT ILIKE '%the virus%' OR v_desc NOT ILIKE '%stage%' THEN
    RAISE EXCEPTION 'replacement description does not state the virus/stage distinction';
  END IF;

  -- The two deliberate NON-actions, asserted so a later edit cannot quietly
  -- perform either one under cover of this migration.
  IF v_name <> 'HIV/AIDS' THEN
    RAISE EXCEPTION 'name changed to % — the rename was measured and rejected (it moves the slug and title-cases)', v_name;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.unified_tags
     WHERE slug = 'hiv-aids' AND status = 'active'
       AND merged_into_id IS NULL AND seo_indexable
  ) THEN
    RAISE EXCEPTION 'hiv-aids is no longer an active, unmerged, indexable facet';
  END IF;
  IF v_uses < 250 THEN
    RAISE EXCEPTION 'hiv-aids usage_count fell to % — assignments were lost', v_uses;
  END IF;

  -- The identifier was deliberately kept, so its codes must still be there.
  SELECT count(*) INTO v_codes FROM public.tag_medical_codes tmc
    JOIN public.unified_tags t ON t.id = tmc.tag_id WHERE t.slug = 'hiv-aids';
  IF v_codes = 0 THEN
    RAISE EXCEPTION 'hiv-aids lost its diagnostic codes';
  END IF;

  -- The definition rows this facet deliberately does NOT absorb.
  IF NOT EXISTS (SELECT 1 FROM public.unified_tags WHERE slug='hiv'  AND status='active')
     OR NOT EXISTS (SELECT 1 FROM public.unified_tags WHERE slug='aids' AND status='active') THEN
    RAISE EXCEPTION 'hiv or aids is no longer active — the facet/definition split is broken';
  END IF;

  RAISE NOTICE 'hiv-aids: description de-circularised; slug, name, % uses and % codes all intact',
    v_uses, v_codes;
END
$verify$;
