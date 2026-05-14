# Row-Level Security audit — Phase 1 (2026-05-14)

Snapshot of every table in the `public` schema of Supabase project `xqeacpakadqfxjxjcewc`. Generated from live `pg_class` / `pg_policies` queries, not from migrations.

> The Supabase JS client always uses the `authenticated` or `anon` PostgREST role. Anything not granted to one of those (or to the generic `public` role with a USING clause that lets them through) is unreachable from the browser. This audit only flags the *reachable* shape.

## Headline numbers

| Metric | Count |
|---|---:|
| Tables in `public` schema | 279 |
| RLS enabled | **279 (100%)** |
| RLS forced (`relforcerowsecurity`) | 10 |
| Tables with **zero policies** | 2 |
| Tables granting `anon` role any access | 13 |
| Tables granting `public` role any SELECT | 121 |
| `npm audit --omit=dev` vulnerabilities | 0 |

RLS is universally enabled — there is no public table where a browser request bypasses policy. The risk surface is in policy *shape*, not policy *presence*.

## Tables forcing RLS

`FORCE ROW LEVEL SECURITY` applies policies even to the table owner (matters for migrations and SECURITY DEFINER functions that don't bypass with `SET LOCAL row_security = OFF`). The 10 tables that opt into this stricter mode are the ones with the most sensitive data:

`conversation_participants`, `conversations`, `donations`, `messages`, `profiles`, `scraper_snapshots`, `user_passkeys`, `user_photos`, `user_relationships`, `user_sessions`.

This list is conservative; consider extending to `user_email_tokens`, `passkey_challenges`, `auth_rate_limit_keys`, and any other table whose contents have direct security or PII implications.

## ⚠️ Tables with RLS enabled but **zero policies**

With RLS on and no policies, *no row is visible to anon or authenticated*. The only way to read or write is via a `SECURITY DEFINER` function or a service-role connection.

| Table | Status | Notes |
|---|---|---|
| `cms_pages_translations` | dead? | Defined in `supabase/migrations/drafts/2026XXXX_cms_pages_locale.sql` (drafts/ folder = not applied). Zero references in `src/`, `workers/`, `supabase/functions/`. Either remove the table or apply the draft migration and add policies. |
| `venue_redirects` | hidden by design | Created in `supabase/migrations/20260505110000_dedupe_venues.sql`. Zero references in `src/`. Presumably consumed by a SECURITY DEFINER lookup function. Document the access path or add a public SELECT policy for `redirect_to`. |

## ⚠️ Anon-role grants (13 tables)

Tables where `pg_policies.roles` explicitly contains `anon`. Worth keeping a short leash on — these are the table-policy pairs that anonymous visitors can hit directly.

| Table | Anon policies | Intent | Risk |
|---|---:|---|---|
| `profiles` | 1 | `profiles_public_read`: SELECT for rows where `privacy_settings->>profile_visibility = 'public'` (defaults to `'public'` via COALESCE) | **By design** for an LGBTQ+ directory, but the COALESCE-to-public default means every profile is anon-readable unless the owner toggles it. Consider flipping default to `'private'` and showing only explicit opt-ins. |
| `community_submissions` | 2 | Unauthenticated submission flow (extension + web form) | Expected. |
| `city_aliases`, `cms_pages`, `event_sources`, `festivals`, `geo_sources`, `news_quality_settings`, `redirects`, `venue_reviews`, `venue_sources` | 1 each | Reference / public-content reads | Expected for editorial / lookup data. |
| `feedback_dispatch_counters` | 1 | **DENY policy**: `roles={anon,authenticated}`, `USING (false)`, `WITH CHECK (false)` | **Good pattern** — explicit deny. |
| `webhook_deliveries` | 1 | **DENY policy** same shape | **Good pattern.** |

## ⚠️ Sensitive tables granting `public` role SELECT

PostgreSQL's `public` pseudo-role includes both `anon` and `authenticated`. Anyone with a USING clause that resolves true gets through. Tables below grant SELECT to `public` and contain personal / private data — checked their USING clauses to confirm they correctly filter by `auth.uid()` (so anon evaluates `NULL = user_id` → false → no rows):

| Table | Policy | USING clause | Verdict |
|---|---|---|---|
| `messages` | "Enhanced message privacy" | `EXISTS (cp WHERE cp.conversation_id = … AND cp.user_id = auth.uid())` | Safe — anon has `auth.uid() IS NULL` so the inner check fails. |
| `user_sessions` | "User sessions read access" | `user_id = auth.uid() OR jwt.role = 'admin'` | Safe — same anon mitigation. |
| `user_relationships` | "Users can view their relationships" | `auth.uid() = user_id OR auth.uid() = target_user_id` | Safe. |
| `user_email_tokens` | `user_email_tokens_owner_select` | `auth.uid() = user_id` | Safe. |
| `notifications`, `trip_*` (16 tables), `push_*`, `mailbox_emails`, … | similar `auth.uid()`-gated USING clauses | | All safe by the same anon-NULL pattern. |

**Hardening opportunity, not a bug:** these policies should target `authenticated` directly, not `public`. The current shape works because `auth.uid()` returns NULL for anonymous requests and the USING expression filters them out — but a future refactor of any USING clause that introduces a path resolving truthy for NULL (e.g. `IS NOT DISTINCT FROM`, `COALESCE(auth.uid(), …)`, broken admin-role check) would silently leak. Migrating these to `FOR SELECT TO authenticated` would make the invariant lexical.

## Tables granting `public` role SELECT (full list, 121 tables)

Generated from `pg_policies WHERE 'public' = ANY(roles) AND cmd IN ('SELECT', 'ALL')`. Most are correctly intended for public access (events, venues, news, hotels, cms_content, etc.) — they're a feature of the open editorial database. The flagged ones above are the subset that contain user-specific data and rely on USING-clause filtering.

```
accessibility_attributes, ai_suggestions, airports, amenities, api_circuit_breakers,
attributes, audio_files, audio_processing_jobs, audio_renditions, automation_modules,
automation_rules, boundaries, canned_responses, cities, cms_content, cms_content_media,
cms_content_relationships, cms_content_revisions, cms_media, comment_likes,
community_groups, community_posts, contact_submissions, content_embeddings,
content_metadata, content_threads, content_translations, continents, countries,
currencies, donations, enrichment_log, entity_attribute_assignments, event_amenities,
event_attendees, event_categories, event_favorites, event_occurrences, event_services,
event_types, events, feedback, feedback_votes, flyer_scans, fx_rates, geo_link_log,
geo_validations, group_join_requests, group_memberships, group_notifications,
group_post_comments, group_posts, hotels, image_asset_links, image_assets,
import_audit_log, import_jobs_enhanced, import_validation_results, knowledge_base,
languages, mailbox_emails, mailbox_reserved_addresses, marketplace_categories,
marketplace_favorites, marketplace_listing_sources, marketplace_listings,
marketplace_merchants, marketplace_price_history, marketplace_reviews,
media_optimization_status, message_reactions, messages, news_article_cities,
news_article_countries, news_articles, news_categories, news_sources, notifications,
personalities, personality_sources, pipeline_definition_versions, pipeline_definitions,
pipeline_health_alerts, pipeline_node_types, pipeline_permissions, pipeline_runs,
placeholder_images, post_comments, post_likes, presence_statuses, professions,
push_notification_logs, push_sent, push_subscriptions, queer_villages,
rag_conversations, reservations, scrape_runs, scrape_sources,
scraper_dedupe_decisions, search_audit_log, search_reindex_jobs,
search_settings_versions, search_synonyms, search_visibility_scores, tag_aliases,
tag_categories, tag_category_assignments, tag_relationships, tag_slug_redirects,
tag_suggestions, target_groups, topic_cluster_tags, topic_clusters,
trip_booking_clicks, trip_budget_items, trip_concierge_messages, trip_days,
trip_documents, trip_members, trip_messages, trip_notes, trip_nudges,
trip_packing_items, trip_places, trip_polls, trip_recaps, trip_safety_briefings,
trip_share_comments, trip_share_reactions, trip_share_views, trip_shares,
trip_suggestion_impressions, trips, ui_themes, unified_tag_assignments, unified_tags,
user_email_tokens, user_events, user_recommendations, user_relationships, user_roles,
user_sessions, venue_amenities, venue_categories, venue_services,
venue_tag_assignments, venues, video_renditions, videos
```

## Recommendations (no PR included)

1. **Add policies for the two zero-policy tables**, or drop them. `cms_pages_translations` looks like a stalled migration draft; `venue_redirects` likely needs an explicit `FOR SELECT TO public USING (true)` so the redirect lookup works for anon visitors hitting the old slug.
2. **Migrate `TO public` policies on user-private tables to `TO authenticated`** for `messages`, `user_sessions`, `user_relationships`, `user_email_tokens`, `notifications`, all `trip_*`, all `push_*`, `mailbox_emails`, `message_reactions`, `passkey_challenges`. Mechanical search-and-replace at the migration level; no application-code change.
3. **Audit `profiles.profiles_public_read` policy default.** Currently `COALESCE(privacy_settings->>'profile_visibility', 'public') = 'public'`, so every profile is anon-readable until the user opts out. For an LGBTQ+ site that hosts both out and closeted members, consider flipping the default to `'community'` (authenticated only) and showing public profiles only on explicit opt-in.
4. **Extend `FORCE ROW LEVEL SECURITY`** to the remaining sensitive tables (passkey_challenges, user_email_tokens, auth_rate_limit_keys, etc.). The 10 tables currently doing this are a good set; the gap is small.

These each warrant their own focused PR with the migration + an updated row in this doc.

## Methodology

```sql
-- Headline counts
SELECT COUNT(*), COUNT(*) FILTER (WHERE relrowsecurity), COUNT(*) FILTER (WHERE relforcerowsecurity)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- Per-table policy counts
SELECT t.tablename, c.relrowsecurity, c.relforcerowsecurity, COUNT(p.policyname)
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename, c.relrowsecurity, c.relforcerowsecurity
ORDER BY t.tablename;

-- Anon / public role policy distribution
SELECT tablename, cmd, array_to_string(roles, ','), qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
```

Re-run any of the above to refresh the audit; the doc lags reality by however long it's been since the last regeneration.
