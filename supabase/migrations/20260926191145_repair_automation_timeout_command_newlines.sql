-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926191145 with no repo file — the signature of
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
;
