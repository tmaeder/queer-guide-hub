-- Decommission Meilisearch: drop the pg_net sync triggers that pushed content
-- mutations to the (now-retired) meilisearch-sync edge function. Search is
-- served from Postgres (search_hybrid / search_autocomplete over
-- search_documents), which is kept fresh by its own trg_search_documents_*
-- triggers (search_documents_sync) — unaffected by this change.

drop trigger if exists trg_meilisearch_sync on public.cities;
drop trigger if exists trg_meilisearch_sync on public.countries;
drop trigger if exists trg_meilisearch_sync on public.events;
drop trigger if exists trg_meilisearch_sync on public.marketplace_listings;
drop trigger if exists trg_meilisearch_sync on public.news_articles;
drop trigger if exists trg_meilisearch_sync on public.unified_tags;
drop trigger if exists trg_meilisearch_sync on public.venues;
drop trigger if exists trg_meilisearch_sync on public.personalities;
drop trigger if exists trg_meilisearch_sync on public.queer_villages;
drop trigger if exists trg_venues_hide_duplicate on public.venues;

drop function if exists public.notify_meilisearch_sync() cascade;
drop function if exists public.notify_meilisearch_duplicate_hide() cascade;
