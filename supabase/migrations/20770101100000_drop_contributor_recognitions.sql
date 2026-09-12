-- Drop the contributor-recognition feature.
--
-- Shipped 2026-05-14 (20260514164400) as an annual "recognition wall": an admin
-- curation page at /admin/recognition, a public wall at /contributors/:year, a
-- privacy opt-in on the profile, and a postal-address form for mailing a zine to
-- the people named. Measured on prod before writing this migration:
--
--   contributor_recognitions        0 rows   (nothing was ever curated)
--   contributor_mailing_addresses   0 rows   (no address was ever collected)
--   profiles with appear_in_recognition true 0
--
-- So the public wall has rendered "No recognitions published for <year> yet."
-- every day of its life and the mailing form was never reachable. Nothing
-- schedules refresh_contribution_metrics_yearly() — no cron.job, no
-- admin_automations row — so the matview only ever refreshed when an admin
-- pressed the button on the page being deleted.
--
-- contributor_mailing_addresses is the reason this aborts rather than cascades:
-- it holds postal addresses of queer contributors. An empty table is safe to
-- drop; a populated one is not, and no later migration can undo it.
--
-- Frontend removed in the same change (routes, admin nav, footer link, hooks,
-- the profile privacy toggle). contributor_recognitions_public is one of the
-- five security_invoker views over public.profiles, so its registry row goes
-- too — security_invoker_view_regressions() ignores a dropped view, but a stale
-- registry row is noise the next reader has to disprove.

-- 1. Refuse to destroy data ---------------------------------------------------
do $$
declare
  n_recognitions bigint := 0;
  n_addresses    bigint := 0;
begin
  if to_regclass('public.contributor_recognitions') is not null then
    execute 'select count(*) from public.contributor_recognitions' into n_recognitions;
  end if;
  if to_regclass('public.contributor_mailing_addresses') is not null then
    execute 'select count(*) from public.contributor_mailing_addresses' into n_addresses;
  end if;

  if n_recognitions > 0 or n_addresses > 0 then
    raise exception
      'ABORT: contributor recognition data exists (recognitions=%, mailing addresses=%). '
      'This migration was written against an empty feature. Export or delete the rows '
      'deliberately before dropping the tables.', n_recognitions, n_addresses;
  end if;
end $$;

-- 2. Drop, dependents first ---------------------------------------------------
drop view if exists public.contributor_recognitions_public;
drop materialized view if exists public.contribution_metrics_yearly;

drop function if exists public.contribution_metrics_for_year(integer);
drop function if exists public.refresh_contribution_metrics_yearly();

drop table if exists public.contributor_recognitions;
drop table if exists public.contributor_mailing_addresses;

-- Only ever fired the two updated_at triggers on the tables above (verified on
-- prod against pg_trigger before writing this).
drop function if exists public.contributor_recognitions_set_updated_at();

delete from public.security_invoker_required_views
 where view_name = 'contributor_recognitions_public';

-- 3. The profile opt-in it gated ----------------------------------------------
update public.profiles
   set privacy_settings = privacy_settings - 'appear_in_recognition'
 where privacy_settings ? 'appear_in_recognition';

-- 4. Postconditions -----------------------------------------------------------
do $$
declare leftovers text;
begin
  select string_agg(o, ', ') into leftovers from (
    select 'view contributor_recognitions_public' o
      where to_regclass('public.contributor_recognitions_public') is not null
    union all
    select 'matview contribution_metrics_yearly'
      where to_regclass('public.contribution_metrics_yearly') is not null
    union all
    select 'table contributor_recognitions'
      where to_regclass('public.contributor_recognitions') is not null
    union all
    select 'table contributor_mailing_addresses'
      where to_regclass('public.contributor_mailing_addresses') is not null
    union all
    select 'function ' || p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('contribution_metrics_for_year',
                         'refresh_contribution_metrics_yearly',
                         'contributor_recognitions_set_updated_at')
    union all
    select 'registry row contributor_recognitions_public'
      from public.security_invoker_required_views
     where view_name = 'contributor_recognitions_public'
    union all
    select 'profiles.privacy_settings.appear_in_recognition x' || count(*)::text
      from public.profiles where privacy_settings ? 'appear_in_recognition'
     having count(*) > 0
  ) s;

  if leftovers is not null then
    raise exception 'FAIL: contributor recognition objects survived the drop: %', leftovers;
  end if;
  raise notice 'PASS: contributor recognition feature fully removed';
end $$;
