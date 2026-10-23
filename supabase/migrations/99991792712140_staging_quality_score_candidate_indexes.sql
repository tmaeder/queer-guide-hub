-- pipeline-quality-score's existing selector scans/sorts the whole staging
-- table even for an empty domain. The event drain repeatedly times out loading
-- zero candidates. Match BOTH unchanged enrichment arms and status guards.
-- One index serves scoped drains; the second serves the unscoped pipeline node.
-- No score, disposition, review state or candidate predicate changes.
set local lock_timeout='2s';
create index if not exists ingestion_staging_quality_candidates_domain_idx
 on public.ingestion_staging(entity_type,created_at,id)
 where dedup_status in('unique','pending')
  and ai_validation_status in('approved','pending')
  and ((enrichment_status='pending' and enriched_data->>'quality_score' is null)
    or (enrichment_status='enriched' and enriched_data->>'quality_status' is not null));
create index if not exists ingestion_staging_quality_candidates_created_idx
 on public.ingestion_staging(created_at,id)
 where dedup_status in('unique','pending')
  and ai_validation_status in('approved','pending')
  and ((enrichment_status='pending' and enriched_data->>'quality_score' is null)
    or (enrichment_status='enriched' and enriched_data->>'quality_status' is not null));

