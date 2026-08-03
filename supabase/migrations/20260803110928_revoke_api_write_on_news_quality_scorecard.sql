-- DRIFT REPAIR SHIM. Recovered verbatim from supabase_migrations.schema_migrations
-- (version 20260803110928, name revoke_api_write_on_news_quality_scorecard).
--
-- This SQL was applied to prod OUT OF BAND while #2555 was in flight, which stamped
-- 20260803110928 into remote history with no matching repo file. A remote-only version
-- makes `supabase db push` skip EVERYTHING silently, so nothing has applied since:
-- remote max(version) sat at 20260810130000 even after #2555 merged, meaning #2555's own
-- 20260810140000 never ran. (Its effect is nonetheless live on prod, because the revoke
-- below was what got applied by hand.) See CLAUDE.md, "Migrations": recover orphan SQL
-- into a file at its exact version -- never a blind `db pull`.
--
-- Committing it here restores the file<->history match so db push resumes. It is already
-- recorded as applied, so db push skips it by version and this body never re-executes;
-- it is kept byte-for-byte as applied so the repo is an honest record of prod. Its
-- reasoning is NOT corrected here for that reason -- but note the premise in the second
-- paragraph is wrong: CREATE OR REPLACE VIEW does not re-arm default privileges (it
-- keeps the relation's ACL and resets only reloptions, measured in 20260810160000). The
-- write set predates the replace; what the replace actually broke was security_invoker.

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
