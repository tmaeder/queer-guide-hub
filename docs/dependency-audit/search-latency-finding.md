# Search latency root cause — `search_hybrid` (2026-06-02)

The shadow logs flagged pg search at **p50 932ms / p95 4365ms / max 7960ms**. Root-caused below.

## Evidence (live, EXPLAIN ANALYZE on prod)

| Query | Vector? | Exec (warm) | Buffers (warm-hit) |
|---|---|---|---|
| `berlin nightlife` | yes | 290 ms | 28,625 (~224 MB) |
| `lgbt` | **no** (keyword-only) | 270 ms | 23,234 |

Keyword-only is just as heavy → **the vector leg is not the driver.** Candidate-set size is:

| Term | tsvector matches | of 74,441 |
|---|---|---|
| `lgbt` | 2,088 | 2.8% |
| `bar` | 4,948 | 6.6% |
| `berlin` | 818 | 1.1% |

Warm = 270–290 ms; the **cold-cache** version of reading ~5k full rows from a 1.23 GB table is the
multi-second p95/max the shadow logs saw.

## Root cause

In `search_hybrid`, the `cand` CTE selects **all heavy columns** — `description`, `facets` (jsonb),
`geog` (geometry), `title`, `image_url`, … — for **every** keyword/trigram/vnn candidate (thousands for
broad terms), then runs window-function ranks (`kw`, `vec`) and scoring over the whole materialized set,
and only at the very end `limit`s to 20. So a broad term reads thousands of TOASTed rows to return 20.

## Fix — rank-then-hydrate (single-table, no ranking change)

Split `cand` into two passes:
1. **Slim candidate + score:** select only `doc_id` + the scoring inputs needed
   (`kw_rank`, `trg`, `vec_sim`, `entity_type`, `is_featured`, `liveness_status`, `closed_at`,
   `start_date`, `boost_city` match, `dist_m`, `quality_score`). No `description`/`facets`/`image_url`.
   Compute `rrf` + `score`, `order by score desc, quality_score desc`, `limit greatest(p_limit,0) offset …`.
2. **Hydrate the page:** join the ~20 surviving `doc_id`s back to `search_documents` for the heavy
   display columns and build the `jsonb` hits.

`total` stays `(select count(*) from cand_slim)`. Ranking/scoring math is unchanged — only the heavy
column reads move from "all candidates" to "the 20 returned". Expected p95 drop: seconds → sub-second
(buffers from ~23k to a few hundred).

### Secondary (optional)
- Cap the keyword candidate set: bound `kwvec` to top-K by `ts_rank_cd` for very broad terms so `cand`
  never exceeds, say, 1,000 rows before ranking.
- Verify `search_documents` is `ANALYZE`d and consider `VACUUM`/`pg_prewarm` for the HNSW + GIN indexes.

## Why not applied here

`search_hybrid` is the **live, no-fallback** search path (Meili removed in #1405). A rewrite must be
shadow-validated for result parity + latency before flipping. Implement as its own reviewed migration:
1. Write the rank-then-hydrate version alongside (e.g. `search_hybrid_v2`), 2. compare top-20 parity vs
current on a query corpus (`scripts/search-eval`), 3. swap the function body once parity + latency confirmed.
