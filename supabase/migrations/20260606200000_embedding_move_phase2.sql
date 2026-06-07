-- Embedding move, Phase 2 (disk reclaim): stop writing search_documents.embedding
-- and drop the column. The vector(1024) now lives ONLY in search_embeddings
-- (Phase 1). Reclaims the ~448MB embedding TOAST: search_documents 634MB -> 88MB,
-- removing the temporary Phase-1 duplication. Applied + validated live on prod
-- 2026-06-07 (writers re-index cleanly, all 4 readers + prod search green).
--
-- Idempotent: the writer transform removes embedding refs if present (no-op once
-- clean); drops are IF EXISTS. Runs after the original index-writer migrations
-- (which create them WITH embedding) and the Phase 1 migrations.

-- 1. Rewrite the 9 search_documents_index_* writers to drop the embedding column
--    from the INSERT, the ce.embedding value, and the on-conflict SET (the
--    content_embeddings join is kept untouched — it is "content_embeddings", not
--    a bare "embedding," reference).
do $do$
declare r record; newdef text;
begin
  for r in select pg_get_functiondef(oid) d from pg_proc where proname like 'search_documents_index_%' loop
    newdef := regexp_replace(
                regexp_replace(
                  regexp_replace(r.d, 'ce\.embedding,\s*', '', 'g'),
                  'embedding\s*=\s*excluded\.embedding,\s*', '', 'g'),
                ',\s*embedding,', ',', 'g');
    execute newdef;
  end loop;
end $do$;

-- 2. The content_embeddings sync trigger now maintains the sibling directly
--    (it previously updated search_documents.embedding, which no longer exists).
create or replace function public.search_documents_sync_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.search_embeddings (doc_id, embedding)
    select doc_id, new.embedding from public.search_documents
     where entity_type = new.content_type and entity_id = new.content_id
    on conflict (doc_id) do update set embedding = excluded.embedding;
  exception when others then
    null;  -- never break the embedding pipeline's write
  end;
  return new;
end $$;

-- 3. The Phase 1 mirror trigger is obsolete once the column is gone.
drop trigger if exists trg_sd_mirror_embedding on public.search_documents;
drop function if exists public.search_documents_mirror_embedding();

-- 4. Drop the column. NOTE: run `VACUUM (FULL, ANALYZE) public.search_documents;`
--    out-of-band afterwards to return the dead TOAST to the OS (cannot run in a
--    migration transaction; already done on prod).
alter table public.search_documents drop column if exists embedding;
