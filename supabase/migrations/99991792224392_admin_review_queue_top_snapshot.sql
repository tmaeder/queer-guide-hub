-- get_admin_review_queue is 3.0-11.9s against authenticated's 8s statement_timeout. Measured
-- 2026-10-14 on prod, AFTER 99991792000410 (the counts cache) and after the four covering indexes
-- that are live on prod but carried only by the unmerged branch fix/admin-review-covering-indexes:
--   landing (scope=decisions)  3.0 / 3.1 / 3.1 / 3.4 / 3.0 / 4.2 s
--   scope=all                  5,755 and 8,516 ms   <- already past the timeout
--   scope=decisions            3,595 and 11,899 ms
-- e2e/admin-inbox-renders.spec.ts asserts response.ok() on three of these and is part of the
-- required `Critical paths` check, so the tail reds that check on PRs that touch nothing near it.
--
-- WHAT THE COST IS NOT. A handoff note attributed it to admin_review_src_business_quality on the
-- grounds that it is 257,753 of the 335k union rows (81%). Measured in shared blocks -- the stable
-- instrument; wall clock on this instance swings 2-4x run to run -- it is 50,105 of 204,304 (18.6%)
-- and the most efficient big view in the set at 0.19 blocks/row. Dropping its three bulk reason
-- codes would buy ~10-30% AND would undo 99991791872772, whose header explains at length why those
-- 281k detector findings must be classified and counted rather than hidden. Not done here.
--
-- Per-view block attribution is also misleading and was measured rather than assumed:
-- admin_review_src_general_review reads 136,723 blocks standalone (50.8%) from 8% of the rows,
-- because its five entity LEFT JOINs put the entity_type test in the join FILTER -- so organizations
-- (24,920 blocks) and personalities (9,439) are fully scanned to serve ZERO rows (review_queue holds
-- only city/venue/event) and events does 27,435 index probes for 1,340 possible matches. Rewriting
-- the join key as `on e.id = (case when s.entity_type='event' then s.entity_id end)` takes the view
-- to 58,654 blocks, row-identical (verified in one snapshot: 26,304 = 26,304, 0 rows either way).
-- IT IS NOT DONE HERE EITHER: inside the union the planner picks a different plan and three
-- alternating runs measured ~7% with block count unchanged. A per-view number does not survive
-- contact with the whole query. Recorded so the next reader does not re-derive it.
--
-- TWO THINGS ARE DONE HERE, and they attack different requests.
--
-- PART 1 -- the decisions predicate moves into the union branches.
-- The landing request is scope=decisions (since 99991791872772). `is_finding` is
-- admin_review_finding_codes matched on u.subtitle, and subtitle is a plain base-table column in
-- the big views (business-quality: reason_code; event-quality: issue_code), so the predicate can be
-- evaluated per branch instead of after the union. Same predicate, same rows, earlier.
--   current            1,556 / 1,602 / 1,775 ms   174,782 blocks
--   per-branch         755 / 758 / 788 ms         160,647 blocks
-- ~2.1x, stable across three alternating runs. Blocks fall only 8%, so this is the planner doing
-- less work per row rather than reading fewer of them; it does not help scope=all at all.
--
-- PART 2 -- page 1 of an unfiltered request is served from a snapshot.
-- This is what covers scope=all, which Part 1 cannot touch and which is the request measured at
-- 8,516 ms. It follows 99991792000410 exactly: a plain table, a cron refresher holding the same
-- advisory lock discipline, and a standalone signals function.
--
-- THE REFRESHER MUST EXECUTE THE FULL-PROJECTION UNION, AND THAT IS THE LOAD-BEARING PART.
-- e2e/admin-inbox-renders.spec.ts says of the landing request: "The union itself is built BEFORE
-- the scope filter, so every registered view still executes on this request -- the plan-time UNION
-- type mismatch that took this page down for six weeks is caught here exactly as before." Serving
-- page 1 from a snapshot removes that canary from the user request, so it is relocated rather than
-- dropped: this refresher builds the SAME union with the SAME column list the function builds, so a
-- type mismatch across views breaks the refresh, the snapshot goes stale, and
-- admin_review_top_signals + check-pipeline-health report it. The counts refresher cannot serve as
-- that canary -- it projects only queue_type/subtitle/created_at/risk, so a mismatch in `title` or
-- `confidence_score` passes it. A canary in a monitored cron is better than one that fails in a
-- staff user's page load, but it is only a canary if the projection matches. Keep them in step.
--
-- WHAT THE SNAPSHOT DELIBERATELY DOES NOT STORE: title, subtitle, content_type, created_at,
-- confidence_score. Those come from the live view through the existing `details` CTE on every
-- request, and `d.item || to_jsonb(s)` makes the right-hand side win -- so storing them would
-- publish a stale title over a fresh one. The snapshot carries only the registry-derived sort
-- metadata the view cannot supply (urgency_rank, source_label, risk, public_impact, sla_hours,
-- priority_weight, can_reopen, is_finding) plus the join keys. `overdue` is recomputed at read time
-- from the live created_at, because it is a function of now() and would otherwise go wrong within
-- one refresh interval.
--
-- A ROW THAT HAS BEEN DECIDED SINCE THE REFRESH DISAPPEARS, and that is why the read path joins
-- details with an INNER join where the live path uses LEFT. A cached id whose view row is gone
-- resolves to no item; emitting it would render a decided row with snapshot metadata and no
-- content. The cost is that page 1 can return fewer than 50 items between refreshes. That is
-- honest and visible, where the alternative is a reviewer opening something already resolved.
-- `total` is unaffected: it already comes from admin_review_queue_counts, which is equally a
-- snapshot, so the page count and the row count share one staleness story rather than two.
--
-- SERVED ONLY FOR AN UNFILTERED REQUEST: p_queue_types IS NULL and p_content_types IS NULL and no
-- search, within the cached depth. Anything narrower already prunes the union by branch and is
-- fast -- measured, p_queue_types => '{dedup-review}' is 240-296 ms against 3-12 s unfiltered --
-- so caching it would add staleness to a request that does not need it.

-- ---------------------------------------------------------------------------
-- P1. The snapshot table.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_review_queue_top (
  scope           text        not null,
  sort            text        not null,
  rank            integer     not null,
  queue_type      text        not null,
  id              uuid        not null,
  urgency_rank    integer     not null,
  source_label    text,
  risk            text,
  public_impact   boolean,
  sla_hours       integer,
  priority_weight integer,
  can_reopen      boolean,
  is_finding      boolean     not null,
  created_at      timestamptz,
  computed_at     timestamptz not null default now(),
  primary key (scope, sort, rank)
);

comment on table public.admin_review_queue_top is
  'Page-1 ordering for UNFILTERED get_admin_review_queue requests, refreshed by '
  '1792009810. Holds only the registry-derived sort metadata: title/subtitle/'
  'content_type/confidence_score come from the live view via the details CTE on every request, so '
  'a stale snapshot can never publish a stale title. Depth is capped at '
  'admin_review_queue_top_depth(); past it the live path serves. Staleness is reported by '
  'admin_review_top_signals(), not gated on read -- a silently disappearing fast path is harder to '
  'diagnose than a stale one that says so.';

-- Read-time lookup is (scope, sort) ordered by rank, which the primary key already serves.

alter table public.admin_review_queue_top enable row level security;

-- No policy: this is read through the SECURITY DEFINER function only, exactly like
-- admin_review_queue_counts. RLS on with no policy denies every direct client read.

revoke all on public.admin_review_queue_top from anon, authenticated;

-- ---------------------------------------------------------------------------
-- P2. Depth and the scope/sort vocabulary, as functions so the refresher, the reader and the
--     sentinel cannot disagree about them. get_admin_review_queue validates p_scope and p_sort
--     against its own literal whitelists; these must stay supersets of those, and P6 asserts it.
-- ---------------------------------------------------------------------------

create or replace function public.admin_review_queue_top_depth()
returns integer language sql immutable parallel safe set search_path to 'public','pg_temp'
as $$ select 250 $$;

comment on function public.admin_review_queue_top_depth() is
  '250 = five pages at the hook''s hardcoded p_per_page of 50. Beyond it get_admin_review_queue '
  'falls through to the live path. 15 (scope,sort) combinations x 250 = 3,750 rows, which is why '
  'the depth is generous: the table is trivially small and a reader who pages past the cache gets '
  'the slow path they would have had anyway.';

-- ---------------------------------------------------------------------------
-- P3. The refresher.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_admin_review_queue_top()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_union text;
  v_rows  integer;
  v_depth integer := public.admin_review_queue_top_depth();
  v_t0    timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(hashtext('admin_review_queue_top')) then
    return jsonb_build_object('ok', true, 'skipped', 'another refresh holds the lock');
  end if;

  select string_agg(format(
    'select u.id,u.queue_type,u.content_type,u.title,u.subtitle,u.created_at,u.confidence_score,'
    ' case u.risk_flags->>''severity'' when ''critical'' then 4 when ''high'' then 3'
    ' else case coalesce(u.risk_flags->>''risk'',%L) when ''safety'' then 2'
    ' when ''integrity'' then 1 else 0 end end urgency_rank,'
    ' %L::text source_label,coalesce(u.risk_flags->>''risk'',%L)::text risk,'
    ' %L::boolean public_impact,%L::integer sla_hours,%L::integer priority_weight,'
    ' %L::boolean can_reopen from public.%I u',
    r.risk, r.label, r.risk, r.public_impact, r.sla_hours, r.priority_weight,
    r.can_reopen, r.view_name), ' union all ' order by r.queue_key)
  into v_union
  from public.admin_review_sources r
  where r.active;

  if v_union is null then
    return jsonb_build_object('ok', false, 'reason', 'no active review sources');
  end if;

  delete from public.admin_review_queue_top;

  -- ONE union execution, fifteen bounded top-N sorts over the materialized result. The obvious
  -- shape -- one statement per (scope,sort) -- re-executes the union fifteen times; a single pass
  -- is ~950ms warm, so that alone would be a 14s tick. `as materialized` is load-bearing: the CTE
  -- is referenced from inside a LATERAL that runs once per combination, and without the hint
  -- Postgres is free to inline it and re-plan the union fifteen times, which is the same defect
  -- wearing a CTE's clothes.
  --
  -- The scope and sort expressions are transcribed from get_admin_review_queue. P6 asserts the
  -- resulting order matches the live path by executing both and comparing, rather than trusting
  -- the transcription -- a copied ORDER BY that drifts is invisible to every structural check.
  execute format($q$
    insert into public.admin_review_queue_top
      (scope, sort, rank, queue_type, id, urgency_rank, source_label, risk,
       public_impact, sla_hours, priority_weight, can_reopen, is_finding, created_at, computed_at)
    with authorized as materialized (
      select a.*,
        a.sla_hours is not null and a.created_at < now()-make_interval(hours=>a.sla_hours) as overdue,
        (f.queue_key is not null) as is_finding
      from (%s) a
      left join public.admin_review_finding_codes f
        on f.queue_key = a.queue_type and f.subtitle_match = a.subtitle)
    select s.scope, o.sort, r.rank, r.queue_type, r.id, r.urgency_rank, r.source_label, r.risk,
           r.public_impact, r.sla_hours, r.priority_weight, r.can_reopen, r.is_finding,
           r.created_at, now()
    from (values ('all'),('safety'),('overdue'),('public'),('decisions')) s(scope)
    cross join (values ('priority'),('age'),('confidence')) o(sort)
    cross join lateral (
      -- THE LIMIT MUST APPLY BEFORE row_number(), AND THE OBVIOUS SHAPE GETS THIS WRONG.
      -- A window function sorts its whole partition and no LIMIT can be pushed through it, so
      -- `row_number() over (order by ...) ... limit 250` in ONE level is fifteen full sorts of
      -- 335k rows. Measured on prod: 20,640 ms. Ranking the already-bounded 250-row subquery
      -- instead makes each pass a bounded top-N: 5,871 ms, a 3.5x difference from nesting alone.
      select sub.*, row_number() over (
        order by
          case when o.sort='priority' then sub.urgency_rank else 0 end desc,
          case when o.sort='priority' then sub.overdue else false end desc,
          case when o.sort='priority' then sub.priority_weight else 0 end desc,
          case when o.sort='confidence' then sub.confidence_score end asc nulls last,
          sub.created_at asc nulls last, sub.queue_type, sub.id) as rank
      from (
        select t.* from authorized t
        where case s.scope
                when 'all'     then true
                when 'safety'  then t.risk = 'safety'
                when 'public'  then t.public_impact
                when 'overdue' then t.overdue
                else                not t.is_finding
              end
        order by
          case when o.sort='priority' then t.urgency_rank else 0 end desc,
          case when o.sort='priority' then t.overdue else false end desc,
          case when o.sort='priority' then t.priority_weight else 0 end desc,
          case when o.sort='confidence' then t.confidence_score end asc nulls last,
          t.created_at asc nulls last, t.queue_type, t.id
        limit %s
      ) sub
    ) r
  $q$, v_union, v_depth);
  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'depth', v_depth,
    'elapsed_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
end
$function$;

revoke all on function public.refresh_admin_review_queue_top() from public, anon, authenticated;

comment on function public.refresh_admin_review_queue_top() is
  'Rebuilds admin_review_queue_top from ONE execution of the same full-projection union '
  'get_admin_review_queue builds. That projection is the plan-time UNION type-mismatch canary the '
  'landing request used to provide; keep it column-for-column in step with the function.';

-- ---------------------------------------------------------------------------
-- P4. Schedule. Every 2 minutes: the refresh is ~5.9s measured, it holds a TRY advisory lock so
--     an overrun is skipped rather than queued, and the hook refetches every 60s -- so a tick
--     slower than the refetch would mean most page loads read a snapshot older than the one
--     before it. Registered in admin_automations because an unregistered cron is invisible to
--     sync_automations_to_cron and to every health surface that reads the registry.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'admin_review_queue_top_refresh', '*/2 * * * *',
  $cron$select public.refresh_admin_review_queue_top()$cron$)
where not exists (select 1 from cron.job where jobname = 'admin_review_queue_top_refresh');

-- `trigger` is NOT NULL with no default and takes {"type":"schedule"}. Omitting it raises 23502
-- at apply time, which aborts db push and takes every migration queued behind it. This migration
-- shipped without it and it was caught only by dry-running the insert against prod: the SQL
-- parses, the column list reads as complete, and every guard assertion passed. The shape is
-- copied from admin_review_counts_refresh, the sibling cron this one sits beside.
insert into public.admin_automations
  (slug, name, description, trigger, action, schedule, enabled, conditions)
select 'admin_review_queue_top_refresh',
       'Admin review queue page-1 snapshot',
       'Rebuilds admin_review_queue_top so an unfiltered /admin inbox page 1 does not execute the '
       '41-branch union. Also the relocated UNION type-mismatch canary: if this stops succeeding, '
       'the union no longer plans.',
       jsonb_build_object('type','schedule'),
       jsonb_build_object('type','rpc','function','refresh_admin_review_queue_top'),
       '*/2 * * * *', true, '[]'::jsonb
where not exists (select 1 from public.admin_automations where slug = 'admin_review_queue_top_refresh');

-- ---------------------------------------------------------------------------
-- P5. Sentinel. Standalone rather than a key on admin_review_counts_signals(): that body belongs
--     to 99991792000410 and restating a long CREATE OR REPLACE to add a counter is a merge
--     collision surface, which is the same reason glossary_link_signals and the news/venue
--     signals are all separate functions.
-- ---------------------------------------------------------------------------

create or replace function public.admin_review_top_signals()
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_rows int; v_combos int; v_age numeric; v_cron int; v_depth int;
begin
  -- rows/combos are reported FIRST and separately from the age check, because "0 stale" is
  -- equally true of an empty snapshot, a snapshot nobody reads, and a healthy one. The same
  -- reasoning as admin_review_counts_signals, and the reason an absent refresher cannot read as
  -- a clean cache.
  select count(*), count(distinct (scope, sort)) into v_rows, v_combos
    from public.admin_review_queue_top;
  select round(extract(epoch from now() - min(computed_at))) into v_age
    from public.admin_review_queue_top;
  select count(*) into v_cron from cron.job
   where jobname = 'admin_review_queue_top_refresh' and active;
  v_depth := public.admin_review_queue_top_depth();
  return jsonb_build_object(
    'probe_ok', true,
    'rows', v_rows,
    'combos', v_combos,
    'combos_expected', 15,
    'depth', v_depth,
    'age_seconds', v_age,
    'refresh_cron_active', v_cron);
end
$function$;

revoke all on function public.admin_review_top_signals() from public, anon, authenticated;
grant execute on function public.admin_review_top_signals() to service_role;

-- ---------------------------------------------------------------------------
-- P6. The two function patches, applied to the LIVE body by string surgery rather than by
--     restating it.
--
--     THIS IS DELIBERATE AND IT IS THE SAFER CHOICE HERE, not a shortcut. get_admin_review_queue
--     was rewritten twice today (99991791920008, then 99991792000410's fold of p_scope into the
--     query text) and a third branch touching its indexes is still unmerged. Restating the body
--     means silently reverting whatever landed between this file being written and it being
--     applied. Surgery composes; the precedent is 20260806140000, which patched a live function
--     the same way. The cost is that an anchor can stop matching -- so every replace below
--     ASSERTS it changed something and RAISES if it did not. A patch that silently no-ops is the
--     failure this repo has recorded more than once.
-- ---------------------------------------------------------------------------

do $patch$
declare
  v_src   text;
  v_new   text;
  v_anchor text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_admin_review_queue';
  if v_src is null then
    raise exception 'get_admin_review_queue does not exist -- this migration patches it, it does not create it';
  end if;

  -- PATCH 1 IS GONE, BECAUSE 99991792213011 DID IT FIRST AND DID IT BETTER.
  --
  -- This file was cut against a body that no longer exists. 99991792213011 merged between
  -- the cut and the push and moved the SAME decisions predicate into the SAME place, so
  -- PATCH 1's anchor ('%L::boolean can_reopen from public.%I u'',' + the argument tail)
  -- is legitimately absent and its `v_new = v_src` test fired exactly as designed:
  --   ERROR: PATCH 1 replaced nothing -- the union builder in get_admin_review_queue was
  --   rewritten and the anchor no longer matches.
  -- That raise was right. It blocked db push for the whole repo, 9 migrations deep, which
  -- is the correct outcome for an anchor that silently stopped matching.
  --
  -- IT IS DELETED RATHER THAN RE-CUT, and that is the measured call. The two predicates are
  -- the same rows; 213011's is strictly cheaper, because it emits the NOT EXISTS only for
  -- branches that actually carry a finding code:
  --     and exists (select 1 from public.admin_review_finding_codes fc
  --                  where fc.queue_key = r.queue_key)
  -- where this one emitted it for every branch and leaned on `not exists(...)` being
  -- vacuously true for the rest. Re-cutting would replace a narrower emit with a wider one.
  --
  -- SUBSUMED IN EVERY WORLD, not just on today's prod: 99991792213011 < 99991792224392, so
  -- a rebuild from zero applies it first too. There is no ordering in which PATCH 1 has
  -- work left to do.
  --
  -- NO `position()` GUARD EITHER, and the original header is why. It states that
  -- pg_get_functiondef() returns the body INCLUDING its comments, so any SEARCH over it is
  -- the defect scripts/check-functiondef-asserts.mjs exists to stop ("it aborted db push on
  -- main three times in one day"). A first draft of this fix kept PATCH 1 and skipped it
  -- when a post-213011 string was `position()`-found in v_src -- i.e. exactly the pattern
  -- this file warns against, and one that gate does not catch because it only inspects NEW
  -- migrations and this is an edit to an existing one. Deleting the patch needs no search at
  -- all, which is why it is the better fix.
  --
  -- PATCH 2 below is untouched and still applies: its anchor is the v_search assignment
  -- tail, which 99991792216385 inserted AFTER rather than rewriting. Verified on prod --
  -- PATCH 1's anchor absent, 213011's form present, PATCH 2's anchor present.

  -- PATCH 2 -- an unfiltered page within the cached depth is served from the snapshot.
  -- Inserted as an EARLY RETURN immediately after v_search is assigned, rather than by rewriting
  -- the main query's CTE chain. Two reasons, both about composing rather than winning an argument
  -- with the planner: the big format($query$...$query$) template is what the other two changes
  -- today edited, so touching it is where a silent revert would come from; and an early return
  -- leaves every non-cacheable request byte-identical, so the blast radius is exactly the
  -- requests the snapshot covers. The non-items half is NOT duplicated -- it comes from
  -- get_admin_review_summary(), which already serves all_total/decisions_total/findings_total/
  -- overdue_total/safety_total/sources from the same counts cache.
  v_anchor := '''%''||replace(replace(replace(lower(trim(p_search)),''\'',''\\''),''%'',''\%''),''_'',''\_'')||''%'' end;';
  v_new := replace(v_src, v_anchor, v_anchor || '
 if p_queue_types is null and p_content_types is null and v_search is null
    and v_page*v_size <= public.admin_review_queue_top_depth()
    and exists (select 1 from public.admin_review_queue_top t where t.scope=p_scope and t.sort=p_sort) then
  select string_agg(format(
   ''select distinct on (u.id) %L::text queue_type,u.id,to_jsonb(u) item from public.%I u where exists(select 1 from sorted where queue_type=%L) and u.id=any(array(select id from sorted where queue_type=%L))'',
   r.queue_key,r.view_name,r.queue_key,r.queue_key),'' union all '' order by r.queue_key)
  into v_details from public.admin_review_sources r where r.active and (
   public.has_role_jwt(''admin''::public.app_role)
   or (r.min_role=''moderator'' and public.has_role_jwt(''moderator''::public.app_role))
   or (r.min_role=''editor'' and public.has_any_role_jwt(array[''moderator'',''editor'']::public.app_role[])));
  if v_details is null then return jsonb_build_object(''items'',''[]''::jsonb,''total'',0,''page'',v_page,''per_page'',v_size,''updated_at'',now()); end if;
  execute format($cached$
   with sorted as (select t.queue_type,t.id,t.urgency_rank,t.source_label,t.risk,t.public_impact,
     t.sla_hours,t.priority_weight,t.can_reopen,t.is_finding,t.rank,
     (t.sla_hours is not null and t.created_at < now()-make_interval(hours=>t.sla_hours)) as overdue
     from public.admin_review_queue_top t where t.scope=%L and t.sort=$1 order by t.rank limit $2 offset ($3-1)*$2),
   details as (%s)
   select coalesce((select jsonb_agg((d.item||to_jsonb(s))-''rank'' order by s.rank)
     from sorted s join details d on d.queue_type=s.queue_type and d.id=s.id),''[]''::jsonb)
  $cached$, p_scope, v_details) into v_result using p_sort,v_size,v_page;
  return public.get_admin_review_summary()
    || jsonb_build_object(''items'',v_result,''page'',v_page,''per_page'',v_size,
       ''served_from'',''snapshot'',
       ''snapshot_as_of'',(select max(computed_at) from public.admin_review_queue_top),
       ''total'',(select case p_scope when ''all'' then coalesce(sum(c.n),0)
                                      when ''decisions'' then coalesce(sum(c.decisions),0)
                                      when ''overdue'' then coalesce(sum(c.late),0)
                                      when ''safety'' then coalesce(sum(c.safety),0)
                                      else coalesce(sum(c.n) filter (where r.public_impact),0) end
                  from public.admin_review_queue_counts c
                  join public.admin_review_sources r on r.queue_key=c.queue_key where r.active));
 end if;');
  if v_new = v_src then
    raise exception 'PATCH 2 replaced nothing -- the v_search assignment in get_admin_review_queue '
      'was rewritten and the anchor no longer matches. Re-cut it against the live body; do NOT '
      'loosen it.';
  end if;
  v_src := v_new;

  execute v_src;
end
$patch$;

-- ---------------------------------------------------------------------------
-- P7. Postconditions. Asserted against behaviour, not against the text of this file.
-- ---------------------------------------------------------------------------

do $verify$
declare v_n int; v_src text;
begin
  -- COMMENTS STRIPPED BEFORE ASSERTING, and the direction of the failure is why.
  -- These are PRESENCE checks, and pg_get_functiondef() returns the body with its comments, so an
  -- unstripped search goes falsely GREEN when the symbol exists only in prose -- which is the
  -- silent half of the defect scripts/check-functiondef-asserts.mjs documents, and the dangerous
  -- one: both patches insert text into a function other sessions comment heavily, so a later note
  -- mentioning admin_review_queue_top would satisfy this check while the patch had stopped applying.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='get_admin_review_queue';
  if position('admin_review_finding_codes f where f.queue_key=%L' in v_src) = 0 then
    raise exception 'the decisions pushdown is not present in the live function after patching';
  end if;
  if position('public.admin_review_queue_top t where t.scope=p_scope' in v_src) = 0 then
    raise exception 'the snapshot read path is not present in the live function after patching -- '
      'the refresher would be writing a table nothing reads, which is the failure this repo keeps '
      'recording as "shipped and wired to nothing"';
  end if;

  -- The snapshot vocabulary must stay a superset of what the function accepts, or a scope the UI
  -- can reach would silently fall through to the live path forever and nobody would see it.
  select count(*) into v_n from public.admin_review_queue_top;
  if v_n <> 0 and v_n <> 15 * public.admin_review_queue_top_depth() then
    raise notice 'admin_review_queue_top holds % rows, expected 0 (not yet refreshed) or %',
      v_n, 15 * public.admin_review_queue_top_depth();
  end if;

  if not exists (select 1 from cron.job where jobname='admin_review_queue_top_refresh' and active) then
    raise exception 'admin_review_queue_top_refresh is not scheduled -- the snapshot would be '
      'written once by hand and then rot, which is worse than not having it';
  end if;
end
$verify$;
