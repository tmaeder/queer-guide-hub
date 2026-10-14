-- Covering indexes for the admin review queue's dominant source.
--
-- CONTEXT. `get_admin_review_queue` 500s for every staff user because
-- PostgREST's `authenticated` role carries `statement_timeout=8s`; measured on
-- prod at 8,664ms for the landing call (`p_scope=>'decisions'`). That reds the
-- `Critical paths` required check on unrelated PRs.
--
-- `99991792000410_admin_review_counts_cache` took the full-corpus aggregates
-- off the request path and is the larger half of this fix. It states, in its
-- own header and measured in shared blocks, that its win lands on `overdue`
-- and does NOT help the two scopes a reader actually arrives on:
--     decisions (the landing scope)  471,475 -> 470,750   no change
--     all                            470,932 -> 470,895   no change
-- with the reason that `not u.is_finding` depends on the
-- `admin_review_finding_codes` join, so the scope predicate cannot push below
-- it, and finding the ~191 non-findings among business-quality's 257,757 rows
-- requires reading all of them. That reasoning is correct and is unchanged by
-- this migration. This migration makes READING THOSE ROWS cheaper instead of
-- trying to read fewer of them, so the two changes compose rather than
-- overlap.
--
-- THIS CORRECTS CANDIDATE 3 OF THAT MIGRATION, which rejected an index with:
--   "Already indexed -- `entity_quality_findings_open_idx` matches the view's
--    predicate, and the planner's seq scan is CORRECT because the query reads
--    essentially every qualifying row."
-- The premise is wrong: the planner was not seq scanning. `EXPLAIN (ANALYZE,
-- BUFFERS)` on `admin_review_src_business_quality` shows a plain **Index Scan**
-- on `entity_quality_findings_open_idx` costing **206,999 blocks** for 257,785
-- rows -- against a heap of only **34,129 pages** (267 MB). That index is keyed
-- `(entity_type, state, dimension, checked_at)`, so it walks the heap in
-- `dimension, checked_at` order, i.e. effectively at random, revisiting the
-- same pages repeatedly. It is **6x worse than the seq scan the rejection
-- assumed was happening**, and the conclusion "the seq scan is correct" was
-- therefore never tested against the plan.
--
-- The second cost the rejection did not see is `title`. The view's title is
-- `COALESCE(o.name, b.display_name, ...)`, and `organizations` is a 325 MB /
-- 41,571-page heap, so supplying `name` for ~128k findings makes the planner
-- **seq scan all of `organizations`** on every request. This is invisible to a
-- `count(*)` probe: a pulled-up subquery never evaluates unreferenced output
-- columns, so `select count(*) from the_view` does not evaluate `title` at all
-- and understates the view by ~4x. Measure it with
-- `select max(length(title)) from ...`, not `count(*)`.
--
-- MEASURED, same instrument, same query, serial, shared blocks (the
-- load-independent metric -- wall clock on this database swings 3x):
--
--   select max(length(title)) from public.admin_review_src_business_quality
--
--                                    before            after        factor
--     total                    250,916 blocks   49,043 blocks         5.1x
--     wall clock                      4,502ms        1,101ms         4.1x
--     entity_quality_findings  206,999 blocks   21,833 blocks         9.5x
--       (plan)                    Index Scan  Index Only Scan
--     organizations             41,571 blocks   24,864 blocks
--       (plan)                      Seq Scan  Index Only Scan
--
-- "before" is the current plan reproduced with `enable_indexonlyscan = off`,
-- which is what the stock plan does once `title` is required; it agrees with
-- the pre-index plan measured independently at 206,688 blocks for the same
-- scan, so the two readings corroborate each other.
--
-- THE TWO VENUE SOURCES were a separate, smaller pathology in the same union:
-- `admin_review_src_venue_kind` and `_venue_category` each filtered on a jsonb
-- extraction with no index, so each **seq scanned all 111k `venues` rows**
-- (12,882 pages, with jsonb detoast) to return **52 and 15 rows**. Measured
-- together, serial: **592ms -> 0.2ms**. Their indexes are 16 kB each.
--
-- WHY `include` AND NOT A WIDER KEY. The union projects only
-- `id, entity_type, entity_id, reason_code, first_seen_at` plus the columns in
-- the view's own predicate (`dimension`, `state`, `waived_at`). It does NOT
-- project `evidence`, because `meta` is only read by the function's `details`
-- CTE for the <=25 displayed rows, which resolves through the existing
-- `admin_review_business_identity_idx`. Putting the projected columns in
-- `include` is what turns the scan index-only; the jsonb stays out of the
-- index. `reason_code` is in `include` rather than the key on purpose -- it is
-- filtered with `<> ALL (...)`, which is not rangeable, but a filter on an
-- included column is still applied without touching the heap (it removes
-- 93,322 of the 257,785 rows here).
--
-- ACCEPTED COSTS, stated rather than discovered later: 37 MB on
-- `entity_quality_findings`, which the ingest pipeline writes continuously, so
-- this adds write amplification to a hot table; and 5.8 MB on
-- `organizations`. `entity_quality_findings` already carries a 105 MB unique
-- index, so 37 MB is proportionate. The index-only scan still reports
-- `Heap Fetches: 83,130` because the visibility map goes stale between
-- autovacuums on a table under constant write; that is already counted in the
-- 21,833 blocks above, so the measured win does not depend on a fresh VM.
--
-- NOT DONE HERE, deliberately. `get_admin_review_queue` passes `p_scope` and
-- `p_sort` as `$4`/`$5` through `EXECUTE ... USING`, which forces a generic
-- plan: the five-branch scope predicate and the four CASE sort keys are then
-- evaluated per row instead of being constant-folded. Interpolating them as
-- literals (both are already whitelist-validated at the top of the function,
-- and `%L` quotes them) measured **7,335ms -> 3,608ms with byte-identical
-- output** on the hand-built query text, A/B interleaved in one session. That
-- is a change to the function body, which `99991792000410` is concurrently
-- rewriting on an unmerged branch, so it is left for that branch to fold in
-- rather than shipped from here and risk reverting the cache.
--
-- No function, view or registry row is touched by this migration. Indexes only.

-- Fail fast rather than queue behind pipeline writes to these tables. A
-- queued CREATE INDEX holds its lock request and stalls every writer behind
-- it, which is worse than this migration failing and being re-run.
set local lock_timeout = '5s';

-- `if not exists` on all four: these were created on prod while diagnosing, so
-- this is a no-op there and authoritative on a rebuild from zero.

create index if not exists entity_quality_findings_admin_review_cover_idx
  on public.entity_quality_findings (entity_type, state)
  include (id, entity_id, dimension, reason_code, first_seen_at)
  where state = any(array['fail','pending']) and waived_at is null;

comment on index public.entity_quality_findings_admin_review_cover_idx is
  'Covers admin_review_src_business_quality so its 257k-row scan is index-only '
  '(206,999 -> 21,833 blocks). The include list is the exact set of columns the '
  'review-queue union projects; narrowing it returns the scan to the heap.';

create index if not exists organizations_id_name_cover_idx
  on public.organizations (id) include (name);

comment on index public.organizations_id_name_cover_idx is
  'Supplies organizations.name to admin_review_src_business_quality''s title '
  'COALESCE without seq scanning the 325 MB heap (41,571 -> 24,864 blocks).';

create index if not exists venues_nonvenue_candidate_review_idx
  on public.venues (updated_at)
  where duplicate_of_id is null and closed_at is null
    and ((enrichment_status -> 'nonvenue_candidate') ->> 'status') = 'review';

comment on index public.venues_nonvenue_candidate_review_idx is
  'admin_review_src_venue_kind seq scanned all 111k venues to return 52 rows.';

create index if not exists venues_category_backfill_review_idx
  on public.venues (updated_at)
  where duplicate_of_id is null and closed_at is null
    and ((enrichment_status -> 'category_backfill') ->> 'status') = 'review';

comment on index public.venues_category_backfill_review_idx is
  'admin_review_src_venue_category seq scanned all 111k venues to return 15 rows.';

-- ------------------------------------------------------------- postconditions
-- Hard on the state this file exists to reach, not on the state it found.
do $verify$
declare
  v_missing text;
  v_cols    text[];
  v_want    text[] := array['id','entity_id','dimension','reason_code','first_seen_at'];
begin
  select string_agg(i, ', ' order by i) into v_missing
  from unnest(array[
    'entity_quality_findings_admin_review_cover_idx',
    'organizations_id_name_cover_idx',
    'venues_nonvenue_candidate_review_idx',
    'venues_category_backfill_review_idx']) i
  where not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = i and c.relkind = 'i');

  if v_missing is not null then
    raise exception 'review-queue covering indexes missing: %', v_missing;
  end if;

  -- The win is the INCLUDE list, not the index's existence: an index that
  -- exists but no longer carries every projected column silently returns the
  -- scan to the heap, which is exactly the 206,999-block plan this replaces.
  -- pg_get_indexdef(index, column_no, pretty) names the Nth index column;
  -- columns above indnkeyatts are the INCLUDE list.
  select array_agg(pg_get_indexdef(x.indexrelid, i, true) order by 1) into v_cols
  from pg_index x
  join pg_class c on c.oid = x.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join generate_series(x.indnkeyatts + 1, x.indnatts) i
  where n.nspname = 'public'
    and c.relname = 'entity_quality_findings_admin_review_cover_idx';

  if v_cols is null or not (v_want <@ v_cols) then
    raise exception
      'entity_quality_findings_admin_review_cover_idx must INCLUDE % (has %)',
      v_want, coalesce(v_cols, '{}'::text[]);
  end if;
end $verify$;
