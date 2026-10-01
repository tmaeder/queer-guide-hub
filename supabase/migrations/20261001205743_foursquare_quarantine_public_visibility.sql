-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261001205743 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Venue public reads historically treat only `archived` as non-visible. Keep
-- the Foursquare discovery cohort reversible and available to editors, but do
-- not expose provider-only candidates while independent corroboration remains
-- pending. Future unmatched discoveries never create a venue; this repairs the
-- 37 records inserted before that gate existed.
with unresolved_foursquare_discoveries as (
  select distinct s.target_record_id
    from public.ingestion_staging s
    join public.review_queue q
      on q.entity_type = 'ingestion_staging'
     and q.entity_id = s.id
     and q.review_type = 'foursquare_independent_corroboration'
     and q.status = 'pending'
   where s.source_name in ('foursquare', 'foursquare_os')
     and s.target_record_id is not null
     and s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'
)
update public.venues v
   set review_status = 'archived',
       needs_attention = true,
       updated_at = now()
  from unresolved_foursquare_discoveries u
 where v.id = u.target_record_id
   and v.review_status = 'pending';
