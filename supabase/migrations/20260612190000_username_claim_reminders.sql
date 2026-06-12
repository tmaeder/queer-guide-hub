-- Username rollout: claim-reminder emails at T-14d and T-2d before the
-- auto-assign deadline (2026-08-11 — keep in sync with enabling the
-- 'username_auto_assign' automation). Mirrors the welcome-email dispatch
-- pattern: pg_cron → run_username_claim_reminders() → pg_net POST to the
-- send-username-reminder edge fn (verify_jwt=false, self-gates via
-- X-Internal-Secret), which renders the email_templates row and stamps the
-- profile.

-- 1) Per-profile reminder bookkeeping (0 = none, 1 = T-14 sent, 2 = T-2 sent).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_reminder_stage int NOT NULL DEFAULT 0;

-- 2) Email template.
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, text_content, variables, is_active)
VALUES (
  'username_claim_reminder',
  'Username claim reminder',
  'Sent at T-14d and T-2d of the username rollout to accounts without a handle. After the deadline an @username is auto-assigned (free first change).',
  'Claim your @username on Queer Guide',
  '<p>Hi {{display_name}},</p>'
  || '<p>Usernames are coming to Queer Guide — your unique handle for mentions and your profile link. Yours is still unclaimed.</p>'
  || '<p><a href="{{claim_url}}">Pick your @username now</a> — it takes less than a minute.</p>'
  || '<p>If you have not chosen one by <strong>{{deadline_date}}</strong>, we will assign you a neutral handle automatically. You can change an auto-assigned handle once for free, so nothing is lost either way.</p>'
  || '<p>— The Queer Guide team</p>',
  'Hi {{display_name}},

Usernames are coming to Queer Guide — your unique handle for mentions and your profile link. Yours is still unclaimed.

Pick your @username now: {{claim_url}}

If you have not chosen one by {{deadline_date}}, we will assign you a neutral handle automatically. You can change an auto-assigned handle once for free.

— The Queer Guide team',
  '["display_name","claim_url","deadline_date"]'::jsonb,
  true
)
ON CONFLICT (template_key) DO UPDATE
  SET subject = EXCLUDED.subject,
      html_content = EXCLUDED.html_content,
      text_content = EXCLUDED.text_content,
      variables = EXCLUDED.variables,
      is_active = true;

-- 3) Dispatcher. Does nothing until the T-14 window opens; the edge fn
--    re-checks username + stage, so double-dispatch is harmless.
CREATE OR REPLACE FUNCTION public.run_username_claim_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline date := DATE '2026-08-11';  -- keep in sync with username_auto_assign enablement
  v_stage int;
  r record;
  dispatched int := 0;
BEGIN
  v_stage := CASE
    WHEN now() >= v_deadline - interval '2 days'  THEN 2
    WHEN now() >= v_deadline - interval '14 days' THEN 1
    ELSE 0
  END;
  IF v_stage = 0 OR now() >= v_deadline THEN
    RETURN jsonb_build_object('dispatched', 0, 'stage', v_stage);
  END IF;

  FOR r IN
    SELECT p.user_id
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.username IS NULL
      AND p.username_reminder_stage < v_stage
      AND u.email_confirmed_at IS NOT NULL
    ORDER BY u.created_at
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/send-username-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
      ),
      body := jsonb_build_object('user_id', r.user_id, 'stage', v_stage, 'deadline', v_deadline),
      timeout_milliseconds := 30000
    );
    dispatched := dispatched + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', dispatched, 'stage', v_stage);
END;
$$;

REVOKE ALL ON FUNCTION public.run_username_claim_reminders() FROM PUBLIC, anon, authenticated;

-- 4) Daily schedule (09:30 UTC — reasonable EU send time). No-op until T-14.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'username_claim_reminders') THEN
    PERFORM cron.unschedule('username_claim_reminders');
  END IF;
  PERFORM cron.schedule(
    'username_claim_reminders',
    '30 9 * * *',
    'SELECT public.run_username_claim_reminders()'
  );
END $$;

-- 5) Register in admin automations (enabled — inert until the window opens).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('username_claim_reminders', 'Username claim reminder emails',
   'Daily 09:30 UTC: emails accounts without a @username at T-14d and T-2d before the 2026-08-11 auto-assign deadline (template username_claim_reminder, Resend). Idempotent via profiles.username_reminder_stage. Inert outside the reminder windows.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_username_claim_reminders"}'::jsonb, '30 9 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action, schedule = EXCLUDED.schedule;
