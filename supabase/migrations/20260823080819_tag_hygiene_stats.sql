-- Tag DQ Phase 5 — the sentinel that stops the regrowth.
--
-- Phase 0 fixed the tag corpus and the image gaps got WORSE while it ran:
-- between the 2026-08-22 audit and 2026-08-23, tags with an image but no
-- license went 1,167 -> 1,215 and tags with no image at all 982 -> 1,060. Every
-- other Phase 0/1 number improved. Nothing was watching, so new tags kept
-- arriving with the same defects the program was busy removing.
--
-- One read-only function, one row, called by scripts/check-tag-hygiene.mjs and
-- rendered on /admin/tags. It is deliberately NOT a scheduled job that writes
-- anything: `unified_tags` carries an unscoped audit trigger and a
-- column-scoped search trigger, so a nightly write over the corpus would churn
-- both for a number nobody reads between CI runs.
--
-- CORRECTION 2026-08-24: "and rendered on /admin/tags" was a plan, not a
-- description, and stayed false for a month — `grep -rn tag_hygiene_stats src`
-- returned nothing at all, not even a generated types.ts entry. That mattered
-- because it silently changed what the six `_advisory` metrics in
-- scripts/tag-hygiene-baseline.json mean: they WARN instead of failing on the
-- stated ground that they are watched somewhere, and the only place they
-- surfaced was a console line on a PASSING CI run. `events_with_tags_unlinked`
-- is the drain gauge for run_event_tag_link and is supposed to be read as a
-- trend to zero; nobody could read it.
--
-- The route was wrong too, and would have sent a reader to a page that cannot
-- carry this: `/admin/tags` is a `<Navigate>` to `/admin/content/unified_tags`,
-- the generic CMS entity table. Every tag quality panel — TagQualityPanel,
-- TagVocabularyHealthPanel, SensitiveTagReviewPanel, TagSuggestionsReviewPanel
-- — actually lives in `src/pages/admin/AdminTags.tsx`, which is mounted at
-- **/admin/settings** and labelled "Vocabularies" in the admin nav. The new
-- TagHygienePanel is rendered there with its siblings; its metric set is pinned
-- to this function's jsonb keys by
-- src/lib/__tests__/tagHygienePanelMetrics.test.ts, so a counter added below
-- fails CI until the panel renders it.
--
-- Every metric is a COUNT OF THINGS THAT SHOULD BE ZERO, so the ratchet in CI
-- is a plain "not worse than the committed baseline" comparison and a new
-- metric can be added without teaching the script what "good" means.

create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v jsonb;
begin
  -- Same gate as admin_content_graph(): SECURITY DEFINER granted to
  -- `authenticated` would otherwise let any signed-in user read it.
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  )
  select jsonb_build_object(

    -- Context, not a gate. The ratchet ignores keys under 'totals'.
    'totals', jsonb_build_object(
      'active_tags',   (select count(*) from active),
      'categories',    (select count(*) from tag_categories),
      'assignments',   (select count(*) from unified_tag_assignments)
    ),

    -- Every one of these is a defect count and must not grow.
    'uncategorized_active', (
      -- mat-/vibe-/occ-... facet tags are uncategorized on purpose
      -- (20260802105740 pulled them out of Sexuality & Kink); excluded so the
      -- gate does not demand a category that must not be given.
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),

    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),

    'image_without_license', (
      select count(*) from active where image_url is not null and image_license is null),

    'image_without_alt', (
      -- Accessibility, not metadata: a tag image with no alt text is a WCAG
      -- 1.1.1 failure on every page that renders it.
      select count(*) from active where image_url is not null
        and nullif(btrim(image_alt), '') is null),

    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),

    'nonclean_entity_type', (
      -- 20260916113000 normalizes these at write; this is the proof it holds.
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),

    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1
      ) d),

    'redirect_to_non_canonical', (
      -- A 301 into a 404. PR #2828 fixed this class once and it has regrown to
      -- 58; the baseline records that rather than pretending it is zero.
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),

    'sensitive_without_description', (
      -- A sensitive or adult tag with no prose is a bare label on a public
      -- page, which is exactly where context matters most.
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),

    'indexable_without_description', (
      -- Thin public pages: seo_indexable with nothing to read.
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null)
  ) into v;

  return v;
end;
$fn$;

comment on function public.tag_hygiene_stats() is
  'Read-only tag data-quality counters. Every key outside "totals" is a defect count that must not grow; scripts/check-tag-hygiene.mjs ratchets them against scripts/tag-hygiene-baseline.json.';

revoke all on function public.tag_hygiene_stats() from public, anon;
grant execute on function public.tag_hygiene_stats() to authenticated, service_role;
