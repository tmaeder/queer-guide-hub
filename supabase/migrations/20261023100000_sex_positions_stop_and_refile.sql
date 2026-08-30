-- Positions: a new stop on the Sex & Kink line, plus the four tags that were
-- already the same concept filed under Fetishes.
--
-- WHY A NEW STOP AND NOT "Practices & Play": a position is a body arrangement,
-- not a practice. The v3 taxonomy's organising rule is that each stop is
-- homogeneous in KIND, and mixing ~160 arrangements into the 255-tag practice
-- stop is the same kind-mismatch that put Sauna under Fetishes.
--
-- THE AGE GATE NEEDS NO SQL EDIT HERE, AND THAT IS MEASURED, NOT ASSUMED.
-- unified_tags_recompute_is_adult() gates on
--     tc.name in (...) or tcp.name = 'Sex & Kink'
-- and that second PARENT arm covers any new stop on this line. Verified in a
-- rolled-back transaction on prod before this migration was written: a tag
-- inserted into the new stop came back is_adult=true, seo_indexable=false.
-- The frontend twin ADULT_CATEGORY_NAMES has NO parent arm, so it does not
-- inherit and 'Positions' is added there explicitly in the same PR, guarded by
-- a table test in categoryMeta.test.ts.

select set_config('app.actor', 'migration:sex-positions-stop-and-refile', false);

-- ── 1. the stop ─────────────────────────────────────────────────────────────
-- level 1 + parent_id is enforced by tag_categories_parent_level_check.
-- Sibling stops on this line run sort_order 1..5, so Positions takes 6.
insert into tag_categories (name, slug, description, parent_id, level, sort_order)
select 'Positions',
       'sex-positions',
       'Named sex positions — the body arrangement itself, distinct from the practice',
       c.id, 1, 6
from tag_categories c
where c.slug = 'sex-kink'
on conflict (slug) do nothing;

do $$
begin
  if not exists (select 1 from tag_categories where slug = 'sex-positions') then
    raise exception 'Positions stop was not created (is the sex-kink line missing?)';
  end if;
end $$;

-- ── 2. re-file the four tags that are already this concept ──────────────────
-- 69 / Doggy Style / Double Penetration / Triple Penetration all sit under
-- Fetishes. They are positions, and leaving them there would mean the import
-- either duplicates them (two active tags sharing a name is the twin-key
-- defect that already broke 21 lookup keys in run_tag_assignment_reconcile)
-- or silently skips them.
--
-- All four are human_reviewed=true, so log_unified_tag_change() RAISEs for any
-- actor matching 'system:%'. That is what the set_config above is for.
--
-- Writing category_id is the correct lever: the BEFORE trigger derives the
-- `category` text and the AFTER trigger moves the primary junction row. The
-- text is named explicitly anyway because trg_search_documents_tag is column-
-- scoped and would not fire on a category_id-only update.
update unified_tags t
   set category_id = c.id,
       category    = c.name
from tag_categories c
where c.slug = 'sex-positions'
  and t.slug in ('69', 'doggy-style', 'double-penetration', 'triple-penetration')
  and t.category_id is distinct from c.id;

-- The AFTER trigger DEMOTES the old primary but never deletes it, and
-- unified_tags_recompute_is_adult() reads EVERY assignment row, so a stale
-- row would keep these double-filed. Remove every junction that is not the
-- new stop.
--
-- DELIBERATELY NOT SCOPED TO 'fetishes-interests'. It was, and that was wrong:
-- between writing this migration and shipping it, a concurrent session re-filed
-- `69` and `doggy-style` from Fetishes to Practices & Play and left the old
-- Fetishes row behind, so both tags now carry TWO junctions. A delete naming
-- one category would have cleared Fetishes, left Practices & Play standing, and
-- then failed this migration's own "no junction outside the stop" check. Any
-- category but the destination is stale by definition, so say that instead of
-- enumerating the ones that happen to be stale today.
--
-- (is_adult stays true either way here — the destination is also an adult stop
-- — so unlike the trans-gear repair there is no seo_indexable to restore.)
delete from tag_category_assignments a
using unified_tags t
where a.tag_id = t.id
  and t.slug in ('69', 'doggy-style', 'double-penetration', 'triple-penetration')
  and a.category_id is distinct from
      (select c.id from tag_categories c where c.slug = 'sex-positions');

-- ── 3. verify ───────────────────────────────────────────────────────────────
do $$
declare
  v_bad int;
begin
  -- filed, text mirror agrees with category_id, exactly one primary junction
  select count(*) into v_bad
  from unified_tags t
  left join tag_categories c on c.id = t.category_id
  where t.slug in ('69', 'doggy-style', 'double-penetration', 'triple-penetration')
    and (c.slug is distinct from 'sex-positions'
         or t.category is distinct from c.name
         or (select count(*) from tag_category_assignments a
              where a.tag_id = t.id and a.is_primary) <> 1);
  if v_bad > 0 then
    raise exception 're-file left % of the 4 tags inconsistent', v_bad;
  end if;

  -- no adult-category junction row survives outside the new stop
  select count(*) into v_bad
  from tag_category_assignments a
  join unified_tags t on t.id = a.tag_id
  join tag_categories c on c.id = a.category_id
  where t.slug in ('69', 'doggy-style', 'double-penetration', 'triple-penetration')
    and c.slug <> 'sex-positions';
  if v_bad > 0 then
    raise exception '% stale junction rows survived the re-file', v_bad;
  end if;

  -- the whole point: they are still gated
  select count(*) into v_bad
  from unified_tags
  where slug in ('69', 'doggy-style', 'double-penetration', 'triple-penetration')
    and is_adult is not true;
  if v_bad > 0 then
    raise exception '% re-filed tags lost is_adult', v_bad;
  end if;
end $$;
