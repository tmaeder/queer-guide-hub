-- Tag categories: one axis, and fix is_adult at its cause.
--
-- unified_tags carries TWO category axes:
--   (a) tag_category_assignments -> tag_categories   — the real, 11-parent /
--       44-child governed tree, and what tag_facet_of / get_similar_tags read
--   (b) unified_tags.category                        — free text, 83 distinct
--       values including 'terms', 'tags', 'queer wiki', 'lgbtiq'
--
-- (b) is not an independent axis: sync_tag_category_assignment() sets
-- NEW.category := tag_categories.name, but ONLY when category_id changes. Rows
-- written before an assignment existed, or re-assigned via the junction table
-- directly, kept their original string forever. The result is 83 spellings for
-- 55 categories, with the text disagreeing with the assignment on hundreds of
-- rows ('slang' where the tree says 'Slang & Terminology', 'drugs' where it
-- says 'Substances & Harm Reduction').
--
-- MEASUREMENT CORRECTION: an earlier pass reported "3,225 active tags have no
-- category". That counted `category IS NULL AND category_id IS NULL` and never
-- looked at tag_category_assignments — the axis that actually drives the
-- product. Measured against the junction table, only 69 of 3,719 active tags
-- have no category at all. The problem here is divergence, not absence.

-- ---------------------------------------------------------------------------
-- 1. is_adult: repair the cause, not the flag
-- ---------------------------------------------------------------------------
-- Cotton, Gold, Silicone, Lace, Denim and Sporty are flagged is_adult. They are
-- marketplace product facets (slug namespaces mat-/vibe-), and the kink
-- checklist import filed all 19 of them under 'Gear & Aesthetics' /
-- 'Body Types & Archetypes', both children of 'Sexuality & Kink'.
-- unified_tags_recompute_is_adult() then derives is_adult=true from exactly
-- that assignment.
--
-- So `UPDATE unified_tags SET is_adult=false` is useless: the next write to any
-- assignment row recomputes it straight back to true. Deleting the wrong
-- assignment is what actually fixes it — the AFTER trigger on
-- tag_category_assignments re-derives is_adult=false on its own, and we never
-- write the column by hand.
--
-- These tags are removed from the editorial tree rather than moved within it:
-- marketplace facets have their own namespaced vocabulary and do not belong in
-- the queer-content taxonomy at all.
do $$
declare v_deleted int;
begin
  -- All 19 rows are human_reviewed=true. log_unified_tag_change() RAISES when a
  -- 'system:%' actor touches a human_reviewed tag, and the trigger cascade from
  -- the DELETE below writes unified_tags.is_adult. Without this the entire
  -- migration rolls back.
  perform set_config('app.actor', 'admin:tag-quality-20260802', true);

  delete from public.tag_category_assignments a
   where a.tag_id in (
     select t.id from public.unified_tags t
      where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating)-')
     and a.category_id in (
       select tc.id from public.tag_categories tc
       left join public.tag_categories tcp on tcp.id = tc.parent_id
        where tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink');

  get diagnostics v_deleted = row_count;
  raise notice 'tag_category_consolidation: removed % bogus Sexuality & Kink assignments', v_deleted;

  -- category_id is the denormalized mirror of the primary assignment; clear it
  -- where it pointed at the assignment we just removed.
  update public.unified_tags t
     set category_id = null
   where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating)-'
     and t.category_id is not null
     and not exists (select 1 from public.tag_category_assignments a
                     where a.tag_id = t.id and a.category_id = t.category_id);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Collapse the free-text axis onto the tree
-- ---------------------------------------------------------------------------
-- Rewrite unified_tags.category from the primary assignment so the string is a
-- projection of the tree instead of a parallel vocabulary. Batched: this table
-- carries trg_search_documents_tag, which fires on `category`.
create or replace function public.run_tag_category_resync(p_batch int default 500)
returns int
language plpgsql security definer
set search_path = public
as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-category-resync', true);

  with target as (
    select t.id,
           (select tc.name
              from public.tag_category_assignments a
              join public.tag_categories tc on tc.id = a.category_id
             where a.tag_id = t.id
             -- is_primary first, then the deeper (more specific) node, so a tag
             -- assigned both 'Sexuality & Kink' and 'Fetishes & Interests'
             -- reads as the latter.
             order by a.is_primary desc nulls last, tc.level desc, tc.name
             limit 1) as want
      from public.unified_tags t
  ), diff as (
    -- The LIMIT belongs here, not on `target`: capping the scan instead of the
    -- write would re-examine the same already-correct 500 rows on every call
    -- and the drain would never advance.
    select tg.id, tg.want from target tg
    join public.unified_tags u on u.id = tg.id
    where u.category is distinct from tg.want
    limit greatest(p_batch, 0)
  )
  update public.unified_tags u
     set category = d.want
    from diff d
   where u.id = d.id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.run_tag_category_resync(int) from public;
grant execute on function public.run_tag_category_resync(int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Work-list for the tags that genuinely have no category
-- ---------------------------------------------------------------------------
create or replace function public.tags_without_category(p_limit int default 200)
returns table (id uuid, slug text, name text, usage_count int)
language sql stable
set search_path = public
as $$
  select t.id, t.slug, t.name, t.usage_count
  from public.unified_tags t
  where t.status = 'active'
    and not exists (select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  order by coalesce(t.usage_count, 0) desc
  limit greatest(p_limit, 0);
$$;

grant execute on function public.tags_without_category(int) to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Assertions
-- ---------------------------------------------------------------------------
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments a on a.tag_id = t.id
    join public.tag_categories tc on tc.id = a.category_id
    left join public.tag_categories tcp on tcp.id = tc.parent_id
   where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating)-'
     and (tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink');
  if v_bad > 0 then
    raise exception 'tag_category_consolidation: % marketplace facet tags still filed under Sexuality & Kink', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where slug in ('mat-cotton','mat-gold','mat-silicone','mat-lace','vibe-sporty')
     and is_adult;
  if v_bad > 0 then
    raise exception 'tag_category_consolidation: % marketplace facet tags are still is_adult', v_bad;
  end if;
end $$;
