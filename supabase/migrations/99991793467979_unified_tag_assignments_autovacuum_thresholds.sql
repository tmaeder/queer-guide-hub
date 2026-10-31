-- Vacuum unified_tag_assignments on a fixed change count, not 20% of the table.
--
-- The table is read almost entirely through index-only scans (80M index scans
-- in six days) and written slowly: ~800 inserts and ~300 deletes a day. Under
-- the default thresholds (50 + 0.2 * ~490k rows for dead tuples, 1000 + 0.2 *
-- rows for inserts) autovacuum needs ~99k changes, i.e. it ran about once a
-- quarter. Between runs the visibility map decays, and every index-only scan
-- has to visit the heap to check visibility.
--
-- Measured 2026-10-31 on prod with the visibility map at 62% all-visible:
--   count(*) where entity_type = 'marketplace_listing'
--     before VACUUM: 1,097 ms, 63,239 buffers, 173,464 heap fetches
--     after  VACUUM:    63 ms,  1,726 buffers,       0 heap fetches
-- The busiest PostgREST read (tag_id + entity_type, 23,668 calls) read 1,563
-- buffers a call. get_marketplace_tag_facets and tag_hygiene_stats read this
-- table too; the latter already had to force enable_indexonlyscan=off
-- (99991789807686) to stop depending on a stale map.
--
-- A one-off VACUUM was run by hand; it cannot run here (VACUUM is not allowed
-- inside a transaction). This makes it recur: with scale factors at 0 the
-- thresholds are absolute, so autovacuum runs after ~1,000 inserts or ~500
-- dead tuples, i.e. roughly daily at today's write rate. A vacuum of this
-- 53 MB table takes about a second and takes no lock that blocks reads or
-- writes.
--
-- ALTER TABLE ... SET (autovacuum_*) takes SHARE UPDATE EXCLUSIVE, which does
-- not block reads or writes but waits behind a running VACUUM; lock_timeout
-- makes the migration fail rather than queue.

set local lock_timeout = '10s';

alter table public.unified_tag_assignments set (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 500,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 1000,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 2000
);
