-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261002092501 with no repo file — the signature of
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
-- Cancelled events are not publishable quality-review subjects. Prevent the
-- scheduled scanner from reopening findings after an admin quarantines a
-- non-event, and reconcile any rows opened in the race window.

create or replace function public.guard_cancelled_event_quality_issue()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if exists(
    select 1 from public.events e
    where e.id=new.event_id and e.status='cancelled'
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_cancelled_event_quality_issue() from public,anon,authenticated;
grant execute on function public.guard_cancelled_event_quality_issue() to service_role;

drop trigger if exists trg_guard_cancelled_event_quality_issue on public.event_quality_issues;
create trigger trg_guard_cancelled_event_quality_issue
before insert on public.event_quality_issues
for each row execute function public.guard_cancelled_event_quality_issue();

create or replace function public.reconcile_cancelled_event_quality()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    update public.event_quality_issues
    set status='resolved',
        resolution='event_cancelled_or_quarantined',
        resolved_at=now(),
        reviewed_at=now()
    where event_id=new.id and status='open';

    update public.event_quality_current
    set open_issue_codes='{}'::text[]
    where event_id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_cancelled_event_quality() from public,anon,authenticated;
grant execute on function public.reconcile_cancelled_event_quality() to service_role;

drop trigger if exists trg_events_reconcile_cancelled_quality on public.events;
create trigger trg_events_reconcile_cancelled_quality
after update of status on public.events
for each row execute function public.reconcile_cancelled_event_quality();

update public.event_quality_issues i
set status='resolved',
    resolution='event_cancelled_or_quarantined',
    resolved_at=now(),
    reviewed_at=now()
from public.events e
where e.id=i.event_id and e.status='cancelled' and i.status='open';

update public.event_quality_current c
set open_issue_codes='{}'::text[]
from public.events e
where e.id=c.event_id and e.status='cancelled';

do $verify$
begin
  if exists(
    select 1 from public.event_quality_issues i
    join public.events e on e.id=i.event_id
    where i.status='open' and e.status='cancelled'
  ) then
    raise exception 'cancelled event still has open quality issues';
  end if;
end
$verify$;
;
