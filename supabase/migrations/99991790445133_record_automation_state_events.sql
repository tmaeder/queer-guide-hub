-- RECORD three objects that exist in PRODUCTION and are created by NO migration.
--
-- `admin_automation_state_events` (table), `admin_automation_log_state_change()`
-- (function) and `admin_automation_log_state_change_trg` (trigger) are live on prod
-- and appear in no migration in this repo. That is a DIFFERENT drift class from the
-- applied-but-uncommitted one `check-migration-drift.mjs` catches: these have no
-- `schema_migrations` row at all, so only `check-schema-object-drift.mjs` can see
-- them, and it is failing on the trigger — which makes `Critical data-quality gates`
-- red on EVERY open PR in the repo, since it is one of the 12 required checks.
--
-- A hand-attached trigger disappears on any rebuild from migrations and the
-- invariant it enforces goes with it. This file makes the repo able to rebuild
-- prod, and nothing else.
--
-- THIS MIGRATION CHANGES NOTHING ON PROD, BY CONSTRUCTION. Every statement is
-- `if not exists` / `or replace` / `drop … if exists` + recreate with the exact
-- definition read back out of the live catalog, so applying it to prod is a no-op
-- and applying it to an empty database reproduces what prod has. The function body
-- is byte-identical to `pg_get_functiondef` (md5 b940927a32fa588fe17ac1cea40b4eee)
-- and the trigger matches `pg_get_triggerdef` verbatim.
--
-- WHOSE OBJECTS THESE ARE. They belong to the automation-lifecycle feature whose
-- other half is `20260926154006_automation_operations_safety` — the trigger fires on
-- `admin_automations.lifecycle_state`, a column that migration adds. That one was
-- applied direct-to-prod and recovered in the same PR as this file; these three were
-- never recorded anywhere. This file therefore RECORDS someone else's schema rather
-- than designing it: no column, default, policy or grant is changed from what the
-- catalog reports, and if the authoring session later ships its own migration for
-- them, the `if not exists` shape means the two compose instead of colliding.
--
-- `id` is `generated always as identity` (pg_attribute.attidentity = 'a'), which
-- `format_type` does NOT show as a default — writing it as a plain `bigint not null`
-- would produce a table whose inserts all fail on a rebuild.
--
-- NOTE the policy is created inside a DO block. `CREATE POLICY IF NOT EXISTS` is not
-- valid in ANY Postgres version — CLAUDE.md records two such statements that
-- therefore never executed, leaving a public bucket with no policy at all.

create table if not exists public.admin_automation_state_events (
  id bigint generated always as identity primary key,
  automation_id uuid not null references public.admin_automations(id) on delete cascade,
  automation_slug text not null,
  happened_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  source text not null default 'database'::text,
  reason text,
  enabled_before boolean not null,
  enabled_after boolean not null,
  lifecycle_before text not null,
  lifecycle_after text not null
);

create index if not exists admin_automation_state_events_automation_idx
  on public.admin_automation_state_events (automation_id, happened_at desc);
create index if not exists admin_automation_state_events_actor_idx
  on public.admin_automation_state_events (actor_id) where actor_id is not null;

alter table public.admin_automation_state_events enable row level security;

-- Matches the live policy exactly: read-only, admin/moderator, `authenticated`.
-- There is no insert policy because the only writer is the SECURITY DEFINER trigger
-- below, and no anon grant.
do $policy$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.admin_automation_state_events'::regclass
      and polname = 'admin_automation_state_events_select'
  ) then
    create policy admin_automation_state_events_select
      on public.admin_automation_state_events
      for select to authenticated
      using (public.has_any_role_jwt(array['admin'::public.app_role, 'moderator'::public.app_role]));
  end if;
end
$policy$;

revoke all on table public.admin_automation_state_events from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_automation_state_events to service_role;

create or replace function public.admin_automation_log_state_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if old.enabled is not distinct from new.enabled
     and old.lifecycle_state is not distinct from new.lifecycle_state then
    return new;
  end if;

  insert into public.admin_automation_state_events (
    automation_id, automation_slug, actor_id, source, reason,
    enabled_before, enabled_after, lifecycle_before, lifecycle_after
  ) values (
    new.id,
    new.slug,
    auth.uid(),
    coalesce(nullif(current_setting('app.automation_state_source', true), ''), 'database'),
    nullif(current_setting('app.automation_state_reason', true), ''),
    old.enabled,
    new.enabled,
    old.lifecycle_state,
    new.lifecycle_state
  );
  return new;
end;
$function$;

alter function public.admin_automation_log_state_change() owner to postgres;
revoke all on function public.admin_automation_log_state_change() from public, anon, authenticated;

drop trigger if exists admin_automation_log_state_change_trg on public.admin_automations;
create trigger admin_automation_log_state_change_trg
  after update of enabled, lifecycle_state on public.admin_automations
  for each row execute function public.admin_automation_log_state_change();

do $verify$
declare
  v_missing text;
begin
  -- The trigger is the object the repo-wide gate reads; assert it by NAME and on the
  -- right table, not merely that some trigger of that name exists somewhere.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
      and t.tgname = 'admin_automation_log_state_change_trg'
      and c.relname = 'admin_automations'
  ) then
    raise exception 'admin_automation_log_state_change_trg is not attached to admin_automations';
  end if;

  -- `id` must still be an identity column. A rebuild that lost this would create a
  -- table whose every insert fails, and the trigger is the only writer.
  if (select attidentity from pg_attribute
       where attrelid = 'public.admin_automation_state_events'::regclass
         and attname = 'id') <> 'a' then
    raise exception 'admin_automation_state_events.id is not generated always as identity';
  end if;

  -- Read-only for humans: no anon reach, and no INSERT/UPDATE/DELETE policy that
  -- would let a client write an audit row the trigger is supposed to own.
  select string_agg(polname, ', ') into v_missing
  from pg_policy
  where polrelid = 'public.admin_automation_state_events'::regclass
    and polcmd <> 'r';
  if v_missing is not null then
    raise exception 'unexpected non-SELECT policy on admin_automation_state_events: %', v_missing;
  end if;

  if has_table_privilege('anon', 'public.admin_automation_state_events', 'select') then
    raise exception 'anon can read admin_automation_state_events';
  end if;
end
$verify$;
