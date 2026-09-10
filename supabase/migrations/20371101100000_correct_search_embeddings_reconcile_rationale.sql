-- Corrects the stated rationale of search_embeddings_reconcile (20260910144533).
-- The function is kept and is still worth having; the REASON recorded in its header is wrong,
-- and a wrong reason in a migration header is how the next person builds on a false premise.
--
-- WHAT THAT HEADER CLAIMED:
--   "The only writer of search_embeddings for existing rows is
--    search_embeddings_pull_on_doc_insert ... so if the embedding does not exist yet, the pull
--    finds nothing and NOTHING EVER RETRIES."
--
-- WHAT IS ACTUALLY TRUE: there are TWO triggers and they cover both orderings.
--   trg_sd_pull_embedding        ON search_documents   -> search_embeddings_pull_on_doc_insert
--       document arrives after the vector: PULL from content_embeddings.
--   trg_search_documents_embedding ON content_embeddings -> search_documents_sync_embedding
--       vector arrives after the document: PUSH into search_embeddings, upsert by doc_id.
--
-- The second one is the retry the header said did not exist, and it is demonstrably the thing
-- that worked: the organizations arm went live at 15:42, the drain wrote its first 200
-- organization embeddings at 15:50:49, and all 200 were in search_embeddings by 15:53 -- while
-- search_embeddings_reconcile had last run at 15:47, BEFORE those embeddings existed. The push
-- trigger did that work, not the reconciler.
--
-- WHY THE FUNCTION STILL EARNS ITS PLACE (the real reason, measured):
-- both triggers wrap their write in `exception when others then null`. A transient failure --
-- a lock timeout, a dimension mismatch, a statement timeout under load -- is swallowed silently
-- and the row is stranded permanently, because neither trigger is ever re-fired for that pair.
-- Nothing else reconciles, so the loss is undetectable and unbounded. That is not a hypothetical:
-- the reconciler's very first run inserted 6 rows for `tag` documents whose vectors already
-- existed in content_embeddings and whose search_embeddings row was simply absent -- exactly the
-- shape a swallowed exception leaves behind, and one the two triggers had already had every
-- opportunity to fix.
--
-- So: it is a BACKSTOP for two silent-failure paths, not the sole delivery mechanism. Anyone
-- tuning it should know the happy path is already covered and this only ever picks up strays.

comment on function public.search_embeddings_reconcile(integer) is
  'Backstop reconciler for search_embeddings. The happy path is covered by TWO triggers: '
  'trg_sd_pull_embedding (document after vector) and trg_search_documents_embedding (vector '
  'after document). Both swallow write failures via `exception when others then null`, so a '
  'transient error strands a (doc_id, embedding) pair permanently with nothing to re-fire it. '
  'This job re-inserts those strays only; it is NOT the primary delivery path, contrary to the '
  'header of migration 20260910144533, which is corrected by 20371101100000.';

do $$
begin
  -- Assert the two triggers this correction depends on actually exist, so the claim above
  -- cannot quietly become false if one is later dropped.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relname = 'content_embeddings'
      and t.tgname = 'trg_search_documents_embedding'
  ) then
    raise exception 'trg_search_documents_embedding is missing -- the push path this comment describes does not exist';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relname = 'search_documents'
      and t.tgname = 'trg_sd_pull_embedding'
  ) then
    raise exception 'trg_sd_pull_embedding is missing -- the pull path this comment describes does not exist';
  end if;
end $$;
