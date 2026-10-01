-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926170046 with no repo file — the signature of
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
-- pg_cron executes a multi-statement command with a commit boundary between
-- statements. A transaction-local GUC set by admin_automation_run_begin()
-- therefore vanishes before automation_http_post() runs. Persist the tiny
-- dispatch context by backend pid and consume it after the command's known
-- number of HTTP calls.

create table if not exists private.admin_automation_run_contexts (
  backend_pid integer primary key,
  run_id bigint not null references public.admin_automation_runs(id) on delete cascade,
  remaining_requests integer not null check (remaining_requests > 0),
  created_at timestamptz not null default now()
);

revoke all on private.admin_automation_run_contexts from public, anon, authenticated;
grant all on private.admin_automation_run_contexts to service_role;

create or replace function public.admin_automation_run_begin(
  p_slug text,
  p_expected_requests integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_automation_id uuid;
  v_run_id bigint;
begin
  select id into v_automation_id
  from public.admin_automations
  where slug = p_slug;

  if v_automation_id is null then
    return null;
  end if;

  insert into public.admin_automation_runs (
    automation_id, automation_slug, status, started_at
  ) values (
    v_automation_id, p_slug, 'running', now()
  ) returning id into v_run_id;

  delete from private.admin_automation_run_contexts
  where created_at < now() - interval '15 minutes';

  insert into private.admin_automation_run_contexts (
    backend_pid, run_id, remaining_requests, created_at
  ) values (
    pg_backend_pid(), v_run_id, greatest(coalesce(p_expected_requests, 1), 1), now()
  )
  on conflict (backend_pid) do update
  set run_id = excluded.run_id,
      remaining_requests = excluded.remaining_requests,
      created_at = excluded.created_at;

  return v_run_id;
end;
$$;

create or replace function public.admin_automation_run_begin(p_slug text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.admin_automation_run_begin(p_slug, 1)
$$;

alter function public.admin_automation_run_begin(text, integer) owner to postgres;
alter function public.admin_automation_run_begin(text) owner to postgres;
revoke all on function public.admin_automation_run_begin(text, integer)
  from public, anon, authenticated;
revoke all on function public.admin_automation_run_begin(text)
  from public, anon, authenticated;
grant execute on function public.admin_automation_run_begin(text, integer) to service_role;
grant execute on function public.admin_automation_run_begin(text) to service_role;

create or replace function public.automation_http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint;
  v_context private.admin_automation_run_contexts%rowtype;
  v_headers jsonb;
begin
  select * into v_context
  from private.admin_automation_run_contexts c
  where c.backend_pid = pg_backend_pid()
    and c.created_at >= now() - interval '15 minutes'
    and exists (
      select 1 from public.admin_automation_runs r
      where r.id = c.run_id and r.status = 'running' and r.finished_at is null
    )
  for update;

  v_headers := coalesce(headers, '{}'::jsonb)
    || case when v_context.run_id is null then '{}'::jsonb
            else jsonb_build_object('X-Automation-Run-Id', v_context.run_id::text) end;

  v_request_id := net.http_post(
    url := url,
    body := body,
    params := params,
    headers := v_headers,
    timeout_milliseconds := timeout_milliseconds
  );

  if v_context.run_id is not null then
    insert into public.admin_automation_run_requests (request_id, run_id, url, timeout_ms)
    values (
      v_request_id, v_context.run_id, url, coalesce(timeout_milliseconds, 5000)
    )
    on conflict (request_id) do nothing;

    if v_context.remaining_requests <= 1 then
      delete from private.admin_automation_run_contexts
      where backend_pid = v_context.backend_pid and run_id = v_context.run_id;
    else
      update private.admin_automation_run_contexts
      set remaining_requests = remaining_requests - 1
      where backend_pid = v_context.backend_pid and run_id = v_context.run_id;
    end if;
  end if;

  return v_request_id;
end;
$$;

alter function public.automation_http_post(text, jsonb, jsonb, jsonb, integer) owner to postgres;
revoke all on function public.automation_http_post(text, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.automation_http_post(text, jsonb, jsonb, jsonb, integer)
  to service_role;

create or replace function public.admin_automation_effective_command(
  p_slug text,
  p_command text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cmd text;
  v_tracked boolean := false;
  v_expected_requests integer := 0;
begin
  if p_command is null or btrim(p_command) = '' then
    return null;
  end if;

  v_cmd := btrim(p_command);

  if v_cmd ilike '%net.http_post%' then
    v_cmd := regexp_replace(v_cmd, '\mnet\.http_post\M', 'public.automation_http_post', 'gi');
    v_tracked := true;
    v_expected_requests := (
      length(lower(v_cmd))
      - length(replace(lower(v_cmd), 'public.automation_http_post', ''))
    ) / length('public.automation_http_post');
  end if;

  if not v_tracked then
    select exists (
      select 1 from public.admin_automation_tracked_callers c
      where v_cmd ~* ('\m' || c.fn_name || '\s*\(')
    ) into v_tracked;
    if v_tracked then
      v_expected_requests := 1;
    end if;
  end if;

  if not v_tracked then
    return p_command;
  end if;

  if right(btrim(v_cmd), 1) <> ';' then
    v_cmd := v_cmd || ';';
  end if;

  return 'SELECT public.admin_automation_run_begin('
    || quote_literal(p_slug) || ', ' || greatest(v_expected_requests, 1) || '); '
    || v_cmd;
end;
$$;

revoke all on function public.admin_automation_effective_command(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_automation_effective_command(text, text)
  to service_role;

-- Re-render every tracked command immediately so pg_cron uses the two-argument
-- run_begin form without waiting for the nightly reconciler.
select public.sync_automations_to_cron(true);

do $$
declare
  v text;
begin
  v := public.admin_automation_effective_command(
    'zz_probe',
    'select net.http_post(url := ''https://example.test/a''), net.http_post(url := ''https://example.test/b'');'
  );
  if v not like 'SELECT public.admin_automation_run_begin(''zz_probe'', 2);%' then
    raise exception 'expected two-request dispatch context, got %', v;
  end if;
end
$$;
;
