-- Revoke `anon` EXECUTE on the admin/cron RPC surface.
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- FUNCTIONS TO anon, authenticated, service_role`, so EVERY function created in
-- this project has been anon-callable from the moment it existed unless someone
-- remembered to revoke it. Measured 2026-08-08: 653 functions in `public` are
-- executable by `anon`, 642 via an explicit `anon=X` ACL entry rather than the
-- Postgres PUBLIC default, and **348 of those are VOLATILE** -- they can write.
--
-- This revokes the 97 that are unambiguously operator surface: the `run_*`
-- sweeps and recomputes, the `commit_*_staging_*` pipeline committers, the
-- merge/unmerge cores, the purges, and the `admin_*` RPCs. Among them
-- `run_venue_fuzzy_automerge`, `run_dedup_truth_sweep_all`, `purge_mailbox_emails`,
-- `run_marketplace_catalog_prune`, `admin_delete_marketplace_merchant`.
--
-- **45 of the 97 have no internal authorization check at all** -- marked below.
-- For those the grant was the only thing in the way. The other 52 call
-- `assert_admin_or_internal()` (or equivalent) and already raise 42501 for anon;
-- they are revoked anyway, because a function should not be reachable by a role
-- that has no business calling it even when it would refuse.
--
-- Precedent: 20260806130000 did exactly this for the 12 merge cores after the
-- same defect class was found there. 20260821100000 fixed the two org readers
-- that were leaking gated rows. This generalises both.
--
-- WHY `FROM public, anon` AND NOT JUST `FROM anon`
-- ------------------------------------------------
-- Revoking from `anon` alone is a NO-OP for 50 of these 97. Their ACL carries an
-- empty-grantee entry -- `{=X/postgres,...}` -- which is the PUBLIC grant, and
-- `anon` inherits EXECUTE through it. Verified: after
-- `revoke execute on public.run_presence_purge() from anon`,
-- `has_function_privilege('anon', ...)` was still true and the ACL still read
-- `=X/postgres`. A first draft of this migration revoked only `anon` and left
-- exactly those 50 reachable; the rolled-back rehearsal is what caught it.
--
-- Revoking PUBLIC does not strand the admin console: 95 of the 97 hold an
-- explicit `authenticated=X` entry that survives. The 2 that do not --
-- `run_news_source_unpause_sweep` and `run_staging_rejected_purge` -- are
-- cron-only (service_role + PUBLIC, zero call sites in src/), so they correctly
-- end up service_role/postgres only. That is a tightening, not a regression.
--
-- SCOPE, and what this deliberately does NOT fix
-- ----------------------------------------------
-- Anonymous access only. `authenticated` and `service_role` keep their grants:
--   * pg_cron runs as `postgres` with no JWT -- `assert_admin_or_internal()`
--     returns early when `request.jwt.claims` is null, so crons are unaffected;
--   * edge functions and workers authenticate with the service key;
--   * the admin console calls these as a signed-in admin. Verified per function:
--     the only non-generated consumers are src/hooks/{useContentGraph,
--     useDedupReview,useBulkColumnEdit,useVenueDuplicates}, imported solely by
--     /admin/graph, AdminDuplicates, DedupPendingLink and the CMS
--     BulkActionsBar. Hits in src/integrations/supabase/types.ts are generated
--     type declarations, not call sites.
--
-- So this closes the anonymous vector completely and leaves a narrower one open:
-- for the 45 unguarded functions any SIGNED-IN user can still call them, because
-- `authenticated` is one role and a grant cannot tell an admin from a member who
-- signed up a minute ago. Closing that means adding
-- `perform assert_admin_or_internal();` to 45 bodies -- which fixes both vectors
-- at once and is the right end state, but it is 45 `CREATE OR REPLACE`
-- statements that must reproduce each body byte-exactly, so it belongs in its
-- own reviewed change rather than riding along here.
--
-- Reversible one function at a time:
--   grant execute on function public.<name>(<args>) to anon;

revoke execute on function public.admin_automations_touch_updated_at() from public, anon;   -- NO internal guard
revoke execute on function public.admin_content_graph() from public, anon;
revoke execute on function public.admin_delete_marketplace_merchant(p_id uuid) from public, anon;
revoke execute on function public.admin_entity_neighbors(p_type text, p_id uuid) from public, anon;
revoke execute on function public.admin_import_amazon_conversions(p_rows jsonb) from public, anon;
revoke execute on function public.admin_merchant_overview(p_days integer) from public, anon;
revoke execute on function public.admin_release_gates() from public, anon;
revoke execute on function public.admin_upsert_marketplace_merchant(p jsonb) from public, anon;
revoke execute on function public.approve_dedup_review(p_id uuid, p_keep_id uuid) from public, anon;
revoke execute on function public.approve_dedup_review_batch(p_min_confidence numeric, p_limit integer) from public, anon;
revoke execute on function public.archive_city_as_nonplace(p_id uuid, p_reason text, p_signals jsonb) from public, anon;
revoke execute on function public.claim_dm_push_batch() from public, anon;   -- NO internal guard
revoke execute on function public.cluster_news_backfill(p_limit integer, p_days integer, p_oldest_first boolean) from public, anon;   -- NO internal guard
revoke execute on function public.collapse_duplicate_image_assets(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.collapse_entity_dup_chains(p_type text) from public, anon;
revoke execute on function public.collapse_venue_dup_chains() from public, anon;
revoke execute on function public.commit_city_staging_batch(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.commit_city_staging_item(p_staging_id uuid, p_actor text) from public, anon;   -- NO internal guard
revoke execute on function public.commit_country_staging_batch(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.commit_country_staging_item(p_staging_id uuid, p_actor text) from public, anon;   -- NO internal guard
revoke execute on function public.commit_event_staging_batch(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.commit_event_staging_item(p_staging_id uuid, p_actor text) from public, anon;   -- NO internal guard
revoke execute on function public.commit_hotel_staging_batch(p_limit integer, p_pipeline_run_id uuid) from public, anon;   -- NO internal guard
revoke execute on function public.commit_marketplace_staging_batch(p_limit integer, p_pipeline_run_id uuid) from public, anon;   -- NO internal guard
revoke execute on function public.commit_personality_staging_batch(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.commit_venue_staging_batch(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.commit_venue_staging_item(p_staging_id uuid, p_actor text) from public, anon;   -- NO internal guard
revoke execute on function public.dlq_claim_batch(p_limit integer, p_worker text) from public, anon;   -- NO internal guard
revoke execute on function public.guide_picks_maintain() from public, anon;   -- NO internal guard
revoke execute on function public.ingest_firecrawl_batch(p_secret text, p_items jsonb) from public, anon;
revoke execute on function public.merge_tag_concept(p_canonical_id uuid, p_duplicate_id uuid, p_actor text, p_source text) from public, anon;
revoke execute on function public.merge_vocab_term(p_vocab text, p_keep_id uuid, p_drop_id uuid) from public, anon;
revoke execute on function public.purge_mailbox_emails() from public, anon;   -- NO internal guard
revoke execute on function public.purge_travel_inbox_raw_bodies() from public, anon;   -- NO internal guard
revoke execute on function public.recompute_marketplace_price_usd() from public, anon;   -- NO internal guard
revoke execute on function public.recompute_safety_gated_for_country(p_country_id uuid) from public, anon;   -- NO internal guard
revoke execute on function public.relink_village_venues(p_village_id uuid, p_radius_m integer) from public, anon;   -- NO internal guard
revoke execute on function public.reset_city_enrichment_state(p_keys text[], p_city_ids uuid[], p_batch integer) from public, anon;
revoke execute on function public.run_city_cost_of_living_backfill(p_batch integer) from public, anon;
revoke execute on function public.run_city_timezone_backfill(p_batch integer) from public, anon;
revoke execute on function public.run_content_graph_recompute() from public, anon;   -- NO internal guard
revoke execute on function public.run_data_normalization_guard(p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_dedup_truth_sweep(p_type text, p_mode text, p_merge_cap integer) from public, anon;
revoke execute on function public.run_dedup_truth_sweep_all(p_mode text) from public, anon;
revoke execute on function public.run_event_dedup_sweep(p_dry_run boolean, p_limit integer) from public, anon;
revoke execute on function public.run_event_tags_backfill(p_batch integer, p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_event_venue_link() from public, anon;   -- NO internal guard
revoke execute on function public.run_existence_decision_event() from public, anon;   -- NO internal guard
revoke execute on function public.run_existence_decision_marketplace() from public, anon;   -- NO internal guard
revoke execute on function public.run_existence_decision_venue() from public, anon;   -- NO internal guard
revoke execute on function public.run_feedback_auto_dedup() from public, anon;   -- NO internal guard
revoke execute on function public.run_feedback_stale_error_gc() from public, anon;   -- NO internal guard
revoke execute on function public.run_feedback_stale_flag() from public, anon;   -- NO internal guard
revoke execute on function public.run_link_orgs_to_venues_by_domain() from public, anon;   -- NO internal guard
revoke execute on function public.run_marketplace_affiliate_backfill(p_batch integer, p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_marketplace_catalog_prune(p_batch integer, p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_marketplace_dedup_sweep() from public, anon;   -- NO internal guard
revoke execute on function public.run_news_category_backfill(p_after uuid, p_max_batches integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_news_category_revise(p_after uuid, p_max_batches integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_news_quality_recompute(p_full boolean, p_after uuid, p_max_batches integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_news_safe_publish_sweep(p_min_relevance numeric, p_min_quality integer, p_min_content integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_news_source_unpause_sweep(p_max_attempts integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_news_trust_recompute(p_full boolean, p_after uuid, p_max_batches integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_org_quality_recompute(p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_personality_auto_promote(p_limit integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_personality_coverage_radar(p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_personality_trust_recompute(p_limit integer, p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_presence_purge() from public, anon;   -- NO internal guard
revoke execute on function public.run_promote_support_orgs() from public, anon;   -- NO internal guard
revoke execute on function public.run_review_queue_retention(p_max_batches integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_social_card_refresh() from public, anon;   -- NO internal guard
revoke execute on function public.run_staging_rejected_purge(p_batch integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_tag_auto_merge(p_min_similarity numeric, p_limit integer) from public, anon;
revoke execute on function public.run_tag_category_resync(p_batch integer) from public, anon;
revoke execute on function public.run_tag_cooccurrence_relations(p_min_support integer, p_min_jaccard numeric, p_top_k integer) from public, anon;
revoke execute on function public.run_tag_ontology_recompute() from public, anon;
revoke execute on function public.run_tag_plural_merge(p_limit integer, p_dry_run boolean) from public, anon;
revoke execute on function public.run_tag_wikidata_hierarchy(p_chunk integer) from public, anon;
revoke execute on function public.run_venue_closure_decision(p_dry_run boolean) from public, anon;
revoke execute on function public.run_venue_event_demisfile(p_batch integer, p_confirm boolean) from public, anon;
revoke execute on function public.run_venue_fuzzy_automerge(p_dry_run boolean, p_limit integer) from public, anon;
revoke execute on function public.run_venue_quality_recompute(p_batch integer) from public, anon;
revoke execute on function public.run_venue_tag_cleanup(p_batch integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_village_completeness_recompute(p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_village_coverage_radar(p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.run_village_relink_batch(p_radius_m integer, p_batch integer) from public, anon;   -- NO internal guard
revoke execute on function public.run_village_trust_recompute(p_force boolean) from public, anon;   -- NO internal guard
revoke execute on function public.seed_social_profiles() from public, anon;   -- NO internal guard
revoke execute on function public.sync_geo_spine_city() from public, anon;   -- NO internal guard
revoke execute on function public.sync_geo_spine_continent() from public, anon;   -- NO internal guard
revoke execute on function public.sync_geo_spine_country() from public, anon;   -- NO internal guard
revoke execute on function public.sync_geo_spine_region() from public, anon;   -- NO internal guard
revoke execute on function public.sync_geo_spine_village() from public, anon;   -- NO internal guard
revoke execute on function public.unarchive_city(p_id uuid) from public, anon;
revoke execute on function public.unmerge_entities(p_audit_id uuid) from public, anon;
revoke execute on function public.unmerge_tag_concept(p_audit_id uuid) from public, anon;
revoke execute on function public.unmerge_vocab_term(p_audit_id uuid) from public, anon;

-- Regrowth is the obvious next worry: the NEXT `run_*` function created
-- inherits `GRANT ALL ... TO anon` from Supabase's default privileges and
-- silently re-opens this.
--
-- `alter default privileges in schema public revoke execute on functions from
-- anon;` would stop that, and is deliberately NOT done here. It is a global,
-- fail-closed posture change: every future genuinely-public RPC would need an
-- explicit `grant execute ... to anon`, and a forgotten grant reads as a broken
-- public feature rather than a permissions error. This repo has concurrent
-- sessions writing migrations, so that surprise would land on someone else with
-- no clue why their new RPC 404s for logged-out users. It is the right end
-- state, but it is a decision to take deliberately, not a rider on a revoke.
--
-- Instead the regrowth guard is a contract test that fails CI when a new
-- admin-shaped function is anon-callable:
--   supabase/migrations/__tests__/anon_admin_rpc_grants.sql
