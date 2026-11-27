-- /admin/search-intelligence "Setup" reported 5 failing checks. All five tested
-- infrastructure that was retired on purpose, so the page read red on a healthy
-- system:
--   * cron search-intelligence-reconcile + app.search_intelligence_webhook_secret
--     — the Meilisearch settings-drift job, unscheduled by 20260601210000; the
--     secret only ever authenticated that job.
--   * cron expand-event-recurrences — registry row marked COMPLETED 2026-09-26.
--   * 15 translate-i18n-* crons + app.translate_i18n_webhook_secret — replaced by
--     the single i18n_translation_dispatch cron (20260801020300); the secret
--     lives in Vault, not a GUC.
-- The checks now test what runs today: the dispatcher is scheduled, active and
-- successful within 3 hours (run tracking samples pure-SQL crons hourly), and the translate secret exists in Vault. Body is
-- otherwise the live definition, read with pg_get_functiondef.
-- search_settings_versions "anchored" expected 9 Meili indexes; any version is
-- now enough.

create or replace function public.verify_search_intelligence_install()
 returns table(category text, name text, status text, detail text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions', 'cron'
as $function$
declare v_count int; v_text text; v_last timestamptz; v_status text;
begin
  for v_text in select unnest(array['pgcrypto','pg_cron','pg_net','postgis']) loop
    if exists (select 1 from pg_extension where extname = v_text) then
      category := 'extension'; name := v_text; status := 'ok'; detail := 'installed'; return next;
    else category := 'extension'; name := v_text; status := 'fail'; detail := 'not installed'; return next; end if;
  end loop;

  for v_text in select unnest(array['search_synonyms','search_settings_versions','search_audit_log','search_reindex_jobs','search_visibility_scores','topic_clusters','topic_cluster_tags','event_occurrences','image_assets','image_asset_links','ai_suggestions']) loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=v_text) then
      category := 'table'; name := v_text; status := 'fail'; detail := 'missing'; return next;
    elsif not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relname=v_text and c.relrowsecurity=true) then
      category := 'table'; name := v_text; status := 'warn'; detail := 'RLS disabled'; return next;
    else category := 'table'; name := v_text; status := 'ok'; detail := 'present + RLS'; return next; end if;
  end loop;

  for v_text in select unnest(array['unified_tags.name_i18n','unified_tags.description_i18n','unified_tags.image_alt_i18n','unified_tags.image_attribution_i18n','venues.name_i18n','events.title_i18n','events.timezone','news_articles.title_i18n','marketplace_listings.title_i18n','personalities.name_i18n','queer_villages.name_i18n','queer_villages.geometry','regions.geometry']) loop
    declare v_table text := split_part(v_text, '.', 1); v_col text := split_part(v_text, '.', 2);
    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name=v_col) then
        category := 'column'; name := v_text; status := 'ok'; detail := 'present';
      else category := 'column'; name := v_text; status := 'fail'; detail := 'missing'; end if;
      return next;
    end;
  end loop;

  for v_text in select unnest(array['compute_visibility_score','record_search_audit','entity_cluster_ids','topic_cluster_entities','expand_event_recurrence','expand_all_recurring_events','is_exception_date','events_in_window','entities_in_polygon','entities_along_route','find_polygon_for_point','is_venue_open_at','venues_open_now','find_invalid_coordinates','count_invalid_coordinates','unified_tag_localized_name','unified_tag_localized_description','venue_localized_name','event_localized_title','effective_event_timezone','canonicalise_image_url','verify_search_intelligence_install','sync_tag_alias_to_search_synonym']) loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname=v_text) then
      category := 'function'; name := v_text; status := 'ok'; detail := 'present';
    else category := 'function'; name := v_text; status := 'fail'; detail := 'missing'; end if;
    return next;
  end loop;

  for v_text in select unnest(array['entity_cluster_membership','cluster_entity_counts']) loop
    if exists (select 1 from pg_views where schemaname='public' and viewname=v_text) then
      category := 'view'; name := v_text; status := 'ok'; detail := 'present';
    else category := 'view'; name := v_text; status := 'fail'; detail := 'missing'; end if;
    return next;
  end loop;

  -- Translation: one dispatcher cron drives every (table, field, locale) combo.
  category := 'cron'; name := 'i18n_translation_dispatch';
  if not exists (select 1 from cron.job where jobname = 'i18n_translation_dispatch') then
    status := 'fail'; detail := 'not scheduled';
  elsif not exists (select 1 from cron.job where jobname = 'i18n_translation_dispatch' and active) then
    status := 'fail'; detail := 'scheduled but inactive';
  else
    select a.last_run_at, a.last_run_status into v_last, v_status
      from public.admin_automations a where a.slug = 'i18n_translation_dispatch';
    if v_last is null then status := 'warn'; detail := 'scheduled; no run recorded';
    elsif v_status is distinct from 'success' then status := 'warn'; detail := format('last run %s', v_status);
    elsif v_last < now() - interval '3 hours' then status := 'warn'; detail := format('last success %s', to_char(v_last, 'YYYY-MM-DD HH24:MI'));
    else status := 'ok'; detail := 'scheduled, running';
    end if;
  end if;
  return next;

  category := 'secret'; name := 'vault: translate_i18n_webhook_secret';
  if exists (select 1 from vault.secrets s where s.name = 'translate_i18n_webhook_secret') then
    status := 'ok'; detail := 'present';
  else status := 'fail'; detail := 'missing'; end if;
  return next;

  select count(distinct index_name) into v_count from public.search_settings_versions;
  if v_count > 0 then category := 'data'; name := 'search_settings_versions anchored'; status := 'ok'; detail := format('%s indexes', v_count);
  else category := 'data'; name := 'search_settings_versions anchored'; status := 'warn'; detail := 'no versions yet'; end if;
  return next;

  select count(*) into v_count from public.search_synonyms where source = 'imported';
  if v_count >= 6 then category := 'data'; name := 'venue synonym backfill'; status := 'ok'; detail := format('%s imported', v_count);
  else category := 'data'; name := 'venue synonym backfill'; status := 'warn'; detail := format('%s imported', v_count); end if;
  return next;

  if exists (select 1 from pg_tables where schemaname='public' and tablename='event_occurrences') then
    select count(*) into v_count from public.event_occurrences;
    if v_count > 0 then category := 'data'; name := 'event_occurrences populated'; status := 'ok'; detail := format('%s occurrences', v_count);
    else category := 'data'; name := 'event_occurrences populated'; status := 'warn'; detail := 'empty (no events with recurrence_rule yet)'; end if;
    return next;
  end if;
end $function$;

do $verify$
declare v_fail int;
begin
  select count(*) into v_fail from public.verify_search_intelligence_install()
   where name in ('search-intelligence-reconcile','expand-event-recurrences','app.search_intelligence_webhook_secret','app.translate_i18n_webhook_secret')
      or name like 'translate-i18n-%';
  if v_fail <> 0 then raise exception 'retired checks still reported (%)', v_fail; end if;
end $verify$;
