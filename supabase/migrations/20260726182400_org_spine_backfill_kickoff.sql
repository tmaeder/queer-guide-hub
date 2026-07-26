-- [Drift recovery 2026-07-26] Applied live via MCP by a concurrent session;
-- recovered verbatim from supabase_migrations.schema_migrations.statements.

-- Business Spine Unification — Phase B3: automation + cron (see repo file 20260801100300)

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
