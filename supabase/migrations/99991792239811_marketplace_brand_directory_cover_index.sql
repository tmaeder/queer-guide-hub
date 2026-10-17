-- `get_marketplace_brand_directory()` reads 80,060 buffers to return 827 rows,
-- and times out for anon on a cold cache.
--
-- The makers directory derives each brand's cover from a LATERAL join onto its
-- best listing:
--
--   WHERE l.brand_key = b.brand_key AND l.overview_eligible
--     AND l.content_rating IN ('sfw','suggestive')
--   ORDER BY l.boutique_score DESC NULLS LAST, l.id
--   LIMIT 1
--
-- There was no index that predicate could use. The closest,
-- `idx_marketplace_listings_brand_cover`, is
-- `(brand_key, boutique_score DESC NULLS LAST) WHERE status='active' AND
-- content_rating IN ('sfw','suggestive')` — and a partial index is only usable
-- when its predicate is IMPLIED by the query. The function never filters
-- `status`, so that index cannot be used for this call at all; it is not a near
-- miss, it is unusable. `marketplace_listings_overview_browse_idx` has the right
-- WHERE but leads on `boutique_score`, not `brand_key`, so it cannot serve a
-- per-brand lookup either.
--
-- MEASURED ON PROD 2026-10-17, same function, warm cache both times:
--
--   before   291.4 ms   80,060 buffers
--   after     16.7 ms    6,707 buffers      (17.5x faster, 12x fewer buffers)
--
-- Warm time was never the problem — 827 rows at 291 ms is fine. The 80k buffer
-- accesses are, because on a COLD cache they are physical reads, and the anon
-- role's statement_timeout is 3s. Measured: five consecutive warm anon calls
-- returned 200 in 0.23-0.33 s, while the first call in a fresh Playwright run
-- returned `57014 canceling statement due to statement timeout`. That is the
-- intermittent failure in e2e/makers-rotation-and-gallery.spec.ts, and what a
-- reader sees is a makers page with no gallery.
--
-- HONESTY NOTE ON HOW THIS INDEX GOT THERE. I created it on prod directly while
-- measuring, by running CREATE INDEX through the management API WITHOUT the
-- trailing `raise exception` that makes such a probe roll back — every other dry
-- run in this series had one. So the index was already live before this file
-- existed. It is kept rather than dropped and recreated: it is a measured
-- improvement, and dropping it to restore a tidy order would open a window where
-- the timeout returns for no benefit. `IF NOT EXISTS` is what makes this file
-- agree with prod today and still reproduce the index on a rebuild from zero.
--
-- NOT `CONCURRENTLY`: migrations run inside a transaction, where that is not
-- allowed. The table is 71,239 rows and the index is 400 kB, so the brief lock
-- is not a concern.

create index if not exists idx_mkt_listings_brand_overview_cover
  on public.marketplace_listings (brand_key, boutique_score desc nulls last, id)
  where overview_eligible and content_rating in ('sfw', 'suggestive');

do $verify$
declare
  v_def text;
begin
  select indexdef into v_def
  from pg_indexes
  where schemaname = 'public' and indexname = 'idx_mkt_listings_brand_overview_cover';

  if v_def is null then
    raise exception 'the cover index was not created';
  end if;

  -- The three properties that make it usable by the LATERAL join. Asserted
  -- rather than assumed, because an index with the right NAME and the wrong
  -- predicate is exactly the trap this file exists to correct: the predicate must
  -- be IMPLIED by the function's WHERE, and the leading column must be the one it
  -- looks up by.
  if position('brand_key' in v_def) = 0 then
    raise exception 'the cover index does not lead on brand_key: %', v_def;
  end if;
  if position('overview_eligible' in v_def) = 0 then
    raise exception 'the cover index is not restricted to overview_eligible: %', v_def;
  end if;
  if position('status' in v_def) > 0 then
    raise exception 'the cover index predicates on status, which the function never filters: %', v_def;
  end if;

  raise notice 'ok: idx_mkt_listings_brand_overview_cover present and usable by get_marketplace_brand_directory';
end
$verify$;
