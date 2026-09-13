-- Retire `expand_event_recurrences` — a nightly cron that has never had anything to do.
--
-- THE SPEC SAID THIS MACHINERY "HAS NEVER RUN". That is wrong, and the difference
-- matters. `expand-event-recurrences` is an ENABLED pg_cron job firing every night at
-- 03:15, with a matching enabled `admin_automations` row. It runs, calls
-- `expand_all_recurring_events(365)`, finds nothing and returns — because its input
-- `events.recurrence_rule` is 0 rows and always has been, and its output
-- `event_occurrences` is 0 rows and always has been. "Never ran" and "runs nightly and
-- no-ops" look identical from the data and are opposite facts about the system.
--
-- It is superseded. `events.schedule` + `event_dates` + `run_event_dates_rebuild` do
-- this job for real: 141 rules and 7,353 dates, against this path's 0 and 0.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO — dropping the tables was the specced
-- step 8 and the reader census stopped it:
--
--   * `event_occurrences` is referenced by FIVE live functions, including
--     `_event_merge_core` and `unmerge_entities`. Those are the reversible-merge path
--     for events; a DROP would take event merging down to delete a 0-row table. The
--     table costs nothing to keep and the blast radius to remove it is real.
--   * `festivals` is embedded in `EVENT_SELECT_FIELDS` as `festivals:festival_id(id,
--     name)` and searched live by the submit form's festival picker
--     (`useFestivalSearch`). EventDetail.parts.tsx documents an incident where a bad
--     embed in that select 400'd the WHOLE event query and every event page rendered
--     no <h1>. Dropping the table without removing the embed first repeats it exactly.
--
-- So the retirement is the cron only. Registry row FIRST, then a guarded unschedule:
-- `sync_automations_to_cron()` recreates any enabled row whose job is missing, so
-- `cron.unschedule` alone is undone by the next reconciler pass. The row is disabled,
-- never deleted — a deleted row makes the live job "unregistered", which branch (a)
-- reports and deliberately never auto-kills.

update admin_automations
set enabled = false,
    description = coalesce(description, '')
      || ' [RETIRED 2026-09-13: expand_all_recurring_events reads events.recurrence_rule'
      || ' (0 rows, always) and writes event_occurrences (0 rows, always), so this fired'
      || ' nightly and did nothing. Superseded by events.schedule + event_dates +'
      || ' run_event_dates_rebuild, which carry 141 rules and 7,353 dates. Kept disabled'
      || ' rather than deleted so sync_automations_to_cron cannot re-arm it.]',
    updated_at = now()
where slug = 'expand_event_recurrences'
  and enabled;

-- Idempotent, and after the registry update so no reconciler pass can re-add it in
-- between.
select cron.unschedule('expand-event-recurrences')
where exists (
  select 1 from cron.job where jobname = 'expand-event-recurrences'
);

do $verify$
declare
  v_enabled  boolean;
  v_job      integer;
  v_occ      bigint;
  v_rules    bigint;
begin
  select enabled into v_enabled from admin_automations where slug = 'expand_event_recurrences';
  select count(*) into v_job from cron.job where jobname = 'expand-event-recurrences';

  if v_enabled is null then
    raise exception 'registry row expand_event_recurrences is missing — it must be disabled, not deleted';
  end if;
  if v_enabled then
    raise exception 'registry row is still enabled; the reconciler would re-arm the job';
  end if;
  if v_job <> 0 then
    raise exception 'cron job expand-event-recurrences still scheduled';
  end if;

  -- Positive control on the PREMISE, not just the action. "0 occurrences" is also
  -- true of a table someone truncated this morning, and retiring a job that was in
  -- fact producing rows would be a silent data-loss decision rather than a cleanup.
  select count(*) into v_occ from event_occurrences;
  select count(*) into v_rules from events where recurrence_rule is not null;
  if v_occ <> 0 or v_rules <> 0 then
    raise exception 'premise broken: % occurrences and % recurrence_rule rows exist — this job was NOT a no-op, do not retire it',
      v_occ, v_rules;
  end if;

  -- And the successor must actually be carrying the load, or this is a removal with
  -- nothing behind it.
  if (select count(*) from events where schedule is not null) = 0 then
    raise exception 'no schedule rules exist — refusing to retire the old path with no successor';
  end if;

  raise notice 'expand_event_recurrences retired: registry disabled, cron unscheduled, 0 occurrences, 0 recurrence_rule rows';
end
$verify$;
