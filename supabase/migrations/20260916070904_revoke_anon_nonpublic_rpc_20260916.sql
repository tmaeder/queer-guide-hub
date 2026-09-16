-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916070904 with no repo file — the signature of
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

create table if not exists security_audit.phase7_20260916_anon_nonpublic_rpc_snapshot (
  object_identity text primary key,
  revoked_anon_execute boolean not null,
  authenticated_execute_preserved boolean not null,
  service_role_execute_preserved boolean not null,
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase7_20260916_anon_nonpublic_rpc_snapshot from public, anon, authenticated;

insert into security_audit.phase7_20260916_anon_nonpublic_rpc_snapshot (
 object_identity,revoked_anon_execute,authenticated_execute_preserved,service_role_execute_preserved,original_proacl
)
select p.oid::regprocedure::text,
 has_function_privilege('anon',p.oid,'execute'),
 has_function_privilege('authenticated',p.oid,'execute'),
 has_function_privilege('service_role',p.oid,'execute'),
 p.proacl::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.oid::regprocedure::text in (
 'assert_search_hybrid_contract()',
 'city_capital_gaps()',
 'detect_trip_gaps(uuid)',
 'dm_digest_candidates(integer)',
 'find_marketplace_fuzzy_duplicate_clusters(integer)',
 'find_semantic_duplicate_candidates(text,vector,numeric,integer,numeric,numeric,uuid)',
 'footprint_return_nudge_self()',
 'footprint_stats_self()',
 'get_event_social_signals(uuid[],uuid)',
 'get_followed_tags_feed(integer,timestamp with time zone)',
 'get_personalized_marketplace_listings(uuid,integer,boolean)',
 'get_similar_trip_suggestions(uuid,integer)',
 'get_venue_social_signals(uuid[],uuid)',
 'glossary_link_signals()',
 'guide_reading_streak(uuid)',
 'list_milestone_link_proposals(text,integer)',
 'list_news_saved_searches()',
 'marketplace_due_for_existence_check(integer)',
 'marketplace_due_for_variant_extract(integer)',
 'news_source_starvation_stats()',
 'news_thin_for_refetch(integer)',
 'personalities_freigabe_queue(text,integer)',
 'personality_freigabe_funnel()',
 'quest_progress(uuid)',
 'search_inbox(uuid,text,integer)',
 'silo_concept_coverage()',
 'suggest_message_recipients(uuid,integer)',
 'tag_merge_graph_signals()',
 'tag_ontology_health()',
 'tag_vocabulary_health()',
 'tags_adult_review_candidates(integer)',
 'tags_due_for_content(integer)'
)
on conflict (object_identity) do nothing;

do $migration$
declare target record;
begin
 for target in
  select object_identity from security_audit.phase7_20260916_anon_nonpublic_rpc_snapshot
  where revoked_anon_execute
 loop
  execute format('revoke execute on function %s from anon',target.object_identity);
 end loop;
end
$migration$;
;
