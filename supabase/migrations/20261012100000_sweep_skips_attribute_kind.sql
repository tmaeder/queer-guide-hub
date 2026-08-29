-- The sweep skips PREFIXED marketplace facets and still re-files the
-- un-prefixed twins, because the exclusion I added keyed on the wrong thing.
--
-- 20261011100000 taught `tags_due_for_category` to skip slugs matching
-- `^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-`. That covers
-- the facets themselves. It does not cover the three UN-prefixed twins
-- 20261006140100 unfiled for the same reason — `lace`, `denim`, `spandex`,
-- which are the same product attributes under bare slugs, kept apart from
-- `mat-lace` / `mat-denim` / `mat-spandex` only by the prefix the exclusion
-- reads.
--
-- Observed, not predicted: the `0 */2 * * *` sweep ran at 2026-08-29 14:00:04
-- with the prefix exclusion live, correctly skipped every prefixed facet, and
-- filed `Lace` under Expression & Style anyway.
--
-- The durable key is the one the corpus already carries: `entity_kind`. The
-- re-filing pass stamped these `attribute`, which is a POSITIVE marker for
-- "deliberately has no glossary category" — unlike an empty category column,
-- which is indistinguishable from "not yet categorised" and is what put these
-- rows at the head of the work list to begin with. Excluding on the marker
-- rather than on the slug shape closes both halves and needs no list.
--
-- Scope is three rows today, and the point is not the three: it is that a
-- cleanup which clears a field, on a corpus with a cron that fills that field,
-- is a loop until the selector is taught the difference.

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
    -- Marketplace facets belong to no glossary category. Two spellings of the
    -- same fact: the slug namespace, and the entity_kind the re-filing pass
    -- stamped on the un-prefixed twins. Mirrors tags_without_category() on the
    -- prefix arm — change both together.
    AND t.slug !~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
    AND t.entity_kind IS DISTINCT FROM 'attribute'
    AND NOT EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id = t.id)
  ORDER BY
    CASE WHEN p_random THEN random() END,
    t.quality_score ASC NULLS FIRST, t.id
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$function$;

comment on function public.tags_due_for_category(integer, boolean) is
  'Work list for the category sweep: active tags with no assignment, excluding marketplace facets by BOTH the slug namespace and entity_kind=attribute (the positive marker for "deliberately uncategorised"). Mirrors tags_without_category() on the prefix arm.';

do $$
declare v_unfiled int; v_offered int;
begin
  perform set_config('app.actor', 'migration:20261012100000_sweep_skips_attribute_kind', true);

  -- Undo what the 14:00 pass filed onto attribute-kind tags.
  delete from tag_category_assignments a
  using unified_tags t
  where t.id = a.tag_id and t.entity_kind = 'attribute';
  get diagnostics v_unfiled = row_count;

  update unified_tags
     set category_id = null, category = null
   where entity_kind = 'attribute'
     and (category_id is not null or category is not null);

  -- The selector must no longer offer them, or the sweep refills in two hours
  -- and this migration is a no-op with extra steps.
  select count(*) into v_offered
    from public.tags_due_for_category(50, false) d
    join public.unified_tags t on t.id = d.id
   where t.entity_kind = 'attribute'
      or t.slug ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-';
  if v_offered > 0 then
    raise exception 'attribute exclusion: selector still offers % facet tag(s)', v_offered;
  end if;

  raise notice 'attribute exclusion: unfiled % assignment(s)', v_unfiled;
end $$;
