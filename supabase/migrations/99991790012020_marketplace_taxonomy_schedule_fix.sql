-- The legacy taxonomy registry row was absent in production, so the v4
-- migration's UPDATE scheduled nothing. A measured 100-row batch completes in
-- ~36 seconds, leaving margin under the 120-second statement timeout and
-- draining 61k rows in roughly 10–12 hours at one run per minute.

INSERT INTO public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule,auto_pause_threshold)
VALUES
  ('marketplace_taxonomy_v3_backfill','Marketplace taxonomy v4 rollout',
   'Reversible deterministic taxonomy rollout: frozen-corpus gate, 1% canary, distribution guard, then bounded expansion.',
   'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
   jsonb_build_object('type','cron','jobname','marketplace-taxonomy-v4-backfill',
     'command','SET statement_timeout=''120s''; SELECT public.run_marketplace_quality_worker(''marketplace_taxonomy_v3_backfill'',100);'),
   '* * * * *',3)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,action=excluded.action,schedule=excluded.schedule,
  auto_pause_threshold=excluded.auto_pause_threshold;

SELECT public.sync_automations_to_cron(true);
