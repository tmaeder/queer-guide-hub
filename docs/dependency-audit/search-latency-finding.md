# Search latency investigation — `search_hybrid` (2026-06-02)

Shadow logs flagged pg search at **p50 932ms / p95 4365ms / max 7960ms**. Investigated with live
EXPLAIN ANALYZE on prod. **Two query-rewrite hypotheses were tested and both regressed** — recorded here
so they aren't re-attempted.

## Measurements (live, warm cache, query = `lgbt`, 2,088 keyword candidates of 74,441 docs)

| Variant | Exec (warm) | Buffers | Verdict |
|---|---|---|---|
| `search_hybrid` (current) | **270 ms** | 23,234 | baseline |
| v2 rank-then-hydrate (defer heavy columns) | 553 ms | 23,322 | ❌ worse |
| v2 inline-kwvec (remove the self-join) | 876 ms | 34,958 | ❌ worse |

Component scans in isolation are all cheap:
- tsvector GIN match (2,088 rows): **1,481 buffers / 9 ms**
- trigram `title %` GIN match: **1,577 buffers / 31 ms**
- the `doc_id IN (kwvec)` step: nested-loop PK refetch = **9,241 buffers / 47 ms** (6,359 of them the refetch)

## What was disproven

1. **Rank-then-hydrate** (defer `description`/`facets`/etc. until after ranking): no buffer change and
   slower. Postgres already carries TOASTed columns as pointers and only detoasts the output rows, so the
   heavy columns were never read for non-output candidates in the first place. Premise was wrong.
2. **Inlining the `kwvec` predicate** to remove the visible self-join: *worse* (34,958 buffers). Removing
   the `kwvec` CTE removed its materialization boundary; `cand` is referenced 4× (kw/vec/fused/count), so
   the planner re-ran the full OR-bitmap candidate scan per reference. The materialized `kwvec` doc_id set
   was actually doing useful work.

## Corrected conclusion

The current `search_hybrid` structure is already reasonably tuned. Warm execution is ~270 ms; the p95/max
of 4.4s/8s is **cold-cache random I/O over a 1.23 GB table** (`search_documents` ≈ 17 KB/row — inline
embedding `vector(1024)` ≈ 4 KB + `facets` jsonb + `description` + `search_tsv` + `geog`), not a query-shape
flaw fixable by CTE rewrites.

## Real levers (operational, not query rewrites) — for a perf ticket, each to be measured

- **Keep the working set warm:** `pg_prewarm` the GIN (`tsv`, `title_trgm`) + HNSW indexes and hot heap
  after restarts; confirm `shared_buffers` / instance size vs the 1.23 GB table + indexes.
- **Shrink the row:** move the `vector(1024)` embedding out of `search_documents` into a sibling
  `search_embeddings(doc_id, embedding)` table. Keyword queries (no `p_query_vec`) then never read the 4 KB
  embedding; the HNSW ANN (`vnn`) and `vec_sim` join only the vector table. ~4 KB/row off the main scan.
- **Bloat check:** `search_documents` is a denormalized, trigger-maintained table — verify `VACUUM`/
  autovacuum health and consider `pg_repack` if bloated; confirm `ANALYZE` is current.

## Methodology note

Both rewrites were created **additively** as `search_hybrid_v2` (never touching the live function),
benchmarked + parity-checked against `search_hybrid` on the live DB, found to regress, and **dropped**.
Parity tooling confirmed identical candidate sets and identical score sequences (differences were only
tie-order among equal-score rows, which is already non-deterministic in `search_hybrid`). No live change
was made. Lesson: any `search_hybrid` change must be measured this way — the obvious rewrites make it worse.
