-- Eight of the twenty-eight terms 20360401100100 published are invisible to
-- crawlers, and one of them is flagged ADULT. Both are that migration's fault.
--
-- Found by running e2e/tags-theory.spec.ts against prod after the merge: 13 of
-- 22 passed, and the failures were not 404s. The pages return 200 and render —
-- they simply emit no <article>, which is what functions/_lib/detail.ts does for
-- a row with `seo_indexable = false`.
--
-- DEFECT 1 — THE REVIVE NEVER SET `seo_indexable`. 20360401100100's revive
-- UPDATE moved status, human_reviewed, verification_status, merged_into_id,
-- deprecated_at, deprecation_reason and last_verified_at. It did not touch
-- `seo_indexable`, so every row that was deindexed while deprecated stayed
-- deindexed after being published — visible in the SPA, absent from the sitemap,
-- and blank to Googlebot. Nothing self-heals this: `run_tag_thin_page_reindex`
-- only restores rows stamped `seo_deindex_reason = 'thin'`, and these carry no
-- reason at all. Affected: homonationalism, lesbian-feminism, performativity,
-- queer-ecology, social-construction-of-gender, gender-performativity,
-- cisnormativity, sex-positivity.
--
-- DEFECT 2 — DEMOTING A CATEGORY IS NOT LEAVING IT. The refile set
-- `is_primary = false` on the old assignment and inserted the new one, but left
-- the old membership in place. `unified_tags_recompute_is_adult()` is an EXISTS
-- over `tag_category_assignments` and does not look at `is_primary`:
--
--     where tca.tag_id = v_tag_id
--       and (tc.name in ('Sex & Kink','Practices & Play','Dynamics & Roles',
--                        'Fetishes','Gear','Kink Community & Scenes') ...)
--
-- So `cisnormativity` — refiled to Theory & Scholarship precisely BECAUSE
-- "Dynamics & Roles" is the BDSM line and filing a structural analysis of gender
-- there is a category error — is still a member of that line, and therefore
-- still `is_adult = true`. The misfiling the migration set out to correct is what
-- now marks the page adult.
--
-- WHICH MEMBERSHIPS ARE DELETED, AND WHY NOT ALL OF THEM. Only the one that is
-- actually wrong. A tag legitimately belongs to more than one category, and the
-- other leftovers are defensible: homonationalism in Laws & Legal Rights,
-- lesbian-feminism in Movements & Milestones, gender-performativity in
-- Orientation. Those stay. Only cisnormativity → Dynamics & Roles goes, because
-- no reading of cisnormativity makes it a BDSM dynamic.
--
-- `sex-positivity` IS DELIBERATELY LEFT DEINDEXED. It is `is_adult` because it
-- sits in Sex & Kink, which is the correct filing for it — not a leftover. With
-- `human_reviewed = true` the sensitivity gate would permit indexing, so making
-- it crawler-visible is available but it is a PRODUCT decision about adult
-- content and SEO, not a data repair. Left as it is, and named here so the next
-- person sees a decision rather than an oversight.
--
-- The four `is_sensitive = true` flags (performativity, gender-performativity,
-- queer-ecology, social-construction-of-gender) are pre-existing and are NOT
-- cleared here. They are questionable on academic terms, but they do not block
-- anything: `enforce_tag_seo_sensitivity_gate` only deindexes when
-- `human_reviewed IS NOT TRUE`, and `tag_is_anon_gated` only hides a sensitive
-- row when `verification_status` is not 'reviewed'/'locked'. All four are
-- reviewed, so signed-out readers and crawlers both reach them.
--
-- Reversible: seo_indexable and one junction row.

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:revived-tags-stayed-deindexed', true);

do $mig$
declare v_n int; v_bad text;
begin
  ------------------------------------------------- 1. drop the wrong membership
  delete from public.tag_category_assignments a
   using public.unified_tags t, public.tag_categories c
   where a.tag_id = t.id and a.category_id = c.id
     and t.slug = 'cisnormativity'
     and c.slug = 'bdsm-power-exchange'
     and not a.is_primary;
  get diagnostics v_n = row_count;
  raise notice 'cisnormativity: dropped % BDSM membership row(s)', v_n;

  -- The DELETE fires unified_tags_recompute_is_adult, which clears is_adult.
  -- Asserted rather than assumed: the trigger is on the junction table, and a
  -- membership removed by a statement that touched no unified_tags row is
  -- exactly the shape where people expect no recompute.
  select count(*) into v_n from public.unified_tags
   where slug = 'cisnormativity' and is_adult;
  if v_n <> 0 then
    raise exception 'cisnormativity: still is_adult after dropping the BDSM membership';
  end if;

  ------------------------------------------------------- 2. re-index the seven
  -- sex-positivity is excluded by name, not by predicate, so that adding a new
  -- adult term later cannot silently opt itself in.
  update public.unified_tags
     set seo_indexable = true, seo_deindex_reason = null, updated_at = now()
   where slug in ('homonationalism','lesbian-feminism','performativity','queer-ecology',
                  'social-construction-of-gender','gender-performativity','cisnormativity')
     and status = 'active'
     and not seo_indexable;
  get diagnostics v_n = row_count;
  raise notice 'reindexed % revived term(s)', v_n;

  ------------------------------------------------------------------ assertions
  -- The sensitivity gate is a BEFORE trigger: if any of these were still
  -- is_adult/is_sensitive without human_reviewed it would have silently forced
  -- the flag back to false, and the UPDATE above would report success anyway.
  select string_agg(slug, ', ') into v_bad
    from public.unified_tags
   where slug in ('homonationalism','lesbian-feminism','performativity','queer-ecology',
                  'social-construction-of-gender','gender-performativity','cisnormativity')
     and not seo_indexable;
  if v_bad is not null then
    raise exception 'revived tags: still deindexed after the update: %', v_bad;
  end if;

  -- Corpus invariant: nothing indexable may lack prose. These rows all carry a
  -- description, but the gate is cheap to restate and this migration is the one
  -- flipping the flag.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_n <> 0 then
    raise exception 'revived tags: % indexable row(s) corpus-wide have no description', v_n;
  end if;

  -- And the deliberate exclusion is still excluded, so a later edit that
  -- quietly adds it has to change this line too.
  select count(*) into v_n from public.unified_tags
   where slug = 'sex-positivity' and seo_indexable;
  if v_n <> 0 then
    raise exception 'sex-positivity was indexed; that is a product decision, not this migration';
  end if;
end
$mig$;
