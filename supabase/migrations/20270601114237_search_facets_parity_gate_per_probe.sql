-- Give each parity probe its own statement_timeout budget.
--
-- THE GATE IS CORRECT AND STAYS CORRECT. Nothing here changes what is asserted,
-- which probes run, or the rule that an unreachable gate is not a passing gate.
-- The only change is how many top-level statements the work is split across.
--
-- WHAT WAS MEASURED (2026-09-05, 46 CI runs of trust-safety-gates.yml, timing the
-- search_facets_parity_failures POST from the job log):
--
--     p50 2.64 s   p90 6.07 s   p95 7.35 s   3 timeouts at 8.125 / 8.143 / 8.166 s
--
-- The three failures are `57014 canceling statement due to statement timeout`.
-- They land within 40 ms of each other because the wall is exactly 8 s — PostgREST
-- connects as `authenticator`, whose statement_timeout is 8 s (`service_role` has
-- no rolconfig of its own, so it inherits it; a direct psql session as service_role
-- gets the 2 min cluster default and therefore never reproduces this).
--
-- So this is NOT a rare pathology on a fast query. The whole distribution has
-- drifted up against the wall — 20260829045226 measured 1.63-1.73 s a week ago —
-- and p95 is now inside 9% of the limit. Every CI run is a coin toss weighted by
-- whatever else is hitting the database at that second, which is why the same
-- branch passed twice and failed twice on identical code within four minutes.
--
-- WHY IT IS SLOW, structurally: the no-arg function performs TEN calls to
-- search_hybrid / search_facets (3 probes x 2, plus 2 gated pairs x 2) inside ONE
-- top-level statement. Each of those scans public.search_documents — there is no
-- index on lower(city) for the gated probes, and the `p.q is null or sd.doc_id in
-- (select doc_id from match)` shape cannot drive an index scan — and four of them
-- additionally run an HNSW top-200 probe over the ~600 MB search_embeddings index.
-- Ten searches is roughly ten times the work of one user-facing query, charged
-- against a budget sized for one user-facing query.
--
-- WHAT WAS CONSIDERED AND REJECTED
--
-- * `alter function ... set statement_timeout` — a NO-OP, not a smaller fix. The
--   timer is armed once when the TOP-LEVEL statement starts; assigning the GUC from
--   inside a function that is already running does not re-arm it. Measured on prod
--   2026-08-19: `set local statement_timeout='5s'; perform pg_sleep(9);` completes
--   in 9.004 s with no cancel. Same for a function's SET clause — same mechanism.
--
-- * `alter role service_role set statement_timeout = '20s'` — this WOULD work, and
--   that is the problem. service_role is the key workers/search-proxy and ~40 edge
--   functions use. On a disk-constrained instance, widening it converts today's
--   "broad query fails fast, worker serves filler" into "broad query pins a pool
--   connection for 20 s". A CI gate must not buy its headroom out of production's.
--
-- * Dropping a probe — worth about 20% and costs coverage. Not needed: splitting
--   buys an order of magnitude, so the probe set is kept INTACT. Speed did not have
--   to be traded against what the gate can catch.
--
-- THE FIX: one probe per CALL. The caller loops, so each probe is its own top-level
-- statement with its own 8 s budget. Heaviest statement is `gated` at 4 searches
-- (~1.05 s at today's p50 rate) against 8 s — about 8x headroom, versus 1.0x today.
-- The 3.1x load spike that produced the observed timeouts would put it at ~3.3 s.
--
-- The probe set lives in ONE place (search_facets_parity_registry) and both entry
-- points read it, because "the same set built by hand in two places" is the exact
-- defect this whole gate exists to prevent recurring — see 20260829041548.
--
-- NO OVERLOAD, DELIBERATELY. The per-probe entry point gets its own NAME rather
-- than becoming search_facets_parity_failures(text). Adding a parameter to a
-- PostgREST-called function is how you get "Could not choose the best candidate
-- function"; a distinct name cannot collide, and it keeps the no-arg signature
-- byte-compatible so the currently-deployed script, the daily schedule and every
-- other open PR keep working unchanged while the client change lands separately.

-- 1. The probe registry — the single definition of the keyword/vector probes.
create or replace function public.search_facets_parity_registry()
returns table(probe text, q text, types text[], use_vec boolean)
language sql
immutable
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
  values ('hybrid:berghain'::text,  'berghain'::text, null::text[],            true),
         ('hybrid:naloxone'::text,  'naloxone'::text, null::text[],            true),
         ('keyword:bookshop'::text, 'bookshop'::text, array['venue']::text[],  false)
$fn$;

comment on function public.search_facets_parity_registry() is
  'Probe definitions for the search_facets/search_hybrid parity gate. Single source of truth — both search_facets_parity_probes() and search_facets_parity_probe_failures() read it.';

-- 2. The run order the caller iterates. `gated` is appended rather than held in the
--    registry because it takes no query text and runs a different comparison.
create or replace function public.search_facets_parity_probes()
returns table(probe text)
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
  select r.probe from public.search_facets_parity_registry() r
  union all
  select 'gated'::text
$fn$;

comment on function public.search_facets_parity_probes() is
  'Names of the parity probes, in run order. The CI gate iterates these and calls search_facets_parity_probe_failures() once per name so each probe gets its own statement_timeout. An empty result must be treated as a hard failure by the caller — a gate with no probes proves nothing.';

-- 3. One probe, one call, one statement budget.
create or replace function public.search_facets_parity_probe_failures(p_probe text)
returns table(probe text, hybrid_total bigint, facet_total bigint, detail text)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
  reg record;
  v extensions.vector;
  h bigint; f bigint;
  gated_city text;
  anon_h bigint; anon_f bigint;
  inc_h bigint;  inc_f bigint;
begin
  if p_probe is null then
    raise exception 'search_facets_parity_probe_failures: p_probe is required; call search_facets_parity_failures() to run every probe';
  end if;

  if p_probe <> 'gated' then
    select * into reg from public.search_facets_parity_registry() r where r.probe = p_probe;
    if not found then
      -- An unknown name means the caller and the registry have drifted. Report it
      -- as a failure rather than returning nothing, which would read as "in step".
      return query select p_probe, 0::bigint, 0::bigint,
        format('unknown probe %L — search_facets_parity_probes() is the registry', p_probe);
      return;
    end if;

    if reg.use_vec then
      -- A deterministic vector, chosen without hardcoding any content.
      select se.embedding into v
      from public.search_embeddings se
      where se.embedding is not null
      order by se.doc_id
      limit 1;

      -- VACUITY GUARD. With v null this probe silently degrades to keyword-only and
      -- stops exercising the vector arm — which is divergence (3) of 20260829041548,
      -- i.e. the thing it is here to catch. Say so instead of passing.
      if v is null then
        return query select p_probe, 0::bigint, 0::bigint,
          'no embedding row exists — the vector arm cannot be exercised, so this probe proves nothing'::text;
        return;
      end if;
    end if;

    select (public.search_hybrid(reg.q, v, reg.types, '{}'::jsonb,
                                 null, null, null, now(), 1, 0,
                                 null, null, null, null, null)->>'total')::bigint,
           coalesce((select sum(value::bigint)
                     from jsonb_each_text(
                       public.search_facets(reg.q, reg.types, '{}'::jsonb,
                                            null, null, null, now(), v)->'type')), 0)::bigint
      into h, f;

    if h <> f then
      return query select p_probe, h, f,
        format('search_facets counted %s candidates, search_hybrid.total counted %s', f, h);
    end if;
    return;
  end if;

  -- ── gated: anon vs include_gated, unchanged from 20260829045226 ───────────────
  select sd.city into gated_city
  from public.search_documents sd
  where sd.safety_gated and sd.city is not null
  group by sd.city
  order by count(*) desc, sd.city
  limit 1;

  if gated_city is null then
    return query select 'gated:probe'::text, 0::bigint, 0::bigint,
      'no safety_gated row carries a city — the gating probe cannot run, so this gate proves nothing'::text;
    return;
  end if;

  select (public.search_hybrid('', null, null, jsonb_build_object('city', gated_city),
                               null, null, null, now(), 1, 0,
                               null, null, null, null, null)->>'total')::bigint,
         coalesce((select sum(value::bigint) from jsonb_each_text(
           public.search_facets('', null, jsonb_build_object('city', gated_city),
                                null, null, null, now(), null)->'type')), 0)::bigint
    into anon_h, anon_f;

  select (public.search_hybrid('', null, null, jsonb_build_object('city', gated_city, 'include_gated', true),
                               null, null, null, now(), 1, 0,
                               null, null, null, null, null)->>'total')::bigint,
         coalesce((select sum(value::bigint) from jsonb_each_text(
           public.search_facets('', null, jsonb_build_object('city', gated_city, 'include_gated', true),
                                null, null, null, now(), null)->'type')), 0)::bigint
    into inc_h, inc_f;

  if anon_h <> anon_f then
    return query select 'gated:anon'::text, anon_h, anon_f,
      format('anon facets describe %s candidates in %s while anon results contain %s — gated content is leaking into the facet block',
             anon_f, gated_city, anon_h);
  end if;

  if inc_h <> inc_f then
    return query select 'gated:included'::text, inc_h, inc_f,
      format('include_gated facets (%s) disagree with include_gated results (%s) for %s', inc_f, inc_h, gated_city);
  end if;

  if inc_h <= anon_h then
    return query select 'gated:discrimination'::text, anon_h, inc_h,
      format('include_gated did not widen the set for %s (%s -> %s) — the gating probes are vacuous and prove nothing',
             gated_city, anon_h, inc_h);
  end if;
end
$fn$;

comment on function public.search_facets_parity_probe_failures(text) is
  'One parity probe per call, so each gets its own statement_timeout. Returns one row per disagreement between search_facets and search_hybrid about the candidate set; empty = in step. See 20260829041548 for the divergence this exists to prevent recurring.';

-- 4. The no-arg entry point keeps its exact signature and semantics — every probe,
--    same rows, same order — but is now a thin fan-out over the same registry, so
--    there is only one definition of each probe. It still runs as ONE statement and
--    so keeps the old timeout exposure; the CI gate calls the per-probe form.
create or replace function public.search_facets_parity_failures()
returns table(probe text, hybrid_total bigint, facet_total bigint, detail text)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
  select fail.probe, fail.hybrid_total, fail.facet_total, fail.detail
  from public.search_facets_parity_probes() p
  cross join lateral public.search_facets_parity_probe_failures(p.probe) fail
$fn$;

comment on function public.search_facets_parity_failures() is
  'Drift gate: returns one row per probe where search_facets and search_hybrid disagree about the candidate set. Empty result = in step. Runs every probe in ONE statement — prefer search_facets_parity_probes() + search_facets_parity_probe_failures() from CI, which splits the work across statements. See 20260829041548.';

revoke execute on function public.search_facets_parity_registry()            from public, anon;
revoke execute on function public.search_facets_parity_probes()              from public, anon;
revoke execute on function public.search_facets_parity_probe_failures(text)  from public, anon;
revoke execute on function public.search_facets_parity_failures()            from public, anon;
grant  execute on function public.search_facets_parity_registry()            to service_role;
grant  execute on function public.search_facets_parity_probes()              to service_role;
grant  execute on function public.search_facets_parity_probe_failures(text)  to service_role;
grant  execute on function public.search_facets_parity_failures()            to service_role;

-- Invoke before shipping. plpgsql only type-checks a RETURN QUERY when the function
-- is CALLED, which is how 20260829045147 shipped a numeric/bigint mismatch that
-- would have reported a divergence that does not exist on its first CI run.
do $verify$
declare n_probes int; n_fail int;
begin
  select count(*) into n_probes from public.search_facets_parity_probes();
  if n_probes = 0 then
    raise exception 'parity gate has no probes — a gate that checks nothing must not ship';
  end if;

  -- Exercises every per-probe body through the lateral fan-out.
  select count(*) into n_fail from public.search_facets_parity_failures();
  raise notice 'search_facets parity: % probes, % failures', n_probes, n_fail;
end
$verify$;
