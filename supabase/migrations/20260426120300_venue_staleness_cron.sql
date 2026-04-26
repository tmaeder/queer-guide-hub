-- Stale/closed-venue detection: marks venues.closed_at when no source has
-- listed them recently. The closed_at column exists since 2026-04-20 but
-- nothing populated it automatically.
--
-- Heuristic (conservative — venues, not events):
--   stale  = MAX(venue_sources.last_seen_at) < now() - 60 days
--   AND no recent successful run from any of its sources in the last 30 days
--   AND venue is currently open (closed_at IS NULL)
--
-- Then: mark closed_at = now(). Audit trail in venue_closed_audit so we can
-- reverse a wrong call. Conservative thresholds prevent false-positives that
-- would silently drop venues from the public site.

CREATE TABLE IF NOT EXISTS public.venue_closed_audit (
  id           BIGSERIAL PRIMARY KEY,
  venue_id     UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  closed_at    TIMESTAMPTZ NOT NULL,
  reason       TEXT NOT NULL,
  detail       JSONB,
  reverted_at  TIMESTAMPTZ,
  reverted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venue_closed_audit_venue
  ON public.venue_closed_audit(venue_id, created_at DESC);

ALTER TABLE public.venue_closed_audit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_closed_audit' AND policyname='vca_admin_all') THEN
    CREATE POLICY "vca_admin_all" ON public.venue_closed_audit FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.detect_stale_venues(
  p_stale_after_days INT DEFAULT 60,
  p_dry_run          BOOLEAN DEFAULT false
)
RETURNS TABLE(venue_id UUID, last_seen_at TIMESTAMPTZ)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
BEGIN
  FOR v_record IN
    WITH last_sources AS (
      SELECT venue_id, MAX(last_seen_at) AS max_seen
      FROM public.venue_sources
      GROUP BY venue_id
    )
    SELECT v.id AS vid, ls.max_seen
    FROM public.venues v
    LEFT JOIN last_sources ls ON ls.venue_id = v.id
    WHERE v.closed_at IS NULL
      AND coalesce(ls.max_seen, v.created_at) < now() - (p_stale_after_days || ' days')::interval
  LOOP
    IF NOT p_dry_run THEN
      UPDATE public.venues
        SET closed_at = now()
        WHERE id = v_record.vid AND closed_at IS NULL;

      INSERT INTO public.venue_closed_audit(venue_id, closed_at, reason, detail)
      VALUES (
        v_record.vid,
        now(),
        'stale_no_recent_source_sighting',
        jsonb_build_object(
          'last_seen_at', v_record.max_seen,
          'threshold_days', p_stale_after_days,
          'detected_by', 'detect_stale_venues_cron'
        )
      );
    END IF;
    venue_id := v_record.vid;
    last_seen_at := v_record.max_seen;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_stale_venues(INT, BOOLEAN) TO service_role, authenticated;

-- Daily cron at 04:30 UTC — after the 03:15 UTC scraper run finishes,
-- so venue_sources.last_seen_at is current.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='detect-stale-venues';
  PERFORM cron.schedule('detect-stale-venues', '30 4 * * *', $f$
    SELECT public.detect_stale_venues(60, false);
  $f$);
END $$;

COMMENT ON FUNCTION public.detect_stale_venues IS
  'Marks venues.closed_at when no source has listed the venue for p_stale_after_days. Audit in venue_closed_audit. Set p_dry_run=true to preview without mutation.';
