-- Fix: "More like this" / SimilarItems returns no neighbours for most entities
-- (personalities especially) because the live KNN path reads search_embeddings,
-- but ~44k embeddings that already exist in content_embeddings never reached it.
--
-- Root cause: the content_embeddings -> search_embeddings bridge
-- (trg_search_documents_embedding -> search_documents_sync_embedding) only fires
-- when content_embeddings is written, joining to the search_documents row that
-- must already exist. Any entity whose search_documents row is created AFTER its
-- content_embeddings row (the common ingest order: embed, then index) is never
-- bridged, and the historical rows predating the trigger were never backfilled.
-- related_entities() needs the SEED's embedding for ANN, so those detail pages
-- return []. e.g. personality coverage in search_embeddings was 240/1988.
--
-- Two parts, both pure SQL / no API cost:
--   1. Forward-sync trigger on search_documents INSERT (the missing direction),
--      symmetric to the existing content_embeddings trigger -> self-healing.
--   2. One-time idempotent backfill of the existing gap.
-- search_embeddings has no triggers of its own, so direct writes here do not
-- cascade into the search-sync storm that direct search_documents writes cause.

set local statement_timeout = 0;

-- 1. Forward sync: when a search_documents row is inserted, pull its embedding
--    from content_embeddings if one already exists. Mirrors
--    search_documents_sync_embedding() in the opposite direction so the bridge
--    works regardless of which side lands first.
create or replace function public.search_embeddings_pull_on_doc_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.search_embeddings (doc_id, embedding)
    select new.doc_id, ce.embedding
      from public.content_embeddings ce
     where ce.content_type = new.entity_type
       and ce.content_id = new.entity_id
       and ce.embedding is not null
       and extensions.vector_dims(ce.embedding) = 1024
    on conflict (doc_id) do update set embedding = excluded.embedding;
  exception when others then
    null;  -- never break the index writers
  end;
  return new;
end $$;

drop trigger if exists trg_sd_pull_embedding on public.search_documents;
create trigger trg_sd_pull_embedding
  after insert on public.search_documents
  for each row execute function public.search_embeddings_pull_on_doc_insert();

-- 2. One-time backfill of the historical gap. Idempotent (ON CONFLICT DO
--    NOTHING) so re-applying on a fresh DB is a no-op once synced.
insert into public.search_embeddings (doc_id, embedding)
select sd.doc_id, ce.embedding
  from public.content_embeddings ce
  join public.search_documents sd
    on sd.entity_type = ce.content_type
   and sd.entity_id = ce.content_id
 where ce.embedding is not null
   and extensions.vector_dims(ce.embedding) = 1024
on conflict (doc_id) do nothing;
