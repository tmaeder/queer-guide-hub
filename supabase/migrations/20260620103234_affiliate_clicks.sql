-- ============================================================
-- Affiliate attribution: surface-scoped click + impression log
--
-- trip_booking_clicks is trip-scoped; monetisation now lives on many
-- surfaces (venues, events, cities, news, …). This generalises the click
-- log so EVERY surface's affiliate exits are attributable per
-- surface × partner × vertical × sub_id.
--
-- Written by the first-party /go redirect in the search-proxy worker
-- (service role) and, as a fallback, by client BookCTA impression logging.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface         text NOT NULL,                 -- AffiliateSurface taxonomy (venue/event/city/…)
  partner         text NOT NULL,                 -- PARTNERS key (aviasales/booking/getyourguide/…)
  vertical        text NOT NULL,                 -- flight/hotel/activity/car/transfer/esim/insurance/other
  sub_id          text,                          -- the tag sent to Travelpayouts (usually == surface)
  entity_type     text,                          -- originating entity, e.g. 'venue'
  entity_id       uuid,                          -- originating entity id (nullable for non-entity surfaces)
  destination_url text NOT NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id      text,
  kind            text NOT NULL DEFAULT 'click'  -- 'click' | 'impression'
                  CONSTRAINT affiliate_clicks_kind_check CHECK (kind IN ('click', 'impression')),
  clicked_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_clicks OWNER TO postgres;

COMMENT ON TABLE public.affiliate_clicks IS
  'Surface-attributed affiliate exits. Generalises trip_booking_clicks across all monetised surfaces. Paired kind=impression rows give CTR per surface.';

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_surface_time
  ON public.affiliate_clicks (surface, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_partner_time
  ON public.affiliate_clicks (partner, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_entity
  ON public.affiliate_clicks (entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_kind_time
  ON public.affiliate_clicks (kind, clicked_at DESC);

-- RLS: writes are service-role only (the worker). Reads are admin-only
-- (the /admin/affiliate dashboard goes through the aggregate RPC below).
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_clicks_admin_read ON public.affiliate_clicks;
CREATE POLICY affiliate_clicks_admin_read ON public.affiliate_clicks
  FOR SELECT TO authenticated
  USING (public.has_role_jwt('admin'));

-- No INSERT/UPDATE/DELETE policy for authenticated → only service_role
-- (which bypasses RLS) can write. Keeps the log tamper-proof from clients.

-- ── Aggregate for the admin dashboard ─────────────────────────────
-- Self-gating SECURITY DEFINER: returns clicks + impressions + CTR grouped
-- by surface × partner × vertical over a window. Admin-only.
CREATE OR REPLACE FUNCTION public.affiliate_click_summary(p_days int DEFAULT 30)
RETURNS TABLE (
  surface     text,
  partner     text,
  vertical    text,
  clicks      bigint,
  impressions bigint,
  ctr         numeric,
  last_click  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    surface,
    partner,
    vertical,
    count(*) FILTER (WHERE kind = 'click')                                   AS clicks,
    count(*) FILTER (WHERE kind = 'impression')                             AS impressions,
    round(
      count(*) FILTER (WHERE kind = 'click')::numeric
      / NULLIF(count(*) FILTER (WHERE kind = 'impression'), 0), 4
    )                                                                        AS ctr,
    max(clicked_at) FILTER (WHERE kind = 'click')                           AS last_click
  FROM public.affiliate_clicks
  WHERE clicked_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
    AND public.has_role_jwt('admin')
  GROUP BY surface, partner, vertical
  ORDER BY clicks DESC;
$$;

REVOKE ALL ON FUNCTION public.affiliate_click_summary(int) FROM public;
GRANT EXECUTE ON FUNCTION public.affiliate_click_summary(int) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'affiliate_clicks ready: surface-attributed affiliate log + affiliate_click_summary() admin aggregate';
END $$;
