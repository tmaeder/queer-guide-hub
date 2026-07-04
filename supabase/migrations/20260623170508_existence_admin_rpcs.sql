-- Existence Truth Engine — M5 admin reader RPCs (2026-06-23)
-- Powers the /admin "Liveness & Closure" panel: overview counts, the single-signal
-- review queue, recent auto-archives (with reopen), and the un-probeable blind-spot
-- list. All admin-gated, SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.existence_overview()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin','moderator']::app_role[]) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT jsonb_object_agg(t.entity_type, t.obj) INTO v
  FROM (
    SELECT et AS entity_type, jsonb_build_object(
      'flagged', (SELECT count(*) FROM public.entity_existence_audit a
                  WHERE a.entity_type=et AND a.action='flag' AND a.reverted_at IS NULL),
      'auto_archived_7d', (SELECT count(*) FROM public.entity_existence_audit a
                  WHERE a.entity_type=et AND a.action='archive' AND a.reverted_at IS NULL
                    AND a.created_at > now() - interval '7 days'),
      'open_archives', (SELECT count(*) FROM public.entity_existence_audit a
                  WHERE a.entity_type=et AND a.action='archive' AND a.reverted_at IS NULL),
      'dead_signal_entities', (SELECT count(DISTINCT entity_id) FROM public.entity_existence_signals s
                  WHERE s.entity_type=et AND s.verdict='dead' AND s.observed_at > now() - interval '120 days')
    ) AS obj
    FROM unnest(ARRAY['venue','event','marketplace']) et
  ) t;
  RETURN coalesce(v, '{}'::jsonb);
END; $function$;

CREATE OR REPLACE FUNCTION public.existence_review_queue(p_entity_type text DEFAULT NULL, p_limit int DEFAULT 50)
 RETURNS TABLE(audit_id bigint, entity_type text, entity_id uuid, label text, slug text, reason text, signals jsonb, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin','moderator']::app_role[]) THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  SELECT a.id, a.entity_type, a.entity_id,
    CASE a.entity_type WHEN 'venue' THEN v.name WHEN 'event' THEN e.title WHEN 'marketplace' THEN m.title END,
    CASE a.entity_type WHEN 'venue' THEN v.slug WHEN 'event' THEN e.slug WHEN 'marketplace' THEN m.slug END,
    a.reason, a.signals, a.created_at
  FROM public.entity_existence_audit a
  LEFT JOIN public.venues v ON a.entity_type='venue' AND v.id=a.entity_id
  LEFT JOIN public.events e ON a.entity_type='event' AND e.id=a.entity_id
  LEFT JOIN public.marketplace_listings m ON a.entity_type='marketplace' AND m.id=a.entity_id
  WHERE a.action='flag' AND a.reverted_at IS NULL
    AND (p_entity_type IS NULL OR a.entity_type=p_entity_type)
  ORDER BY a.created_at DESC LIMIT greatest(1, least(p_limit, 200));
END; $function$;

CREATE OR REPLACE FUNCTION public.existence_recent_archives(p_entity_type text DEFAULT NULL, p_limit int DEFAULT 50)
 RETURNS TABLE(audit_id bigint, entity_type text, entity_id uuid, label text, slug text, reason text, signals jsonb, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin','moderator']::app_role[]) THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  SELECT a.id, a.entity_type, a.entity_id,
    CASE a.entity_type WHEN 'venue' THEN v.name WHEN 'event' THEN e.title WHEN 'marketplace' THEN m.title END,
    CASE a.entity_type WHEN 'venue' THEN v.slug WHEN 'event' THEN e.slug WHEN 'marketplace' THEN m.slug END,
    a.reason, a.signals, a.created_at
  FROM public.entity_existence_audit a
  LEFT JOIN public.venues v ON a.entity_type='venue' AND v.id=a.entity_id
  LEFT JOIN public.events e ON a.entity_type='event' AND e.id=a.entity_id
  LEFT JOIN public.marketplace_listings m ON a.entity_type='marketplace' AND m.id=a.entity_id
  WHERE a.action='archive' AND a.reverted_at IS NULL
    AND (p_entity_type IS NULL OR a.entity_type=p_entity_type)
  ORDER BY a.created_at DESC LIMIT greatest(1, least(p_limit, 200));
END; $function$;

CREATE OR REPLACE FUNCTION public.existence_blind_spots(p_entity_type text DEFAULT NULL, p_limit int DEFAULT 50)
 RETURNS TABLE(entity_type text, entity_id uuid, label text, slug text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin','moderator']::app_role[]) THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  (SELECT 'venue', v.id, v.name, v.slug FROM public.venues v
    WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL
      AND v.website IS NULL AND (v.latitude IS NULL OR v.longitude IS NULL)
      AND (p_entity_type IS NULL OR p_entity_type='venue')
    LIMIT CASE WHEN p_entity_type IS NULL OR p_entity_type='venue' THEN greatest(1, least(p_limit,200)) ELSE 0 END)
  UNION ALL
  (SELECT 'event', e.id, e.title, e.slug FROM public.events e
    WHERE e.status NOT IN ('cancelled','completed') AND e.duplicate_of_id IS NULL AND e.website IS NULL
      AND (p_entity_type IS NULL OR p_entity_type='event')
    LIMIT CASE WHEN p_entity_type IS NULL OR p_entity_type='event' THEN greatest(1, least(p_limit,200)) ELSE 0 END)
  UNION ALL
  (SELECT 'marketplace', m.id, m.title, m.slug FROM public.marketplace_listings m
    WHERE m.status IN ('active','sold_out') AND m.duplicate_of_id IS NULL
      AND m.external_url IS NULL AND m.affiliate_url IS NULL
      AND (p_entity_type IS NULL OR p_entity_type='marketplace')
    LIMIT CASE WHEN p_entity_type IS NULL OR p_entity_type='marketplace' THEN greatest(1, least(p_limit,200)) ELSE 0 END);
END; $function$;

GRANT EXECUTE ON FUNCTION public.existence_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.existence_review_queue(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.existence_recent_archives(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.existence_blind_spots(text, int) TO authenticated;
