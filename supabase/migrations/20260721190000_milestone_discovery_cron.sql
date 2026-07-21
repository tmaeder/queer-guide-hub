-- ============================================================================
-- Milestone discovery — weekly AI proposal cron (parked until secrets exist)
-- ----------------------------------------------------------------------------
-- Wires the milestone-discovery edge function to a weekly cron. The function
-- asks a (provider-agnostic) model to propose LGBTQ+ history milestones that are
-- NOT already in the timeline, dedupes them, and STAGES each as
-- status='draft' / review_status='pending' — the publish gate only shows
-- status='published', so nothing reaches the public calendar until an admin
-- approves it at /admin/content/milestones.
--
-- PARKED by design (mirrors the tag-enrichment / city-quality crons): the job
-- POSTs with X-Webhook-Secret read from Vault (name='milestone_discovery_webhook_secret').
-- Until BOTH of these exist the POST sends a NULL secret and the function returns
-- 401, so the job rotates harmlessly (effectively paused):
--   1) supabase functions deploy milestone-discovery   (auto on merge)
--   2) select vault.create_secret('<secret>', 'milestone_discovery_webhook_secret', 'milestone discovery cron auth');
--   3) supabase secrets set MILESTONE_DISCOVERY_WEBHOOK_SECRET=<secret>
--   4) update public.admin_automations set enabled = true where slug = 'milestone_discovery';
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'milestone_discovery') THEN
    PERFORM cron.unschedule('milestone_discovery');
  END IF;
END $$;

SELECT cron.schedule(
  'milestone_discovery',
  '0 5 * * 1', -- Mondays 05:00 UTC
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/milestone-discovery',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='milestone_discovery_webhook_secret')
    ),
    body := jsonb_build_object('count', 8, 'triggered_by', 'cron')
  ) as request_id;
  $cron$
);

-- Register in the automations catalog (disabled until the secret is created).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'milestone_discovery',
  'Discover new LGBTQ+ milestones (AI)',
  'Weekly: a provider-agnostic model proposes queer-history milestones not yet in the timeline; dedupes and stages them as review_status=pending for admin approval at /admin/content/milestones. Never auto-publishes. Parked until milestone_discovery_webhook_secret exists.',
  'system',
  false,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type":"edge","fn":"milestone-discovery","body":{"count":8}}'::jsonb,
  '0 5 * * 1'
)
ON CONFLICT (slug) DO UPDATE
  SET name=EXCLUDED.name, description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;
