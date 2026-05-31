-- Close the embedding-freshness gap: search_documents rows are written when the
-- source entity is written, but embeddings are generated asynchronously by
-- embedding-generator afterward — so a freshly-ingested entity's
-- search_documents.embedding stays null until the row is next touched. This
-- mirrors content_embeddings writes onto search_documents, and backfills the
-- existing gap. See docs/search-intelligence/meili-to-postgres-migration-plan.md.

create or replace function public.search_documents_sync_embedding()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    update public.search_documents
       set embedding = new.embedding, updated_at = now()
     where entity_type = new.content_type and entity_id = new.content_id;
  exception when others then
    -- never break the embedding pipeline's write
    null;
  end;
  return new;
end $$;

drop trigger if exists trg_search_documents_embedding on public.content_embeddings;
create trigger trg_search_documents_embedding
  after insert or update of embedding on public.content_embeddings
  for each row execute function public.search_documents_sync_embedding();

-- One-time backfill for rows indexed before their embedding existed.
update public.search_documents sd
   set embedding = ce.embedding, updated_at = now()
  from public.content_embeddings ce
 where ce.content_type = sd.entity_type and ce.content_id = sd.entity_id
   and sd.embedding is null and ce.embedding is not null;

revoke all on function public.search_documents_sync_embedding() from public, anon, authenticated;
