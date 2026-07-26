-- ============================================================================
-- Content-processing simplification P0.3 — one i18n dispatcher
-- ----------------------------------------------------------------------------
-- Replaces ~150 per-(table, field, locale) pg_cron jobs (i18n_<table>_<field>_<lang>,
-- created live via Management API, no repo migration) with ONE registry table +
-- ONE dispatcher fn + ONE cron.
--
-- The dispatcher round-robins the stalest enabled combos and POSTs to the
-- unchanged translate-i18n-batch edge fn with the exact same body the old
-- crons sent ({table, locale, field, batch_limit[, min_quality]}), using the
-- same auth (anon bearer + X-Internal-Secret from Vault internal_invoke_secret).
--
-- Cadence math: */2 cron × 5 slots = 150 posts/hour → each of the 150 combos
-- fires ~once/hour (old system: each combo every 10-15 min, mostly no-op batches
-- once the backlog is translated). Tune via p_slots / cron schedule.
--
-- The old 150 jobs stay scheduled until the companion cleanup migration —
-- dual-run is harmless (fn is idempotent; already-translated rows are skipped).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.i18n_translation_targets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text NOT NULL,
  field       text NOT NULL,
  locale      text NOT NULL,
  batch_limit int  NOT NULL DEFAULT 20 CHECK (batch_limit BETWEEN 1 AND 50),
  min_quality int,
  priority    int  NOT NULL DEFAULT 100,
  enabled     boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, field, locale)
);

ALTER TABLE public.i18n_translation_targets ENABLE ROW LEVEL SECURITY;
-- No policies: service-role / SECURITY DEFINER access only.

-- Seed: the 15 (table, field) combos × 10 locales currently driven by the
-- per-combo crons. unified_tags descriptions keep the min_quality=40 gate.
INSERT INTO public.i18n_translation_targets (table_name, field, locale, batch_limit, min_quality)
SELECT c.table_name, c.field, l.locale, c.batch_limit,
       CASE WHEN c.table_name = 'unified_tags' AND c.field = 'description' THEN 40 END
FROM (VALUES
  ('cities',               'name',        20),
  ('countries',            'name',        20),
  ('events',               'title',       20),
  ('events',               'description', 10),
  ('hotels',               'name',        20),
  ('hotels',               'description', 10),
  ('marketplace_listings', 'title',       20),
  ('marketplace_listings', 'description', 10),
  ('news_articles',        'title',       20),
  ('personalities',        'description', 10),
  ('queer_villages',       'name',        20),
  ('queer_villages',       'description', 10),
  ('unified_tags',         'name',        20),
  ('unified_tags',         'description', 15),
  ('venues',               'description', 10)
) AS c(table_name, field, batch_limit)
CROSS JOIN (VALUES ('de'),('fr'),('es'),('it'),('pt'),('ru'),('zh'),('ja'),('ko'),('ar')) AS l(locale)
ON CONFLICT (table_name, field, locale) DO NOTHING;

-- Where the live per-combo crons carry a different batch_limit, prefer theirs.
UPDATE public.i18n_translation_targets t
SET batch_limit = c.batch::int
FROM (
  SELECT
    substring(command FROM '''table'',''([a-z_]+)''')  AS tbl,
    substring(command FROM '''field'',''([a-z_]+)''')  AS fld,
    substring(command FROM '''locale'',''([a-z]+)''')  AS loc,
    substring(command FROM '''batch_limit'',([0-9]+)') AS batch
  FROM cron.job
  WHERE jobname LIKE 'i18n\_%' ESCAPE '\' AND jobname <> 'i18n_cron_auth_fix'
) c
WHERE c.tbl = t.table_name AND c.fld = t.field AND c.loc = t.locale
  AND c.batch ~ '^[0-9]+$' AND c.batch::int BETWEEN 1 AND 50
  AND c.batch::int <> t.batch_limit;

CREATE OR REPLACE FUNCTION public.run_i18n_translation_dispatch(p_slots int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target record;
  v_count  int := 0;
  v_secret text;
  v_body   jsonb;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'run_i18n_translation_dispatch: internal_invoke_secret missing, skipping';
    RETURN 0;
  END IF;

  FOR v_target IN
    SELECT * FROM i18n_translation_targets
    WHERE enabled
    ORDER BY last_run_at NULLS FIRST, priority, table_name, field, locale
    LIMIT greatest(coalesce(p_slots, 5), 0)
  LOOP
    v_body := jsonb_build_object(
      'table',       v_target.table_name,
      'locale',      v_target.locale,
      'field',       v_target.field,
      'batch_limit', v_target.batch_limit
    );
    IF v_target.min_quality IS NOT NULL THEN
      v_body := v_body || jsonb_build_object('min_quality', v_target.min_quality);
    END IF;

    PERFORM net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
        'X-Internal-Secret', v_secret
      ),
      body := v_body,
      timeout_milliseconds := 30000
    );

    UPDATE i18n_translation_targets SET last_run_at = now() WHERE id = v_target.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.run_i18n_translation_dispatch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_i18n_translation_dispatch(int) TO service_role;

COMMENT ON FUNCTION public.run_i18n_translation_dispatch(int) IS
  'Round-robin i18n dispatcher: picks the stalest enabled (table, field, locale) combos from i18n_translation_targets and POSTs each to translate-i18n-batch. Replaces the ~150 per-combo i18n_* crons.';

-- One cron replaces ~150.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'i18n_translation_dispatch') THEN
    PERFORM cron.unschedule('i18n_translation_dispatch');
  END IF;
  PERFORM cron.schedule(
    'i18n_translation_dispatch',
    '*/2 * * * *',
    'SELECT public.run_i18n_translation_dispatch(5);'
  );
END $$;

-- Register in the automations registry.
INSERT INTO admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'i18n_translation_dispatch',
  'i18n translation dispatcher',
  'Every 2 min, dispatches the 5 stalest (table, field, locale) translation combos from i18n_translation_targets to translate-i18n-batch. Replaced the ~150 per-combo i18n_* pg_cron jobs (each combo now cycles ~hourly). Tune slots via the cron command, combos via the table.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type": "sql", "function": "run_i18n_translation_dispatch"}'::jsonb,
  '*/2 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      managed_by = EXCLUDED.managed_by,
      trigger = EXCLUDED.trigger,
      action = EXCLUDED.action,
      schedule = EXCLUDED.schedule,
      updated_at = now();
