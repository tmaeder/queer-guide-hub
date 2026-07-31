-- Drops the database-block schema. The feature was reverted; nothing reads
-- any of this.
--
-- The two creating migrations (20260802100000, 20260803100000) are deliberately
-- LEFT IN PLACE rather than deleted: they are recorded in the remote
-- supabase_migrations.schema_migrations, and removing the files would leave a
-- remote version with no repo file — the exact drift that makes `db push` skip
-- silently and that the drift monitor alerts on. Reverting DDL means a new
-- forward migration, never deleting an applied one.

drop function if exists public.sync_document_entity_edges(text, uuid, jsonb);
drop table if exists public.document_entity_edges;
drop view if exists public.v_entity_cards;

alter table public.cms_pages
  drop constraint if exists cms_pages_body_doc_is_doc,
  drop constraint if exists cms_pages_body_source_valid;

-- Both columns were introduced by this feature and were never populated by
-- application code (verified: 0 rows with a non-null body_doc).
alter table public.cms_pages
  drop column if exists body_doc,
  drop column if exists body_source;

-- ────────────────────────────────────────────────────────────────────────────
-- DELIBERATELY NOT REVERTED: the search_documents gate
-- ────────────────────────────────────────────────────────────────────────────
--
-- 20260803100000 replaced the `using (true)` policy on public.search_documents
-- with `using ((not safety_gated) or (select auth.uid()) is not null)` and
-- granted anon SELECT.
--
-- That table carries safety_gated rows — venues, events and organizations in
-- criminalizing and death-penalty countries — and its gating had until then
-- lived only inside the SECURITY DEFINER search RPCs. Restoring `using (true)`
-- would put the permissive policy back on a table that is in the generated
-- client types and reachable via PostgREST.
--
-- This is a standalone security property, independent of the reverted feature,
-- so it stays. Verified live after this migration: anon sees 0 gated rows,
-- authenticated sees all of them.
