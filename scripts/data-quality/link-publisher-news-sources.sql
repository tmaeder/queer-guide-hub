-- Link unlinked news feeds to the publisher organisation whose website they serve.
--
-- Why: an organisation's "articles indexed on Queer Guide" count is
--   news_articles JOIN news_sources ON source_id WHERE news_sources.organization_id = org.id
-- (api_private.get_organization). /organizations/autostraddle-qc-listing-1116 read
-- "0 articles" while its feed (news_sources "Autostraddle", www.autostraddle.com/feed/)
-- carries 73 non-duplicate articles, because that feed's organization_id is NULL.
--
-- Rule: a feed with no organisation is linked only when its feed HOST, minus a leading
-- www./feeds./feed./rss., equals the website_domain of EXACTLY ONE organisation that
-- holds the `publisher` role. Shared hosts (podcasts.apple.com, youtube.com) can name
-- many publishers and are excluded. Measured 2026-11-27: one match (Autostraddle).
--
-- DRY RUN by default: run the SELECT. The UPDATE is idempotent (it only touches
-- organization_id IS NULL rows) and is left commented out; an operator applies it
-- deliberately, then re-runs the SELECT and expects zero rows.
--
-- Not handled here, reported instead: duplicate publisher organisations for one
-- outlet ("them" vs "them-qc-listing-7132", "pinknews-qc-listing-7131" vs "pink-news");
-- the feed is linked to one row and the other reads zero. That is a merge decision.

with candidates as (
  select ns.id as source_id, ns.name as source_name, ns.url, o.id as org_id, o.slug as org_slug,
         count(*) over (partition by ns.id) as matches
  from news_sources ns
  join organizations o
    on 'publisher' = any (o.roles)
   and o.duplicate_of_id is null
   and o.website_domain is not null
   and lower(o.website_domain) not in ('podcasts.apple.com', 'youtube.com', 'soundcloud.com', 'spotify.com')
   and regexp_replace(lower(split_part(split_part(ns.url, '://', 2), '/', 1)), '^(www|feeds|feed|rss)\.', '')
       = lower(o.website_domain)
  where ns.organization_id is null
)
select c.*, (select count(*) from news_articles a where a.source_id = c.source_id and a.duplicate_of_id is null) as articles
from candidates c
where c.matches = 1
order by c.org_slug;

-- begin;
-- update news_sources ns
--    set organization_id = c.org_id
--   from (
--     select ns2.id as source_id, min(o.id::text)::uuid as org_id
--     from news_sources ns2
--     join organizations o
--       on 'publisher' = any (o.roles)
--      and o.duplicate_of_id is null
--      and o.website_domain is not null
--      and lower(o.website_domain) not in ('podcasts.apple.com', 'youtube.com', 'soundcloud.com', 'spotify.com')
--      and regexp_replace(lower(split_part(split_part(ns2.url, '://', 2), '/', 1)), '^(www|feeds|feed|rss)\.', '')
--          = lower(o.website_domain)
--     where ns2.organization_id is null
--     group by ns2.id
--     having count(*) = 1
--   ) c
--  where ns.id = c.source_id
--    and ns.organization_id is null;
-- commit;
