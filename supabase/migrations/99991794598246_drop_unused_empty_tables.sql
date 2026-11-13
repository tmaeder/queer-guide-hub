-- Technical-debt cleanup (2026-11-13): drop twelve tables that nothing uses.
--
-- Each one was checked on prod before this file was written:
--   * exact row count (count(*), NOT pg_stat_user_tables, whose counters reset
--     on every restart) = 0
--   * no reference in src/, functions/, workers/, scraper/, supabase/functions/,
--     scripts/, mobile/, extension/ or e2e/ except the generated
--     src/integrations/supabase/types.ts
--   * no public function body, view, non-internal trigger or pg_cron command
--     names it, and the only foreign keys are among the dropped set itself
--     (cms_sync_jobs -> cms_connectors) or outbound to tables that stay
--     (audio_files, videos).
--
-- Two guards make this safe to apply against a database that has moved since:
--   1. the DO block aborts if ANY of the twelve has gained a row, so no data
--      can be deleted by this file;
--   2. DROP ... RESTRICT (the default, stated explicitly) fails instead of
--      cascading if a new dependent object has appeared.
-- Recreating any of them, should it ever be wanted, is a copy of its original
-- CREATE TABLE from the migration history.

do $guard$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'audio_processing_jobs','audio_renditions','auth_rate_limit',
    'cms_sync_jobs','cms_connectors','crawl_jobs','cron_job_logs',
    'media_optimization_status','presence_statuses','ui_themes',
    'video_processing_jobs','video_renditions'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'refusing to drop public.%: it now holds % row(s)', t, n;
    end if;
  end loop;
end
$guard$;

drop table if exists public.audio_processing_jobs restrict;
drop table if exists public.audio_renditions restrict;
drop table if exists public.auth_rate_limit restrict;
drop table if exists public.cms_sync_jobs restrict;
drop table if exists public.cms_connectors restrict;
drop table if exists public.crawl_jobs restrict;
drop table if exists public.cron_job_logs restrict;
drop table if exists public.media_optimization_status restrict;
drop table if exists public.presence_statuses restrict;
drop table if exists public.ui_themes restrict;
drop table if exists public.video_processing_jobs restrict;
drop table if exists public.video_renditions restrict;
