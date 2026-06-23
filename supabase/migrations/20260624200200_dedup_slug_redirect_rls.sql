-- Unified dedup follow-up — RLS hardening for the new slug-redirect tables (2026-06-24)
--
-- 20260623123927_generic_entity_merge created event/marketplace/personality
-- _slug_redirects WITHOUT row-level security, so they inherited the default
-- anon/authenticated write grants (a writable public table → security-advisor
-- finding + tamperable redirects). Mirror venue_slug_redirects exactly: RLS on,
-- one public SELECT policy (slug resolution needs read), and writes only via the
-- SECURITY DEFINER merge cores (which bypass RLS). Idempotent.

ALTER TABLE public.event_slug_redirects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_slug_redirects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personality_slug_redirects  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_slug_redirects_public_read ON public.event_slug_redirects;
CREATE POLICY event_slug_redirects_public_read ON public.event_slug_redirects FOR SELECT USING (true);
DROP POLICY IF EXISTS marketplace_slug_redirects_public_read ON public.marketplace_slug_redirects;
CREATE POLICY marketplace_slug_redirects_public_read ON public.marketplace_slug_redirects FOR SELECT USING (true);
DROP POLICY IF EXISTS personality_slug_redirects_public_read ON public.personality_slug_redirects;
CREATE POLICY personality_slug_redirects_public_read ON public.personality_slug_redirects FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_slug_redirects        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.marketplace_slug_redirects  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.personality_slug_redirects  FROM anon, authenticated;
