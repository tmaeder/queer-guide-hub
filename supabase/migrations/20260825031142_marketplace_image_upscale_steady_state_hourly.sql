-- Drop to hourly now that the backlog is gone.
--
-- `*/5` was sized to drain 2,150 misterb listings; that finished (work-list 0,
-- 1,148 resolved, 1,593 retired as unmeasurable after 3 attempts). What remains
-- is maintenance: new marketplace imports arrive on a daily cron, so hourly
-- clears anything they add many times over.
--
-- At `*/5` an empty queue costs ~288 edge invocations a day to return "nothing
-- to upscale". That is not free on this account — Pages Functions and Workers
-- bill against the same request quota, and exhausting it has taken the whole
-- site down before (see the `1027` incident in CLAUDE.md). Hourly is 24.
--
-- The registry row stays the record of truth and the kill switch; only the
-- schedule moves.
UPDATE public.admin_automations
SET schedule = '0 * * * *'
WHERE slug = 'marketplace_image_upscale';

SELECT cron.unschedule('marketplace-image-upscale');

SELECT cron.schedule(
  a.action->>'jobname',
  a.schedule,
  public.admin_automation_effective_command(a.slug, a.action->>'command')
)
FROM public.admin_automations a
WHERE a.slug = 'marketplace_image_upscale';
