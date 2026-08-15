-- tag_usage_summary counted entity_type spellings that almost nothing writes.
--
-- THE BUG
--
-- Every `*_count` bucket matched a single literal — `'venue'`, `'news_article'`,
-- `'event'`. The writers use the other spelling. Measured on prod, the actual
-- contents of `unified_tag_assignments`:
--
--   news                 60,332   <- NOT counted (bucket matches 'news_article')
--   venues               43,402   <- NOT counted (bucket matches 'venue')
--   marketplace_listing  36,573      counted
--   news_article         35,250      counted
--   personality           1,035      no bucket exists
--   hotel                   766      no bucket exists
--   tag                      42      counted into nothing, and shouldn't be
--   community_group           5      counted
--
-- So 103,734 of 177,405 assignments — 58%, including the two largest types —
-- were invisible, and `tag_usage_summary` reported 0 for essentially every tag.
-- `bear-bar` has 17 venue assignments and reported `venue_count = 0`; `chemsex`
-- has 12 news assignments and reported `news_count = 0`. Both readers
-- (`useTagUsageBreakdown` on /tags/:slug, `useCentralizedTags` on /tags) show
-- that number, which is why a glossary page said "0 items across the guide"
-- while its linked-content band listed the articles directly underneath — the
-- band calls `get_tag_linked_content`, which defensively accepts BOTH spellings
-- (`entity_type IN ('news_article','news')`) and was therefore correct all along.
-- That disagreement between two surfaces on the same page is the tell.
--
-- WHY BOTH SPELLINGS RATHER THAN NORMALISING THE DATA
--
-- The dirty vocabulary is long-standing and has two live normalisers over it
-- already (`tag_facet_of`, `tag_assignments_norm`). Rewriting 177k rows to one
-- spelling would need every writer changed in the same commit — the nightly
-- `run_tag_assignment_reconcile` writes `'venues'`/`'news'`, the marketplace
-- backfill writes `'marketplace_listing'`, the hotel-vibes seed writes
-- `'hotel'` — and any missed writer silently reintroduces the split. Accepting
-- both spellings here is the change that cannot regress.
--
-- `'tag'` is now excluded explicitly: those 42 rows are tag→tag self-links from
-- the near-duplicate flagger, not content, and counting them would inflate a
-- number the UI presents as "items across the guide".
--
-- STILL UNCOUNTED, AND DELIBERATELY LEFT SO: `hotel` (766) and `personality`
-- (1,035) have no bucket. Adding them means new columns, a wider
-- `TagUsageBreakdown` interface, a change to `totalUses()`, and two more
-- RouteStrip stations on the detail page — a UI change, not a counting fix, so
-- it does not belong in the same migration. Their absence is pre-existing and is
-- 1% of the corpus against the 58% this recovers.
--
-- A matview cannot be CREATE OR REPLACE'd, so this is DROP + CREATE. The unique
-- index on (id) is recreated because `REFRESH ... CONCURRENTLY` (used by the
-- hourly `tag_usage_summary_refresh` cron) requires one.

drop materialized view if exists public.tag_usage_summary;

create materialized view public.tag_usage_summary as
select
  ut.id,
  ut.name,
  ut.slug,
  ut.category,
  ut.usage_count,
  count(*) filter (where uta.entity_type in ('event', 'events'))                    as event_count,
  count(*) filter (where uta.entity_type in ('venue', 'venues'))                    as venue_count,
  count(*) filter (where uta.entity_type in ('marketplace_listing', 'marketplace')) as marketplace_count,
  count(*) filter (where uta.entity_type in ('content', 'cms_content'))             as content_count,
  count(*) filter (where uta.entity_type in ('news_article', 'news'))               as news_count,
  count(*) filter (where uta.entity_type in ('community_post', 'post'))             as post_count,
  count(*) filter (where uta.entity_type in ('community_group', 'group'))           as group_count
from public.unified_tags ut
left join public.unified_tag_assignments uta
  on ut.id = uta.tag_id
 -- Self-links from flag_near_duplicate_on_insert are not content.
 and uta.entity_type <> 'tag'
group by ut.id, ut.name, ut.slug, ut.category, ut.usage_count;

create unique index tag_usage_summary_id_key on public.tag_usage_summary (id);

-- SELECT only. The dropped view carried `anon=arwdDxtm`, i.e. every write verb —
-- inert on a matview, since Postgres rejects DML against one, but there is no
-- reason to restate it.
grant select on public.tag_usage_summary to anon, authenticated, service_role;

do $verify$
declare v_bear int; v_chem int; v_zero int; v_tagself int;
begin
  select venue_count into v_bear  from public.tag_usage_summary s
    join public.unified_tags t on t.id = s.id where t.slug = 'bear-bar';
  select news_count  into v_chem  from public.tag_usage_summary s
    join public.unified_tags t on t.id = s.id where t.slug = 'chemsex';

  if coalesce(v_bear, 0) = 0 then
    raise exception 'tag_usage_summary: bear-bar still reports 0 venues';
  end if;
  if coalesce(v_chem, 0) = 0 then
    raise exception 'tag_usage_summary: chemsex still reports 0 news';
  end if;

  -- Every bucketed assignment must now land somewhere. Compare the view's total
  -- against the raw count of rows whose entity_type has a bucket at all.
  select count(*) into v_zero
    from public.unified_tag_assignments
   where entity_type in ('event','events','venue','venues','marketplace_listing',
                         'marketplace','content','cms_content','news_article','news',
                         'community_post','post','community_group','group');
  select coalesce(sum(event_count + venue_count + marketplace_count + content_count
                      + news_count + post_count + group_count), 0)
    into v_tagself from public.tag_usage_summary;
  if v_zero <> v_tagself then
    raise exception 'tag_usage_summary: bucketed rows % <> view total %', v_zero, v_tagself;
  end if;
end
$verify$;
