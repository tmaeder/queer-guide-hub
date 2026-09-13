-- P7: two audit tables were anon-readable with RLS disabled (Supabase advisor: rls_disabled_in_public, ERROR).
-- Neither has any reader in src/, workers/, supabase/functions/, functions/ or scripts/ (grepped 2026-09-10);
-- the only repo reference is the generated types.ts entry. service_role bypasses RLS, so the
-- backfills/audits that WRITE these tables are unaffected. Enabling RLS with no policy is the
-- intended end state for an audit table: deny to anon/authenticated, full access to service_role.

alter table public.geo_city_relink_audit enable row level security;
alter table public.news_tag_vocab_dump_audit_20261007 enable row level security;

-- Belt and braces: RLS alone still leaves the tables visible in the pg_graphql schema
-- (advisor: pg_graphql_anon_table_exposed). Revoke so they leave the exposed API surface entirely.
revoke all on public.geo_city_relink_audit from anon, authenticated;
revoke all on public.news_tag_vocab_dump_audit_20261007 from anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('geo_city_relink_audit','news_tag_vocab_dump_audit_20261007')
      and not c.relrowsecurity
  ) then
    raise exception 'RLS still disabled on an audit table after migration';
  end if;
end $$;
