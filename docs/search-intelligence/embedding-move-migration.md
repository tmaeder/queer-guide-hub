# Migration: move `search_documents.embedding` → `search_embeddings` sibling table

**Status:** designed + core-validated on prod (2026-06-02), **NOT yet applied.** Apply via the
deploy-supabase-functions pipeline after staged parity validation. Reviewed PR required — this rewrites
the live search / discovery / dedup core.

## Why

`search_documents` is **1.25 GB**: 119 MB heap + **448 MB embedding TOAST** + **608 MB embedding HNSW** +
73 MB GIN/trigram. The 1,056 MB of embedding data/index (85%) is **only used for vector search**; keyword/
`cand` scans touch just the ~192 MB heap+GIN. Moving the `vector(1024)` to a sibling table shrinks
`search_documents` to **~192 MB**, so the keyword working set fits in cache — directly attacking the
cold-cache p95 (~4.4 s). See `search-latency-finding.md` for the measurements (and why two query-shape
rewrites regressed — the lever is working-set size, not query shape).

## Validated core

`search_hybrid_v3` (reads the sibling via a `p_query_vec`-gated `LATERAL` join so keyword-only queries
never touch the embedding table) was built on prod and **parity-tested exact** vs live `search_hybrid`
across keyword, keyword+vector, and pure-vector paths (identical totals + score sequences; diffs only at
tied-score positions, which are non-deterministic in the original too). The full SQL is in the migration
file below. The same join pattern applies mechanically to the other 3 readers.

## Scope — 14 functions reference `search_documents.embedding`

**Readers (rewrite to read the sibling):**
- `search_hybrid` → use the validated v3 body (lateral-gated sibling read).
- `related_entities` → seed `select se.embedding … from search_embeddings se join search_documents sd …`;
  ANN `… from search_documents sd join search_embeddings se on se.doc_id=sd.doc_id order by se.embedding <=> v limit …`.
- `find_duplicates` → vnn leg `… join search_embeddings se … order by se.embedding <=> p_embedding limit 20`; `vs = 1-(se.embedding <=> p_embedding)`.
- `get_recommendations` → `vec = case when p_bias_vec is not null and se.embedding is not null then 1-(se.embedding <=> p_bias_vec) else 0 end`, via a `p_bias_vec`-gated `LATERAL` join (same trick as v3).

**Writers (10) — two options:**
- **Option A (clean, recommended): DROP COLUMN.** Rewrite the 9 `search_documents_index_*` to remove
  `embedding` from the INSERT column list, the `ce.embedding` value, and the `on conflict … set embedding=excluded.embedding`;
  rewrite `search_documents_sync_embedding` (trigger on `content_embeddings`) to upsert the sibling:
  `insert into search_embeddings(doc_id, embedding) select doc_id, new.embedding from search_documents where entity_type=new.content_type and entity_id=new.content_id on conflict (doc_id) do update set embedding=excluded.embedding`.
  Then `ALTER TABLE search_documents DROP COLUMN embedding` — **instant** reclaim of the 448 MB TOAST.
- **Option B (fewer edits, messier reclaim): trigger-redirect.** A `BEFORE INSERT OR UPDATE OF embedding`
  trigger on `search_documents` upserts `new.embedding` into the sibling and sets `new.embedding := NULL`.
  The 10 writers are **unchanged**. But the column stays, so reclaiming the 448 MB TOAST needs a batched
  `UPDATE … SET embedding=NULL` + `VACUUM` (MVCC bloat — risky on the constrained disk). Drop the HNSW either way.

Recommendation: **Option A** — the DROP COLUMN gives clean, instant space reclaim, which matters on this
disk-constrained DB.

## Disk-aware sequencing (critical — see `queerguide_db_disk_constrained`)

Baseline ~5.7 GB; the read-only guard trips ~6.7 GB. The sibling adds ~977 MB. **Do not hold both the
old embedding+HNSW and the new sibling+HNSW at once** (peak ~6.7 GB → read-only). Order:

1. **Increase disk first** (temp headroom) OR follow this order exactly.
2. `create table search_embeddings …`; backfill from `search_documents.embedding`; (no HNSW yet) → +406 MB.
3. In one migration txn: rewrite all 14 functions (readers → sibling; writers → Option A) and
   `ALTER TABLE search_documents DROP COLUMN embedding` (drops the 448 MB TOAST) and
   `DROP INDEX search_documents_embed_hnsw` (drops 608 MB). → frees ~1 GB, DB ~5.1 GB.
4. `create index search_embeddings_hnsw … using hnsw …` → +572 MB, DB ~5.7 GB. (CREATE INDEX runs outside
   the txn; pgvector HNSW build is the slow step.)
5. `VACUUM (ANALYZE) search_documents;` to settle stats.

This keeps peak disk under the guard without needing the bump (step 3 frees before step 4 adds).

## Validation (run in staging / on a branch before prod apply)

Parity per reader — totals + ordered score/`_score` sequences must match the pre-migration function across
a query corpus (keyword, keyword+vector, pure-vector, geo, and per content_type). The `scripts/search-eval`
harness shape works. Confirm `pg_database_size` drops ~1 GB and `search_documents` total ≈ 192 MB; p95 on a
cold cache should fall materially.

## Rollback

Keep the sibling until validated. To revert: recreate `search_documents.embedding`
(`alter table … add column embedding vector(1024)`), `update search_documents sd set embedding=se.embedding
from search_embeddings se where se.doc_id=sd.doc_id`, recreate `search_documents_embed_hnsw`, and
`CREATE OR REPLACE` the 14 functions back to their current bodies (captured in this PR). Then drop the sibling.

## Why not applied here

The core (search_hybrid) is parity-proven, but the other 13 rewrites must be parity-validated before they
touch the live search/discovery/dedup core, and the disk sequencing needs a controlled window. A prior
in-place experiment tripped the disk read-only guard (recovered) — so this goes through staged validation +
review, not a blind live apply.
