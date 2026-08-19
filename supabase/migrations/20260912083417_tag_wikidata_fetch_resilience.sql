-- Both weekly Wikidata tag crons abort on the FIRST slow HTTP chunk.
--
-- WHAT FAILED
--
--   tag_wikidata_hierarchy  0 5 * * 1  run_tag_wikidata_hierarchy(p_chunk=45)
--     2026-08-03 + 2026-08-17, consecutive_failures=2
--     ERROR: Operation timed out after 10000 milliseconds with 532768 bytes received
--   tag_medical_codes_sync  30 5 * * 1  run_tag_medical_codes_sync(p_chunk=45)
--     2026-08-17, consecutive_failures=1
--     ERROR: HTTP request cancelled
--
-- Both died inside the same statement: a single `create temp table _fetch as
-- select ... extensions.http_get(...) ... from grp`, which issues ~34 requests
-- (1,521 distinct active QIDs / 45) INLINE inside one SELECT. `http_get` RAISES
-- on a curl timeout, so one slow chunk out of 34 takes down the entire run —
-- including the ~33 chunks that already succeeded. auto_pause_threshold is 3,
-- so the hierarchy job was one bad Monday away from pausing itself.
--
-- The `api_errors` counter both functions already return was UNREACHABLE dead
-- code: `select count(*) from _fetch where raw is null` can only observe a null
-- that `http_get` never produces, because the failure path is an exception, not
-- a null. Every run was therefore all-or-nothing with no partial-failure state.
--
-- THE TIMEOUT THAT MATTERS IS NOT THE ONE IN THE CODE
--
-- Both functions open with `set local statement_timeout = '240s'`. That line
-- does NOTHING. statement_timeout is armed once, when the TOP-LEVEL statement
-- starts; assigning the GUC from inside a function that is already running does
-- not re-arm the timer. Measured on prod:
--
--   do $$ ... set local statement_timeout='5s'; perform pg_sleep(9); ... $$
--   -> completes in 9.004s, no cancel.
--
-- So the real ceiling was the cluster default, `statement_timeout = 2min`, and
-- the evidence matches exactly: tag_medical_codes_sync ran 05:30:00.281 ->
-- 05:32:00.285, i.e. 120.004s, and its "HTTP request cancelled" is the http
-- extension observing that cancel — not a curl timeout at all. Its CURLOPT_
-- TIMEOUT is 15s and no single request ever hit it.
--
-- Two different faults wearing the same stack trace: hierarchy hit curl's 10s
-- timeout, medical hit the 120s statement ceiling. Both are fixed below, and
-- neither would have been fixed by tuning the number the code appears to set.
--
-- THE FIX
--
--   1. `wikidata_entities_fetch(ids)` wraps the call and returns NULL on any
--      failure, so a bad chunk becomes a counted `api_errors` row (the counter
--      finally means something) instead of killing the run. One retry, because
--      the observed failure is a transient stall: a healthy chunk is 1.4-2.0 MB
--      in ~1.5s (measured over chunks 0-2 on prod), while the 2026-08-17 miss
--      managed 532 KB in 10s — ~53 KB/s, a stall rather than a size problem.
--      curl's own LOW_SPEED_LIMIT/LOW_SPEED_TIME would be the precise tool, but
--      pgsql-http refuses them: "curl option 'CURLOPT_LOW_SPEED_LIMIT' is not
--      available for run-time configuration". Only TIMEOUT, TIMEOUT_MS,
--      CONNECTTIMEOUT(_MS), TCP_KEEPALIVE and USERAGENT are settable, so a
--      whole-request timeout plus a retry is the available approximation.
--
--   2. The fan-out becomes a PL/pgSQL LOOP, one request per statement, so a
--      failure is contained to its chunk and the bodies are parsed into `_ent`
--      as they arrive — the ~55 MB of raw JSON is no longer held in a temp
--      table on a disk-constrained DB.
--
--   3. The budget is DERIVED from the statement_timeout actually in force
--      (`current_setting`), not hardcoded, and the loop stops admitting new
--      requests one reserve short of it. A hardcoded budget is what created
--      this bug: the code believed it had 240s while the server was going to
--      cancel it at 120.
--
--   4. The pg_cron commands raise statement_timeout to 600s BEFORE the call —
--      the only place it can be raised, since (per above) the function cannot
--      raise its own. Normal cost is ~50s of fetching, so 600s means the
--      budget cut-off is a genuine emergency brake rather than routine
--      truncation. That matters because truncation is NOT neutral: chunks are
--      ordered by QID, so a run that stops early always drops the SAME tail
--      tags, forever.
--
-- Both crons stay type='rpc' with no action->>'command', so branch (c2) of
-- sync_automations_to_cron (command drift) does not apply and will not rewrite
-- these commands back. The projector keys tracking off jobname and treats any
-- command without `admin_automation_run_begin` as Family C, which both still
-- are — so run recording is unaffected.

-- ---------------------------------------------------------------------------
-- 1. The failure-tolerant fetch
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose. Called only from the two SECURITY DEFINER
-- functions below, it already runs as their owner; making it DEFINER would add
-- a second privileged surface for no gain. It also takes the QID list, never a
-- URL: `public` still has DEFAULT PRIVILEGES granting EXECUTE on new functions
-- to anon/authenticated, so a definer-mode arbitrary-URL fetcher in this schema
-- would be anon-reachable SSRF the moment it is created. Revoked below anyway.
create or replace function public.wikidata_entities_fetch(p_ids text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_url  text;
  v_body text;
begin
  if p_ids is null or btrim(p_ids) = '' then return null; end if;

  v_url := 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids='
           || p_ids || '&props=claims&format=json';

  for i in 1..2 loop
    begin
      select (extensions.http_get(v_url)).content into v_body;
      -- An API-level error body ({"error":...}) or an HTML interstitial is a
      -- miss, not a payload; the callers only ever read `.entities`.
      if v_body is not null and left(v_body, 1) = '{' then return v_body; end if;
    exception
      -- A real cancel (statement_timeout, pg_cancel_backend, shutdown) must
      -- propagate. Swallowing it would let the loop keep running past a
      -- deadline the server has already enforced.
      when query_canceled or admin_shutdown then raise;
      when others then null;   -- transient: fall through to the retry
    end;
  end loop;

  return null;
end $$;

comment on function public.wikidata_entities_fetch(text) is
  'Fetch wbgetentities claims for a pipe-joined QID list. Returns NULL on any failure (one retry) so a caller can count it instead of aborting.';

revoke execute on function public.wikidata_entities_fetch(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Shared budget helper
-- ---------------------------------------------------------------------------
-- Returns the wall-clock instant after which a long fan-out must stop issuing
-- requests, derived from the statement_timeout ACTUALLY in force. '0' means no
-- timeout, in which case 10 minutes is the self-imposed cap.
--
-- p_reserve, not a fraction of the limit: the deadline is checked BEFORE a
-- request, so the last request admitted still runs to completion afterwards.
-- The reserve has to cover that worst case (2 attempts x CURLOPT_TIMEOUT = 40s)
-- plus the post-fetch parse/insert work (~10s measured), or the run gets
-- cancelled by the very ceiling the deadline exists to respect. A fraction
-- cannot express that: 70% of 600s leaves 180s of slack, 70% of the 120s
-- default leaves 36s — less than one stalled request.
create or replace function public.http_fanout_deadline(p_reserve interval default '100 seconds')
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare v_limit interval;
begin
  begin
    v_limit := nullif(current_setting('statement_timeout'), '0')::interval;
  exception when others then
    v_limit := null;
  end;
  if v_limit is null or v_limit <= interval '0' then
    v_limit := interval '10 minutes';
  end if;
  -- Under a ceiling smaller than the reserve, fetch almost nothing rather than
  -- go negative — a truncated run is recoverable, a cancelled one is not.
  return clock_timestamp() + greatest(v_limit - p_reserve, v_limit * 0.25);
end $$;

revoke execute on function public.http_fanout_deadline(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. run_tag_wikidata_hierarchy — same signature, same return shape
-- ---------------------------------------------------------------------------
create or replace function public.run_tag_wikidata_hierarchy(p_chunk int default 45)
returns table (edges_inserted int, candidates int, skipped_cycle int, ambiguous_parents int, api_errors int)
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int := 0; v_cyc int := 0; v_ambig int := 0; v_apierr int := 0; v_cand int := 0;
  v_deadline timestamptz;
  v_raw text;
  r record;
begin
  perform public.assert_admin_or_internal();
  -- NOT `set local statement_timeout` — see the header: it is a no-op here.
  v_deadline := public.http_fanout_deadline(interval '100 seconds');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT', 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)');

  create temp table _map on commit drop as
    select wikidata_id as qid, (array_agg(id order by id))[1] as tag_id, count(*) as c
    from public.unified_tags
    where status = 'active' and wikidata_id ~ '^Q[0-9]+$'
    group by wikidata_id;
  select count(*) into v_ambig from _map where c > 1;
  delete from _map where c > 1;

  -- One request per statement. A chunk that fails is counted and skipped; the
  -- run continues. Bodies are parsed on arrival rather than stockpiled.
  create temp table _ent (qid text, entity jsonb) on commit drop;

  for r in
    with ids as (select qid, (row_number() over (order by qid) - 1) as rn from _map)
    select rn / greatest(p_chunk, 1) as g, string_agg(qid, '|' order by qid) as ids
    from ids group by rn / greatest(p_chunk, 1) order by 1
  loop
    if clock_timestamp() > v_deadline then
      v_apierr := v_apierr + 1;
      continue;
    end if;

    v_raw := public.wikidata_entities_fetch(r.ids);
    if v_raw is null then
      v_apierr := v_apierr + 1;
      continue;
    end if;

    begin
      insert into _ent (qid, entity)
      select e.key, e.value from jsonb_each((v_raw::jsonb) -> 'entities') e;
    exception when others then
      v_apierr := v_apierr + 1;
    end;
  end loop;

  create index on _ent (qid);

  create temp table _cand on commit drop as
    select child_tag, parent_tag, max(conf) as conf
    from (
      select cm.tag_id as child_tag, pm.tag_id as parent_tag,
             case when x.prop = 'P279' then 0.95 else 0.85 end as conf
      from _ent e
      join _map cm on cm.qid = e.qid
      cross join lateral (
        select 'P279' as prop, jsonb_path_query(e.entity, '$.claims.P279[*].mainsnak.datavalue.value') as v
        union all
        select 'P361',          jsonb_path_query(e.entity, '$.claims.P361[*].mainsnak.datavalue.value')
      ) x
      join _map pm on pm.qid = (x.v ->> 'id')
      where pm.tag_id <> cm.tag_id
    ) s
    group by child_tag, parent_tag;
  select count(*) into v_cand from _cand;

  for r in select child_tag, parent_tag, conf from _cand loop
    begin
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (r.child_tag, r.parent_tag, 'broader', r.conf, 'auto')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
      if found then v_inserted := v_inserted + 1; end if;
    exception when others then
      v_cyc := v_cyc + 1;
    end;
  end loop;

  return query select v_inserted, v_cand, v_cyc, v_ambig, v_apierr;
end $$;

-- ---------------------------------------------------------------------------
-- 4. run_tag_medical_codes_sync — same signature, same return shape
-- ---------------------------------------------------------------------------
create or replace function public.run_tag_medical_codes_sync(p_chunk int default 45)
returns table (codes_inserted int, codes_refreshed int, codes_removed int, codes_rejected int,
               tags_matched int, systems_hit int, ambiguous_qids int, api_errors int)
language plpgsql security definer set search_path = public as $$
declare
  v_ins int := 0; v_ref int := 0; v_del int := 0; v_rej int := 0;
  v_tags int := 0; v_sys int := 0; v_ambig int := 0; v_apierr int := 0;
  v_started timestamptz := now();
  v_deadline timestamptz;
  v_raw text;
  r record;
begin
  perform public.assert_admin_or_internal();
  v_deadline := public.http_fanout_deadline(interval '100 seconds');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT',
    'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)');

  create temp table _map on commit drop as
    select wikidata_id as qid, (array_agg(id order by id))[1] as tag_id, count(*) as c
    from public.unified_tags
    where status = 'active' and wikidata_id ~ '^Q[0-9]+$'
    group by wikidata_id;
  select count(*) into v_ambig from _map where c > 1;
  delete from _map where c > 1;

  create temp table _sys on commit drop as
    select slug, wikidata_property, link_property, code_pattern
    from public.medical_code_systems
    where enabled and wikidata_property is not null;

  create temp table _ent (qid text, claims jsonb) on commit drop;

  for r in
    with ids as (select qid, (row_number() over (order by qid) - 1) as rn from _map)
    select rn / greatest(p_chunk, 1) as g, string_agg(qid, '|' order by qid) as ids
    from ids group by rn / greatest(p_chunk, 1) order by 1
  loop
    if clock_timestamp() > v_deadline then
      v_apierr := v_apierr + 1;
      continue;
    end if;

    v_raw := public.wikidata_entities_fetch(r.ids);
    if v_raw is null then
      v_apierr := v_apierr + 1;
      continue;
    end if;

    begin
      insert into _ent (qid, claims)
      select e.key, e.value -> 'claims' from jsonb_each((v_raw::jsonb) -> 'entities') e;
    exception when others then
      v_apierr := v_apierr + 1;
    end;
  end loop;

  create index on _ent (qid);

  -- Retraction is scoped to tags we actually SAW this run. A chunk that failed
  -- contributes no _ent rows, so its tags are absent from _covered and their
  -- existing codes are left alone — a missed fetch must never read as "Wikidata
  -- dropped this code". That property is why partial runs are safe at all.
  create temp table _covered on commit drop as
    select distinct m.tag_id from _map m join _ent e on e.qid = m.qid;

  create temp table _codes on commit drop as
    select tag_id, system_slug, code, min(link_code) as link_code
    from (
      select m.tag_id,
             s.slug as system_slug,
             st -> 'mainsnak' -> 'datavalue' ->> 'value' as code,
             case when s.link_property is null then null else (
               select case when count(*) = 1
                           then min(lk -> 'mainsnak' -> 'datavalue' ->> 'value') end
               from jsonb_array_elements(coalesce(e.claims -> s.link_property, '[]'::jsonb)) lk
               where coalesce(lk ->> 'rank', 'normal') <> 'deprecated'
                 and lk -> 'mainsnak' ->> 'snaktype' = 'value'
             ) end as link_code
      from _map m
      join _ent e on e.qid = m.qid
      cross join _sys s
      cross join lateral jsonb_array_elements(
        coalesce(e.claims -> s.wikidata_property, '[]'::jsonb)
      ) st
      where coalesce(st ->> 'rank', 'normal') <> 'deprecated'
        and st -> 'mainsnak' ->> 'snaktype' = 'value'
    ) x
    where code is not null and btrim(code) <> ''
    group by tag_id, system_slug, code;

  select count(*) into v_rej
  from _codes c join _sys s on s.slug = c.system_slug
  where s.code_pattern is not null and c.code !~ s.code_pattern;

  delete from _codes c using _sys s
  where s.slug = c.system_slug and s.code_pattern is not null and c.code !~ s.code_pattern;

  update _codes c set link_code = null
  where c.link_code is not null
    and (select count(*) from _codes c2
         where c2.tag_id = c.tag_id and c2.system_slug = c.system_slug) > 1;

  select count(distinct tag_id), count(distinct system_slug) into v_tags, v_sys from _codes;

  insert into public.tag_medical_codes (tag_id, system_slug, code, link_code, source)
  select tag_id, system_slug, code, link_code, 'wikidata' from _codes
  on conflict (tag_id, system_slug, code) do update
    set last_seen_at = now(),
        link_code = excluded.link_code;
  get diagnostics v_ins = row_count;

  select count(*) into v_ref
  from public.tag_medical_codes
  where source = 'wikidata' and last_seen_at >= v_started and first_seen_at < v_started;
  v_ins := v_ins - v_ref;

  with gone as (
    delete from public.tag_medical_codes t
    where t.source = 'wikidata'
      and t.tag_id in (select tag_id from _covered)
      and t.system_slug in (select slug from _sys)
      and not exists (
        select 1 from _codes c
        where c.tag_id = t.tag_id and c.system_slug = t.system_slug and c.code = t.code
      )
    returning 1
  )
  select count(*) into v_del from gone;

  return query select v_ins, v_ref, v_del, v_rej, v_tags, v_sys, v_ambig, v_apierr;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Give the crons a ceiling the function cannot give itself
-- ---------------------------------------------------------------------------
-- pg_cron runs the whole command string in one transaction via the simple query
-- protocol, so a leading SET is in force when the SELECT that follows it is
-- armed. This is the ONLY layer that can raise statement_timeout for these runs.
do $$
declare
  v_id bigint;
  v_job record;
begin
  for v_job in
    select * from (values
      ('tag_wikidata_hierarchy', ' set statement_timeout = ''600s''; select public.run_tag_wikidata_hierarchy(); '),
      ('tag_medical_codes_sync', ' set statement_timeout = ''600s''; select public.run_tag_medical_codes_sync(); ')
    ) as t(jobname, command)
  loop
    select jobid into v_id from cron.job where jobname = v_job.jobname;
    if v_id is not null then
      perform cron.alter_job(v_id, command => v_job.command);
    end if;
  end loop;
end $$;

-- Both jobs are one failure away from auto_pause_threshold=3 for a fault that
-- was never theirs. Clear the counters so the next green run is not racing a
-- pause it did not earn.
update public.admin_automations
set consecutive_failures = 0
where slug in ('tag_wikidata_hierarchy', 'tag_medical_codes_sync')
  and consecutive_failures > 0;
