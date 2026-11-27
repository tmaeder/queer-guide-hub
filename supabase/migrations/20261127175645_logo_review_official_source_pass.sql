-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127175645 with no repo file — the signature of
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
-- Owner approved up to US$1 total for public-source/logo verification on 2026-11-27.
insert into api_private.jev_budget_accounts(account,cap_nano_usd,period,enabled)
values('logo-review-2026-11-27',1000000000,'lifetime',true) on conflict do nothing;

create table api_private.logo_review_sessions (
 token_sha256 text primary key check(token_sha256 ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
alter table api_private.logo_review_sessions enable row level security;
revoke all on api_private.logo_review_sessions from public,anon,authenticated;
create function public.logo_review_session_check(p_hash text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from api_private.logo_review_sessions where token_sha256=p_hash and enabled and expires_at>now());
$$;
revoke all on function public.logo_review_session_check(text) from public,anon,authenticated;
grant execute on function public.logo_review_session_check(text) to service_role;

create function public.logo_review_source_jobs(p_offset integer default 0,p_limit integer default 500)
returns table(entity_table text,entity_id uuid,entity_name text,expected_url text,expected_website text,candidate_url text,
 source_url text,source text,locality text,brand_source text,discovered_website text,reason text)
language sql stable security invoker set search_path='' as $$
 select j.entity_table,j.entity_id,j.entity_name,j.expected_url,j.expected_website,j.candidate_url,
   j.evidence->>'source_url',j.evidence->>'source',coalesce(v.city,e.city,c.name,''),b.logo_source,
   j.evidence->>'discovered_website',j.reason
 from public.logo_quality_jobs j
 left join public.venues v on j.entity_table='venues' and v.id=j.entity_id
 left join public.events e on j.entity_table='events' and e.id=j.entity_id
 left join public.organizations o on j.entity_table='organizations' and o.id=j.entity_id
 left join public.marketplace_brands b on j.entity_table='marketplace_brands' and b.id=j.entity_id
 left join public.cities c on c.id=o.city_id
 where j.status in ('review','quarantined')
 order by j.entity_table,j.entity_id offset greatest(0,p_offset) limit greatest(1,least(p_limit,500));
$$;
revoke all on function public.logo_review_source_jobs(integer,integer) from public,anon,authenticated;
grant execute on function public.logo_review_source_jobs(integer,integer) to service_role;

-- A human decision made during research must win over an older batch result.
create function public.logo_review_finish(p_table text,p_id uuid,p_lease uuid,p_url text,p_reason text,p_evidence jsonb,p_on_ink boolean default false)
returns text language plpgsql security invoker set search_path='' as $$
declare et text; case_id uuid;
begin
 et:=case p_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' when 'marketplace_brands' then 'marketplace_brand' else null end;
 if et is null then raise exception 'invalid review entity'; end if;
 select id into case_id from public.review_queue where entity_type=et and entity_id=p_id and review_type='logo_quality'
   and status in ('pending','open','pending_review','review') limit 1 for update;
 if not found then
   update public.logo_quality_jobs set status='superseded',reason='review_already_decided',updated_at=now()
    where entity_table=p_table and entity_id=p_id and lease=p_lease and status='processing';
   return 'review_already_decided';
 end if;
 return public.logo_quality_finish(p_table,p_id,p_lease,'repaired',p_url,p_reason,p_evidence,p_on_ink);
end $$;
revoke all on function public.logo_review_finish(text,uuid,uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.logo_review_finish(text,uuid,uuid,text,text,jsonb,boolean) to service_role;
;
