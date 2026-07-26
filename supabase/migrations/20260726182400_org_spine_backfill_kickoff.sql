-- ============================================================
-- Business Spine Unification — Phase B3: automation + cron
--
-- Nightly batched backfill (05:10 UTC — clear of dedup 05:50 and the
-- 06:00/06:15 sweeps). No inline full backfill here: org INSERTs fire the
-- search_documents sync per row, so the work runs 200-a-night per source
-- until org_spine_drift_counts() reads zero.
-- ============================================================

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES ('org_spine_backfill', 'Business spine backfill',
        'Nightly: links hotels/merchants/affiliate partners/venues to organizations (adopt-before-create: domain or name+city proof auto-links, ambiguous matches queue in org_link_suggestions), mints missing orgs in 200-row batches, and queues queer-owned brand suggestions. Progress: SELECT org_spine_drift_counts().',
        'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
        '{"type":"rpc","fn":"run_org_spine_backfill"}'::jsonb, '10 5 * * *')
ON CONFLICT (slug) DO UPDATE SET schedule=EXCLUDED.schedule,
  description=EXCLUDED.description, name=EXCLUDED.name, action=EXCLUDED.action, trigger=EXCLUDED.trigger;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'org_spine_backfill') THEN
    PERFORM cron.unschedule('org_spine_backfill');
  END IF;
  PERFORM cron.schedule('org_spine_backfill', '10 5 * * *', 'SELECT public.run_org_spine_backfill(200);');
END $cron$;
