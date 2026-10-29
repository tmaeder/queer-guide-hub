-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261029220732 with no repo file — the signature of
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
-- Immutable-input shadow checks. No source text, publication or review mutation.
create table api_private.jev_pipeline_checks (
 staging_id uuid not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 model text not null check(length(model) between 1 and 80),
 policy_version text not null check(length(policy_version) between 1 and 100),
 source_name text not null check(length(source_name) between 1 and 120),
 entity_type text not null check(entity_type in ('news_article','event','marketplace')),
 verdict text not null check(verdict in ('pending','supported','contradicted','uncertain','budget_deferred','error')),
 answers jsonb not null default '{}'::jsonb check(jsonb_typeof(answers)='object' and octet_length(answers::text)<=16384),
 input_tokens integer check(input_tokens between 0 and 65536),
 lease_token uuid not null,
 checked_at timestamptz,
 expires_at timestamptz not null,
 primary key(staging_id,input_hash,model,policy_version)
);
create index jev_pipeline_checks_expiry on api_private.jev_pipeline_checks(expires_at);
alter table api_private.jev_pipeline_checks enable row level security;
revoke all on api_private.jev_pipeline_checks from public,anon,authenticated;

create function public.claim_jev_pipeline_check(p_staging_id uuid,p_input_hash text,p_model text,p_policy_version text,p_lease_token uuid,p_source_name text,p_entity_type text)
returns boolean language plpgsql security definer set search_path='' as $$
declare claimed boolean;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 insert into api_private.jev_pipeline_checks(staging_id,input_hash,model,policy_version,source_name,entity_type,verdict,lease_token,expires_at)
 values(p_staging_id,p_input_hash,p_model,p_policy_version,p_source_name,p_entity_type,'pending',p_lease_token,now()+interval '5 minutes')
 on conflict(staging_id,input_hash,model,policy_version) do update set
  verdict='pending',answers='{}'::jsonb,input_tokens=null,checked_at=null,
  lease_token=excluded.lease_token,expires_at=excluded.expires_at
 where api_private.jev_pipeline_checks.expires_at<=now()
 returning true into claimed;
 return coalesce(claimed,false);
end $$;

create function public.finish_jev_pipeline_check(p_staging_id uuid,p_input_hash text,p_model text,p_policy_version text,p_lease_token uuid,p_verdict text,p_answers jsonb,p_input_tokens integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed boolean;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 if p_verdict is null or p_verdict not in ('supported','contradicted','uncertain','budget_deferred','error') then raise exception 'Invalid shadow verdict';end if;
 if p_answers is null or (p_verdict in ('supported','contradicted','uncertain') and (p_input_tokens is null or p_answers='{}'::jsonb)) then raise exception 'Missing shadow judgments';end if;
 update api_private.jev_pipeline_checks set verdict=p_verdict,answers=p_answers,input_tokens=p_input_tokens,checked_at=now(),
  expires_at=now()+case when p_verdict in ('budget_deferred','error') then interval '1 hour' else interval '24 hours' end
 where staging_id=p_staging_id and input_hash=p_input_hash and model=p_model and policy_version=p_policy_version
  and lease_token=p_lease_token and verdict='pending'
 returning true into changed;
 return coalesce(changed,false);
end $$;
revoke all on function public.claim_jev_pipeline_check(uuid,text,text,text,uuid,text,text),public.finish_jev_pipeline_check(uuid,text,text,text,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.claim_jev_pipeline_check(uuid,text,text,text,uuid,text,text),public.finish_jev_pipeline_check(uuid,text,text,text,uuid,text,jsonb,integer) to service_role;
;
