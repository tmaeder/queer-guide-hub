-- Fix search_documents_sync_embedding trigger: content_embeddings uses content_type='marketplace'
-- but search_documents uses entity_type='marketplace_listing'. The trigger did a direct equality
-- match (entity_type = new.content_type) so marketplace embeddings never reached search_embeddings.
-- Map legacy content_type names to their entity_type equivalents.

create or replace function public.search_documents_sync_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entity_type text;
begin
  begin
    -- Map content_type → entity_type (legacy mismatch: content_embeddings uses 'marketplace',
    -- search_documents uses 'marketplace_listing').
    v_entity_type := case new.content_type
      when 'marketplace' then 'marketplace_listing'
      else new.content_type
    end;

    insert into public.search_embeddings (doc_id, embedding)
    select doc_id, new.embedding
      from public.search_documents
     where entity_type = v_entity_type
       and entity_id   = new.content_id
    on conflict (doc_id) do update set embedding = excluded.embedding;
  exception when others then null;
  end;
  return new;
end $$;
