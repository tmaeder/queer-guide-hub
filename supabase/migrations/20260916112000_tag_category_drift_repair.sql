-- Tag DQ Phase 1.2 (plan 2026-08-22): make unified_tags.category_id canonical.
--
-- Measured 2026-08-22: 2,361 tags carry a DANGLING category_id (the column has
-- no FK, so past tag_categories deletions stranded them - 1,524 deprecated,
-- 791 active, 46 merged; all but 9 recoverable from tag_category_assignments,
-- which has real FKs and is clean). A further 1,366 active tags have NULL
-- category_id while 1,358 of them hold a junction row.
--
-- Repairs, in order:
--   1) junction bookkeeping set-based FIRST (promote the resolved category to
--      is_primary, demote others),
--   2) unified_tags.category_id + legacy `category` text with the
--      sync_tag_category_assignment trigger DISABLED,
--   3) FK unified_tags.category_id -> tag_categories(id) ON DELETE SET NULL so
--      the dangle class cannot recur.
--
-- WHY the trigger dance: sync_tag_category_assignment (BEFORE UPDATE on
-- unified_tags) upserts tag_category_assignments, whose AFTER trigger
-- unified_tags_recompute_is_adult writes BACK to unified_tags - inside a
-- set-based UPDATE that cascade hits rows the same statement is still visiting
-- and Postgres aborts with 27000 "tuple to be updated was already modified"
-- (measured in the rolled-back dry run). Doing the junction writes as their own
-- statements lets the is_adult recompute run standalone, and the disabled sync
-- trigger has nothing left to do - `category` text is set explicitly, which
-- also makes the column-scoped search trigger see the change (enqueue-only
-- since the pipeline overhaul, no inline storm).

select set_config('app.actor', 'migration:tag-dq-phase1', false);

-- Deterministic resolution map for every tag whose category_id needs repair.
create temp table _cat_fix on commit drop as
with broken as (
  select ut.id
  from unified_tags ut
  where (ut.category_id is not null
         and not exists (select 1 from tag_categories tc where tc.id = ut.category_id))
     or (ut.category_id is null and ut.status = 'active' and ut.merged_into_id is null)
),
resolved as (
  select b.id,
         (select t.category_id
            from tag_category_assignments t
            join tag_categories tc on tc.id = t.category_id
           where t.tag_id = b.id
           order by t.is_primary desc, t.created_at asc, t.category_id asc
           limit 1) as new_category_id
  from broken b
)
select r.id, r.new_category_id, tc.name as new_category_name
from resolved r
left join tag_categories tc on tc.id = r.new_category_id;

-- 1) junction: exactly one primary per repaired tag, the resolved one.
update tag_category_assignments t
   set is_primary = false
  from _cat_fix f
 where t.tag_id = f.id
   and f.new_category_id is not null
   and t.category_id <> f.new_category_id
   and t.is_primary;

insert into tag_category_assignments (tag_id, category_id, is_primary)
select f.id, f.new_category_id, true
  from _cat_fix f
 where f.new_category_id is not null
on conflict (tag_id, category_id) do update set is_primary = true;

-- 2) the column itself, sync trigger out of the loop.
alter table unified_tags disable trigger trg_sync_tag_category;

update unified_tags ut
   set category_id = f.new_category_id,
       category    = f.new_category_name
  from _cat_fix f
 where ut.id = f.id
   and ut.status = 'deprecated'
   and ut.category_id is distinct from f.new_category_id;

update unified_tags ut
   set category_id = f.new_category_id,
       category    = f.new_category_name
  from _cat_fix f
 where ut.id = f.id
   and ut.status = 'active'
   and ut.category_id is distinct from f.new_category_id;

update unified_tags ut
   set category_id = f.new_category_id,
       category    = f.new_category_name
  from _cat_fix f
 where ut.id = f.id
   and ut.status not in ('active', 'deprecated')
   and ut.category_id is distinct from f.new_category_id;

alter table unified_tags enable trigger trg_sync_tag_category;

-- Pre-existing multi-primary junctions (11 measured): where a primary row
-- matching the canonical category_id exists, demote the disagreeing ones.
update tag_category_assignments t
   set is_primary = false
  from unified_tags ut
 where t.tag_id = ut.id
   and t.is_primary
   and ut.category_id is not null
   and t.category_id <> ut.category_id
   and exists (select 1 from tag_category_assignments p
                where p.tag_id = t.tag_id and p.is_primary
                  and p.category_id = ut.category_id);

-- 3) the guard. Deletes null out instead of dangling; a writer inserting a
-- stale category id now fails loudly instead of silently stranding the tag.
alter table unified_tags
  add constraint unified_tags_category_id_fkey
  foreign key (category_id) references tag_categories(id) on delete set null;
