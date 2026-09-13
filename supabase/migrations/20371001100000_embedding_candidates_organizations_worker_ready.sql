-- Re-applies the organizations arm of embedding_candidates, reverted by 20260910144711.
--
-- That revert existed for one reason: the ingest worker had no TABLE_MAP entry for
-- `organizations`, so it silently skipped every organization row while get_stale_embeddings
-- orders never-embedded rows FIRST -- 6,284 orgs would have pinned the head of the work list
-- and starved all twelve other entity types.
--
-- The prerequisite is now met. workers/ingest ships `organizations: { contentType: "organization" }`
-- and deployed on main at 2026-09-10T15:14:53Z (deploy.yml, job deploy-ingest, success).
--
-- The gap this closes: all 6,284 organization documents in search_documents are vector-invisible.
-- content_embeddings has never held a single organization row, so hybrid search has been running
-- keyword-only for that entity type -- a missing capability, not a drain backlog.
--
-- The filter mirrors what search_documents actually contains, measured rather than assumed:
-- status='active' AND duplicate_of_id IS NULL is exactly 6,284 of 6,497 organizations, and the
-- other three status/duplicate combinations contribute 0 rows to search (draft 127, active+dupe 50,
-- draft+dupe 36). Embedding rows search can never return is the defect that leaves 53% of
-- content_embeddings pointing at nothing; organizations follows the milestones/guides arms, which
-- filter, rather than the unfiltered venues/events/personalities arms, which are why that 53% exists.
--
-- Delivery into search needs no backfill here: search_embeddings_pull_on_doc_insert only fires on
-- document INSERT and those documents already exist, so the recurring reconciler added in
-- 20260910144533 (cron search_embeddings_reconcile, */10) is what carries the vectors across once
-- the drain produces them.

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
  if v_orgs = 0 then
    raise exception 'organizations arm produced no rows -- the view change did not take';
  end if;
  raise notice 'organizations now embeddable: % candidate rows', v_orgs;
end $$;
