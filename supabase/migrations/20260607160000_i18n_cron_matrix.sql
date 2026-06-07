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
-- Auth: every job sends BOTH a public anon-key Bearer token AND the shared Vault
-- secret 'translate_i18n_webhook_secret' (see 20260607150000). The anon JWT
-- satisfies the API gateway whether the function is verify_jwt true OR false
-- (bulk function redeploys from CI periodically reset verify_jwt back to true,
-- which would otherwise 401 every cron); the webhook secret does the real auth
-- inside the function. The anon key is public (it ships in the frontend bundle),
-- so embedding it here is safe.
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
  -- Public anon key (also in the frontend bundle) — satisfies the gateway JWT
  -- check regardless of the function's verify_jwt setting.
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
  j record; tbl text; fld text; loc text; m int; idx int := 0; jobname text; sched text;
  blimit int; is_desc bool; ptimeout int;
BEGIN
  -- Clean slate: drop every existing translate-i18n cron job.
  FOR j IN SELECT cron.job.jobname AS jn FROM cron.job
           WHERE command LIKE '%translate-i18n-batch%' LOOP
    PERFORM cron.unschedule(j.jn);
  END LOOP;

  FOR i IN 1 .. array_length(v_pairs,1) LOOP
    tbl := v_pairs[i][1]; fld := v_pairs[i][2];
    is_desc := (fld = 'description');
    FOREACH loc IN ARRAY v_locales LOOP
      -- Batch size is governed by TEXT LENGTH, not row count: the edge fn aborts
      -- its own LLM call at 30s. Measured: ~25 short strings (name/title) ≈ 10s,
      -- but ~15 long strings (description) already ≈ 30s. So descriptions need a
      -- small batch + higher frequency; names/titles tolerate a larger batch.
      IF is_desc THEN
        -- marketplace descriptions average ~1000 chars (2-3x the others), so a
        -- batch of 6 would blow the limit; keep it tiny.
        blimit := CASE WHEN tbl = 'marketplace_listings' THEN 2 ELSE 6 END;
        -- The fn gives description LLM calls a 50s self-abort budget; let pg_net
        -- wait 55s so the request is logged as a 200 instead of a premature
        -- timeout (the fn writes regardless, but this keeps observability clean).
        ptimeout := 55000;
        m := idx % 10;                                            -- 6 runs/hour
        sched := format('%s,%s,%s,%s,%s,%s * * * *', m, m+10, m+20, m+30, m+40, m+50);
      ELSE
        blimit := 20; ptimeout := 30000; m := idx % 15;          -- 4 runs/hour
        sched := format('%s,%s,%s,%s * * * *', m, m+15, m+30, m+45);
      END IF;
      jobname := format('i18n_%s_%s_%s', tbl, fld, loc);
      PERFORM cron.schedule(jobname, sched, format($cmd$
        select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer %s',
            'X-Webhook-Secret', %s
          ),
          body := jsonb_build_object('table',%L,'locale',%L,'field',%L,'batch_limit',%s),
          timeout_milliseconds := %s  -- 30s short fields / 55s long descriptions;
          -- without this pg_net disconnects at its 5s default and kills the fn.
        ) as request_id;
      $cmd$, v_anon, v_vault, tbl, loc, fld, blimit, ptimeout));
      idx := idx + 1;
    END LOOP;
  END LOOP;
END $$;
