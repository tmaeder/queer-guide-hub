-- Index the expression `search_documents_index_venues` self-joins on, so
-- reindexing ONE venue stops seq scanning all 111k of them.
--
-- WHERE THIS CAME FROM. `search_reindex_drain` is the single largest consumer
-- on this instance -- 8.9% of all database execution time in
-- `pg_stat_statements`. Its observed stats looked absurd: `claimed: 2,
-- reindexed: 2, elapsed_ms: 6334`. Two rows, six seconds.
--
-- THE COST IS NOT WHERE THE DRAIN'S SHAPE SUGGESTS, and three plausible
-- explanations were measured and killed before this one. Recording them so
-- they are not re-derived:
--
--   1. "The drain self-overlaps every minute." NO. It holds
--      `pg_try_advisory_xact_lock(hashtext('search_reindex_drain'))`, and 24h
--      of `cron.job_run_details` contains ZERO self-overlapping runs for any
--      job on this instance.
--   2. "DELETE + re-INSERT doubles maintenance across 10 indexes / 225 MB."
--      NO. Measured in one transaction, the per-row delete is
--      {19.78, 0.23, 0.25, 0.22, 0.19} ms -- a btree/GIN delete just marks the
--      tuple dead and defers cleanup to vacuum. The delete is free.
--   3. "So remove the redundant DELETE, since the indexers upsert." WRONG AND
--      UNSAFE. They do upsert (`on conflict (entity_type, entity_id) do
--      update`), but the DELETE is not redundant: it is what DE-indexes an
--      entity that no longer qualifies. When a venue is archived the insert's
--      SELECT returns no rows, so without the delete a stale document would
--      live in search forever -- the exact guarantee `20261016110000`
--      (archived_rows_leave_search) exists to provide.
--
-- WHAT IT ACTUALLY IS. `search_documents_index_venues` carries a correlated
-- subquery that counts same-name/same-city venues:
--
--     from public.venues v2
--     where lower(btrim(v2.name)) = lower(btrim(v.name))
--       and lower(btrim(coalesce(v2.city,''))) = lower(btrim(coalesce(v.city,'')))
--
-- Both sides are EXPRESSIONS, and no index covered them, so each single-venue
-- reindex seq scans the whole table. Measured on the subquery alone:
-- **12,889 shared buffers, 919ms** -- against a `venues` heap of 12,882 pages.
-- It reads the entire 101 MB table to index one row.
--
-- MEASURED EFFECT of this index, same transaction, same venue:
--
--     before   {372.2, 289.0, 291.2, 290.2} ms     ~290ms steady
--     after    {165.6, 150.5, 127.9,  73.5} ms     ~100ms steady
--
-- i.e. roughly **3x on the venues indexer**, for a 5.4 MB index that builds in
-- 653ms and changes no semantics.
--
-- THE FIRST A/B WAS INVALID AND SAID THE INDEX DID NOTHING -- worth recording,
-- because the artifact is silent. Creating the index and re-timing in the SAME
-- session reuses the plan cached before it existed: before {1045, 966, 485} vs
-- after {711, 431, 535}, overlapping ranges, no apparent win. `discard plans`
-- between the two halves is what produced the numbers above. Any in-session
-- index A/B needs it.
--
-- SCOPE, STATED RATHER THAN IMPLIED. This is NOT a fix for the whole 8.9%.
--   * Only `venues` has this pathology. All 15 `search_documents_index_*`
--     functions were checked; the only other apparent self-join, in
--     `..._index_tags`, is a normal `t2.id = a2.tag_id` lookup on a primary
--     key and needs nothing.
--   * The share of drained rows that are venues is NOT known. The queue was
--     empty when this was written (the drain keeps up outside storm windows),
--     so the entity_type mix could not be sampled, and the queue deletes rows
--     as it claims them so there is no history to mine. The honest claim is
--     "3x on venue reindexes", not "3x on the drain".
--   * The residual ~100ms per venue is the tsvector build plus the upsert
--     across ten indexes (92 MB tsv GIN, 38 MB geog GiST, 32 MB title trigram
--     among them). That is inherent to the document shape, not a defect.
--
-- WRITE COST. `venues` is written by the ingest pipeline, so this adds one
-- more index to maintain: 5.4 MB over two expressions on 111k rows, against a
-- table that already carries several. Proportionate, and reversible with a
-- single DROP INDEX if it is not.

set local lock_timeout = '5s';

create index if not exists venues_name_city_key_idx
  on public.venues (lower(btrim(name)), lower(btrim(coalesce(city, ''))));

comment on index public.venues_name_city_key_idx is
  'Covers the correlated same-name/same-city subquery in '
  'search_documents_index_venues, which otherwise seq scans all 111k venues '
  '(12,889 buffers / 919ms) to reindex a single one. Measured 290ms -> 100ms '
  'per venue reindex. The expressions must stay byte-identical to the '
  'function''s, or the planner silently stops using it.';

-- ------------------------------------------------------------- postconditions
do $verify$
declare
  v_expr text;
begin
  select pg_get_indexdef(c.oid) into v_expr
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'venues_name_city_key_idx' and c.relkind = 'i';

  if v_expr is null then
    raise exception 'venues_name_city_key_idx was not created';
  end if;

  -- The index is only useful if its expressions match the function's exactly.
  -- Assert BOTH halves: an index on name alone still exists, still looks
  -- plausible, and the planner still will not use it for this predicate.
  if position('lower(btrim(name))' in v_expr) = 0 then
    raise exception 'index lost the lower(btrim(name)) expression: %', v_expr;
  end if;
  if position('lower(btrim(COALESCE(city' in v_expr) = 0
     and position('lower(btrim(coalesce(city' in v_expr) = 0 then
    raise exception 'index lost the lower(btrim(coalesce(city,''''))) expression: %', v_expr;
  end if;

  -- And the consumer must still contain the predicate this exists to serve --
  -- if someone rewrites the function, this index becomes dead weight rather
  -- than silently-wrong, and should be dropped with it.
  --
  -- COMMENTS ARE STRIPPED FIRST, and that is not pedantry: pg_get_functiondef()
  -- returns the body INCLUDING its comments, so asserting on the raw text
  -- matches prose that merely mentions the symbol. A rewritten function that
  -- kept an explanatory comment would satisfy this check while the predicate
  -- was gone. The same mistake aborted `db push` on main three times on
  -- 2026-09-20 and stranded the whole queue; check-functiondef-asserts.mjs
  -- exists to catch it, and caught it here.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_documents_index_venues'
      and position('lower(btrim(v2.name))' in
            regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')) > 0
  ) then
    raise exception
      'search_documents_index_venues no longer self-joins on lower(btrim(name)); this index has no consumer';
  end if;
end $verify$;
