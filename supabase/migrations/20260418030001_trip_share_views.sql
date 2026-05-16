-- ============================================================
-- trip_share_views: log each viewer hit on a /trips/shared/:token page
-- so the trip owner sees social proof ("12 people viewed your link").
--
-- Anonymous-friendly: viewer_user_id is nullable (most viewers won't be
-- logged in). We aggregate by share_id and by day client-side; we do not
-- store IP, user-agent, or anything that could PII-identify an anonymous
-- viewer beyond a coarse referer host.
-- ============================================================

CREATE TABLE public.trip_share_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES public.trip_shares(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referer_host TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_share_views_share ON public.trip_share_views(share_id, viewed_at DESC);
CREATE INDEX idx_trip_share_views_trip ON public.trip_share_views(trip_id, viewed_at DESC);

ALTER TABLE public.trip_share_views ENABLE ROW LEVEL SECURITY;

-- Trip editors can read view stats for their own trips.
CREATE POLICY trip_share_views_select ON public.trip_share_views FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_share_views.trip_id
      AND (t.owner_id = (SELECT auth.uid())
           OR EXISTS (
             SELECT 1 FROM public.trip_members m
             WHERE m.trip_id = t.id AND m.user_id = (SELECT auth.uid())
                   AND m.role IN ('owner','editor')
           ))
  )
);

-- No direct INSERT/UPDATE/DELETE: writes happen via SECURITY DEFINER RPC
-- so anonymous viewers can record a hit without table-level grants.

-- ============================================================
-- track_share_view: idempotent-ish view counter callable by anyone
-- holding a valid (non-expired) share token. Returns the share_id so
-- the client can confirm the hit registered (debugging only).
-- ============================================================
CREATE OR REPLACE FUNCTION public.track_share_view(
  p_token TEXT,
  p_referer_host TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_share_id UUID;
  v_trip_id UUID;
BEGIN
  SELECT id, trip_id INTO v_share_id, v_trip_id
  FROM public.trip_shares
  WHERE token = p_token
    AND (expires_at IS NULL OR expires_at > now());

  IF v_share_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.trip_share_views (share_id, trip_id, viewer_user_id, referer_host)
  VALUES (v_share_id, v_trip_id, auth.uid(), p_referer_host);

  RETURN v_share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.track_share_view(TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- get_share_view_stats: per-share aggregate for the owner's UI.
-- Returns total views + last 7 days + last viewed timestamp.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_share_view_stats(p_trip_id UUID)
RETURNS TABLE (
  share_id UUID,
  total_views BIGINT,
  views_7d BIGINT,
  last_viewed_at TIMESTAMPTZ
) AS $$
  SELECT
    share_id,
    COUNT(*) AS total_views,
    COUNT(*) FILTER (WHERE viewed_at >= now() - INTERVAL '7 days') AS views_7d,
    MAX(viewed_at) AS last_viewed_at
  FROM public.trip_share_views
  WHERE trip_id = p_trip_id
  GROUP BY share_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_share_view_stats(UUID) TO authenticated;
