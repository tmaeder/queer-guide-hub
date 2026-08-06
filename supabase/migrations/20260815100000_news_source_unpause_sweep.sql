-- ============================================================================
-- news_sources: auto-pause is a one-way door, and one dead HOST closed it on 45 feeds
-- ----------------------------------------------------------------------------
-- source-rss-news auto-pauses a source after 8 consecutive failures. Nothing
-- has ever un-paused one: `auto_paused` is set by the fetch loop and cleared
-- only by hand, so every pause is permanent until a human notices.
--
-- That turns a transient upstream outage into permanent content loss, because
-- the failures of sources sharing a host are perfectly correlated. Measured
-- 2026-08-06:
--
--   45 sources auto-paused with "8 consecutive failures: HTTP 521"
--   all 45 on ONE host — joy.org.au (an Australian LGBTQ+ radio station)
--   all paused inside a ~2h window on 2026-07-31 (03:01–05:00)
--
-- HTTP 521 is Cloudflare "web server is down" — an origin fault, not 45 broken
-- feeds. joy.org.au answers 200 today (probed via pg_net: 83 KB / 332 KB /
-- 194 KB bodies), so those 45 feeds have been dark for six days and would have
-- stayed dark for ever.
--
-- This sweep gives such sources a bounded retry. It is deliberately NOT a
-- blanket un-pause:
--
--   * Only transient, host-level reasons qualify — HTTP 5xx / 429 / connection
--     errors. A 404 means the feed itself is gone and an empty-fetch streak
--     means it serves nothing; neither recovers by waiting, so both stay
--     paused.
--   * At most `p_max_attempts` (3) retries per source, tracked in
--     `auto_unpause_attempts`. A genuinely dead host therefore costs 3 retries
--     total, not a daily pause/un-pause cycle for ever.
--   * The attempt budget resets once a source actually delivers again, so a
--     feed that recovers is not permanently one strike from exhaustion.
--
-- Self-limiting by construction: an un-paused source that is still broken
-- simply re-paused after 8 more failures, via the existing logic.
-- ============================================================================

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS auto_unpause_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.news_sources.auto_unpause_attempts IS
  'How many times run_news_source_unpause_sweep() has retried this source. Reset to 0 by a successful fetch. Caps automatic recovery so a permanently dead host cannot cycle for ever.';

CREATE OR REPLACE FUNCTION public.run_news_source_unpause_sweep(p_max_attempts integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unpaused integer := 0;
  v_reset    integer := 0;
BEGIN
  -- (1) Give back the attempt budget to sources that have since delivered.
  -- Without this, a feed that flaps once a quarter would exhaust its three
  -- retries over a year and then be unrecoverable for the wrong reason.
  UPDATE public.news_sources
     SET auto_unpause_attempts = 0
   WHERE auto_unpause_attempts > 0
     AND NOT auto_paused
     AND last_successful_fetch > now() - interval '7 days';
  GET DIAGNOSTICS v_reset = ROW_COUNT;

  -- (2) Retry sources paused by a transient, host-level failure.
  WITH candidates AS (
    SELECT id
      FROM public.news_sources
     WHERE auto_paused
       AND is_active
       AND auto_unpause_attempts < p_max_attempts
       -- Transient only. Matches "HTTP 500".."HTTP 599", "HTTP 429", and the
       -- connection-level "error sending request for url (…)" shape. Does NOT
       -- match 404 or the empty-fetch reason.
       AND auto_paused_reason ~ 'consecutive failures: (HTTP (5[0-9]{2}|429)|error sending request)'
       -- Let the upstream actually recover before spending an attempt.
       AND coalesce(last_fetched_at, created_at) < now() - interval '24 hours'
  )
  UPDATE public.news_sources s
     SET auto_paused           = false,
         auto_paused_reason    = NULL,
         consecutive_failures  = 0,
         backoff_until         = NULL,
         status                = 'active',
         auto_unpause_attempts = s.auto_unpause_attempts + 1,
         last_error            = format(
           'auto-unpaused for retry %s/%s; previous pause: %s',
           s.auto_unpause_attempts + 1, p_max_attempts, s.auto_paused_reason)
    FROM candidates c
   WHERE c.id = s.id;
  GET DIAGNOSTICS v_unpaused = ROW_COUNT;

  RETURN jsonb_build_object(
    'unpaused', v_unpaused,
    'attempt_budget_reset', v_reset,
    'max_attempts', p_max_attempts,
    'ran_at', now()
  );
END $$;

COMMENT ON FUNCTION public.run_news_source_unpause_sweep(integer) IS
  'Daily: bounded retry for news sources auto-paused by a TRANSIENT failure (HTTP 5xx/429/connection). 404 and empty-fetch pauses are permanent by design. Max 3 attempts per source; budget resets on a successful fetch.';

REVOKE EXECUTE ON FUNCTION public.run_news_source_unpause_sweep(integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_news_source_unpause_sweep(integer) TO service_role;

-- Registry-of-record first, then pg_cron. A cron job with no admin_automations
-- row reads as "unregistered" to the pipeline-health gate, and the reconciler
-- (sync_automations_to_cron) drives cron FROM this table — so registering only
-- the cron side would be undone.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'news_source_unpause_sweep',
  'Retry transiently-paused news sources',
  'Daily: un-pauses news sources auto-paused by a transient failure (HTTP 5xx/429/connection) so one upstream outage cannot dark a whole host for ever. Max 3 attempts each; 404 and empty-fetch pauses stay permanent.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type":"rpc","fn":"run_news_source_unpause_sweep","jobname":"news_source_unpause_sweep"}'::jsonb,
  '20 5 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = EXCLUDED.enabled;

DO $$
BEGIN
  PERFORM cron.unschedule('news_source_unpause_sweep');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'news_source_unpause_sweep',
  '20 5 * * *',
  'SELECT public.run_news_source_unpause_sweep();'
);
