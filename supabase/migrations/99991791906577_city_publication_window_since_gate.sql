-- The gate I shipped an hour ago would have failed its own health check tomorrow morning.
--
-- `99991791903202` made publication conditional on an external identifier and watched it with
-- `city_publication_signals().published_without_identity_recent`, counted over "cities created in
-- the last 2 days". That window STRADDLES the deploy. Measured immediately after the merge: 2,679
-- of 2,780 cities inside it were published without an identifier -- every one of them created
-- BEFORE the gate existed, by a resolver that could not have gated them. `check-pipeline-health.mjs`
-- runs on a schedule (`0 6 * * *`), so tomorrow's 06:00Z pass would have hard-failed and named a
-- number the gate is not responsible for.
--
-- That is the failure mode the same migration's own header argues against twice -- it is why
-- `cohort_total` was made advisory, "because gating on a level that cannot be driven to zero by
-- this change ships red on arrival and gets scrolled past". I then put a straddling window on the
-- key that DOES gate. A zero-invariant whose first scheduled run is red teaches its readers to
-- ignore it, which is worse than not having it.
--
-- THE WINDOW NOW STARTS AT THE GATE. The lower bound is
-- `greatest(now() - interval '2 days', <gate install>)`, so the invariant only ever counts rows the
-- gate could have governed, and the rolling 2-day ceiling still keeps it from becoming an unbounded
-- backlog counter.
--
-- WHERE THE INSTALL MOMENT COMES FROM, since nothing records it: `supabase_migrations
-- .schema_migrations` has columns version / statements / name / created_by / idempotency_key /
-- rollback and NO timestamp, and `pg_proc` has no creation time either. But this repo's migration
-- versions are `9999` + ten digits of Unix epoch seconds (scripts/next-migration-version.mjs), so
-- the version IS the timestamp: `substr('99991791903202', 5)::bigint` = 1791903202 =
-- 2026-10-13 14:53:22+00, verified against `now()` on prod. It is written here as that one
-- derivation rather than a bare literal so the next reader can check it rather than trust it.
--
-- It is a constant and that is correct: the moment the gate began applying is a fact about the
-- past and will not change on a rebuild. Pinning it is not the thing the guard test forbids --
-- that ban is on pinning a measured COUNT, which moves with the corpus.
--
-- `gate_since` IS REPORTED IN THE OUTPUT, not just used. A count without its window is the shape
-- this whole subsystem keeps getting wrong: a reader who cannot see which rows were counted cannot
-- tell a clean gate from a narrow one.
--
-- MEASURED AT WRITE TIME: since 14:53:22Z the geocoder has created 0 cities, so
-- `created_since_gate` is 0 and the health section's `made === 0` branch WARNS that the gate is
-- UNTESTED rather than reporting a pass. That is the honest reading and it is what this change
-- makes visible -- the straddling window was hiding it behind 2,780 pre-gate rows.

create or replace function public.city_publication_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  with gate as (
    -- 99991791903202, the migration that put the gate on city_resolve_or_create. See the header:
    -- the version's trailing ten digits are Unix epoch seconds.
    select to_timestamp(substr('99991791903202', 5)::bigint) as since
  ),
  recent as (
    select c.seo_indexable,
           (c.wikidata_qid is not null or c.wikipedia_title is not null) as has_identity
    from public.cities c, gate g
    where c.duplicate_of_id is null
      -- Rolling 2 days, but never reaching back past the gate: a row the gate could not have
      -- governed is not evidence about the gate.
      and c.created_at >= greatest(now() - interval '2 days', g.since)
  )
  select jsonb_build_object(
    'probe_ok', true,
    -- The window, before anything counted inside it.
    'gate_since', (select since from gate),
    -- Denominators first: a zero above an empty denominator is not a clean gate.
    'created_recent', (select count(*) from recent),
    'created_recent_with_identity', (select count(*) from recent where has_identity),
    -- The invariant, now scoped to rows the gate could have governed.
    'published_without_identity_recent',
      (select count(*) from recent where seo_indexable and not has_identity),
    -- Context, never gated: the standing cohort predates the gate and falls only as
    -- city_qid_gap_link works through it or a human dispositions it.
    'cohort_total',
      (select count(*) from public.cities
        where duplicate_of_id is null and seo_indexable
          and wikidata_qid is null and wikipedia_title is null),
    -- Proof the gate is on the function rather than on a comment about it.
    'resolver_sets_seo_indexable',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'city_resolve_or_create'
          and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
              ilike '%field_provenance, seo_indexable)%')
  );
$fn$;

-- CREATE OR REPLACE preserves privileges, but restating them is what keeps a later rewrite from
-- silently widening the grant -- and the mirror below asserts it rather than assuming.
revoke all on function public.city_publication_signals() from public;
revoke all on function public.city_publication_signals() from anon, authenticated;
grant execute on function public.city_publication_signals() to service_role;

do $verify$
declare
  v_sig    jsonb;
  v_since  timestamptz;
  v_src    text;
begin
  v_sig := public.city_publication_signals();

  -- P1: the sentinel answers and now states its own window.
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'P1 failed: city_publication_signals did not answer';
  end if;
  if not (v_sig ? 'gate_since') then
    raise exception 'P1 failed: the sentinel does not report the window it counted over';
  end if;

  -- P2: the window starts at the gate, not two days before it. Asserted as a RELATIONSHIP against
  -- the version's own epoch rather than against a pinned date, so it survives a clock change.
  v_since := (v_sig->>'gate_since')::timestamptz;
  if v_since is distinct from to_timestamp(substr('99991791903202', 5)::bigint) then
    raise exception 'P2 failed: gate_since is % but the gate landed at %',
      v_since, to_timestamp(substr('99991791903202', 5)::bigint);
  end if;

  -- P3: BEHAVIOURAL. No row created before the gate may be inside the window. This is the whole
  -- point: the straddling window counted 2,679 such rows, and a source-text check cannot tell a
  -- live bound from a dead one.
  if exists (
    select 1 from public.cities
    where duplicate_of_id is null
      and created_at < to_timestamp(substr('99991791903202', 5)::bigint)
      and created_at >= greatest(now() - interval '2 days',
                                 to_timestamp(substr('99991791903202', 5)::bigint))
  ) then
    raise exception 'P3 failed: the window still reaches back past the gate';
  end if;

  -- P4: MIRROR, and it is what stops the fix from becoming a way to never report anything. The
  -- 2-day ceiling must still be there -- without it this becomes an all-time counter that can
  -- never return to zero, which is the advisory shape cohort_total already occupies.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'city_publication_signals';
  if position('greatest(now() - interval ''2 days''' in v_src) = 0 then
    raise exception 'P4 failed: the rolling 2-day ceiling is gone, so this is an all-time counter';
  end if;
  if position('field_provenance, seo_indexable)' in v_src) = 0 then
    raise exception 'P4 failed: the sentinel can no longer see the gate it exists to watch';
  end if;

  -- P5: still service_role only. CREATE OR REPLACE keeps privileges, so this asserts the restated
  -- grants did not widen anything.
  if has_function_privilege('anon', 'public.city_publication_signals()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.city_publication_signals()', 'EXECUTE') then
    raise exception 'P5 failed: city_publication_signals is reachable by anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.city_publication_signals()', 'EXECUTE') then
    raise exception 'P5 failed: service_role lost execute, so the health check cannot read it';
  end if;

  raise notice 'city publication window anchored at the gate: %', v_sig;
end
$verify$;
