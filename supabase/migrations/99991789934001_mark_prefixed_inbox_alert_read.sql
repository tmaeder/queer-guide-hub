-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991789934001 with no repo file — the signature of
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
-- Inbox feed ids are namespaced text values (`notif_<uuid>` and
-- `group_<uuid>`), not bare UUIDs. Accept the public feed contract here and
-- unwrap only the two durable alert kinds that have per-item read state.

drop function if exists public.mark_inbox_alert_read(uuid);

create or replace function public.mark_inbox_alert_read(p_item text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_item like 'notif\_%' escape '\' then
    begin
      v_id := substring(p_item from 7)::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid inbox notification id' using errcode = '22023';
    end;

    update public.notifications
       set read = true
     where id = v_id
       and user_id = auth.uid()
       and read = false;
  elsif p_item like 'group\_%' escape '\' then
    begin
      v_id := substring(p_item from 7)::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid inbox group notification id' using errcode = '22023';
    end;

    update public.group_notifications
       set read_at = now()
     where id = v_id
       and user_id = auth.uid()
       and read_at is null;
  else
    raise exception 'unsupported inbox alert id' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.mark_inbox_alert_read(text) from public, anon;

grant execute on function public.mark_inbox_alert_read(text) to authenticated;

do $verify$
begin
  if to_regprocedure('public.mark_inbox_alert_read(uuid)') is not null then
    raise exception 'obsolete bare-uuid inbox alert RPC still exists';
  end if;
  if to_regprocedure('public.mark_inbox_alert_read(text)') is null then
    raise exception 'prefixed inbox alert RPC is missing';
  end if;
end
$verify$;
