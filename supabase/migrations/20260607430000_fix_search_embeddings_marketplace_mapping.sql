-- Restore search_documents_sync_embedding to original (no content_type mapping needed:
-- search_documents.entity_type IS 'marketplace', matching content_embeddings.content_type).
-- This migration is a no-op on a correctly-deployed DB but ensures idempotency.

create or replace function public.search_documents_sync_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
    begin
      begin
        insert into public.search_embeddings (doc_id, embedding)
        select doc_id, new.embedding from public.search_documents
         where entity_type=new.content_type and entity_id=new.content_id
        on conflict (doc_id) do update set embedding=excluded.embedding;
      exception when others then null;
      end;
      return new;
    end $$;
