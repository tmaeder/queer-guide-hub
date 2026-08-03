-- SECURITY: revoke the anon/authenticated write set that Supabase's stock
-- ALTER DEFAULT PRIVILEGES armed on public.news_quality_scorecard.
--
-- 20260810130000 recreated the view (adding the code_residue column) and a fresh
-- relation picks up `GRANT ALL ON TABLES TO anon, authenticated` from the schema's
-- default privileges. The view has no security_invoker, so it runs as its owner and
-- would bypass news_articles' RLS. It is a pure aggregate, so it is not
-- auto-updatable and the write set was never actually reachable -- but this is
-- exactly the shape scripts/check-definer-view-grants.mjs exists to reject (see
-- 20260806180000), and any later non-aggregate revision of the view would make it
-- live. Revoke unconditionally; REVOKE is idempotent.
--
-- anon never held SELECT here (the panel is admin-only) and does not gain it.

revoke insert, update, delete, truncate, references, trigger
  on public.news_quality_scorecard from anon, authenticated;

grant select on public.news_quality_scorecard to authenticated;
