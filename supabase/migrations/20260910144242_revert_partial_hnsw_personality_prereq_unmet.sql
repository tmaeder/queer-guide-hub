-- Reverts content_embeddings_hnsw_personality (added minutes earlier in 20260910144111).
--
-- The index works exactly as intended -- EXPLAIN confirms it is chosen and drops the ANN step from
-- 446 ms to 6.3 ms. It is being removed because the fix it enables cannot be completed yet, and a
-- 137 MB index that no query plan reaches is a net regression on a disk-constrained instance.
--
-- Why the rewrite it would serve is blocked: of 18,465 personality embeddings only 1,698 (9.2%)
-- belong to a personality with visibility='public', and 2,333 reference a personality row that no
-- longer exists at all. An ANN-first rewrite therefore returns 40 nearest neighbours of which
-- ~0 are publishable -- measured, rows=0. Production's current brute-force plan is slow but
-- CORRECT precisely because it scans the whole filtered set instead of a fixed candidate window.
--
-- Correct order of work, recorded here so the next attempt does not repeat this:
--   1. stop embedding non-public / deleted rows and purge the existing orphans (corpus fix)
--   2. re-add this partial index
--   3. only then rewrite the RPCs ANN-first
-- Doing (3) before (1) ships a silent correctness regression: fast, indexed, and empty.

drop index if exists public.content_embeddings_hnsw_personality;
