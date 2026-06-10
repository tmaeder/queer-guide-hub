-- dup_integrity release gate regressed again: 24 venues have duplicate_of_id
-- pointing at a row that is itself a duplicate (chained pointer), introduced by
-- merge/visibility work that set duplicate_of_id without collapsing existing
-- chains. Same fix as 20260607140000 — re-point each chained venue directly to
-- its ultimate (non-duplicate) survivor. Reversible via the backup table.

begin;

-- Reuse the original backup table (created in 20260607140000) so all chain fixes
-- accumulate in one auditable place.
create table if not exists public.venue_dup_chain_fix_backup (
  venue_id uuid primary key,
  old_duplicate_of_id uuid not null,
  new_duplicate_of_id uuid not null,
  fixed_at timestamptz not null default now()
);

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
  select distinct on (venue_id) venue_id, cur as survivor_id
  from resolved
  order by venue_id, depth desc
),
chained as (
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
on conflict (venue_id) do update
  set new_duplicate_of_id = excluded.new_duplicate_of_id,
      old_duplicate_of_id = excluded.old_duplicate_of_id,
      fixed_at = now();

update public.venues v
set duplicate_of_id = b.new_duplicate_of_id
from public.venue_dup_chain_fix_backup b
where v.id = b.venue_id
  and v.duplicate_of_id is distinct from b.new_duplicate_of_id;

commit;

-- To reverse the latest pass:
--   update public.venues v set duplicate_of_id = b.old_duplicate_of_id
--   from public.venue_dup_chain_fix_backup b where v.id = b.venue_id;
