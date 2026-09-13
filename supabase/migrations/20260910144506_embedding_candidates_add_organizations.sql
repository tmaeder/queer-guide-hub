-- P2: organizations were never in the embedding work list. embedding_candidates had 11 arms and
-- no organizations arm, so content_embeddings held ZERO organization rows and all 6,284 organization
-- documents in search_documents were vector-invisible -- keyword-only in a hybrid search engine.
-- This is a missing capability, not a drain backlog: no amount of drain throughput would ever have
-- reached them.
--
-- The filter is not invented. Measured on prod 2026-09-10, search_documents contains exactly the
-- organizations with status='active' AND duplicate_of_id IS NULL -- 6,284 of 6,497, an exact match
-- across all four status/duplicate combinations (draft 127 -> 0 in search, active+dupe 50 -> 0,
-- draft+dupe 36 -> 0). Mirroring that predicate keeps the embedding corpus aligned with what search
-- can actually return.
--
-- That alignment is the point. The existing arms for venues, events and personalities do NOT filter
-- (venues carries 11,306 merge tombstones; only 9.2% of embedded personalities are public), which is
-- why 53% of content_embeddings corresponds to nothing in search_documents and why an ANN-first
-- rewrite of get_similar_personalities returns zero publishable rows. The milestones and guides arms
-- already filter on status; organizations follows those, not the unfiltered majority.
--
-- NOTE: reverted minutes later by 20260910144711 -- the ingest worker had no TABLE_MAP entry for
-- organizations, which would have wedged the FIFO drain. See that migration.

create or replace view public.embedding_candidates as
 select 'venues'::text as table_name, v.id, v.updated_at, 'venue'::text as content_type from venues v
union all
 select 'events'::text, e.id, e.updated_at, 'event'::text from events e
union all
 select 'cities'::text, c.id, c.updated_at, 'city'::text from cities c
union all
 select 'countries'::text, co.id, co.updated_at, 'country'::text from countries co
union all
 select 'personalities'::text, p.id, p.updated_at, 'personality'::text from personalities p
union all
 select 'news_articles'::text, n.id, n.updated_at, 'news'::text from news_articles n
union all
 select 'marketplace_listings'::text, m.id, m.updated_at, 'marketplace'::text from marketplace_listings m
union all
 select 'queer_villages'::text, q.id, q.updated_at, 'queer_village'::text from queer_villages q
union all
 select 'unified_tags'::text, t.id, t.updated_at, 'tag'::text from unified_tags t
union all
 select 'milestones'::text, ms.id, ms.updated_at, 'milestone'::text from milestones ms
  where ms.status = 'published'::text and ms.duplicate_of_id is null
union all
 select 'guides'::text, g.id, g.updated_at, 'guide'::text from guides g
  where g.status = 'published'::text
union all
 select 'organizations'::text, o.id, o.updated_at, 'organization'::text from organizations o
  where o.status = 'active'::text and o.duplicate_of_id is null;

do $$
declare v_orgs integer;
begin
  select count(*) into v_orgs from public.embedding_candidates where content_type = 'organization';
  if v_orgs <> 6284 then
    raise warning 'organization candidate count is % (expected 6284 at authoring time)', v_orgs;
  end if;
  if v_orgs = 0 then
    raise exception 'organizations arm produced no rows -- the view change did not take';
  end if;
end $$;
