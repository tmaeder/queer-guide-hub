-- ============================================================================
-- Wire the send-welcome-email edge function (dead-code audit BR-5)
-- ----------------------------------------------------------------------------
-- The function existed and was deployed but nothing ever invoked it: no auth
-- hook, no trigger, no cron — profiles.welcome_email_sent_at was NULL for all
-- rows since launch. This migration adds the canonical dispatch path:
--
--   pg_cron (every 15 min) → run_welcome_email_dispatch()
--     → pg_net POST /functions/v1/send-welcome-email per eligible user
--       (fn is deployed verify_jwt=false and self-gates via X-Internal-Secret,
--        the same proven pattern as translate-i18n-batch)
--
-- Eligible = profile with welcome_email_sent_at IS NULL whose auth user has
-- confirmed their email. The fn itself is idempotent (re-checks + stamps).
--
-- Existing profiles are stamped as handled so wiring this up does NOT
-- retroactively email accounts that signed up long before the welcome flow
-- worked. Only future signups (and rows explicitly reset) get the email.
-- ============================================================================

-- 1) Grandfather existing accounts: never welcome-email them retroactively.
UPDATE public.profiles
SET welcome_email_sent_at = now()
WHERE welcome_email_sent_at IS NULL;

-- 2) Dispatcher: finds eligible users and invokes the edge function.
CREATE OR REPLACE FUNCTION public.run_welcome_email_dispatch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          record;
  dispatched int := 0;
BEGIN
  FOR r IN
    SELECT p.user_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.welcome_email_sent_at IS NULL
      AND u.email_confirmed_at IS NOT NULL
    ORDER BY u.created_at
    LIMIT 20
  LOOP
    PERFORM net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/send-welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
      ),
      body := jsonb_build_object('user_id', r.user_id),
      timeout_milliseconds := 30000
    );
    dispatched := dispatched + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', dispatched);
END;
$$;

REVOKE ALL ON FUNCTION public.run_welcome_email_dispatch() FROM PUBLIC, anon, authenticated;

-- 3) Schedule (idempotent re-schedule).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'welcome_email_dispatch') THEN
    PERFORM cron.unschedule('welcome_email_dispatch');
  END IF;
  PERFORM cron.schedule(
    'welcome_email_dispatch',
    '*/15 * * * *',
    'SELECT public.run_welcome_email_dispatch()'
  );
END $$;

-- 4) Register in admin automations.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('welcome_email_dispatch', 'Send welcome emails',
   'Every 15 min: emails newly confirmed signups the welcome template (Resend) and stamps profiles.welcome_email_sent_at. Idempotent; existing pre-wiring accounts were grandfathered as sent.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_welcome_email_dispatch"}'::jsonb, '*/15 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action, schedule = EXCLUDED.schedule;
