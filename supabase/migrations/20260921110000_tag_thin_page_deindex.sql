-- Tag DQ Phase 2 — descriptions.
--
-- The plan says: fill 960 empty descriptions from Wikipedia, LLM-assisted,
-- budget-capped, sensitive tags review-gated. Measured on prod 2026-08-23 that
-- plan cannot run, and for the largest bucket it is the wrong prescription.
--
-- ## There is nothing to ground a description in
--
--   889 active tags have no description or short_description
--     1  has a wikidata_id
--     1  has a wikipedia_url
--     0  have long_description
--     0  have description_i18n
--
-- A Wikipedia-grounded filler can reach exactly ONE of them. The blocker is not
-- generation, it is entity resolution — and this corpus has already been burned
-- by a blind resolver: `bingo` was linked to "Bingo, Bluey's younger sister",
-- `alkohol` to a 1919 silent film, `fetisch` to an Xmal Deutschland album and
-- `kerle` to "Kerle is a surname", all with that entity's prose published on a
-- queer glossary. Those four were disposed of in 20260919130000. Re-running the
-- pass that created them, at 888x the scale, is not the fix.
--
-- ## For the largest bucket, prose is the wrong answer entirely
--
-- The biggest category among the 889 is venues-nightlife (220). Its top members
-- by usage are: Adult-Entertainment, Dance-Club, Us-Venue, Social-Spot,
-- Gay-Sauna, LGBTQ-Club, LGBTQ-Venue, Night-Life, LGBTQ-Bar, LGBTQ-Nightlife,
-- Gay-Club, Adult-Store. These are machine-generated near-duplicates of one
-- another. They do not need 220 encyclopedia entries; they need consolidation,
-- which is Phase 0.1's twin-merge treatment applied to semantic rather than
-- lexical twins. Writing prose for each would entrench the duplication.
--
-- ## What is both safe and worth doing now
--
-- 869 of the 889 are seo_indexable, so the sitemap advertises 869 public pages
-- with a heading and no content. That is a thin-content problem we can fix
-- without inventing a single word: stop indexing a tag until it has prose.
--
-- Exact precedent in this codebase — 20260821051221 did the same for cities:
-- zero-content stub cities are deindexed by design, and re-indexed automatically
-- when they gain content. This mirrors it, including the self-healing half:
-- write a description and the tag becomes indexable again on the next sweep.
--
-- Facet tags (mat-/vibe-/occ-/...) are marketplace filter labels, not glossary
-- entries; they are deindexed on the same grounds and will never gain prose.

create or replace function public.run_tag_thin_page_reindex(p_batch int default 400)
returns table (deindexed int, reindexed int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_off int := 0; v_on int := 0;
begin
  perform public.assert_admin_or_internal();
  -- unified_tags carries an unscoped audit trigger and a column-scoped search
  -- trigger; batch so a sweep cannot storm either.
  set local statement_timeout = '120s';
  perform set_config('app.actor', 'job:tag_thin_page_reindex', true);

  -- Deindex: public, indexable, and nothing to read.
  with cand as (
    select id from unified_tags
     where status = 'active' and merged_into_id is null
       and seo_indexable
       and coalesce(nullif(btrim(description), ''), short_description) is null
     order by id
     limit greatest(p_batch, 0)
  )
  update unified_tags u set seo_indexable = false
    from cand where u.id = cand.id;
  get diagnostics v_off = row_count;

  -- Re-index: the self-healing half. A tag that has since gained prose comes
  -- back. Without this the deindex is a one-way door and every future
  -- description would need a manual flag flip.
  with cand as (
    select id from unified_tags
     where status = 'active' and merged_into_id is null
       and not seo_indexable
       and coalesce(nullif(btrim(description), ''), short_description) is not null
       -- Only reverse OUR decision. A tag deindexed for sensitivity by
       -- enforce_tag_seo_sensitivity_gate must stay deindexed no matter how
       -- much prose it acquires.
       and not is_sensitive and not is_adult
     order by id
     limit greatest(p_batch, 0)
  )
  update unified_tags u set seo_indexable = true
    from cand where u.id = cand.id;
  get diagnostics v_on = row_count;

  deindexed := v_off; reindexed := v_on;
  return next;
end;
$fn$;

comment on function public.run_tag_thin_page_reindex(int) is
  'Deindexes active tags that have no description (thin public pages advertised in sitemap-tags.xml) and re-indexes them once they gain prose. Mirrors the city stub treatment in 20260821051221. Does not touch tags deindexed for sensitivity.';

revoke all on function public.run_tag_thin_page_reindex(int) from public, anon;
grant execute on function public.run_tag_thin_page_reindex(int) to authenticated, service_role;

-- Track the thin-page count so the ratchet can see it grow.
create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    'image_without_license', (
      select count(*) from active where image_url is not null and image_license is null),
    'commons_image_without_license', (
      select count(*) from active
       where image_url like 'https://upload.wikimedia.org/%' and image_license is null),
    'image_alt_column_empty', (
      select count(*) from active where image_url is not null
        and nullif(btrim(image_alt), '') is null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    -- Renamed from indexable_without_description: after the deindex sweep this
    -- is the number that must stay at zero, and it is now a real invariant
    -- rather than a backlog — a NEW thin page becoming indexable is a bug.
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),

    -- Phase 4 scope marker, measured not fixed. `events` does not use the
    -- unified tag system at all: 35,131 events carry a free-text tags[] array
    -- and unified_tag_assignments holds ZERO rows with entity_type='event'.
    -- Of 535 distinct strings in that array, 363 resolve to no tag at all —
    -- and they are German-heavy in exactly the way the Phase 1.3 tail was
    -- (1920er, ableismus, aidshilfe, ausstellungen, austellung/ausstellung,
    -- ballet/ballett). The plan estimated "40 of 80 distinct strings
    -- unresolved"; it is 363 of 535. Reconciling them needs the same
    -- hand-reviewed disposition that made Phase 1.3 safe, at 363x the size, so
    -- it is tracked here rather than guessed at.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (
        select 1 from unified_tags u
         where lower(u.name) = e.s or lower(u.slug) = e.s))
  ) into v;

  return v;
end;
$fn$;
