-- ============================================================================
-- Tag Content-Quality: Phase 2 — enrichment producer (parked cron)
-- ----------------------------------------------------------------------------
-- Wires the tag-enrichment-sweep edge function to a daily cron. The sweep walks
-- active tags worst-first and fills the lowest missing content dimension
-- (wiki link → description → image), free sources first, with hybrid-by-
-- confidence routing: source-grounded enrichment auto-applies; pure-LLM guesses
-- and sensitive/adult tags are queued to ai_suggestions for admin review at
-- /admin/tags.
--
-- PARKED by design (mirrors 20260607040000_tag_i18n_cron): the job POSTs with
-- X-Webhook-Secret read from Vault (name='tag_enrichment_webhook_secret'). Until
-- BOTH of these exist the POST sends a NULL secret and the function returns 401,
-- so the job rotates harmlessly (effectively paused):
--   1) supabase functions deploy tag-enrichment-sweep
--   2) select vault.create_secret('<secret>', 'tag_enrichment_webhook_secret', 'tag enrichment cron auth');
--   3) supabase secrets set TAG_ENRICHMENT_WEBHOOK_SECRET=<secret>   (on the function)
-- ============================================================================

-- Selector: active tags with no category assignment, worst-first. Used by the
-- sweep's categorization pass (the ~2.1k uncategorized tags are the biggest
-- quality gap). Mirrors the *_due_for_* selector convention.
-- p_random shuffles selection so a cluster of un-categorizable scraping junk at
-- the worst-score head (e.g. menu items, broken names) doesn't permanently block
-- the LLM categorizer from reaching real tags deeper in the backlog.
CREATE OR REPLACE FUNCTION public.tags_due_for_category(
  p_limit int DEFAULT 20,
  p_random boolean DEFAULT false
)
RETURNS TABLE (id uuid, name text, is_sensitive boolean, is_adult boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.is_sensitive, t.is_adult
  FROM public.unified_tags t
  WHERE t.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id = t.id)
  ORDER BY
    CASE WHEN p_random THEN random() END,
    t.quality_score ASC NULLS FIRST, t.id
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;
ALTER FUNCTION public.tags_due_for_category(int, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tags_due_for_category(int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tags_due_for_category(int, boolean) TO service_role, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tag_enrichment_sweep') THEN
    PERFORM cron.unschedule('tag_enrichment_sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'tag_enrichment_sweep',
  '40 5 * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tag_enrichment_webhook_secret')
    ),
    body := jsonb_build_object('batch_limit', 20, 'triggered_by', 'cron')
  ) as request_id;
  $cron$
);
