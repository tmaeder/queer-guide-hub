-- The 2 new per-item commit RPCs (added in 20260501040000 / 20260501040100)
-- defaulted to PUBLIC EXECUTE per Postgres default function ACL. Lock
-- down: only authenticated callers (the review API runs with auth context).
-- Already applied to prod via Supabase MCP on 2026-05-01.

REVOKE EXECUTE ON FUNCTION public.commit_marketplace_staging_item(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_news_staging_item(uuid, text) FROM PUBLIC;
