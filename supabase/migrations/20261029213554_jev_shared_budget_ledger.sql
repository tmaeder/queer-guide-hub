-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261029213554 with no repo file — the signature of
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
-- Durable hard caps for Jev. No source payload, credentials, or model output is stored here.
create schema if not exists api_private;
create table api_private.jev_budget_accounts (
 account text primary key check (account ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'),
 cap_nano_usd bigint not null check(cap_nano_usd >= 0),
 period text not null check(period in ('lifetime','day')),
 enabled boolean not null default false
);
create table api_private.jev_budget_windows (
 account text not null references api_private.jev_budget_accounts(account),
 period_start date not null,
 charged_nano_usd bigint not null default 0 check(charged_nano_usd >= 0),
 reserved_nano_usd bigint not null default 0 check(reserved_nano_usd >= 0),
 primary key(account,period_start)
);
create table api_private.jev_budget_reservations (
 request_id uuid primary key,
 account text not null,
 period_start date not null,
 caller text not null check(caller ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 reserved_nano_usd bigint not null check(reserved_nano_usd = 2752512),
 charged_nano_usd bigint,
 input_tokens integer check(input_tokens between 0 and 65536),
 created_at timestamptz not null default now(),
 settled_at timestamptz,
 foreign key(account,period_start) references api_private.jev_budget_windows(account,period_start),
 check ((settled_at is null and charged_nano_usd is null) or
        (settled_at is not null and charged_nano_usd between 0 and reserved_nano_usd))
);
create index jev_budget_reservations_account on api_private.jev_budget_reservations(account,period_start);
alter table api_private.jev_budget_accounts enable row level security;
alter table api_private.jev_budget_windows enable row level security;
alter table api_private.jev_budget_reservations enable row level security;
revoke all on api_private.jev_budget_accounts,api_private.jev_budget_windows,api_private.jev_budget_reservations from public,anon,authenticated;

-- Approved by owner on 2026-10-29: $5 total experimentation, never a daily reset.
insert into api_private.jev_budget_accounts(account,cap_nano_usd,period,enabled)
values('validation-2026-10-29',5000000000,'lifetime',true);
-- Production accounts are provisioned explicitly after shadow/canary verification.

create function public.reserve_jev_budget(p_account text,p_request_id uuid,p_caller text,p_request_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a api_private.jev_budget_accounts;w api_private.jev_budget_windows;period_key date;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 if p_request_id is null or p_caller is null or p_caller !~ '^[a-z0-9][a-z0-9._:-]{0,79}$'
 or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid Jev reservation';end if;
 -- Account lock serializes cap checks, disabling and concurrent reservations.
 select * into a from api_private.jev_budget_accounts where account=p_account for update;
 if not found then raise exception 'Jev budget account is not configured';end if;
 if not a.enabled then return false;end if;
 if exists(select 1 from api_private.jev_budget_reservations where request_id=p_request_id) then
  -- A reservation authorizes exactly one attempt. Never replay an existing request ID.
  return false;end if;
 period_key:=case when a.period='day' then (now() at time zone 'UTC')::date else date '1970-01-01' end;
 insert into api_private.jev_budget_windows(account,period_start) values(p_account,period_key)on conflict do nothing;
 select * into w from api_private.jev_budget_windows where account=p_account and period_start=period_key for update;
 if w.charged_nano_usd+w.reserved_nano_usd+2752512 > a.cap_nano_usd then return false;end if;
 insert into api_private.jev_budget_reservations(request_id,account,period_start,caller,request_hash,reserved_nano_usd)
 values(p_request_id,p_account,period_key,p_caller,p_request_hash,2752512);
 update api_private.jev_budget_windows set reserved_nano_usd=reserved_nano_usd+2752512 where account=p_account and period_start=period_key;
 return true;
end $$;

create function public.settle_jev_budget(p_account text,p_request_id uuid,p_input_tokens integer default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare r api_private.jev_budget_reservations;charge bigint;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 if p_input_tokens is not null and (p_input_tokens<0 or p_input_tokens>65536)then raise exception 'Invalid Jev usage';end if;
 -- Same lock order as reserve, including at UTC rollover.
 perform 1 from api_private.jev_budget_accounts where account=p_account for update;
 select * into r from api_private.jev_budget_reservations where request_id=p_request_id and account=p_account for update;
 if not found then return false;end if;
 if r.settled_at is not null then
  if r.input_tokens is distinct from p_input_tokens then raise exception 'Jev settlement usage changed';end if;
  return true;
 end if;
 charge:=case when p_input_tokens is null then r.reserved_nano_usd else p_input_tokens::bigint*42 end;
 update api_private.jev_budget_windows set reserved_nano_usd=reserved_nano_usd-r.reserved_nano_usd,charged_nano_usd=charged_nano_usd+charge
 where account=r.account and period_start=r.period_start;
 update api_private.jev_budget_reservations set charged_nano_usd=charge,input_tokens=p_input_tokens,settled_at=now()where request_id=p_request_id;
 return true;
end $$;

create function public.get_jev_budget_status(p_account text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a api_private.jev_budget_accounts;w api_private.jev_budget_windows;period_key date;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 select * into a from api_private.jev_budget_accounts where account=p_account;
 if not found then return jsonb_build_object('configured',false);end if;
 period_key:=case when a.period='day' then (now()at time zone 'UTC')::date else date '1970-01-01'end;
 select * into w from api_private.jev_budget_windows where account=p_account and period_start=period_key;
 return jsonb_build_object('configured',true,'enabled',a.enabled,'period',a.period,'period_start',period_key,
 'cap_nano_usd',a.cap_nano_usd,'charged_nano_usd',coalesce(w.charged_nano_usd,0),'reserved_nano_usd',coalesce(w.reserved_nano_usd,0),
 'remaining_nano_usd',greatest(0,a.cap_nano_usd-coalesce(w.charged_nano_usd,0)-coalesce(w.reserved_nano_usd,0)));
end $$;

revoke all on function public.reserve_jev_budget(text,uuid,text,text),public.settle_jev_budget(text,uuid,integer),public.get_jev_budget_status(text)from public,anon,authenticated;
grant execute on function public.reserve_jev_budget(text,uuid,text,text),public.settle_jev_budget(text,uuid,integer),public.get_jev_budget_status(text)to service_role;
;
