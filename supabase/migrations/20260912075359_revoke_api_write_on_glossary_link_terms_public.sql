-- SECURITY: revoke anon/authenticated write privileges on glossary_link_terms_public.
--
-- Same trap as 20260806180000, one view later. Supabase stock
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated` hands INSERT/UPDATE/DELETE/TRUNCATE to both API roles on every
-- NEW relation, views included. A view without `security_invoker` runs as its
-- owner (postgres) and so bypasses the base table's RLS entirely.
--
-- 20600101100000 creates this view and grants SELECT only -- that migration is
-- CORRECT. An explicit `grant select` is ADDITIVE; it does not remove what the
-- default privileges already handed out. Measured on prod before this migration:
--   anon           DELETE,INSERT,SELECT,UPDATE
--   authenticated  DELETE,INSERT,SELECT,UPDATE
-- which is what `scripts/check-definer-view-grants.mjs` (a required CI gate,
-- reading LIVE prod) fails on -- so it went red on every open PR in the repo,
-- not only the branch that introduced the view.
--
-- NOT CURRENTLY EXPLOITABLE, AND THAT IS WORTH STATING RATHER THAN IMPLYING.
-- The view is a JOIN of glossary_link_terms and unified_tags, carries no INSTEAD
-- OF trigger, and Postgres reports is_updatable = NO / is_insertable_into = NO,
-- so every write through it is rejected regardless of the grant. This is defence
-- in depth against the day someone narrows the view to one table or adds an
-- INSTEAD OF trigger, at which point the grant would silently become a live
-- RLS-bypassing write path. Revoking now costs nothing: every reader in the tree
-- (functions/_lib/glossaryVocabulary.ts, src/hooks/useGlossaryLinkVocabulary.ts)
-- only SELECTs, and REVOKE is idempotent.
--
-- The base table keeps its grants on purpose: glossary_link_terms has RLS
-- enabled and 20600101100000 deliberately grants authenticated the write set so
-- RLS can gate it. Only the RLS-bypassing view is narrowed here.
--
-- APPLIED VIA MCP apply_migration BEFORE THIS FILE EXISTED, hence the version
-- number sitting far below the current ceiling (20600101100100). That is the
-- documented recovery shape: the version here matches the one the tool stamped,
-- so `db push` matches it against history and skips, and
-- check-migration-versions.mjs exempts it from the sorts-above-remote-max rule
-- because it is already in schema_migrations. It had to reach prod first because
-- the gate it fixes reads prod, so the fix could not land through the PR the gate
-- was blocking.

revoke insert, update, delete, truncate
  on public.glossary_link_terms_public
  from anon, authenticated;

-- Postcondition, not a precondition: this migration exists to reach a state, so
-- it asserts the state it reached rather than the state it expected to find.
do $$
declare
  v_bad text;
begin
  select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
    into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'glossary_link_terms_public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_bad is not null then
    raise exception 'glossary_link_terms_public still writable by an API role: %', v_bad;
  end if;

  -- Positive control: "no write grants" is also true of a view that does not
  -- exist, or one anon cannot read at all. Prove SELECT survived.
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'glossary_link_terms_public'
      and grantee = 'anon'
      and privilege_type = 'SELECT'
  ) then
    raise exception 'anon lost SELECT on glossary_link_terms_public -- the public glossary vocabulary would 401';
  end if;
end $$;
