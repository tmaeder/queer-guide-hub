-- A venue-identity organization republished the location of the gated cruising
-- venue it sits above, to anonymous callers.
--
-- `venues.safety_gated` is `location_is_high_risk(country_id, city_id) OR
-- category = 'cruising'` (20261112100000). The second term exists because
-- publishing a cruising location to anonymous visitors is an outing exposure on
-- its own, whatever the local law says. `organizations.safety_gated` carried only
-- the geographic half -- `set_entity_safety_gated()` is shared by events, hotels,
-- milestones, organizations and queer_villages and is geography-only by design --
-- so a venue-identity org above a cruising venue in a non-criminalizing country
-- came out UNGATED while its venue was hidden.
--
-- Measured on prod: 55,520 live cruising venues, every one gated, and 55,335 of
-- them carry an ungated venue-identity organization. 55,334 of those orgs share
-- the venue's name, 55,066 carry an address, 51,087 carry coordinates and 50,586
-- carry coordinates BYTE-IDENTICAL to the gated venue's. Read as `anon` by id over
-- RLS, five sampled rows returned name, street address and exact lat/lng for
-- cruising venues in Porto Alegre, A Coruña, Vila Nova de Gaia, Padre Hurtado and
-- Den Haag -- public squares and toilets. The venue rows themselves returned 0 to
-- the same role in the same transaction, which is what identifies this as a bypass
-- of a working gate rather than a gate nobody had set.
--
-- SCOPE, STATED HONESTLY, BECAUSE IT DECIDES THE SEVERITY. The rendered UI does
-- NOT leak: `/organizations/:slug` was fetched from production for two of these
-- rows and the page renders chrome only, and the search indexer deliberately
-- excludes venue-identity orgs so only 31 of the 55,335 reach `search_documents`.
-- The exposure is the PostgREST layer, where the anon key is public by
-- construction and RLS is the whole boundary -- the same reason this repo gates
-- `profiles` by column grant rather than trusting RLS alone. It is enumerable, it
-- covers 55k cruising locations with coordinates, and `city_safety_gate_drift`
-- can never see it: that gate compares an org against the GEOGRAPHIC predicate,
-- and geographically these rows are correct.
--
-- MEASURED AND REJECTED: `inherit_primary_entity_location()` (the existing
-- BEFORE trigger on `primary_venue_id`) and `sync_entity_location_to_organization()`
-- (the existing venue->org syncer). Both already copy venue geography onto the org
-- and both looked like the cheap home for one more assignment. Both are
-- fill-if-empty with long early-bail chains -- `if not found then return new`, "only
-- when the org's address is empty", a 500 km city-distance guard. A gate that is
-- conditional on whether an address happened to be blank is the defect, not the
-- fix, so the gate stays its own concern with no bail conditions.
--
-- THE BACKFILL IS SELF-CHECKING AND DOES NOT SET THE ANSWER. It writes
-- `safety_gated = false` -- the value these rows ALREADY hold -- and lets the new
-- BEFORE trigger compute the truth (`UPDATE OF col` fires on the columns named in
-- the STATEMENT, not on what changed). So the repair and the producer are one
-- implementation that cannot disagree, and P1 becomes an end-to-end test of the
-- seal rather than of a hand-written UPDATE: if the seal is dead the rows stay
-- false and P1 fails loudly. Writing the value they already carry also means a
-- broken seal introduces no new exposure. Naming only `safety_gated` keeps
-- `aa_location_primary` (scoped to primary_venue_id, and it SELECTs from venues per
-- row) out of the hot path. Batched so no single statement is unbounded.
--
-- Direction is the SAFE one: this only ever gates MORE. Nothing a logged-out
-- visitor can reach today becomes unreachable, because the venue these rows
-- describe is already hidden from them.
do $mig$
declare
  v_before  bigint;
  v_after   bigint;
  v_touched bigint := 0;
  v_batch   bigint;
  v_bad     bigint;
  v_src     text;
  v_anchor  text := '  FROM review_holds h;';
  v_hits    int;
begin
  select count(*) into v_before
    from public.organizations o
    join public.venues v on v.id = o.primary_venue_id
   where coalesce(o.safety_gated, false) is false
     and v.duplicate_of_id is null and v.safety_gated is true;
  raise notice 'bypassed organizations before: %', v_before;

  -- 1. THE SEAL. Organizations-specific, so the generic function the other four
  -- tables share is untouched (asserted in P5).
  create or replace function public.set_org_safety_gated()
  returns trigger language plpgsql set search_path to 'public' as $fn$
  begin
    new.safety_gated :=
      public.location_is_high_risk(new.country_id, new.city_id)
      or exists (
        select 1 from public.venues v
         where v.id = new.primary_venue_id
           and v.duplicate_of_id is null
           and v.safety_gated is true
      );
    return new;
  end $fn$;

  -- Scope gains primary_venue_id (attaching or detaching a venue must re-decide the
  -- gate) and safety_gated (a direct write to the column self-heals, which is what
  -- the events trigger already does and what makes P4 a one-step proof). Name keeps
  -- sorting after aa_location_primary, which inherits the venue's geography in the
  -- same BEFORE pass.
  --
  -- The swap takes ACCESS EXCLUSIVE on a 100k-row table the search drain reads most
  -- of every minute, and a pending exclusive lock queues every NEW reader behind it.
  -- Bounded and retried rather than waited on: an unbounded wait stalls organizations
  -- site-wide, while a bare timeout turns a busy minute into a repo-wide db push abort.
  for i in 1..20 loop
    begin
      perform set_config('lock_timeout', '2s', true);
      drop trigger if exists trg_organizations_safety_gated on public.organizations;
      exit;
    exception when lock_not_available then
      if i = 20 then raise; end if;
      perform pg_sleep(2);
    end;
  end loop;
  perform set_config('lock_timeout', '0', true);
  create trigger trg_organizations_safety_gated
    before insert or update of country_id, city_id, primary_venue_id, safety_gated
    on public.organizations
    for each row execute function public.set_org_safety_gated();

  -- 2. PROPAGATION. Without this a venue reclassified to cruising later (the
  -- venue_category_reclassify cron does exactly that) gates the venue and leaves
  -- its org behind. Re-asserting primary_venue_id makes the org recompute through
  -- the seal, so un-gating falls back to the org's own geography for free.
  create or replace function public.propagate_venue_gate_to_organization()
  returns trigger language plpgsql security definer
  set search_path to 'public', 'pg_temp' as $fn$
  begin
    update public.organizations o
       set primary_venue_id = o.primary_venue_id
     where o.primary_venue_id = new.id
       and o.duplicate_of_id is null;
    return null;
  end $fn$;

  drop trigger if exists zzz_venue_gate_to_org on public.venues;
  create trigger zzz_venue_gate_to_org
    after update of safety_gated on public.venues
    for each row when (old.safety_gated is distinct from new.safety_gated)
    execute function public.propagate_venue_gate_to_organization();

  -- 3. BACKFILL through the seal, batched.
  loop
    with batch as (
      select o.id
        from public.organizations o
        join public.venues v on v.id = o.primary_venue_id
       where coalesce(o.safety_gated, false) is false
         and v.duplicate_of_id is null and v.safety_gated is true
       limit 5000
    )
    update public.organizations o
       set safety_gated = false
      from batch b where b.id = o.id;
    get diagnostics v_batch = row_count;
    exit when v_batch = 0;
    v_touched := v_touched + v_batch;
  end loop;
  raise notice 'backfill re-asserted % organization(s)', v_touched;

  -- 4. SENTINEL. A one-shot repair cannot keep a producer sealed, so the invariant
  -- joins the critical gate that already blocks every PR. Appended to the WRAPPER's
  -- UNION ALL rather than restating release_gate_checks_raw(), whose load-bearing
  -- `category = 'cruising'` term a full restatement has already re-reverted once
  -- (20261112100000 -> 20270309161544).
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_gate_checks';
  if v_src is null then
    raise exception 'precondition: public.release_gate_checks() not found';
  end if;

  if position('venue_identity_gate_bypass' in v_src) > 0 then
    raise notice 'venue_identity_gate_bypass gate already present -- skipping patch';
  else
    v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    if v_hits <> 1 then
      raise exception 'precondition: expected the holds tail anchor exactly once, found %', v_hits;
    end if;
    execute replace(v_src, v_anchor,
'  FROM review_holds h
  UNION ALL
  SELECT ''venue_identity_gate_bypass'', ''critical'', count(*)::bigint,
    jsonb_build_object(
      ''meaning'', ''ungated organizations above a gated venue -- republishes a hidden location'',
      ''cruising'', count(*) filter (where v.category::text = ''cruising''))
  FROM public.organizations o
  JOIN public.venues v ON v.id = o.primary_venue_id
  WHERE coalesce(o.safety_gated, false) IS FALSE
    AND v.duplicate_of_id IS NULL
    AND v.safety_gated IS TRUE;');
  end if;

  -- ===== POSTCONDITIONS =====

  -- P1: the bypass is closed. Zero-invariant: this is a safety gate and must never
  -- be given a ceiling in data-quality-gate-baseline.json.
  select count(*) into v_after
    from public.organizations o
    join public.venues v on v.id = o.primary_venue_id
   where coalesce(o.safety_gated, false) is false
     and v.duplicate_of_id is null and v.safety_gated is true;
  if v_after <> 0 then
    raise exception 'P1 failed: % organization(s) still ungated above a gated venue', v_after;
  end if;

  -- P2: it closed because rows were GATED, not because the cohort vanished. Without
  -- this, P1 also passes if the join stopped matching for an unrelated reason.
  if v_before > 0 and v_touched < v_before then
    raise exception 'P2 failed: % bypassed rows but only % re-asserted', v_before, v_touched;
  end if;

  -- P3: THE MIRROR, and the one that stops this being a sweep. Gating more is the
  -- safe direction but gating EVERYTHING would also satisfy P1. An org whose venue
  -- is not gated and whose own geography is safe must still be ungated, so the
  -- population of ungated orgs has to stay large.
  select count(*) into v_bad from public.organizations where coalesce(safety_gated,false) is false;
  if v_bad < 30000 then
    raise exception 'P3 failed: only % ungated organizations remain -- over-gated', v_bad;
  end if;

  -- P4: the seal is LIVE, proven behaviourally rather than by reading its source. A
  -- source-text check cannot tell a live trigger from a dropped one.
  declare
    v_probe_org uuid;
    v_gated     boolean;
  begin
    select o.id into v_probe_org
      from public.organizations o
      join public.venues v on v.id = o.primary_venue_id
     where v.safety_gated is true and v.duplicate_of_id is null
     limit 1;
    if v_probe_org is null then
      raise exception 'P4 failed: no probe row available';
    end if;
    -- Writing FALSE directly must come back TRUE: the seal corrects it in the same
    -- statement. A source-text check cannot tell a live trigger from a dropped one.
    update public.organizations set safety_gated = false where id = v_probe_org;
    select safety_gated into v_gated from public.organizations where id = v_probe_org;
    if v_gated is not true then
      raise exception 'P4 failed: seal did not re-gate the probe org (reads %)', v_gated;
    end if;
  end;

  -- P5: the generic function the other four tables share was NOT redefined. If
  -- set_entity_safety_gated had gained a primary_venue_id reference it would break
  -- events, hotels, milestones and queer_villages, none of which have that column.
  select count(*) into v_bad
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'public' and p.proname = 'set_entity_safety_gated' and not t.tgisinternal;
  if v_bad <> 4 then
    raise exception 'P5 failed: set_entity_safety_gated now has % triggers (expected 4)', v_bad;
  end if;
  -- Strips comments BEFORE asserting. pg_get_functiondef() returns the body
  -- INCLUDING its comments, so an unstripped assertion matches the prose
  -- explaining a symbol rather than the code -- and these very migrations
  -- quote `cruising` and `primary_venue_id` in their own text. The PATCH reads
  -- above deliberately keep comments: stripping there would delete the
  -- function's own documentation when the patched body is re-executed.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_entity_safety_gated';
  if position('primary_venue_id' in v_src) > 0 then
    raise exception 'P5 failed: the shared gate function now references primary_venue_id';
  end if;

  -- P6: the new gate EXECUTES and reads zero. A SQL function can be created and
  -- still fail when called, so a successful patch is not evidence the gate runs.
  select failures into v_bad from public.release_gate_checks()
   where gate = 'venue_identity_gate_bypass';
  if v_bad is distinct from 0::bigint then
    raise exception 'P6 failed: venue_identity_gate_bypass reads %', v_bad;
  end if;

  -- P7: the pre-existing gates survived the patch.
  select count(*) into v_bad from public.release_gate_checks()
   where gate in ('city_safety_gate_drift','city_safety_review_holds','news_category_coverage');
  if v_bad <> 3 then
    raise exception 'P7 failed: patched release_gate_checks() lost a gate (% of 3)', v_bad;
  end if;
  select failures into v_bad from public.release_gate_checks() where gate='city_safety_gate_drift';
  if v_bad is distinct from 0::bigint then
    raise exception 'P7 failed: city_safety_gate_drift regressed to %', v_bad;
  end if;

  raise notice 'org venue gate inheritance: all postconditions passed (% re-asserted)', v_touched;
end
$mig$;
