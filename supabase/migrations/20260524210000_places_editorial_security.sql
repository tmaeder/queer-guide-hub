-- Address security advisors from 20260524200000_places_editorial:
-- 1. editorial_rails_touch: fix mutable search_path
-- 2. current_editorial_cover: switch SECURITY DEFINER -> INVOKER (RLS already filters)
-- 3. approve_editorial_draft: revoke from anon and PUBLIC; keep is_admin gate

ALTER FUNCTION public.editorial_rails_touch() SET search_path = public;

CREATE OR REPLACE FUNCTION current_editorial_cover()
RETURNS TABLE (
  id              UUID,
  entity_type     editorial_entity_type,
  entity_id       UUID,
  headline        TEXT,
  pull_quote      TEXT,
  hero_image_url  TEXT,
  author          TEXT,
  starts_at       TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT id, entity_type, entity_id, headline, pull_quote, hero_image_url, author, starts_at
  FROM editorial_covers
  WHERE published = TRUE
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  ORDER BY starts_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_editorial_cover() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION approve_editorial_draft(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_editorial_draft(UUID) TO authenticated;
