-- Replace retired interactive lookups with the scoped, review-only weekly adapter.
-- Preserve operator enable/disable controls and all source configuration.
begin;
update public.ingestion_sources set edge_function='source-weekly-enrichment',updated_at=now()
where (slug='wikipedia' and edge_function='get-wikipedia-info')
   or (slug='pexels' and edge_function='get-pexels-images');
commit;
