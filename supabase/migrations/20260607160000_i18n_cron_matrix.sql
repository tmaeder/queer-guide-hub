-- ============================================================================
-- i18n cron matrix — coherent per-(entity,field,locale) translation backfill
-- ----------------------------------------------------------------------------
-- Replaces the sparse, inconsistent translate-i18n cron set (a few entities in
-- a few locales, mixed auth) with one declarative matrix: every VALUABLE
-- (entity, field) pair × all 11 locales, batch 50, 6 runs/hour, staggered.
--
-- The function early-returns (no LLM call) once a locale slot is filled, so the
-- matrix is expensive only during backfill and ~free at steady state, while
-- still picking up newly-ingested rows.
--
-- Proper-noun NAME fields are deliberately EXCLUDED: venues.name (32k) and
-- personalities.name (12k) translate to themselves — pure LLM waste. Their
-- description fields ARE translated. cities.name / countries.name are kept
-- (city/country names do have localized forms, e.g. München, Deutschland).
--
-- Auth: every job reads the shared Vault secret 'translate_i18n_webhook_secret'
-- (see 20260607150000); the function is verify_jwt=false (config.toml).
-- ============================================================================

DO $$
DECLARE
  v_locales text[] := ARRAY['de','fr','es','it','pt','nl','pl','ru','tr','uk','sv'];
  v_pairs text[][] := ARRAY[
    ['unified_tags','name'], ['unified_tags','description'],
    ['countries','name'], ['cities','name'],
    ['events','title'], ['events','description'],
    ['marketplace_listings','title'], ['marketplace_listings','description'],
    ['news_articles','title'],
    ['venues','description'],
    ['personalities','description'],
    ['hotels','name'], ['hotels','description'],
    ['queer_villages','name'], ['queer_villages','description']
  ];
  v_vault text := '(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''translate_i18n_webhook_secret'')';
  j record; tbl text; fld text; loc text; m int; idx int := 0; jobname text; sched text;
BEGIN
  -- Clean slate: drop every existing translate-i18n cron job.
  FOR j IN SELECT cron.job.jobname AS jn FROM cron.job
           WHERE command LIKE '%translate-i18n-batch%' LOOP
    PERFORM cron.unschedule(j.jn);
  END LOOP;

  FOR i IN 1 .. array_length(v_pairs,1) LOOP
    tbl := v_pairs[i][1]; fld := v_pairs[i][2];
    FOREACH loc IN ARRAY v_locales LOOP
      m := idx % 30;  -- 2 runs/hour, staggered across 30 minute-buckets
      sched := format('%s,%s * * * *', m, m+30);  -- keeps peak concurrency ~5-6
      -- (165 jobs / 30 buckets) so CF Workers AI isn't saturated.
      jobname := format('i18n_%s_%s_%s', tbl, fld, loc);
      PERFORM cron.schedule(jobname, sched, format($cmd$
        select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'X-Webhook-Secret', %s
          ),
          body := jsonb_build_object('table',%L,'locale',%L,'field',%L,'batch_limit',50),
          timeout_milliseconds := 30000  -- LLM batch needs >5s; without this pg_net
          -- disconnects at 5s and the edge function is killed mid-batch (partial
          -- writes land, the rest of the 50 are re-translated next run = 3x waste).
        ) as request_id;
      $cmd$, v_vault, tbl, loc, fld));
      idx := idx + 1;
    END LOOP;
  END LOOP;
END $$;
