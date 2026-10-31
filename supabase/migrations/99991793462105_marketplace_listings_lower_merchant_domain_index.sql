-- Index lower(merchant_domain) on active marketplace listings, so
-- get_organization()'s product count stops reading the whole table.
--
-- api_private.get_organization(p_slug) computes
--   product_count = count(*) from marketplace_listings l
--                   where lower(l.merchant_domain) = lower(o.website_domain)
--                     and l.status = 'active'
-- and no index covered lower(merchant_domain), so every call read the full
-- 249 MB table. Measured 2026-10-31 for reddit-lgbt: 2,791 ms cold and 183 ms
-- warm for that count alone, against 73 ms for articles and 10 ms for venues.
-- 18,209 calls averaged 154 ms with a standard deviation of 430 ms and hit
-- the anon role's 3s statement_timeout a few times every hour (135 in 24h).
--
-- The index matches the predicate exactly (expression and partial WHERE), so
-- the planner can use it without any change to the function, and results
-- cannot change. In a rolled-back transaction on prod the count went from
-- 183 ms to 1.6 ms; the index is 448 kB.
--
-- No CONCURRENTLY (migrations run in a transaction). CREATE INDEX takes a
-- SHARE lock that blocks writes to marketplace_listings, not reads, for the
-- few seconds the build takes; lock_timeout makes the migration fail rather
-- than queue behind a long-running write and stall everything behind it.

set local lock_timeout = '10s';

create index if not exists idx_marketplace_listings_active_lower_merchant_domain
  on public.marketplace_listings (lower(merchant_domain))
  where status = 'active';
