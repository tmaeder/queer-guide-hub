-- P1 (1/3): the global content_embeddings HNSW cannot serve a type-filtered ANN query.
--
-- Measured on prod 2026-09-10, EXPLAIN (ANALYZE) of the get_similar_personalities query shape:
--   Nested Loop -> personalities bitmap scan -> per-row btree probe -> top-N heapsort
--   HNSW absent from the plan entirely. 668 ms, 56,070 buffers, 1,698 exact distance computations.
--
-- The obvious fix is a trap and was tested before writing this. Rewriting the query ANN-first
-- (order by distance, limit 200, join afterwards) DOES engage the global HNSW -- and returns
-- ZERO ROWS: the index yields ~40 candidates drawn from all 12 content types, and none survive
-- the content_type post-filter. Production is currently correct-but-slow; a query rewrite alone
-- would have made it fast-and-wrong.
--
-- A partial index moves content_type into the index definition, so every candidate the graph
-- returns is already the right type and no post-filter can empty the result.
--
-- The global index is deliberately KEPT: match_content_embeddings (workers/submit/src/ai.ts:69,
-- the extension submission dedup path) and personalized_semantic_search both run UNFILTERED ANN,
-- and dropping it would turn those into seq scans over 245k 1024-dim vectors.
--
-- NOTE: this index was reverted minutes later by 20260910144242 -- see that migration for why.

create index if not exists content_embeddings_hnsw_personality
  on public.content_embeddings using hnsw (embedding extensions.vector_cosine_ops)
  with (m = '16', ef_construction = '64')
  where content_type = 'personality';
