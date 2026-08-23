-- Tag DQ Phase 1.3 — disposition of the uncategorized tail.
--
-- THE PLAN'S PREMISE WAS WRONG. It says: assign categories to the 136 active
-- tags with no category_id. Measured on prod 2026-08-22, most of them should
-- not receive a category because they should not be public tags at all:
--
--   136 uncategorized active tags
--   111  zero usage, zero assignments, no description, no wikidata_id
--   127  seo_indexable -> a live /tags/<slug> page (all return HTTP 200)
--     -  aha, alkohol, bingo, busfahrer, dachdecker confirmed in sitemap-tags.xml
--
-- The population is German profession/title strings that leaked in as tags
-- (busfahrer, dachdecker, hochschulprofessor, konig-von-preuen), bare junk
-- (die, aha, 30, guided), and tags whose Wikidata link resolves to a DIFFERENT
-- entity whose prose is already published: `bingo` reads "Bingo, Bluey's
-- younger sister", `alkohol` is a 1919 German silent film, `fetisch` a
-- post-punk album, `kerle` "is a surname".
--
-- tag_language_guard does not catch any of this. Its message says the name
-- "must be English" but the check only rejects NON-LATIN scripts (Greek,
-- Cyrillic, Arabic, Devanagari, Thai, CJK, Hangul). German is Latin, so it
-- passes untouched. Same defect class as the professions corpus.
--
-- Three dispositions, all reversible, and the destructive one is NOT a bare
-- predicate -- a predicate over "zero usage + no description" would have
-- deprecated `zwangsouting` (forced outing), `lavenderscare`, `suizid` and
-- `mordopfer-hassverbrechen`, which are queer history and safety concepts that
-- happen to be unused. Every keep and every merge below is hand-reviewed.
--
-- DEPENDS ON 20260919100000. Part B writes category_id, which fails with 27000
-- until that migration's trigger split lands -- confirmed by hitting it during
-- this migration's own dry run.
--
-- Dry run on prod (rolled back, with 20260919100000 applied in the same
-- transaction): 19 merged, 0 skipped, 86 deprecated, 22 uncategorized non-facet
-- tags left (the keep list, plus rows that have a description or QID but no
-- category), active tags 2,893 -> 2,788. Redirect rows pointing at a
-- non-canonical tag: 58 before, 58 after -- this adds none. (Those 58 are a
-- pre-existing defect, not introduced here.)

-- ---------------------------------------------------------------------------
-- A) German duplicates of a LIVE English tag -> merge, which also mints the
-- /tags/<german-slug> -> /tags/<english-slug> 301 via tag_slug_redirects.
--
-- Unlike the Phase 0.1 twin merges, NO FIELDS ARE COPIED from the duplicate.
-- There the pair shared a QID and copying filled gaps; here several duplicates
-- carry a WRONG-ENTITY wikidata_id and its prose, so copying would poison a
-- good tag with a film/album/surname. merge_tag_concept moves links only.
--
-- Targets are resolved to the END of the merge chain: `bears` and
-- `crystal-meth` are themselves merged (into `bear` and `methamphetamine`), and
-- single-hop resolution means merging into them would 301 into a tag that is
-- not canonical.
do $$
declare
  v_pairs text[][] := array[
    -- canonical (active, live)      duplicate (German)
    ['alcohol',      'alkohol'],        -- dup QID is a 1919 silent film
    ['aromantic',    'aromantisch'],
    ['fetish',       'fetisch'],        -- dup QID is an Xmal Deutschland album
    ['fisting',      'fisten'],
    ['football',     'fu-ball'],
    ['martial-arts', 'kampfsport'],
    ['kink',         'kinky'],
    ['ballroom',     'ballroom-ikone'],
    ['concert',      'konzert'],
    ['lesbian',      'lesben'],
    ['mixed-crowd',  'mixed'],
    ['non-binary',   'nichtbin-r'],
    ['politics',     'politik'],
    ['sex-positive', 'sexpositiv'],
    ['bdsm',         'sm'],
    ['walking-tour', 'stadttour'],
    ['outing',       'zwangsouting'],
    ['bear',           'b-ren'],        -- chain end: bears -> bear
    ['methamphetamine','crystalmeth']   -- chain end: crystal-meth -> methamphetamine
  ];
  v_pair text[]; v_canon uuid; v_dup uuid; v_merged int := 0;
begin
  perform set_config('app.actor', 'migration:20260919110000_tag_uncategorized_disposition', true);

  foreach v_pair slice 1 in array v_pairs loop
    select id into v_canon from unified_tags
     where slug = v_pair[1] and status = 'active' and merged_into_id is null;
    select id into v_dup from unified_tags
     where slug = v_pair[2] and status = 'active' and merged_into_id is null;
    if v_canon is null then
      -- Never merge into a deprecated or merged target: tag_slug_redirects
      -- would then be a 301 into a 404.
      raise notice 'skip % <- %: canonical is not an active canonical tag', v_pair[1], v_pair[2];
      continue;
    end if;
    if v_dup is null then
      raise notice 'skip % <- %: duplicate already gone', v_pair[1], v_pair[2];
      continue;
    end if;
    perform merge_tag_concept(v_canon, v_dup);
    v_merged := v_merged + 1;
  end loop;

  raise notice 'phase 1.3 A: % german duplicates merged', v_merged;
end $$;

-- ---------------------------------------------------------------------------
-- B) Real tags that simply lacked a category.
--
-- The six mat-* marketplace facet tags are deliberately left uncategorized:
-- 20260802105740 pulled them OUT of Sexuality & Kink and asserts they must not
-- be is_adult. Giving them a category here risks re-tripping that. They are
-- high-usage (mat-silicone 4,197) and correct as they are.
do $$
declare v_updated int;
begin
  perform set_config('app.actor', 'migration:20260919110000_tag_uncategorized_disposition', true);

  update unified_tags u set category_id = c.id
    from tag_categories c
   where u.slug = 'fashion' and c.slug = 'expression-presentation'
     and u.status = 'active' and u.category_id is null;

  update unified_tags u set category_id = c.id
    from tag_categories c
   where u.slug = 'sex-work' and c.slug = 'sexual-health'
     and u.status = 'active' and u.category_id is null;

  -- FLINTA* is used in English too; it is a real identity term, not a German
  -- import artifact, and is the one zero-usage tag in this tail worth keeping.
  update unified_tags u set category_id = c.id
    from tag_categories c
   where u.slug = 'flinta' and c.slug = 'gender-identity'
     and u.status = 'active' and u.category_id is null;

  get diagnostics v_updated = row_count;
  raise notice 'phase 1.3 B: categorized fashion / sex-work / flinta';
end $$;

-- ---------------------------------------------------------------------------
-- C) Deprecate the residue: German profession/title strings and bare tokens.
--
-- Reversible (status flip + seo_indexable), and deliberately NOT a hard delete:
-- these carry no content worth destroying but the decision should be undoable.
-- Deprecating also drops them from sitemap-tags.xml, which filters
-- status=eq.active.
--
-- The KEEP list below is the load-bearing part. Everything in it is unused and
-- undescribed and would otherwise match the predicate, but each is a real queer
-- history or safety concept, or has no English tag to merge into yet.
do $$
declare
  v_keep text[] := array[
    'flinta',                              -- categorized above
    'asexuell',                            -- `asexual` is DEPRECATED; merging would 301 into a 404
    'lavenderscare', 'lavenderscare-suizid', -- `lavender-scare` is DEPRECATED, same problem
    'suizid',                              -- no English tag exists; safety-adjacent, not junk
    'mordopfer-hassverbrechen',            -- hate-crime murder victim
    'gewaltverbrechen', 'gewaltverbrechen-kriminell', -- violent crime
    'sexualisierte',                       -- sexualised (violence) — incomplete but not junk
    'siegessaeule-bars'                    -- Siegessäule is Berlin's queer magazine
  ];
  v_slugs text[]; v_count int;
begin
  perform set_config('app.actor', 'migration:20260919110000_tag_uncategorized_disposition', true);

  select array_agg(slug order by slug) into v_slugs
    from unified_tags
   where status = 'active' and merged_into_id is null and category_id is null
     and coalesce(usage_count, 0) = 0
     and wikidata_id is null
     and coalesce(nullif(btrim(description), ''), short_description) is null
     and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'
     and not (slug = any(v_keep))
     and not exists (select 1 from unified_tag_assignments a where a.tag_id = unified_tags.id)
     and not human_reviewed;

  v_count := coalesce(array_length(v_slugs, 1), 0);

  -- Sanity band. Measured 111 matched the predicate before the keep list and
  -- the part-A merges; anything far outside means the corpus moved under this
  -- migration and it should stop rather than deprecate an unreviewed set.
  if v_count > 120 then
    raise exception 'phase 1.3 C: % tags matched, expected <=120 — refusing to deprecate an unreviewed set', v_count;
  end if;

  update unified_tags
     set status = 'deprecated',
         deprecated_at = now(),
         deprecation_reason = 'tag-dq-phase-1.3: German profession/title string or bare token imported as a tag; no usage, no description, no Wikidata entity',
         seo_indexable = false
   where slug = any(v_slugs);

  raise notice 'phase 1.3 C: deprecated % tags: %', v_count, array_to_string(v_slugs, ', ');
end $$;

-- ---------------------------------------------------------------------------
-- Post-conditions.
do $$
declare v_uncat int; v_bad_redirect int;
begin
  select count(*) into v_uncat from unified_tags
   where status='active' and merged_into_id is null and category_id is null
     and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-';
  raise notice 'uncategorized active non-facet tags remaining: %', v_uncat;

  -- No redirect may point at a tag that is not an active canonical, or the
  -- 301 lands on a 404. This is the trap that made 144 merged tags soft-404.
  select count(*) into v_bad_redirect
    from tag_slug_redirects r
    join unified_tags t on t.id = r.tag_id
   where t.status <> 'active' or t.merged_into_id is not null;
  if v_bad_redirect > 0 then
    raise warning '% tag_slug_redirects rows point at a non-canonical tag', v_bad_redirect;
  end if;
end $$;
