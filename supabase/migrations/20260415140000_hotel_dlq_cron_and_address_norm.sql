-- Hotel ops follow-up: DLQ + reenrich crons, address normalization, dedup signal.
-- Replays prod changes applied via mcp on 2026-04-15.

-- Cron: DLQ consumer, coverage refresh, hotel reenrich.
DO $$
DECLARE
  v_url  TEXT := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1';
  v_auth TEXT := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
  v_headers_text TEXT;
BEGIN
  v_headers_text := jsonb_build_object('Content-Type','application/json','Authorization',v_auth)::text;

  PERFORM cron.unschedule(jobid) FROM cron.job
  WHERE jobname IN ('pipeline-dlq-consumer','hotel-coverage-refresh','hotel-reenrich-stale');

  PERFORM cron.schedule('pipeline-dlq-consumer', '* * * * *', format($f$
    SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:='{"limit":50}'::jsonb);
  $f$, v_url || '/pipeline-dlq-consumer', v_headers_text));

  PERFORM cron.schedule('hotel-coverage-refresh', '*/15 * * * *', $f$
    SELECT public.refresh_source_coverage();
  $f$);

  PERFORM cron.schedule('hotel-reenrich-stale', '23 4 * * *', format($f$
    WITH stale AS (
      SELECT id FROM public.venues
      WHERE accommodation_type IS NOT NULL AND duplicate_of_id IS NULL
        AND (last_refreshed_at IS NULL OR last_refreshed_at < now() - interval '90 days')
      ORDER BY last_refreshed_at NULLS FIRST LIMIT 50
    )
    SELECT net.http_post(url:=%L, headers:=%L::jsonb,
      body:=jsonb_build_object('venue_ids', (SELECT array_agg(id) FROM stale), 'reason','scheduled_reenrich'))
    WHERE EXISTS (SELECT 1 FROM stale);
  $f$, v_url || '/enrich-venue', v_headers_text));
END $$;

-- Address normalization helper.
CREATE OR REPLACE FUNCTION public.normalize_address(a TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions AS $$
  WITH x AS (SELECT lower(extensions.unaccent(coalesce(a,''))) AS s),
  e AS (
    SELECT regexp_replace(
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        s, '\bavenue\b','ave','g'),
        '\bstreet\b','st','g'), '\bsaint\b','st','g'), '\bboulevard\b','blvd','g'),
        '\bdrive\b','dr','g'), '\broad\b','rd','g'), '\blane\b','ln','g'),
        '\bcourt\b','ct','g'), '\bplace\b','pl','g'), '\bsquare\b','sq','g'),
        '\bterrace\b','ter','g'), '\bhighway\b','hwy','g'), '\bparkway\b','pkwy','g'),
        '\bnorth\b','n','g'), '\bsouth\b','s','g'), '\beast\b','e','g') AS s
    FROM x
  ),
  e2 AS (SELECT regexp_replace(s,'\bwest\b','w','g') AS s FROM e)
  SELECT btrim(regexp_replace(s,'[^a-z0-9]+',' ','g')) FROM e2;
$$;
GRANT EXECUTE ON FUNCTION public.normalize_address(TEXT) TO authenticated, service_role;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS address_normalized TEXT;

CREATE OR REPLACE FUNCTION public.venues_maintain_normalized()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, extensions AS $$
BEGIN
  NEW.phone_e164         := public.normalize_phone(NEW.phone);
  NEW.website_domain     := public.extract_website_domain(NEW.website);
  NEW.email_lower        := lower(nullif(btrim(NEW.email), ''));
  NEW.name_normalized    := public.normalize_name(NEW.name);
  NEW.address_normalized := public.normalize_address(NEW.address);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venues_normalized ON public.venues;
CREATE TRIGGER trg_venues_normalized
  BEFORE INSERT OR UPDATE OF name, phone, website, email, address
  ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_maintain_normalized();

UPDATE public.venues SET address_normalized = public.normalize_address(address)
WHERE address_normalized IS NULL AND address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_address_trgm
  ON public.venues USING gin (address_normalized extensions.gin_trgm_ops)
  WHERE address_normalized IS NOT NULL AND duplicate_of_id IS NULL;

-- Extend venue + hotel dedup RPCs with p_address parameter.
CREATE OR REPLACE FUNCTION public.find_venue_duplicate_candidates(
  p_name TEXT, p_phone_e164 TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL,
  p_website_domain TEXT DEFAULT NULL, p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL,
  p_city_id UUID DEFAULT NULL, p_limit INT DEFAULT 20, p_address TEXT DEFAULT NULL
)
RETURNS TABLE(venue_id UUID, match_type TEXT, score NUMERIC, distance_m DOUBLE PRECISION)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH candidates AS (
    SELECT v.id AS vid, 'phone_exact'::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v
    WHERE p_phone_e164 IS NOT NULL AND v.phone_e164 = p_phone_e164 AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'email_exact', 0.98, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_email IS NOT NULL AND v.email_lower = lower(btrim(p_email)) AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'domain_proximity', 0.95, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_website_domain IS NOT NULL AND v.website_domain = p_website_domain AND v.duplicate_of_id IS NULL
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 500)
    UNION ALL
    SELECT v.id, 'name_proximity',
           extensions.similarity(v.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE v.name_normalized % public.normalize_name(p_name) AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 1500)
    UNION ALL
    SELECT v.id, 'address_name_proximity',
           ((extensions.similarity(v.address_normalized, public.normalize_address(p_address)) +
             extensions.similarity(v.name_normalized,     public.normalize_name(p_name))) / 2)::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_address IS NOT NULL
      AND v.address_normalized IS NOT NULL
      AND v.address_normalized % public.normalize_address(p_address)
      AND v.name_normalized    % public.normalize_name(p_name)
      AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
  ),
  best AS (
    SELECT DISTINCT ON (vid) vid, mt, sc, dm
    FROM candidates ORDER BY vid, sc DESC, dm ASC NULLS LAST
  )
  SELECT vid, mt, sc, dm FROM best
  ORDER BY sc DESC, dm ASC NULLS LAST LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.find_venue_duplicate_candidates(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,UUID,INT,TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.find_hotel_duplicate_candidates(
  p_name TEXT, p_phone_e164 TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL,
  p_website_domain TEXT DEFAULT NULL, p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL,
  p_city_id UUID DEFAULT NULL, p_platform_ids JSONB DEFAULT '{}'::jsonb,
  p_booking_url TEXT DEFAULT NULL, p_limit INT DEFAULT 20, p_address TEXT DEFAULT NULL
)
RETURNS TABLE(venue_id UUID, match_type TEXT, score NUMERIC, distance_m DOUBLE PRECISION)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH platform_keys AS (
    SELECT key, value::text AS pid FROM jsonb_each_text(coalesce(p_platform_ids, '{}'::jsonb))
    WHERE value IS NOT NULL AND value::text <> ''
  ),
  candidates AS (
    SELECT v.id, ('platform_' || pk.key)::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v JOIN platform_keys pk ON v.platform_ids ->> pk.key = pk.pid
    WHERE v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'booking_url_exact', 0.99, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_booking_url IS NOT NULL AND lower(btrim(v.booking_url)) = lower(btrim(p_booking_url))
      AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT c.venue_id, c.match_type, c.score, c.distance_m
    FROM public.find_venue_duplicate_candidates(p_name, p_phone_e164, p_email, p_website_domain, p_lat, p_lng, p_city_id, p_limit, p_address) c
  )
  SELECT DISTINCT ON (id) id, mt, sc, dm FROM candidates
  ORDER BY id, sc DESC, dm ASC NULLS LAST LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.find_hotel_duplicate_candidates(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,UUID,JSONB,TEXT,INT,TEXT) TO authenticated, service_role;
