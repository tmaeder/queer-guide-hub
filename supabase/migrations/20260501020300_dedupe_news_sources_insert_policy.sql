-- Consolidation sprint Q2-2026, Batch 2c: drop duplicate INSERT policy on news_sources.
-- Two policies "Admins can insert news sources" and "admins insert news_sources" had
-- bit-for-bit identical with_check expressions. Keep the lowercase newer name.
-- Closes 1 of 2 advisor items: WARN multiple_permissive_policies on news_sources INSERT
-- Skipped: personality_internal_notes SELECT (recent migration; needs maintainer review)
-- Ref: docs/consolidation-2026-Q2-addendum-db-advisors.md
-- Already applied to prod via Supabase MCP on 2026-05-01.

DROP POLICY IF EXISTS "Admins can insert news sources" ON public.news_sources;
