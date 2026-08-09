-- Contract test: `anon` must not hold EXECUTE on admin/cron RPCs.
-- Run via: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f anon_admin_rpc_grants.sql
-- (after 20260822100000_revoke_anon_on_admin_rpcs.sql has been applied).
--
-- This exists because the hole regrows on its own. Supabase's
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon`
-- arms every newly created function, so the next `run_*` sweep somebody adds is
-- anon-callable the moment it is created, with nothing in the diff to notice.
-- 20260822100000 revoked 97; this keeps the count at zero.
--
-- The pattern below is intentionally the same one the migration used to select
-- what to revoke. If you add an admin/cron function whose name matches it, you
-- must revoke `anon` in the same migration -- that is the whole contract.
--
-- Deliberately NOT asserted here: that `authenticated` cannot call them.
-- 45 of the 97 have no internal authorization check, so any signed-in user can
-- still invoke them; closing that needs `perform assert_admin_or_internal();`
-- inside each body and is tracked separately. Asserting it now would fail on
-- day one and train people to ignore this file.

begin;

do $$
declare
  offenders text[];
begin
  select coalesce(array_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) order by p.proname), '{}')
    into offenders
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f'
    and p.provolatile = 'v'                      -- write-capable only
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and (
      p.proname ~ '^(run_|admin_|sync_geo_spine|rebuild_|recompute_|backfill_|seed_|purge_|prune_|collapse_|relink_|reset_|archive_city|unarchive_city|merge_tag|merge_vocab|unmerge_|approve_dedup|claim_dm|cluster_news|guide_picks|ingest_firecrawl|dlq_claim|commit_)'
      or p.proname ~ '(_sweep|_recompute|_backfill|_automerge|_maintain)$'
    );

  if array_length(offenders, 1) > 0 then
    raise exception
      E'anon holds EXECUTE on % admin/cron function(s):\n  %\n\nAdd `revoke execute on function public.<name>(<args>) from anon;` to your migration. Supabase''s default privileges grant it automatically on creation.',
      array_length(offenders, 1), array_to_string(offenders, E'\n  ');
  end if;
end $$;

-- Positive control: the guard must be able to see a violation at all. Grant a
-- matching function back to anon inside this transaction and assert the same
-- query catches it, then roll the whole thing back. Without this, a query that
-- silently matched nothing would "pass" forever.
do $$
declare
  n int;
begin
  grant execute on function public.run_presence_purge() to anon;

  select count(*) into n
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f' and p.provolatile = 'v'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname ~ '^run_';

  if n = 0 then
    raise exception 'negative control failed: re-granting run_presence_purge to anon was not detected, so this test proves nothing';
  end if;
end $$;

-- `authenticated` must not hold EXECUTE on the unguarded cron RPCs either
-- (20260823100000). Same population, one role over. Nothing in src/ calls these
-- — they are pg_cron and service-key only — so a grant here means a signed-in
-- member can run a sweep.
--
-- TRIGGER functions are excluded on purpose and the exclusion is load-bearing:
-- sync_geo_spine_* and admin_automations_touch_updated_at match the admin-shaped
-- name pattern but have live triggers attached, so revoking `authenticated`
-- would break ordinary user writes (editing a city fires the geo-spine mirror).
do $$
declare
  offenders text[];
begin
  select coalesce(array_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) order by p.proname), '{}')
    into offenders
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f'
    and p.provolatile = 'v'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.prorettype <> 'trigger'::regtype
    and (select count(*) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) = 0
    and (
      p.proname ~ '^(run_|admin_|rebuild_|backfill_|seed_|purge_|prune_|collapse_|relink_|reset_|archive_city|unarchive_city|merge_tag|merge_vocab|unmerge_|approve_dedup|claim_dm|cluster_news|guide_picks|dlq_claim|commit_)'
      or p.proname ~ '(_sweep|_recompute|_backfill|_automerge|_maintain)$'
    )
    -- Guarded functions legitimately keep `authenticated`: the admin console
    -- calls them and assert_admin_or_internal() sorts admin from member.
    and pg_get_functiondef(p.oid) !~* '(assert_admin_or_internal|is_admin|has_role|auth\.uid|jwt|current_setting|p_secret)';

  if array_length(offenders, 1) > 0 then
    raise exception
      E'authenticated holds EXECUTE on % UNGUARDED admin/cron function(s):\n  %\n\nEither add `perform assert_admin_or_internal();` to the body (if the admin console needs it) or `revoke execute ... from authenticated;` (if it is cron/service-role only).',
      array_length(offenders, 1), array_to_string(offenders, E'\n  ');
  end if;
end $$;

-- Positive control for the trigger exclusion. If a future edit drops the
-- `prorettype <> 'trigger'` filter, sync_geo_spine_city would be reported as an
-- offender and someone would "fix" it by revoking — breaking every city write by
-- a normal user. Assert the exclusion still holds.
do $$
begin
  if not has_function_privilege('authenticated', 'public.sync_geo_spine_city()', 'EXECUTE') then
    raise exception 'sync_geo_spine_city is a TRIGGER function and must keep EXECUTE for authenticated — revoking it breaks ordinary writes to cities';
  end if;
end $$;

rollback;
