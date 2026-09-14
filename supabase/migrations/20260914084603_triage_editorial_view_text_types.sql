-- VERSION NOTE: this file is numbered 20260914084603, which sorts BELOW the
-- repo's other recent migrations (the 5001* block). That is deliberate and must
-- not be "corrected". The inbox was fully down, so this was applied live via MCP
-- apply_migration, which stamps supabase_migrations.schema_migrations with its
-- OWN call timestamp — 20260914084603 — not with the filename you intended. The
-- repo file must therefore carry that exact version, or `db push` has an applied
-- version with no file and the drift monitor fails every PR in the repo until
-- someone reconciles it. `db push` matches by version and SKIPS an already-
-- applied one, and check-migration-versions.mjs exempts a version present in
-- remote history from its "must sort above the ceiling" rule for that reason.
--
-- The trap that cost a CI round here: `select version, name from
-- schema_migrations order by version desc limit 10` did NOT show this row,
-- because 20260914084603 sorts below the 2026092* block and fell off the limit.
-- That read like "no history row was recorded". Query the version you expect BY
-- NAME, never by taking the head of a descending list.

-- ───────────────────────────────────────────────────────────────────────────
-- The admin inbox has been dead, and the queue that killed it was EMPTY
-- ───────────────────────────────────────────────────────────────────────────
--
-- /admin/inbox returned nothing but
--
--   Failed to load triage queue: UNION types text and editorial_entity_type
--   cannot be matched
--
-- get_unified_triage_queue() builds its result by UNION ALL-ing `SELECT *`
-- over every ACTIVE row of triage_sources (17 views). Sixteen of those views
-- emit `text` for content_type / subtitle / entity_table / status.
-- triage_src_editorial emitted the raw column types of editorial_drafts —
-- `editorial_entity_type` on three of them and `editorial_draft_status` on the
-- fourth — so the union could not be PLANNED and the whole RPC raised 42804.
--
-- Two things about this are worth keeping.
--
-- (1) THE OFFENDING QUEUE CONTRIBUTES ZERO ROWS. editorial_drafts holds 241
--     rows and 0 at status='pending', so triage_src_editorial is empty and has
--     been for a long time. A union type mismatch is a PLAN-time failure, so an
--     empty view took down the other sixteen just as effectively as a full one
--     would have: 7,525 real items — staging 1,238, dedup-review 1,378,
--     personality quality 1,738, venue 1,197, news 782, city 829 — were
--     unreachable because of a view with nothing in it. No row-count, queue-depth
--     or freshness check could ever have seen this.
--
-- (2) IT ONLY FAILS UNFILTERED. The RPC narrows the union to the requested
--     p_queue_types, so /admin/inbox?queue=dedup-review — the deep link this
--     repo's own docs hand out — builds a ONE-view union and works fine. Only
--     the plain inbox, which is the whole point of a unified queue, unions all
--     seventeen. That is why this survived since 20260801050000 created the
--     view: every narrowed entry point was green.
--
-- The fix is four ::text casts. The defect class — one view out of seventeen
-- drifting and taking the union with it — is what triage_queue_signals() below
-- exists to catch, because nothing was watching the shape.
--
-- CREATE OR REPLACE VIEW cannot change a column's type ("cannot change data
-- type of view column"), so this is a DROP + CREATE. Nothing depends on the
-- view (checked: pg_depend returns no dependent rewrite rules), and the ACL is
-- re-asserted in the verify block below rather than assumed: a dropped view is
-- recreated under public's DEFAULT privileges, which in this database grant
-- anon=awd and authenticated=arwd. The REVOKE is not tidiness — without it the
-- recreate silently re-exposes a view that 20260801050000 deliberately closed.

drop view if exists public.triage_src_editorial;

create view public.triage_src_editorial as
select
  d.id,
  'editorial'::text                                        as queue_type,
  d.entity_type::text                                      as content_type,
  coalesce(left(d.draft_hook, 80), 'Editorial draft')      as title,
  d.entity_type::text                                      as subtitle,
  d.status::text                                           as status,
  null::numeric                                            as confidence_score,
  d.generated_at                                           as created_at,
  coalesce(d.model, 'editorial')::text                     as source,
  d.entity_id,
  d.entity_type::text                                      as entity_table,
  true                                                     as has_diff,
  null::uuid                                               as reporter_id,
  jsonb_build_object(
    'draft_hook', d.draft_hook,
    'draft_long', left(d.draft_long, 2000),
    'model', d.model
  )                                                        as meta,
  null::text                                               as flag_type,
  '{}'::jsonb                                              as risk_flags
from editorial_drafts d
where d.status = 'pending';

revoke all on public.triage_src_editorial from anon, authenticated;

comment on view public.triage_src_editorial is
  'Pending editorial_drafts as a triage source. Every column must carry the '
  'same BASE type as its sibling triage_src_* views: get_unified_triage_queue '
  'UNION ALLs them and a mismatch is a plan-time 42804 that kills the whole '
  'inbox, not just this queue. Enum columns are cast to text for that reason.';

-- ───────────────────────────────────────────────────────────────────────────
-- Sentinel: does the union the RPC builds actually run?
-- ───────────────────────────────────────────────────────────────────────────
--
-- Standalone function rather than a key on pipeline_hygiene_stats(): adding one
-- there means restating that function's whole body, which is a merge-collision
-- surface (same reason event_dup_signals / venue_dup_signals are separate).
--
-- The AUTHORITATIVE check is executing the union, not comparing types. Running
-- it catches type drift, a column added to one view, a reordered SELECT list, a
-- registered view that no longer exists and a runtime error in any member — all
-- of which present to the user as the same dead inbox. `type_drift` is a
-- DIAGNOSTIC that names the culprit when the probe fails; it gates nothing on
-- its own, which is why a majority vote is good enough for it.
--
-- The union is built from triage_sources exactly as get_unified_triage_queue
-- builds it, so the sentinel cannot measure a different set than the RPC serves.
--
-- Cost is not a concern: measured 10 ms execution / 12 ms planning over all 17
-- views (7,525 rows, every member an index scan).

create or replace function public.triage_queue_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_union   text;
  v_active  int;
  v_missing text[];
  v_rows    bigint;
  v_ok      boolean := true;
  v_err     text := null;
  v_drift   jsonb;
begin
  select count(*) into v_active from triage_sources where active;

  -- Registered but absent. `SELECT * FROM public.<gone>` fails at parse time,
  -- so this is the same class of inbox-wide outage as a type mismatch.
  select coalesce(array_agg(s.view_name order by s.view_name), '{}'::text[])
    into v_missing
  from triage_sources s
  where s.active
    and to_regclass('public.' || quote_ident(s.view_name)) is null;

  -- Base type (atttypid), never format_type(): confidence_score is legitimately
  -- numeric, numeric(3,2) and numeric(4,3) across the set and all three unify
  -- under UNION. Comparing the formatted type would report six false positives.
  with cols as (
    select s.view_name as v, a.attname, a.atttypid::regtype::text as t
    from triage_sources s
    join pg_class c on c.oid = to_regclass('public.' || quote_ident(s.view_name))
    join pg_attribute a
      on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where s.active
  ),
  tally as (
    select attname, t, count(*) as n,
           row_number() over (partition by attname order by count(*) desc, t) as rn
    from cols group by attname, t
  )
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'view', c.v, 'column', c.attname,
             'type', c.t, 'siblings_use', m.t
           ) order by c.v, c.attname),
           '[]'::jsonb)
    into v_drift
  from cols c
  join tally m on m.attname = c.attname and m.rn = 1
  where c.t <> m.t;

  select string_agg(format('SELECT * FROM public.%I', view_name), ' UNION ALL ')
    into v_union
  from triage_sources
  where active
    and to_regclass('public.' || quote_ident(view_name)) is not null;

  if v_union is null then
    v_ok := false;
    v_err := 'no active triage_sources view exists';
  else
    begin
      execute 'select count(*) from (' || v_union || ') u' into v_rows;
    exception when others then
      -- The error text is the whole value of this probe: 42804 names the two
      -- types, 42703 names a dropped column. Swallowing it would leave the next
      -- reader with the same "which of seventeen?" hunt this migration cost.
      v_ok := false;
      v_err := sqlstate || ': ' || sqlerrm;
    end;
  end if;

  -- `rows` stays NULL on a failed probe. A zero would read as an empty inbox,
  -- which is a legitimate state and the opposite of what a failure means.
  return jsonb_build_object(
    'probe_ok',      v_ok,
    'union_error',   v_err,
    'views_active',  v_active,
    'views_missing', to_jsonb(v_missing),
    'type_drift',    v_drift,
    'rows',          v_rows
  );
end;
$fn$;

revoke all on function public.triage_queue_signals() from public, anon, authenticated;
grant execute on function public.triage_queue_signals() to service_role;

comment on function public.triage_queue_signals() is
  'Health probe for the unified triage inbox. Executes the exact UNION ALL that '
  'get_unified_triage_queue builds from triage_sources, so a plan-time failure '
  'in any one source view is reported before an admin meets it. Read by '
  'scripts/check-pipeline-health.mjs.';

-- ───────────────────────────────────────────────────────────────────────────
-- Postconditions: assert the state this file exists to reach.
-- ───────────────────────────────────────────────────────────────────────────
do $verify$
declare
  s        jsonb;
  v_bad    text;
  v_leaked text;
begin
  -- 1. The four columns this migration is about.
  select string_agg(a.attname || '=' || a.atttypid::regtype::text, ', ' order by a.attname)
    into v_bad
  from pg_attribute a
  where a.attrelid = 'public.triage_src_editorial'::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attname in ('content_type', 'subtitle', 'entity_table', 'status')
    and a.atttypid <> 'text'::regtype;
  if v_bad is not null then
    raise exception 'triage_src_editorial still emits non-text: %', v_bad;
  end if;

  -- 2. The drop/recreate must not have re-exposed the view. public's default
  --    privileges grant anon=awd and authenticated=arwd on a new relation.
  select string_agg(distinct a.grantee::regrole::text, ', ')
    into v_leaked
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.triage_src_editorial'::regclass
    and a.grantee::regrole::text in ('anon', 'authenticated');
  if v_leaked is not null then
    raise exception 'triage_src_editorial is exposed to %', v_leaked;
  end if;

  -- 3. ...and must not have revoked the reader that check-pipeline-health uses.
  if not has_table_privilege('service_role', 'public.triage_src_editorial', 'SELECT') then
    raise exception 'service_role lost SELECT on triage_src_editorial';
  end if;

  -- 4. The union the inbox actually serves.
  s := public.triage_queue_signals();
  if coalesce((s->>'probe_ok')::boolean, false) is not true then
    raise exception 'triage queue union still does not execute: %', s->>'union_error';
  end if;
  if s->'type_drift' <> '[]'::jsonb then
    raise exception 'triage source views disagree on column types: %', s->'type_drift';
  end if;
  if jsonb_array_length(coalesce(s->'views_missing', '[]'::jsonb)) > 0 then
    raise exception 'registered triage view(s) do not exist: %', s->'views_missing';
  end if;
  if coalesce((s->>'views_active')::int, 0) = 0 then
    raise exception 'no active triage_sources — the probe above measured nothing';
  end if;

  raise notice 'triage inbox OK: % items across % source views',
    s->>'rows', s->>'views_active';
end
$verify$;
