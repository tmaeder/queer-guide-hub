-- REVERTS the organizations arm added minutes earlier in 20260910144506.
--
-- The DB half shipped ahead of the worker half and that combination wedges the drain.
-- workers/ingest/src/index.ts:306 reads:  if (!TABLE_MAP[s.table_name]) continue;
-- and TABLE_MAP has no `organizations` key, so the worker SILENTLY SKIPS every organization row.
--
-- That is not merely "organizations do not get embedded". get_stale_embeddings orders
-- never-embedded rows FIRST, so the 6,284 organizations would occupy the head of the work list
-- permanently: every 5-minute run would fetch 200 organizations, skip all 200, embed nothing, and
-- fetch the same 200 again. Throughput for all twelve other entity types goes to zero -- a
-- zero-yield head that the FIFO ordering can never move past. The worker's own comment above
-- embedTextFor already names this hazard: "a row that cannot be embedded is a row that sits at
-- the head of the queue forever".
--
-- Correct order, which the next attempt must follow:
--   1. add `organizations: { contentType: "organization" }` to TABLE_MAP and DEPLOY workers/ingest
--   2. re-apply the organizations arm to embedding_candidates
--   3. search_embeddings_reconcile (already live, every 10 min) then pulls the vectors into search
-- Steps 2 and 3 are already built and verified; only step 1 is outstanding.
--
-- search_embeddings_reconcile and its cron are deliberately LEFT IN PLACE: they are correct and
-- useful independently of organizations (the first run already filled 6 tag documents whose
-- vectors existed but had never been pulled), and they are what will carry organizations into
-- search once step 1 lands.

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
  where g.status = 'published'::text;

do $$
begin
  if exists (select 1 from public.embedding_candidates where content_type = 'organization') then
    raise exception 'organizations arm still present after revert';
  end if;
end $$;
