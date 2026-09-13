-- content_embeddings is polymorphic ((content_type, content_id) with no FK, by necessity across
-- 12 entity tables), so entity deletes leave embeddings behind with nothing to clean them up.
-- Measured on prod 2026-09-10: 5,589 of 245,518 rows (2.3%) point at an entity row that no longer
-- exists -- personality 2,333 (12.6%), news 2,135, event 1,067, venue 31, queer_village 14, city 9.
--
-- These are unreturnable by construction: every consumer joins back to the entity table, so an
-- orphan can only ever be scanned, weighed as an ANN candidate, and discarded. They cost storage,
-- HNSW graph edges, and -- the reason this matters beyond bytes -- ANN recall, because a fixed
-- ef_search candidate window spent on dead rows is a window not spent on live ones.
--
-- No producer seal is needed: get_stale_embeddings derives its work list FROM the entity tables,
-- so a deleted entity is never re-embedded. This is a terminal cleanup, not a recurring leak.
-- (search_embeddings is unaffected -- it is keyed off search_documents, which excludes these.)

do $$
declare
  v_deleted integer;
  v_before  integer;
begin
  select count(*) into v_before from public.content_embeddings;

  with orphans as (
    select ce.id
    from public.content_embeddings ce
    where (ce.content_type = 'personality'   and not exists (select 1 from public.personalities        x where x.id = ce.content_id))
       or (ce.content_type = 'venue'         and not exists (select 1 from public.venues               x where x.id = ce.content_id))
       or (ce.content_type = 'event'         and not exists (select 1 from public.events               x where x.id = ce.content_id))
       or (ce.content_type = 'news'          and not exists (select 1 from public.news_articles        x where x.id = ce.content_id))
       or (ce.content_type = 'city'          and not exists (select 1 from public.cities               x where x.id = ce.content_id))
       or (ce.content_type = 'country'       and not exists (select 1 from public.countries            x where x.id = ce.content_id))
       or (ce.content_type = 'tag'           and not exists (select 1 from public.unified_tags         x where x.id = ce.content_id))
       or (ce.content_type = 'marketplace'   and not exists (select 1 from public.marketplace_listings x where x.id = ce.content_id))
       or (ce.content_type = 'milestone'     and not exists (select 1 from public.milestones           x where x.id = ce.content_id))
       or (ce.content_type = 'queer_village' and not exists (select 1 from public.queer_villages       x where x.id = ce.content_id))
       or (ce.content_type = 'guide'         and not exists (select 1 from public.guides               x where x.id = ce.content_id))
  )
  delete from public.content_embeddings ce using orphans o where ce.id = o.id;

  get diagnostics v_deleted = row_count;

  -- Sanity gate: the measurement said 5,589. An order-of-magnitude divergence means a content_type
  -- was mis-mapped to the wrong parent table, which would delete live vectors. Fail rather than commit.
  if v_deleted > v_before * 0.10 then
    raise exception 'aborting: delete of % rows exceeds 10%% of the % row table; suspect a bad type->table mapping', v_deleted, v_before;
  end if;

  raise notice 'purged % orphaned content_embeddings rows (table had %)', v_deleted, v_before;
end $$;
