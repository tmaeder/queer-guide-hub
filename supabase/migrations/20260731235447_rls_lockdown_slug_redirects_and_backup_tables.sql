-- Lock down the 10 public tables that ship with RLS disabled AND anon/authenticated
-- write grants. Confirmed exploitable on prod against the public anon key:
--   DELETE /rest/v1/news_slug_redirects            -> 204 (anon can wipe redirects)
--   POST   /rest/v1/country_slug_redirects         -> 23502, i.e. the privilege check
--                                                     PASSED and only NOT NULL stopped it
-- Forging a slug redirect silently repoints a legitimate public URL, so this is a
-- URL-hijack vector, not just a lint warning.
--
-- Two shapes:
--   * the 6 *_slug_redirects tables stay anon-READABLE (slug resolution runs as anon)
--     -> enable RLS + a public read policy, revoke every write privilege.
--   * the 4 backup/audit snapshots are operator-only and have no app reader at all
--     (grep of src/ supabase/functions/ workers/ scripts/ finds only generated types)
--     -> enable RLS with NO policy and revoke everything; service_role bypasses RLS.
--
-- Writers are unaffected: the merge cores that populate the redirect tables are
-- SECURITY DEFINER and run as the table owner.

-- 1. Slug redirects: public read, no public write.
do $$
declare t text;
begin
  foreach t in array array[
    'news_slug_redirects',
    'country_slug_redirects',
    'village_slug_redirects',
    'milestone_slug_redirects',
    'org_slug_redirects',
    'hotel_slug_redirects'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format(
      'create policy %I on public.%I for select using (true)',
      t || '_public_read', t
    );
  end loop;
end $$;

-- 2. Operator-only snapshots: no public access at all.
do $$
declare t text;
begin
  foreach t in array array[
    'person_gate_demoted_20260721',
    'milestones_backup_20260721',
    'needs_attention_hidden_20260716',
    'silo_fold_audit'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

comment on table public.person_gate_demoted_20260721 is
  'Rollback snapshot for the 20260721 personality public gate. Operator-only: RLS on with no policy, no anon/authenticated grants — the row set names demoted people and is outing-adjacent.';
