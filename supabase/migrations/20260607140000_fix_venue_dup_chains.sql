-- Fix dup_integrity release gate: 306 venues had duplicate_of_id pointing to a
-- row that was itself a duplicate (chained pointer), regressed by city-merge /
-- visibility-batch work that set duplicate_of_id without collapsing existing chains.
-- Re-point each chained venue directly to its ultimate (non-duplicate) survivor.
-- Reversible: prior pointers are captured in venue_dup_chain_fix_backup; see down note.

begin;

create table if not exists public.venue_dup_chain_fix_backup (
  venue_id uuid primary key,
  old_duplicate_of_id uuid not null,
  new_duplicate_of_id uuid not null,
  fixed_at timestamptz not null default now()
);

-- Resolve every venue's ultimate survivor (walk duplicate_of_id until it is null).
with recursive resolved as (
  select id as venue_id, duplicate_of_id as cur, 0 as depth
  from public.venues
  where duplicate_of_id is not null
  union all
  select r.venue_id, v.duplicate_of_id, r.depth + 1
  from resolved r
  join public.venues v on v.id = r.cur
  where v.duplicate_of_id is not null and r.depth < 50
),
survivor as (
  -- the row in each walk whose cur points at a non-duplicate (or missing) target
  select distinct on (venue_id) venue_id, cur as survivor_id
  from resolved
  order by venue_id, depth desc
),
chained as (
  -- only venues whose current pointer differs from the ultimate survivor,
  -- and whose survivor exists and is itself a clean (non-duplicate) row
  select v.id as venue_id, v.duplicate_of_id as old_target, s.survivor_id
  from public.venues v
  join survivor s on s.venue_id = v.id
  join public.venues g on g.id = s.survivor_id
  where v.duplicate_of_id is distinct from s.survivor_id
    and g.duplicate_of_id is null
    and s.survivor_id <> v.id
)
insert into public.venue_dup_chain_fix_backup (venue_id, old_duplicate_of_id, new_duplicate_of_id)
select venue_id, old_target, survivor_id from chained
on conflict (venue_id) do nothing;

update public.venues v
set duplicate_of_id = b.new_duplicate_of_id
from public.venue_dup_chain_fix_backup b
where v.id = b.venue_id
  and v.duplicate_of_id is distinct from b.new_duplicate_of_id;

commit;

-- To reverse:
--   update public.venues v set duplicate_of_id = b.old_duplicate_of_id
--   from public.venue_dup_chain_fix_backup b where v.id = b.venue_id;
--   drop table public.venue_dup_chain_fix_backup;
