-- Close the `authenticated` half of the admin-RPC exposure.
--
-- 20260822100000 revoked `anon` on 97 admin/cron RPCs and named the remainder:
-- 45 of them carry no internal authorization check, so any SIGNED-IN user could
-- still call them -- `authenticated` is one role and a grant cannot tell an
-- admin from a member who signed up a minute ago.
--
-- That note proposed adding `perform assert_admin_or_internal();` to ~45 bodies.
-- **That turned out to be the wrong fix, and this is why.**
--
-- Re-derived the set against production: 56 admin/cron functions are
-- `authenticated`-executable, VOLATILE, and unguarded. Then checked who actually
-- calls them:
--
--   * called from src/ (the browser client, i.e. the only thing that ever
--     authenticates as `authenticated`) ............................ 0 of 56
--   * called from supabase/functions, workers/ or scripts/ ......... 23 of 56
--
-- and every one of those 23 builds its client with the SERVICE key, not the
-- caller's JWT. Spot-checked the three highest-risk callers:
--   - ingestion-review-api  -> `getServiceClient()`   (the admin review flow)
--   - push-dispatcher       -> SUPABASE_SERVICE_ROLE_KEY
--   - pipeline-dlq-consumer -> SUPABASE_SERVICE_ROLE_KEY
-- The remaining 33 are pg_cron only.
--
-- So nothing legitimately calls these as `authenticated`, and the grant can just
-- go. That is strictly better than a body guard: no EXECUTE at all beats
-- execute-then-raise, and it edits zero function bodies -- 56 `CREATE OR REPLACE`
-- statements reproducing each body byte-exactly was the real risk in the
-- original plan, for no security gain.
--
-- SAFE FOR CRON, verified before writing this:
--   all 56 carry an explicit `service_role=X` AND `postgres=X` ACL entry, and
--   NONE still holds a PUBLIC grant (20260822100000 removed those). So revoking
--   `authenticated` cannot strand pg_cron (runs as postgres), edge functions or
--   workers (service key).
--
-- DELIBERATELY EXCLUDED -- 6 trigger functions
--   `sync_geo_spine_{city,continent,country,region,village}` and
--   `admin_automations_touch_updated_at` match the admin-shaped name pattern and
--   are unguarded, but they are TRIGGER functions with live triggers attached.
--   Guarding or revoking those would break ordinary writes: every authenticated
--   user who edits a city would hit the geo-spine mirror trigger and fail. They
--   are excluded by `prorettype <> 'trigger'` plus a `pg_trigger` check, not by
--   hand. This is the trap that makes "add a guard to everything admin-shaped"
--   an actively dangerous instruction.
--
-- Reversible per function:
--   grant execute on function public.<name>(<args>) to authenticated;

revoke execute on function public.claim_dm_push_batch() from authenticated;
revoke execute on function public.cluster_news_article(p_article_id uuid) from authenticated;
revoke execute on function public.cluster_news_backfill(p_limit integer, p_days integer, p_oldest_first boolean) from authenticated;
revoke execute on function public.collapse_duplicate_image_assets(p_limit integer) from authenticated;
revoke execute on function public.commit_city_staging_batch(p_limit integer) from authenticated;
revoke execute on function public.commit_city_staging_item(p_staging_id uuid, p_actor text) from authenticated;
revoke execute on function public.commit_country_staging_batch(p_limit integer) from authenticated;
revoke execute on function public.commit_country_staging_item(p_staging_id uuid, p_actor text) from authenticated;
revoke execute on function public.commit_event_staging_batch(p_limit integer) from authenticated;
revoke execute on function public.commit_event_staging_item(p_staging_id uuid, p_actor text) from authenticated;
revoke execute on function public.commit_hotel_staging_batch(p_limit integer, p_pipeline_run_id uuid) from authenticated;
revoke execute on function public.commit_marketplace_staging_batch(p_limit integer, p_pipeline_run_id uuid) from authenticated;
revoke execute on function public.commit_news_staging_item(p_staging_id uuid, p_actor text) from authenticated;
revoke execute on function public.commit_personality_staging_batch(p_limit integer) from authenticated;
revoke execute on function public.commit_venue_staging_batch(p_limit integer) from authenticated;
revoke execute on function public.commit_venue_staging_item(p_staging_id uuid, p_actor text) from authenticated;
revoke execute on function public.dlq_claim_batch(p_limit integer, p_worker text) from authenticated;
revoke execute on function public.guide_picks_maintain() from authenticated;
revoke execute on function public.purge_mailbox_emails() from authenticated;
revoke execute on function public.purge_travel_inbox_raw_bodies() from authenticated;
revoke execute on function public.relink_village_venues(p_village_id uuid, p_radius_m integer) from authenticated;
revoke execute on function public.run_content_graph_recompute() from authenticated;
revoke execute on function public.run_data_normalization_guard(p_force boolean) from authenticated;
revoke execute on function public.run_event_tags_backfill(p_batch integer, p_force boolean) from authenticated;
revoke execute on function public.run_event_venue_link() from authenticated;
revoke execute on function public.run_existence_decision_event() from authenticated;
revoke execute on function public.run_existence_decision_marketplace() from authenticated;
revoke execute on function public.run_existence_decision_venue() from authenticated;
revoke execute on function public.run_feedback_auto_dedup() from authenticated;
revoke execute on function public.run_feedback_stale_error_gc() from authenticated;
revoke execute on function public.run_feedback_stale_flag() from authenticated;
revoke execute on function public.run_link_orgs_to_venues_by_domain() from authenticated;
revoke execute on function public.run_marketplace_affiliate_backfill(p_batch integer, p_force boolean) from authenticated;
revoke execute on function public.run_marketplace_catalog_prune(p_batch integer, p_force boolean) from authenticated;
revoke execute on function public.run_marketplace_dedup_sweep() from authenticated;
revoke execute on function public.run_marketplace_review_autotriage(p_batch integer, p_force boolean) from authenticated;
revoke execute on function public.run_marketplace_tag_llm(p_force boolean) from authenticated;
revoke execute on function public.run_news_category_backfill(p_after uuid, p_max_batches integer) from authenticated;
revoke execute on function public.run_news_category_revise(p_after uuid, p_max_batches integer) from authenticated;
revoke execute on function public.run_news_quality_recompute(p_full boolean, p_after uuid, p_max_batches integer) from authenticated;
revoke execute on function public.run_news_safe_publish_sweep(p_min_relevance numeric, p_min_quality integer, p_min_content integer) from authenticated;
revoke execute on function public.run_news_trust_recompute(p_full boolean, p_after uuid, p_max_batches integer) from authenticated;
revoke execute on function public.run_org_quality_recompute(p_force boolean) from authenticated;
revoke execute on function public.run_personality_auto_promote(p_limit integer) from authenticated;
revoke execute on function public.run_personality_coverage_radar(p_force boolean) from authenticated;
revoke execute on function public.run_personality_trust_recompute(p_limit integer, p_force boolean) from authenticated;
revoke execute on function public.run_presence_purge() from authenticated;
revoke execute on function public.run_promote_support_orgs() from authenticated;
revoke execute on function public.run_review_queue_retention(p_max_batches integer) from authenticated;
revoke execute on function public.run_social_card_refresh() from authenticated;
revoke execute on function public.run_venue_tag_cleanup(p_batch integer) from authenticated;
revoke execute on function public.run_village_completeness_recompute(p_force boolean) from authenticated;
revoke execute on function public.run_village_coverage_radar(p_force boolean) from authenticated;
revoke execute on function public.run_village_relink_batch(p_radius_m integer, p_batch integer) from authenticated;
revoke execute on function public.run_village_trust_recompute(p_force boolean) from authenticated;
revoke execute on function public.seed_social_profiles() from authenticated;
