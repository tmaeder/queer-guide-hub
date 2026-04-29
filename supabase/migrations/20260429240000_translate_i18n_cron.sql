-- Wave E: schedule the translate-i18n-batch function via pg_cron
--
-- Drives Anthropic-Claude-backed translation of *_i18n columns added in
-- #155 (unified_tags) and #172 (per-entity polish). Each cron invocation
-- handles ONE (table, locale, field) tuple and a small batch (<= 25 rows),
-- so the whole catalogue trickles in over weeks at predictable cost.
--
-- Schedule rotates over the week to spread API spend:
--   Mondays    03:30 UTC  unified_tags + venues, locales: de, fr, es
--   Tuesdays   03:30 UTC  events, news_articles, locales: de, fr, es
--   Wednesdays 03:30 UTC  marketplace_listings, personalities, locales: de
--   Thursdays  03:30 UTC  cities, countries, queer_villages, hotels, locales: de, fr
--   Fri/Sat/Sun: idle (used for catching up on rejected rows)
--
-- pg_net.http_post calls /functions/v1/translate-i18n-batch with a
-- webhook secret read from a Postgres GUC. Idempotent at the function
-- level: rows already translated for the locale are skipped.
--
-- Setup outside this migration (one-time):
--   ALTER DATABASE postgres SET app.translate_i18n_webhook_secret = '<secret>';
-- And set the matching TRANSLATE_I18N_WEBHOOK_SECRET env var on the
-- deployed translate-i18n-batch function. Until both are set, the cron
-- POST returns 401 and rotates harmlessly.

-- Helper: schedule a single (table, locale, field) cron job.
do $$
declare
  v_jobs jsonb := '[
    {"day": 1, "table": "unified_tags",         "locale": "de", "field": "name"},
    {"day": 1, "table": "unified_tags",         "locale": "fr", "field": "name"},
    {"day": 1, "table": "unified_tags",         "locale": "es", "field": "name"},
    {"day": 1, "table": "venues",               "locale": "de", "field": "name"},

    {"day": 2, "table": "events",               "locale": "de", "field": "title"},
    {"day": 2, "table": "events",               "locale": "fr", "field": "title"},
    {"day": 2, "table": "news_articles",        "locale": "de", "field": "title"},
    {"day": 2, "table": "news_articles",        "locale": "es", "field": "title"},

    {"day": 3, "table": "marketplace_listings", "locale": "de", "field": "title"},
    {"day": 3, "table": "personalities",        "locale": "de", "field": "name"},

    {"day": 4, "table": "cities",               "locale": "de", "field": "name"},
    {"day": 4, "table": "countries",            "locale": "de", "field": "name"},
    {"day": 4, "table": "countries",            "locale": "fr", "field": "name"},
    {"day": 4, "table": "queer_villages",       "locale": "de", "field": "name"},
    {"day": 4, "table": "hotels",               "locale": "de", "field": "name"}
  ]'::jsonb;
  v_entry jsonb;
  v_jobname text;
  v_minute_offset int := 0;
begin
  for v_entry in select * from jsonb_array_elements(v_jobs)
  loop
    v_jobname := format(
      'translate-i18n-%s-%s-%s',
      v_entry->>'table',
      v_entry->>'locale',
      v_entry->>'field'
    );
    if exists (select 1 from cron.job where jobname = v_jobname) then
      perform cron.unschedule(v_jobname);
    end if;
    -- 03:30 UTC + minute_offset, on the assigned day of week (1=Mon..7=Sun).
    perform cron.schedule(
      v_jobname,
      format('%s 3 * * %s', 30 + v_minute_offset, v_entry->>'day'),
      format(
        $cron$
        select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Webhook-Secret', current_setting('app.translate_i18n_webhook_secret', true)
          ),
          body := jsonb_build_object(
            'table',   %L,
            'locale',  %L,
            'field',   %L,
            'batch_limit', 25
          )
        ) as request_id;
        $cron$,
        v_entry->>'table',
        v_entry->>'locale',
        v_entry->>'field'
      )
    );
    v_minute_offset := v_minute_offset + 1;
  end loop;
end $$;

comment on schema cron is
  'pg_cron: includes translate-i18n-* jobs (Mon-Thu around 03:30 UTC). Set app.translate_i18n_webhook_secret via ALTER DATABASE. Edge function reads the matching TRANSLATE_I18N_WEBHOOK_SECRET env var.';
