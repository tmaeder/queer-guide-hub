-- /admin/content ("All content") reads the 100 most recently updated rows of
-- every content type: `select * … order by updated_at desc limit 100`.
-- Neither table below has a usable index on updated_at, so each request is a
-- full seq scan + top-N sort. Measured on prod 2026-10-24:
--   marketplace_listings  71.5k rows / 249 MB heap -> 2.0–5.2 s (30k pages read)
--   organizations        111.9k rows / 325 MB heap -> ~0.45 s
-- Field LCP for that page was 8.6 s (web_vital RUM, PR #4753).
-- The existing marketplace_listings_variant_work_idx leads on
-- attributes_extracted_at and is partial, so it cannot serve this order.
-- ~2–3 MB per index. Not CONCURRENTLY: migrations run in a transaction.

create index if not exists marketplace_listings_updated_at_idx
  on public.marketplace_listings (updated_at desc);

create index if not exists organizations_updated_at_idx
  on public.organizations (updated_at desc);
