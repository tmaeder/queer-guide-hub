-- The place tags a NAME-shaped sweep cannot find: caught by Wikidata class instead.
--
-- 81000101100000 worked from a hand-built cohort (the Berlin districts I could name, plus the
-- audit's blocked same-name bucket). That cohort had a hole, and the hole was found by asking the
-- obvious question — "did you check ALL the tags?" — rather than by any check in this repo.
-- `spandau` is a Berlin BOROUGH (Q158083, `borough of Berlin`), exactly the same class as the
-- eight districts that migration refiled, and it was missed purely because it was not on my list.
--
-- ============================================================================
-- THE SWEEP THAT HAS NO LIST
-- ============================================================================
-- Every previous pass over this defect keyed on something NAME-shaped: a slug, a category, a
-- description regex, or an enumerated cohort. All of those are sampling, and all of them missed
-- rows. The exhaustive signal is the one the tag itself carries: the P31 class of its Wikidata
-- entity. Measured over all 1,570 QIDs on active tags (774 distinct classes, every one resolved):
-- **71 active tags point at an entity whose class is a place**, and 14 of those were still
-- `seo_indexable` after 81000101100000 ran.
--
-- WHY THE CLASS SWEEP NEEDS ITS OWN FALSE-POSITIVE GUARD
-- `town` (Q3957) is classed `classification of human settlements` — it matches every place
-- pattern and is NOT a place. It is the common noun, the concept a glossary should carry, and the
-- audit put it in bucket F on purpose. The discriminator is structural, not a word list: **Q3957
-- is itself USED AS A P31 VALUE by other entities**, which is what a class does and what an
-- instance never does. Applied to all 14, it separates exactly one row — `town` — and leaves the
-- other 13 untouched. No other tag in the corpus has that shape.
--
-- ============================================================================
-- WHAT IS DEINDEXED HERE, AND WHAT IS DELIBERATELY NOT
-- ============================================================================
-- DEINDEXED (11) — a specific settlement, borough or district, publishing encyclopaedic geography:
--   uk               154  Q145     sovereign state    -> /country/united-kingdom
--   espana             6  Q29      sovereign state    -> /country/spain
--   turkiye            5  Q43      sovereign state    -> /country/turkey
--   venezia            1  Q641     comune of Italy    -> /city/venice-italy
--   spandau            3  Q158083  borough of Berlin  (no target; see below)
--   epsom              1  Q993164  town               (no target)
--   bon-encontre       1  Q24758   commune of France  (no target)
--   qawra              1  Q492737  municipality       (no target)
--   west-hollywood    29  (no QID)                    -> /city/west-hollywood
--   castro-district   11  (no QID)                    -> /villages/castro-district
--   fortitude-valley   1  (no QID)                    -> /villages/fortitude-valley
--
-- THE LAST THREE HAVE NO WIKIDATA ID, SO THE CLASS SWEEP IS STRUCTURALLY BLIND TO THEM.
-- 3,179 of 4,727 active tags carry no QID; P31 cannot see any of them. They were found by the
-- complementary sweep — name-match against live `cities` / `countries` / `queer_villages` rows —
-- run over that whole no-QID cohort. The result is worth recording because it is mostly GOOD
-- news: of every no-QID tag that name-matches a real place, exactly ONE was still indexable
-- (`cuauhtemoc`, the audit's deliberate wrong-sense exclusion, left alone here too), and all the
-- rest were already deindexed by 20270501180000 or by 81000101100000.
--
-- These three were the exception: they sat at reason `thin`, which is the live bomb — the
-- thin-page reindexer republishes exactly that reason the moment prose arrives — and each one
-- duplicates a REAL page with real content (Castro District village 69 venues, West Hollywood
-- city 68 venues, Fortitude Valley village 9 venues). `west-hollywood` is the sharpest: the
-- VILLAGE of that name was hard-merged into the city by 20260928100000, so the tag duplicated a
-- page that had already been de-duplicated once at a different layer.
--
-- The name sweep also proves why name-matching alone may never be the rule: it flags `savage`
-- (a Dynamics & Roles tag; there is a town called Savage) and `color-orange` (there is a city
-- called Orange). Both are correctly NOT touched — this migration acts on an explicit list that
-- was read by hand, never on the predicate.
--
-- `uk` is the interesting one: the 2026-09-04 audit KNEW about it and could not act, noting it
-- "lands in F only because it fails the string match (the row is `United Kingdom`)" and that
-- fuzzy-matching it "must go through §2.3's rule". The class sweep reaches it without any string
-- matching at all, and content mass confirms the target.
--
-- Four of the eight get no redirect because nothing exists to redirect TO. They are still
-- deindexed: a tag with one usage serving Wikipedia's description of a French commune is not
-- doing facet work for anyone, and `place-duplicate` is stamped so the thin-page reindexer can
-- never republish it when prose arrives.
--
-- NOT TOUCHED (5) — regions, and the audit's bucket-E reasoning applies unchanged:
--   wales, queensland, manhattan  (the audit names these explicitly)
--   bali (province of Indonesia), yucatan (state of Mexico)
-- "A region tag grouping content across LA/SF/San Diego is the one thing a Destination tag does
-- that no geo page does." None of the five has a city or country page to duplicate — verified
-- here, not assumed — so deindexing them would remove a working facet and replace it with
-- nothing. A region is not a settlement, and this migration does not quietly widen the rule to
-- cover one.
--
-- NOT TOUCHED (1) — `town`, per the class-vs-instance test above.
--
-- REVERSE
--   update public.unified_tags set seo_indexable = true, seo_deindex_reason = 'thin'
--    where slug in ('uk','espana','turkiye','venezia','spandau','epsom','bon-encontre','qawra',
--                   'west-hollywood','castro-district','fortitude-valley');

do $$
declare
  v_deindex text[] := array['uk','espana','turkiye','venezia','spandau','epsom','bon-encontre',
                            'qawra','west-hollywood','castro-district','fortitude-valley'];
  v_keep    text[] := array['wales','queensland','manhattan','bali','yucatan','town'];
  v_written int; v_leak int; v_lost text;
begin
  perform set_config('app.actor', 'migration:place_tags_p31_residue', true);

  update public.unified_tags t
     set seo_indexable      = false,
         seo_deindex_reason = 'place-duplicate',
         updated_at         = now()
   where t.status = 'active'
     and t.slug = any(v_deindex)
     and (t.seo_indexable is true or t.seo_deindex_reason = 'thin')
     and t.seo_deindex_reason is distinct from 'place-duplicate';
  get diagnostics v_written = row_count;
  raise notice 'p31 residue deindexed: %', v_written;

  -- Postcondition 1: none of the eight may still be indexable.
  select count(*) into v_leak from public.unified_tags
   where status = 'active' and slug = any(v_deindex) and seo_indexable is true;
  if v_leak > 0 then
    raise exception 'postcondition failed: % residue tags still indexable', v_leak;
  end if;

  -- Postcondition 2: the kept set must be UNCHANGED. This is the half that protects a working
  -- facet from a future pass that reads the rule as "deindex anything place-classed" — assert
  -- what must SURVIVE, not only what must change.
  select string_agg(slug, ', ' order by slug) into v_lost
    from public.unified_tags
   where status = 'active' and slug = any(v_keep) and seo_deindex_reason = 'place-duplicate';
  if v_lost is not null then
    raise exception 'bucket E/F tags were deindexed as place duplicates: %', v_lost;
  end if;
end $$;
