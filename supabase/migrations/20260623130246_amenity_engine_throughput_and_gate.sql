-- Amenity Truth Engine — make it reliable + automated in the background.
-- Problem (prod, 2026-06-23): engine runs nightly but data barely moves.
--   • amenity coverage 5.4% (1293/23874), accessibility 0.008% (2)
--   • review queue: 20 open accessibility items, oldest 15 days, 0 EVER approved/rejected
--     (the human gate was never cleared — same failure as city safety notes 0/3830)
--   • throughput 60/day, LLM only reaches desc>=80 venues (3342 fillable), and the
--     selector keeps re-cycling ~19k ungroundable venues (no description) forever
--   • cron "succeeds" but only because net.http_post enqueued — the real edge-fn
--     result lands nowhere the admin can see.
-- Fixes here: (1) targeted selector, (2) one-click batch-approve of SAFE reviews,
-- (3) run visibility + frequent small batches. Accessibility stays human-gated
-- (load-bearing invariant: a wrong access claim is real-world harm) — we only make
-- the human's job one click instead of twenty. Idempotent; no CONCURRENTLY.

-- ===== 1. Targeted work-list selector =====
-- Adds p_only_fillable (LLM cron asks for desc>=80 + empty-amenities so it never
-- wastes an invocation on a venue it can't ground) and a backstop that stops
-- re-selecting recently-swept ungroundable venues for 30 days (frees the daily
-- LLM budget for the venues that CAN be filled). Re-entry after 30d is cheap and
-- catches venues that gained a description since.
DROP FUNCTION IF EXISTS public.venues_due_for_amenity_backfill(int);

CREATE OR REPLACE FUNCTION public.venues_due_for_amenity_backfill(
  p_limit int DEFAULT 25,
  p_only_fillable boolean DEFAULT false
)
RETURNS TABLE (
  id              uuid,
  name            text,
  category        text,
  description     text,
  tags            text[],
  amenities       text[],
  accessibility_attributes text[],
  platform_ids    jsonb,
  last_refreshed_at timestamptz,
  refresh_reason  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    v.id, v.name, v.category, v.description, v.tags, v.amenities,
    v.accessibility_attributes, v.platform_ids, v.last_refreshed_at,
    CASE
      WHEN coalesce(array_length(v.amenities,1),0) = 0 THEN 'no_amenities'
      WHEN coalesce(array_length(v.accessibility_attributes,1),0) = 0 THEN 'no_accessibility'
      WHEN v.amenities_verified IS NOT TRUE THEN 'unverified'
      ELSE 'stale'
    END AS refresh_reason
  FROM public.venues v
  WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL
    -- LLM cron: only venues an LLM can actually ground (description + empty amenities).
    AND (NOT p_only_fillable OR (
          coalesce(array_length(v.amenities,1),0) = 0
          AND length(coalesce(v.description,'')) >= 80))
    -- Backstop: skip recently-swept ungroundable venues (no amenities, no usable
    -- description). Nothing either source can do; don't burn the budget re-checking.
    AND NOT (
          v.last_refreshed_at > now() - interval '30 days'
          AND coalesce(array_length(v.amenities,1),0) = 0
          AND length(coalesce(v.description,'')) < 80)
  ORDER BY
    (coalesce(array_length(v.amenities,1),0) > 0),                 -- empty amenities first
    (coalesce(array_length(v.accessibility_attributes,1),0) > 0),  -- no accessibility next
    (v.amenities_verified IS TRUE),                                -- unverified next
    v.last_refreshed_at ASC NULLS FIRST                            -- then oldest
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.venues_due_for_amenity_backfill(int, boolean) TO service_role, authenticated;
COMMENT ON FUNCTION public.venues_due_for_amenity_backfill(int, boolean) IS
  'Prioritized batch for amenity-truth-backfill. p_only_fillable restricts to desc>=80 + empty amenities (LLM cron). Skips recently-swept ungroundable venues. Excludes closed/duplicate venues.';

-- ===== 2. Batch-approve SAFE accessibility reviews (human one-click, not auto) =====
-- "Safe" = high confidence AND citation-backed (the access claim is grounded in a
-- quote from the venue's own text). Reuses the audited approve_venue_review path so
-- every approval is still logged in venue_consensus_audit. A human runs this; the
-- machine never auto-publishes accessibility.
CREATE OR REPLACE FUNCTION public.batch_approve_safe_venue_reviews(p_min_conf numeric DEFAULT 0.80)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r       record;
  v_count int := 0;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  FOR r IN
    SELECT id FROM public.venue_review_queue
    WHERE status = 'open'
      AND confidence >= p_min_conf
      AND jsonb_array_length(coalesce(citations, '[]'::jsonb)) > 0
    ORDER BY created_at
  LOOP
    PERFORM public.approve_venue_review(
      r.id, 'batch-approved (safe: conf>=' || p_min_conf::text || ', cited)');
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('approved', v_count, 'min_conf', p_min_conf);
END; $$;
ALTER FUNCTION public.batch_approve_safe_venue_reviews(numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.batch_approve_safe_venue_reviews(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_approve_safe_venue_reviews(numeric) TO authenticated, service_role;

-- ===== 3. Run visibility =====
-- Register the backfill as an automation so its runs show up in admin_automation_runs
-- (the edge function writes a summary row at the end of each invocation). Enable the
-- weekly coverage pulse that was registered paused.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('amenity_truth_backfill','Amenity truth backfill',
   'Cleans + LLM-fills venue amenities and queues accessibility for review. Runs every 3h, targets fillable venues, daily LLM cap.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"edge","fn":"amenity-truth-backfill"}'::jsonb, '0 */3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule, enabled=true;

UPDATE public.admin_automations SET enabled = true WHERE slug = 'amenity_coverage_summary';

-- ===== 4. Reschedule the backfill cron: frequent small batches, fillable-targeted =====
-- Was: daily 04:15, batch 60 (×~1.5s LLM ≈ 90s, near the 120s timeout).
-- Now: every 3h, batch 30 (safely <110s), daily_cap 200, only_fillable. ~8 runs/day
-- drains the ~3.3k fillable pool in ~17 days, then naturally tapers.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='amenity_truth_backfill') THEN
    PERFORM cron.unschedule('amenity_truth_backfill');
  END IF;
  PERFORM cron.schedule('amenity_truth_backfill', '0 */3 * * *', $cron$
    select net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/amenity-truth-backfill',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='amenity_quality_webhook_secret')
      ),
      body := '{"sources":["extract","llm"],"batch_limit":30,"daily_cap":200,"only_fillable":true}'::jsonb,
      timeout_milliseconds := 110000
    );
  $cron$);
END $$;
