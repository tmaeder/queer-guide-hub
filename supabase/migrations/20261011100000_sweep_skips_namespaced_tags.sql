-- The nightly sweep re-files marketplace attribute tags into the glossary
-- every two hours, and unfiling them is what taught it to.
--
-- `20261006170000` removed the glossary filing from 92 namespaced tags
-- (`mat-`/`vibe-`/`color-`/`size-`/`genre-`/`fit-`/…), which is the
-- established rule: a marketplace facet belongs to NO glossary category.
-- What that migration did not do is tell the selector. `tags_due_for_category`
-- returns any active tag with no assignment at all, so unfiling those 92 did
-- not retire them — it promoted them to the head of the sweep's work list.
--
-- Measured: the `0 */2 * * *` sweep ran at 2026-08-29 12:00:20 and re-filed
-- 30 of them in one batch — `mat-denim` (659 uses) and `size-xs` back under
-- Expression & Presentation, `genre-horror` under Subcultures, `color-rainbow`
-- under Symbols & Flags. Left alone it would take the rest on the following
-- passes, and keep re-filing them after every future unfile.
--
-- The exclusion is not new and did not need designing: `tags_without_category`
-- has carried exactly this predicate since `20260802124310`. The two functions
-- ask the same question — "which active tags have no category?" — and only one
-- of them knew the answer excludes marketplace facets. Reporting and WORK
-- SELECTION disagreeing about a work-list is the actual defect; the sweep was
-- doing exactly what it was told.

set local statement_timeout = '600s';

create or replace function public.tags_due_for_category(p_limit integer default 20, p_random boolean default false)
returns table(id uuid, name text, is_sensitive boolean, is_adult boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT t.id, t.name, t.is_sensitive, t.is_adult
  FROM public.unified_tags t
  WHERE t.status = 'active'
    -- Marketplace facets are keyed by slug PREFIX and belong to no glossary
    -- category. Same predicate as tags_without_category(); keep them in step.
    AND t.slug !~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
    AND NOT EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id = t.id)
  ORDER BY
    CASE WHEN p_random THEN random() END,
    t.quality_score ASC NULLS FIRST, t.id
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$function$;

comment on function public.tags_due_for_category(integer, boolean) is
  'Work list for the category sweep: active tags with no assignment, EXCLUDING marketplace-namespaced slugs (they belong to no glossary category). Mirrors tags_without_category() — change both together.';

-- Undo what the 12:00 pass filed.
do $$
declare v_unfiled int; v_left int;
begin
  perform set_config('app.actor', 'migration:20261011100000_sweep_skips_namespaced_tags', true);

  delete from tag_category_assignments a
  using unified_tags t
  where t.id = a.tag_id
    and t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-';
  get diagnostics v_unfiled = row_count;

  update unified_tags
     set category_id = null, category = null
   where slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
     and (category_id is not null or category is not null);

  select count(*) into v_left from unified_tags t
   where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
     and t.status = 'active'
     and (t.category_id is not null or t.category is not null
          or exists (select 1 from tag_category_assignments a where a.tag_id = t.id));
  if v_left > 0 then
    raise exception 'namespaced re-unfile: % still filed', v_left;
  end if;

  -- The selector must no longer offer them, or the sweep re-files them in
  -- two hours and this migration is a no-op with extra steps.
  if exists (
    select 1 from public.tags_due_for_category(50, false) d
    join public.unified_tags t on t.id = d.id
    where t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-') then
    raise exception 'namespaced re-unfile: the selector still offers namespaced tags';
  end if;

  raise notice 'namespaced re-unfile: removed % assignment(s)', v_unfiled;
end $$;
