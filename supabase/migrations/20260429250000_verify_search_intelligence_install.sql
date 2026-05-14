-- verify_search_intelligence_install
--
-- Re-runnable self-test that returns the install state of every Search
-- Intelligence component. Powers the Setup tab in the admin UI; also
-- runnable from psql:
--
--   SELECT * FROM verify_search_intelligence_install();
--
-- Each row is one check with: category, name, status (ok|warn|fail|na),
-- detail. The function is purely read-only (does not write), so it's safe
-- to call from any audit / monitoring path.

create or replace function public.verify_search_intelligence_install()
returns table (
  category text,
  name     text,
  status   text,
  detail   text
)
language plpgsql
stable
security definer
set search_path = public, extensions, cron
as $$
declare
  v_count int;
  v_text  text;
begin
  -- ── Extensions ───────────────────────────────────────────────────────────
  for v_text in
    select unnest(array['pgcrypto', 'pg_cron', 'pg_net', 'postgis'])
  loop
    if exists (select 1 from pg_extension where extname = v_text) then
      category := 'extension'; name := v_text; status := 'ok'; detail := 'installed';
      return next;
    else
      category := 'extension'; name := v_text; status := 'fail'; detail := 'not installed';
      return next;
    end if;
  end loop;

  -- ── Tables (existence + RLS enabled) ────────────────────────────────────
  for v_text in
    select unnest(array[
      'search_synonyms', 'search_settings_versions', 'search_audit_log',
      'search_reindex_jobs', 'search_visibility_scores',
      'topic_clusters', 'topic_cluster_tags',
      'event_occurrences',
      'image_assets', 'image_asset_links', 'ai_suggestions'
    ])
  loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_text
    ) then
      category := 'table'; name := v_text; status := 'fail'; detail := 'missing';
      return next;
    elsif not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_text and c.relrowsecurity = true
    ) then
      category := 'table'; name := v_text; status := 'warn'; detail := 'exists but RLS disabled';
      return next;
    else
      category := 'table'; name := v_text; status := 'ok'; detail := 'present + RLS';
      return next;
    end if;
  end loop;

  -- ── Columns (additive ones from #155 + #172) ─────────────────────────────
  for v_text in
    select unnest(array[
      'unified_tags.name_i18n',
      'unified_tags.description_i18n',
      'unified_tags.image_alt_i18n',
      'unified_tags.image_attribution_i18n',
      'venues.name_i18n',
      'events.title_i18n',
      'events.timezone',
      'news_articles.title_i18n',
      'marketplace_listings.title_i18n',
      'personalities.name_i18n',
      'queer_villages.name_i18n',
      'queer_villages.geometry',
      'regions.geometry'
    ])
  loop
    declare v_table text := split_part(v_text, '.', 1);
            v_col   text := split_part(v_text, '.', 2);
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table and column_name = v_col
      ) then
        category := 'column'; name := v_text; status := 'ok'; detail := 'present';
      else
        category := 'column'; name := v_text; status := 'fail'; detail := 'missing';
      end if;
      return next;
    end;
  end loop;

  -- ── Functions ────────────────────────────────────────────────────────────
  for v_text in
    select unnest(array[
      'compute_visibility_score', 'record_search_audit',
      'entity_cluster_ids', 'topic_cluster_entities',
      'expand_event_recurrence', 'expand_all_recurring_events',
      'is_exception_date', 'events_in_window',
      'entities_in_polygon', 'entities_along_route', 'find_polygon_for_point',
      'is_venue_open_at', 'venues_open_now',
      'find_invalid_coordinates', 'count_invalid_coordinates',
      'unified_tag_localized_name', 'unified_tag_localized_description',
      'venue_localized_name', 'event_localized_title',
      'effective_event_timezone',
      'canonicalise_image_url',
      'verify_search_intelligence_install',
      'sync_tag_alias_to_search_synonym'
    ])
  loop
    if exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_text
    ) then
      category := 'function'; name := v_text; status := 'ok'; detail := 'present';
    else
      category := 'function'; name := v_text; status := 'fail'; detail := 'missing';
    end if;
    return next;
  end loop;

  -- ── Views ────────────────────────────────────────────────────────────────
  for v_text in
    select unnest(array[
      'entity_cluster_membership', 'cluster_entity_counts'
    ])
  loop
    if exists (
      select 1 from pg_views where schemaname = 'public' and viewname = v_text
    ) then
      category := 'view'; name := v_text; status := 'ok'; detail := 'present';
    else
      category := 'view'; name := v_text; status := 'fail'; detail := 'missing';
    end if;
    return next;
  end loop;

  -- ── Cron jobs ────────────────────────────────────────────────────────────
  for v_text in
    select unnest(array[
      'search-intelligence-reconcile',
      'expand-event-recurrences'
    ])
  loop
    if exists (select 1 from cron.job where jobname = v_text) then
      category := 'cron'; name := v_text; status := 'ok'; detail := 'scheduled';
    else
      category := 'cron'; name := v_text; status := 'fail'; detail := 'not scheduled';
    end if;
    return next;
  end loop;

  -- Translate-i18n cron jobs (15 jobs from #183) — count, don't list each.
  select count(*) into v_count
    from cron.job
   where jobname like 'translate-i18n-%';
  if v_count = 15 then
    category := 'cron'; name := 'translate-i18n-* (15 expected)';
    status := 'ok'; detail := 'all scheduled';
  elsif v_count > 0 then
    category := 'cron'; name := 'translate-i18n-* (15 expected)';
    status := 'warn'; detail := format('%s of 15 scheduled', v_count);
  else
    category := 'cron'; name := 'translate-i18n-* (15 expected)';
    status := 'fail'; detail := '0 of 15 — apply 20260429240000_translate_i18n_cron.sql';
  end if;
  return next;

  -- ── GUCs (webhook secrets) ──────────────────────────────────────────────
  -- current_setting(..., true) returns NULL on missing setting (safe).
  -- We don't print the secret; just whether it's set.
  if coalesce(nullif(trim(current_setting('app.search_intelligence_webhook_secret', true)), ''), '') = '' then
    category := 'guc'; name := 'app.search_intelligence_webhook_secret';
    status := 'fail';
    detail := 'unset — /cron/reconcile will return 401. ALTER DATABASE postgres SET ...';
  else
    category := 'guc'; name := 'app.search_intelligence_webhook_secret';
    status := 'ok'; detail := 'present';
  end if;
  return next;

  if coalesce(nullif(trim(current_setting('app.translate_i18n_webhook_secret', true)), ''), '') = '' then
    category := 'guc'; name := 'app.translate_i18n_webhook_secret';
    status := 'fail';
    detail := 'unset — translate-i18n cron will return 401';
  else
    category := 'guc'; name := 'app.translate_i18n_webhook_secret';
    status := 'ok'; detail := 'present';
  end if;
  return next;

  -- ── Data anchors ────────────────────────────────────────────────────────
  -- search_settings_versions should have at least one row per managed index
  -- once the operator has clicked "Snapshot live → desired".
  select count(distinct index_name) into v_count from public.search_settings_versions;
  if v_count >= 9 then
    category := 'data'; name := 'search_settings_versions anchored';
    status := 'ok'; detail := format('%s indexes anchored', v_count);
  elsif v_count > 0 then
    category := 'data'; name := 'search_settings_versions anchored';
    status := 'warn'; detail := format('%s indexes anchored — anchor the rest via Settings tab', v_count);
  else
    category := 'data'; name := 'search_settings_versions anchored';
    status := 'fail'; detail := 'no versions yet — open Settings tab and click "Snapshot live → desired" per index';
  end if;
  return next;

  -- search_synonyms backfill from #151
  select count(*) into v_count
    from public.search_synonyms where source = 'imported';
  if v_count >= 6 then
    category := 'data'; name := 'venue synonym backfill';
    status := 'ok'; detail := format('%s imported synonym(s)', v_count);
  else
    category := 'data'; name := 'venue synonym backfill';
    status := 'warn'; detail := format('%s imported synonyms — expected 6 from #151', v_count);
  end if;
  return next;

  -- event_occurrences populated by the nightly cron from #166
  select count(*) into v_count from public.event_occurrences;
  if v_count > 0 then
    category := 'data'; name := 'event_occurrences populated';
    status := 'ok'; detail := format('%s occurrences', v_count);
  else
    category := 'data'; name := 'event_occurrences populated';
    status := 'warn';
    detail := 'empty — wait for 03:15 UTC cron, or run SELECT expand_all_recurring_events(365);';
  end if;
  return next;

end $$;

revoke all on function public.verify_search_intelligence_install() from public;
grant execute on function public.verify_search_intelligence_install()
  to authenticated, service_role;

comment on function public.verify_search_intelligence_install() is
  'Re-runnable self-test for the Search Intelligence install. Returns one row per check with status (ok|warn|fail). Powers the admin Setup tab.';
