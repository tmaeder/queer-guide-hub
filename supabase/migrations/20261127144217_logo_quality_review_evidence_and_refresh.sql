-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127144217 with no repo file — the signature of
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
-- Keep the human-facing case synchronized with the researched candidate. A
-- write guard may have opened the case before candidate discovery finished.
create or replace function public.logo_quality_close_verified_review() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if new.status in ('verified','repaired') then
   update public.review_queue set status='resolved',resolved_at=now(),details=coalesce(details,'{}')||
     jsonb_build_object('resolution','verified_official_logo','replacement_url',new.candidate_url,'evidence',new.evidence)
   where entity_id=new.entity_id and entity_type=case new.entity_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end
     and review_type='logo_quality' and status in ('pending','open','pending_review','review');
 elsif new.status in ('review','quarantined') then
   update public.review_queue set details=coalesce(details,'{}')||jsonb_build_object(
     'candidate_url',new.candidate_url,'reason',new.reason,'evidence',new.evidence,'requires_human_review',true)
   where entity_id=new.entity_id and entity_type=case new.entity_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end
     and review_type='logo_quality' and status in ('pending','open','pending_review','review');
 end if;
 return new;
end $$;
revoke all on function public.logo_quality_close_verified_review() from public,anon,authenticated;

-- Bring cases opened during the first repair batches up to the same format.
update public.review_queue r set details=coalesce(r.details,'{}')||jsonb_build_object(
 'candidate_url',j.candidate_url,'reason',j.reason,'evidence',j.evidence,'requires_human_review',true)
from public.logo_quality_jobs j where j.entity_id=r.entity_id and r.review_type='logo_quality'
 and r.entity_type=case j.entity_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end
 and r.status in ('pending','open','pending_review','review') and j.status in ('review','quarantined');

-- Recheck previously verified assets every 90 days, rather than assuming a URL
-- remains correct forever. Human-review cases stay open until someone decides.
create function public.logo_quality_refresh() returns integer language plpgsql
security invoker set search_path='' as $$
declare changed integer;
begin
 with sources as (
   select 'venues'::text entity_table,id,name,logo_url,website from public.venues where logo_url is not null and duplicate_of_id is null
   union all select 'events',id,title,logo_url,website from public.events where logo_url is not null and duplicate_of_id is null
   union all select 'organizations',id,name,logo_url,website from public.organizations where logo_url is not null
   union all select 'marketplace_brands',id,display_name,logo_url,website from public.marketplace_brands where logo_url is not null
 ) update public.logo_quality_jobs j set status='pending',attempts=0,lease=null,checked_at=null,updated_at=now(),
     entity_name=s.name,expected_url=s.logo_url,expected_website=s.website,evidence='{}',candidate_url=null
 from sources s where j.entity_table=s.entity_table and j.entity_id=s.id
   and j.status in ('repaired','verified') and j.checked_at<now()-interval '90 days';
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function public.logo_quality_refresh() from public,anon,authenticated;
grant execute on function public.logo_quality_refresh() to service_role;

create function public.logo_quality_name_changed() returns trigger language plpgsql
security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); prior jsonb:=to_jsonb(old); n text; old_name text;
begin
 n:=coalesce(j->>'name',j->>'title',j->>'display_name','');
 old_name:=coalesce(prior->>'name',prior->>'title',prior->>'display_name','');
 if n is not distinct from old_name or (new.logo_url is null and new.website is null) then return new; end if;
 insert into public.logo_quality_jobs(entity_table,entity_id,entity_name,expected_url,expected_website)
 values(tg_table_name,new.id,n,new.logo_url,new.website)
 on conflict(entity_table,entity_id) do update set entity_name=excluded.entity_name,
 expected_url=excluded.expected_url,expected_website=excluded.expected_website,status='pending',
 attempts=0,lease=null,checked_at=null,updated_at=now(),candidate_url=null,evidence='{}';
 return new;
end $$;
revoke all on function public.logo_quality_name_changed() from public,anon,authenticated;
create trigger logo_quality_name_changed after update of name on public.venues for each row execute function public.logo_quality_name_changed();
create trigger logo_quality_name_changed after update of title on public.events for each row execute function public.logo_quality_name_changed();
create trigger logo_quality_name_changed after update of name on public.organizations for each row execute function public.logo_quality_name_changed();
create trigger logo_quality_name_changed after update of display_name on public.marketplace_brands for each row execute function public.logo_quality_name_changed();
select cron.schedule('logo-quality-refresh','17 2 * * 0','select public.logo_quality_refresh();');
select cron.schedule('logo-quality-repair','*/5 * * * *', $cron$
 select net.http_post(
   url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/logo-quality-repair',
   headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',
     (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
   body:='{"table":"all","batch_size":4}'::jsonb,timeout_milliseconds:=250000);
$cron$);
;
