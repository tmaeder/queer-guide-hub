-- The timeout rewrite used an escaped replacement newline, leaving the two
-- literal characters `\n` in affected registry commands. Convert only those
-- escape sequences back to whitespace and immediately re-render cron.
update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb(replace(action->>'command', E'\\n', E'\n')),
      true
    ),
    updated_at = now()
where position(E'\\n' in coalesce(action->>'command', '')) > 0;

select public.sync_automations_to_cron(true);

do $$
begin
  if exists (
    select 1 from public.admin_automations
    where position(E'\\n' in coalesce(action->>'command', '')) > 0
  ) then
    raise exception 'literal newline escape remains in an automation command';
  end if;
end
$$;
