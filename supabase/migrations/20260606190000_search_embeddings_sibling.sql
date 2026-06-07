-- Embedding move, Phase 1 (perf): move the vector(1024) read path off
-- search_documents into a `search_embeddings` sibling table read via a
-- p_query_vec-gated LATERAL join, so keyword-only queries never fetch the
-- embedding TOAST during candidate scans (the cold-p95 lever — see
-- docs/search-intelligence/embedding-move-migration.md + search-latency-finding.md).
--
-- Applied + parity-validated live on prod 2026-06-07 before commit:
--   keyword path exact (total + set), related/get_recommendations 10/10 overlap,
--   find_duplicates byte-identical. Sibling HNSW confirmed used (Index Scan).
--
-- Phase 1 keeps search_documents.embedding (a mirror trigger syncs the sibling
-- from the unchanged 9 index writers, so no writer edits + trivial rollback).
-- Phase 2 (separate) drops the column + rewrites writers for the ~448MB reclaim.
-- Idempotent: safe to re-apply (prod already has it).

-- 1. Sibling table + backfill.
create table if not exists public.search_embeddings (
  doc_id text primary key references public.search_documents(doc_id) on delete cascade,
  embedding extensions.vector(1024)
);
insert into public.search_embeddings (doc_id, embedding)
select doc_id, embedding from public.search_documents
where embedding is not null
on conflict (doc_id) do nothing;

-- RLS: only SECURITY DEFINER functions read it; deny direct access.
alter table public.search_embeddings enable row level security;

-- 2. Mirror trigger — every write to search_documents.embedding (by the 9 index
--    writers or the content_embeddings sync trigger) keeps the sibling in sync.
create or replace function public.search_documents_mirror_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.embedding is not null then
    insert into public.search_embeddings (doc_id, embedding)
    values (new.doc_id, new.embedding)
    on conflict (doc_id) do update set embedding = excluded.embedding;
  end if;
  return new;
end $$;

drop trigger if exists trg_sd_mirror_embedding on public.search_documents;
create trigger trg_sd_mirror_embedding
  after insert or update of embedding on public.search_documents
  for each row execute function public.search_documents_mirror_embedding();

-- 3. Sibling HNSW (matches the old search_documents index params).
create index if not exists search_embeddings_hnsw
  on public.search_embeddings using hnsw (embedding extensions.vector_cosine_ops)
  with (m = '16', ef_construction = '64');

-- 4. Readers now live in 20260606190100_search_embeddings_readers.sql (kept
--    separate to keep this file focused on the table/trigger/index).

-- 5. Drop the now-unused old index (readers no longer touch search_documents.embedding).
drop index if exists public.search_documents_embed_hnsw;
