-- dup_integrity (audit §4) — collapse chained duplicate_of_id pointers.
-- The release gate found 9 chained pointers (events: 2, news_articles: 7): a row
-- marked duplicate-of another row that is itself a duplicate. Chains break merge
-- resolution (a reader following one hop lands on another tombstone). Repoint
-- each chained row directly to the ultimate canonical (the chain root whose own
-- duplicate_of_id is null). Idempotent; depth-guarded against cycles.

begin;

-- events
with recursive resolve as (
  select t.id as orig, t.duplicate_of_id as ptr, 1 as depth
  from public.events t
  where t.duplicate_of_id is not null
  union all
  select r.orig, e.duplicate_of_id, r.depth + 1
  from resolve r
  join public.events e on e.id = r.ptr
  where e.duplicate_of_id is not null and r.depth < 25
),
roots as (
  select distinct on (orig) orig, ptr as root
  from resolve r
  where not exists (
    select 1 from public.events e where e.id = r.ptr and e.duplicate_of_id is not null
  )
)
update public.events t
   set duplicate_of_id = roots.root, updated_at = now()
from roots
where t.id = roots.orig
  and roots.root is not null
  and t.duplicate_of_id is distinct from roots.root;

-- news_articles
with recursive resolve as (
  select t.id as orig, t.duplicate_of_id as ptr, 1 as depth
  from public.news_articles t
  where t.duplicate_of_id is not null
  union all
  select r.orig, n.duplicate_of_id, r.depth + 1
  from resolve r
  join public.news_articles n on n.id = r.ptr
  where n.duplicate_of_id is not null and r.depth < 25
),
roots as (
  select distinct on (orig) orig, ptr as root
  from resolve r
  where not exists (
    select 1 from public.news_articles n where n.id = r.ptr and n.duplicate_of_id is not null
  )
)
update public.news_articles t
   set duplicate_of_id = roots.root
from roots
where t.id = roots.orig
  and roots.root is not null
  and t.duplicate_of_id is distinct from roots.root;

commit;
