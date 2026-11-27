-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127192033 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Retain a researched official website for the next periodic check when the profile has no website.
create or replace function public.logo_quality_refresh() returns integer language plpgsql
security invoker set search_path='' as $$
declare changed integer;
begin
 with sources as (
   select 'venues'::text entity_table,id,name,logo_url,website from public.venues where logo_url is not null and duplicate_of_id is null
   union all select 'events',id,title,logo_url,website from public.events where logo_url is not null and duplicate_of_id is null
   union all select 'organizations',id,name,logo_url,website from public.organizations where logo_url is not null
   union all select 'marketplace_brands',id,display_name,logo_url,website from public.marketplace_brands where logo_url is not null
 ) update public.logo_quality_jobs j set status='pending',attempts=0,lease=null,checked_at=null,updated_at=now(),
     entity_name=s.name,expected_url=s.logo_url,expected_website=s.website,evidence=case when s.website is null and j.evidence->>'discovered_website' ~ '^https?://'
       then jsonb_build_object('discovered_website',j.evidence->>'discovered_website') else '{}'::jsonb end,candidate_url=null
 from sources s where j.entity_table=s.entity_table and j.entity_id=s.id
   and j.status in ('repaired','verified') and j.checked_at<now()-interval '90 days';
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function public.logo_quality_refresh() from public,anon,authenticated;
grant execute on function public.logo_quality_refresh() to service_role;

;
