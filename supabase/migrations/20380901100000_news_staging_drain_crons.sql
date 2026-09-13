-- ============================================================================
-- Staging drains for news + personalities, and a repair for the event drain
-- ============================================================================
--
-- Three families had hourly validate+dedup drains (ev/mp/vn); news,
-- personalities and hotels had none. They relied solely on their hourly DAG,
-- which only ever processes the batch of its own run — a staging row that
-- misses its run is never re-offered, because nothing else selects it. Measured
-- on prod 2026-09-10: 4,865 news rows and 929 personality rows sitting
-- disposition='pending', oldest 2026-05-12.
--
-- The companion code change (pipeline-validate / pipeline-deduplicate) adds the
-- `targetTable` selector these rows need. entity_type is unnormalized AND
-- nullable — news rows carry 'news_article' (2,658), NULL (1,858) or 'news'
-- (349) — and `.eq()` never matches NULL, so no entityType value can address
-- the cohort. target_table is NOT NULL on every staging row.
--
-- WHY NEWS IS ENABLED AND PERSONALITIES IS NOT
--
-- The obvious objection to draining a 4-month backlog is that both selectors
-- are FIFO on created_at, so the OLDEST rows publish first — a May article
-- landing as today's news. That was measured rather than assumed, and it does
-- not hold: news_commit_staging_batch derives
--   v_published := coalesce(normalized.published_at, dates.start,
--                           meta.published_at, now())
-- and ALL 4,865 pending rows carry their own published_at — zero would fall
-- through to now(). 3,828 sort into the past where they belong; 632 are
-- genuinely recent. A dry run of pipeline-validate over 200 of them approved
-- 200/200 with zero rejections, so the backlog is valid content that was never
-- selected, not junk that was correctly held back.
--
-- Personalities are registered DISABLED. The 929 rows are real named people
-- resolved to Wikidata QIDs, and publishing a person as LGBTQ+ is an outing
-- decision this repo deliberately keeps behind a human (see the personhood /
-- namesake rules in CLAUDE.md). The row is registered so the work is visible
-- and one boolean arms it; branch (d) of sync_automations_to_cron() will
-- schedule it from action.command the moment it is enabled.
--
-- Batch 100/hour drains the news backlog over ~2 days, which keeps the
-- search_reindex_queue and embedding drain off a cliff.
-- ============================================================================

DO $$
DECLARE
  v_url_validate CONSTANT text :=
    'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-validate';
  v_url_dedup CONSTANT text :=
    'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-deduplicate';
  v_anon CONSTANT text :=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

  -- Registry rows. The command stays the plain readable net.http_post form:
  -- admin_automation_effective_command() derives the run-tracking wrapper and
  -- sync_automations_to_cron()'s command-drift branch applies it, so writing
  -- the wrapped form here would be re-wrapped anyway.
  v_rows CONSTANT jsonb := jsonb_build_array(
    jsonb_build_object('slug','news_drain_validate','jobname','news-drain-validate',
      'schedule','37 * * * *','url',v_url_validate,'target','news_articles',
      'enabled',true,
      'desc','Hourly validate drain for news staging. The news DAG only processes its own run''s batch; without this a row that misses its run is never re-offered.'),
    jsonb_build_object('slug','news_drain_dedup','jobname','news-drain-dedup',
      'schedule','41 * * * *','url',v_url_dedup,'target','news_articles',
      'enabled',true,
      'desc','Hourly dedup drain for news staging. News dedup is fully automatic (auto-merge or drop) and can never enter dedup_review_queue.'),
    jsonb_build_object('slug','personality_drain_validate','jobname','personality-drain-validate',
      'schedule','39 * * * *','url',v_url_validate,'target','personalities',
      'enabled',false,
      'desc','DISABLED pending a human decision: publishing a person as LGBTQ+ is an outing decision. 929 rows staged 2026-08-20. Enable by setting enabled=true; the nightly sync schedules it from action.command.'),
    jsonb_build_object('slug','personality_drain_dedup','jobname','personality-drain-dedup',
      'schedule','43 * * * *','url',v_url_dedup,'target','personalities',
      'enabled',false,
      'desc','DISABLED alongside personality_drain_validate. Personality dedup carries namesake risk — name-only person pairs never auto-merge.')
  );
  v_row jsonb;
  v_command text;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_rows)
  LOOP
    -- ONE E-string, deliberately. Adjacent literals are concatenated, but only
    -- an E'' literal interprets \n — a continuation line written as plain '...'
    -- emits a literal backslash-n into the cron command and silently malforms
    -- it. Same trap as the tag-body prose convention in CLAUDE.md.
    v_command := format(
      E'\n  SELECT net.http_post(\n    url := %L,\n    headers := jsonb_build_object(\n      ''Content-Type'',''application/json'',\n      ''Authorization'',''Bearer %s'',\n      ''x-internal-secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''internal_invoke_secret'')\n    ),\n    body := ''{"targetTable":"%s","batch_size":100}''::jsonb,\n    timeout_milliseconds := 120000\n  );\n',
      v_row->>'url', v_anon, v_row->>'target');

    INSERT INTO public.admin_automations
      (slug, name, description, schedule, enabled, managed_by,
       trigger, action, conditions, auto_pause_threshold)
    VALUES (
      v_row->>'slug',
      v_row->>'jobname',
      v_row->>'desc',
      v_row->>'schedule',
      (v_row->>'enabled')::boolean,
      'system',
      jsonb_build_object('type','schedule'),
      jsonb_build_object('type','cron','command',v_command,'jobname',v_row->>'jobname'),
      '[]'::jsonb,
      3
    )
    ON CONFLICT (slug) DO UPDATE
      SET schedule    = EXCLUDED.schedule,
          action      = EXCLUDED.action,
          description = EXCLUDED.description;
      -- deliberately NOT resetting `enabled` on conflict: if an operator has
      -- since armed personalities, or auto-pause has since disabled news, a
      -- re-run of this migration must not silently undo that decision.
  END LOOP;

  -- ---------------------------------------------------------------------
  -- Repair: the event drain cannot see its own stale rows.
  -- ev-drain-validate/dedup filter entityType='event', which matches 3 pending
  -- rows while 41 carry entity_type NULL — and those 41 are precisely the
  -- `events` figure pipeline_hygiene_stats().stale_pending_by_entity reports.
  -- Repointing to targetTable is a strict widening: entity_type='event' rows
  -- all carry target_table='events'.
  -- ---------------------------------------------------------------------
  UPDATE public.admin_automations
     SET action = jsonb_set(action, '{command}',
           to_jsonb(replace(action->>'command',
                            '{"entityType":"event","batch_size":100}',
                            '{"targetTable":"events","batch_size":100}')))
   WHERE slug IN ('ev_drain_validate','ev_drain_dedup')
     AND action->>'command' LIKE '%"entityType":"event"%';
END $$;

-- Materialise the registry into pg_cron. Branch (d) creates the missing jobs
-- for enabled rows carrying action.command; the command-drift branch rewrites
-- the two event drains. Disabled rows are deliberately left unscheduled.
SELECT public.sync_automations_to_cron(true);

-- ============================================================================
-- Assert the postconditions this migration exists to reach. Soft on
-- preconditions (ON CONFLICT above), hard on what must be true afterwards.
-- ============================================================================
DO $verify$
DECLARE
  v_missing text;
  v_armed   int;
  v_ev_bad  int;
BEGIN
  SELECT string_agg(slug, ', ') INTO v_missing
  FROM (VALUES ('news_drain_validate'),('news_drain_dedup'),
               ('personality_drain_validate'),('personality_drain_dedup')) t(slug)
  WHERE NOT EXISTS (SELECT 1 FROM public.admin_automations a WHERE a.slug = t.slug);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'registry rows missing after insert: %', v_missing;
  END IF;

  -- The two news jobs must actually exist in pg_cron and be active. A registry
  -- row alone is inert — that is how wf-enrich-wolfram-countries ran for months
  -- against a workflow that no longer existed.
  SELECT count(*) INTO v_armed
  FROM cron.job WHERE jobname IN ('news-drain-validate','news-drain-dedup') AND active;
  IF v_armed <> 2 THEN
    RAISE EXCEPTION 'expected 2 active news drain cron jobs, found %', v_armed;
  END IF;

  -- Personalities must NOT be scheduled: registering them is the point, arming
  -- them is a separate human decision.
  IF EXISTS (SELECT 1 FROM cron.job
             WHERE jobname IN ('personality-drain-validate','personality-drain-dedup')) THEN
    RAISE EXCEPTION 'personality drains were scheduled; they must stay disabled';
  END IF;

  -- The event repair must have taken in BOTH the registry and pg_cron. A
  -- migration that "fixes" a cron by rewriting only the registry is the drift
  -- class that left detect_stale_venues calling the old threshold for weeks.
  SELECT count(*) INTO v_ev_bad
  FROM public.admin_automations
  WHERE slug IN ('ev_drain_validate','ev_drain_dedup')
    AND action->>'command' LIKE '%"entityType":"event"%';
  IF v_ev_bad <> 0 THEN
    RAISE EXCEPTION 'event drain registry still filters entityType, % row(s)', v_ev_bad;
  END IF;

  SELECT count(*) INTO v_ev_bad
  FROM cron.job
  WHERE jobname IN ('ev-drain-validate','ev-drain-dedup')
    AND command LIKE '%"entityType":"event"%';
  IF v_ev_bad <> 0 THEN
    RAISE EXCEPTION 'event drain cron still filters entityType, % job(s)', v_ev_bad;
  END IF;
END $verify$;
