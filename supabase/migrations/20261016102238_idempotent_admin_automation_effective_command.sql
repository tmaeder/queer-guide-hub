-- A registry command can already contain its run-tracking wrapper. Re-syncing
-- it must not prepend a second run_begin call to the pg_cron command.
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
  v_prefix text;
  v_tracked boolean := false;
  v_expected_requests integer := 0;
begin
  if p_command is null or btrim(p_command) = '' then
    return null;
  end if;

  v_cmd := btrim(p_command);
  v_prefix := 'SELECT public.admin_automation_run_begin('
    || quote_literal(p_slug) || ', ';

  if left(v_cmd, length(v_prefix)) = v_prefix
     and substring(v_cmd from length(v_prefix) + 1) ~ '^[1-9][0-9]*\);[[:space:]]+' then
    return p_command;
  end if;
  if lower(left(v_cmd, length('SELECT public.admin_automation_run_begin(')))
       = lower('SELECT public.admin_automation_run_begin(') then
    raise exception 'admin automation command has an unexpected run-begin wrapper for %', p_slug;
  end if;

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

do $$
declare
  v_command text;
begin
  select action->>'command' into v_command
    from public.admin_automations where slug = 'geo_address_drain';
  if v_command is null
     or public.admin_automation_effective_command('geo_address_drain', v_command)
        is distinct from v_command then
    raise exception 'postal drain command acquired another run-begin wrapper';
  end if;

  if public.admin_automation_effective_command(
       'zz_probe',
       'select net.http_post(url := ''https://example.test/a'');'
     ) not like 'SELECT public.admin_automation_run_begin(''zz_probe'', 1);%' then
    raise exception 'unwrapped HTTP command lost run tracking';
  end if;
end;
$$;
