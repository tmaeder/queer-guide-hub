-- A deliberate safety hold on a venue-identity organization is recognised by its
-- LINK to the held venue, not by `needs_attention`.
--
-- `20261015170028` introduced `review_holds` so a geography review could detach an
-- unsupported country/city link while deliberately retaining the safety gate, and
-- its header states the premise it rested on: "venues are nonindexed and flagged
-- for attention, and linked ORGANIZATIONS are flagged for attention." That premise
-- was true when written and `99991792261855` (org_needs_attention_venue_identity,
-- 2026-10-17) falsified it on purpose: the 02:50 recompute now flags
-- `completeness < 40 AND NOT venue_identity`, because a venue-identity org's
-- description/website/phone live on the venue by design and flagging the org
-- double-counted the venue's own `needs_attention`. That was the right call and is
-- NOT reverted here.
--
-- What nothing re-examined is the surface that READ the flag. The org arm of
-- `review_holds` used `o.needs_attention IS TRUE` as its proof-of-deliberateness,
-- so the moment the recompute stopped flagging venue-identity orgs the holds
-- stopped being recognised. Measured on prod: at 2026-10-19 02:50:00.252418+00 the
-- recompute flipped `needs_attention` true -> false on exactly these seven orgs, one
-- changed field each, `actor_kind = system` -- named from `content_revisions`, not
-- inferred from the producer I suspected. `city_safety_gate_drift` is CRITICAL, so
-- from that minute it reported 7 and redded EVERY open PR in the repo (#4514 at
-- 06:08Z, #4515 at 07:40Z -- both dead-code-removal diffs that cannot touch a data
-- gate, which is what identifies the failure as prod state rather than either PR).
-- This is the documented class: a fix that changes a shared signal has not changed
-- the surfaces that read it; enumerate the readers.
--
-- THE SEVEN ARE OVER-GATED, WHICH IS THE SAFE DIRECTION, AND THEY MUST STAY GATED.
-- All seven are venue-identity orgs (`roles = {venue}`, `primary_venue_id` set) whose
-- parent venue is itself `safety_gated` and under review, and one of those venues is
-- in SYRIA (`lgbti_criminalization->>'legal' = 'false'`). Measured: 7 over-gated, and
-- **0 organizations under-gated corpus-wide**, so there is no outing exposure to
-- repair -- the data is already in the safe state. Un-gating them to satisfy the
-- gate would publish a venue-identity record, and through `primary_venue_id` a
-- pointer to a gated venue, in exactly the shape the safety layer exists to prevent.
--
-- MEASURED AND REJECTED: deriving the org's geography from its venue. Six of the
-- seven parent venues carry NO country or city either (they are the same
-- geography-under-review cohort the venue arm already holds), so there is nothing to
-- derive for six of seven and it would invent a producer for one.
-- MEASURED AND REJECTED: writing `needs_attention` back onto the seven. The 02:50
-- recompute would clear it again the same night -- a data write a cron undoes nightly
-- is not a fix -- and it re-overloads a completeness signal with gate semantics,
-- which is the coupling that caused this.
--
-- So the fix is the gate predicate, and it RESTORES the stated intent rather than
-- widening it: the header already said "LINKED organizations", and
-- `needs_attention` was only the proxy available for that linkage. The structural
-- arm tests the linkage itself. The `needs_attention` arm is KEPT, so an org held
-- that way for any other reason still counts.
--
-- SAFETY ARGUMENT, and it is why this cannot hide an outing exposure: BOTH arms sit
-- under `o.safety_gated IS TRUE`, so the subtraction can only ever remove an
-- OVER-gated row. An under-gated org -- `safety_gated` false in a criminalizing
-- country, the direction that exposes people -- can never match either arm and is
-- still reported by the critical gate at full weight. Asserted below in both
-- directions, and the live gate was additionally proven to still CATCH a synthetic
-- under-gated org in a rolled-back transaction before merge.
--
-- Blast radius, measured: the old arm matched 0 orgs, the new arm matches exactly 7
-- (the seven named above) out of 1,706 gated and 100,064 total organizations.
--
-- Patched via `pg_get_functiondef()` with an exactly-once anchor rather than
-- restated: `release_gate_checks_raw` in this family carries a load-bearing
-- `category = 'cruising'` term that a full restatement has already re-reverted once
-- (20261112100000 -> 20270309161544), and the wrapper's own newest file is named
-- "reassert" for the same reason. No count is pinned: the cohort can legitimately
-- move between authoring and apply, so the postconditions assert the reached STATE
-- and the structural invariants, never a total.
do $mig$
declare
  v_src    text;
  v_anchor text :=
'         AND o.needs_attention IS TRUE) AS organization_count';
  v_repl   text :=
'         AND (
           o.needs_attention IS TRUE
           OR EXISTS (
             SELECT 1 FROM public.venues pv
              WHERE pv.id = o.primary_venue_id
                AND pv.duplicate_of_id IS NULL
                AND pv.safety_gated IS TRUE
           )
         )) AS organization_count';
  v_hits   int;
  v_bad    bigint;
  v_detail jsonb;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_gate_checks';

  if v_src is null then
    raise exception 'precondition: public.release_gate_checks() not found';
  end if;

  -- Soft on preconditions: already patched (a sibling session, or a re-run) is a
  -- no-op, never an abort. An exact-match premise here would take `db push` -- and
  -- therefore every migration queued behind it -- down for the whole repo.
  if position(v_repl in v_src) > 0 then
    raise notice 'org venue-identity safety hold already present -- skipping patch';
  else
    v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    if v_hits <> 1 then
      raise exception
        'precondition: expected the organization hold anchor exactly once, found %', v_hits;
    end if;
    execute replace(v_src, v_anchor, v_repl);
  end if;

  -- P1: the critical safety gate is clean. Zero-tolerance by design -- this gate has
  -- no entry in data-quality-gate-baseline.json and must never be given one.
  select failures, detail into v_bad, v_detail
    from public.release_gate_checks() where gate = 'city_safety_gate_drift';
  if v_bad is distinct from 0::bigint then
    raise exception 'P1 failed: city_safety_gate_drift = % (detail %)', v_bad, v_detail;
  end if;

  -- P2: and it is clean because the holds were RECOGNISED, not because the gate
  -- stopped measuring. The organizations key of the holds gate must now be positive;
  -- without this, P1 also passes against a patch that subtracts nothing because the
  -- drift itself vanished for an unrelated reason.
  select (detail->>'organizations')::bigint into v_bad
    from public.release_gate_checks() where gate = 'city_safety_review_holds';
  if coalesce(v_bad, 0) <= 0 then
    raise exception 'P2 failed: city_safety_review_holds reports % organizations', v_bad;
  end if;

  -- P3: THE SAFETY INVARIANT, measured independently of the gate so a broken gate
  -- cannot satisfy it. No organization may be under-gated: visible while its own or
  -- its city's country criminalizes. Predicate copied from the body of
  -- release_gate_checks_raw so the two cannot diverge.
  with hr as (
    select cp.place_id as country_id
      from public.geo_country_profiles cp
     where (cp.lgbti_criminalization->>'legal') = 'false'
        or lower(coalesce(cp.lgbti_criminalization->>'death_penalty','')) = 'yes'
  ), cc as (
    select gp.id, gp.country_id from public.geo_places gp where gp.place_type = 'city'
  )
  select count(*) into v_bad
    from public.organizations o
    left join cc on cc.id = o.city_id
   where coalesce(o.safety_gated, false) is false
     and coalesce(o.country_id, cc.country_id) in (select country_id from hr);
  if v_bad <> 0 then
    raise exception 'P3 failed: % organization(s) UNDER-gated in a criminalizing country', v_bad;
  end if;

  -- P4: every row the hold arm subtracts must itself be a genuine OVER-gate. The
  -- arm removes rows from a CRITICAL safety count, so the failure mode to guard is
  -- it subtracting a row that is not drift at all -- that would mask real drift
  -- elsewhere by the same amount. Replicates the arm verbatim and asks whether any
  -- matched row's DERIVED gate is true, i.e. whether it was correctly gated and
  -- therefore never drift. It pins the geography terms as well as the gated term:
  -- drop `country_id IS NULL` and an org correctly gated by a criminalizing country
  -- becomes subtractable, and this check fails.
  --
  -- An earlier draft asserted the mirror instead -- that no UNGATED org matches the
  -- arm's other conditions -- and it FAILED ON CORRECT CODE, reporting 7. Those 7
  -- are six international bodies with no venue at all (matched via `needs_attention`
  -- and correctly ungated, having no location) plus one draft org. The assertion was
  -- wider than the claim: the arm itself requires `o.safety_gated IS TRUE`, so it can
  -- never match an ungated row, and removing that term to "test the mirror" tested a
  -- different population. Scope an assertion to the half of the statement it is about.
  with hr as (
    select cp.place_id as country_id
      from public.geo_country_profiles cp
     where (cp.lgbti_criminalization->>'legal') = 'false'
        or lower(coalesce(cp.lgbti_criminalization->>'death_penalty','')) = 'yes'
  ), cc as (
    select gp.id, gp.country_id from public.geo_places gp where gp.place_type = 'city'
  )
  select count(*) into v_bad
    from public.organizations o
    left join cc on cc.id = o.city_id
   where o.safety_gated is true
     and o.country_id is null and o.city_id is null
     and (o.needs_attention is true
          or exists (select 1 from public.venues pv
                      where pv.id = o.primary_venue_id
                        and pv.duplicate_of_id is null
                        and pv.safety_gated is true))
     and coalesce(coalesce(o.country_id, cc.country_id) in (select country_id from hr), false) is true;
  if v_bad <> 0 then
    raise exception 'P4 failed: hold arm would subtract % correctly-gated (non-drift) org(s)', v_bad;
  end if;

  -- P5: the patch replaced one predicate and gutted nothing else. Assert the parts of
  -- the wrapper a careless restatement loses -- including the venue arm's own
  -- `cruising` exclusion, whose sibling term in release_gate_checks_raw has been
  -- re-reverted by a full restatement before.
  -- Strips comments BEFORE asserting. pg_get_functiondef() returns the body
  -- INCLUDING its comments, so an unstripped assertion matches the prose
  -- explaining a symbol rather than the code -- and these very migrations
  -- quote `cruising` and `primary_venue_id` in their own text. The PATCH reads
  -- above deliberately keep comments: stripping there would delete the
  -- function's own documentation when the patched body is re-executed.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_gate_checks';
  if position('o.safety_gated IS TRUE' in v_src) = 0
     or position('pv.safety_gated IS TRUE' in v_src) = 0
     or position('o.needs_attention IS TRUE' in v_src) = 0
     or position('news_category_coverage' in v_src) = 0
     or position('city_safety_review_holds' in v_src) = 0
     or position($q$coalesce(v.category::text, '') <> 'cruising'$q$ in v_src) = 0 then
    raise exception 'P5 failed: patched release_gate_checks() lost a load-bearing clause';
  end if;

  -- P6: it EXECUTES. A SQL function can be created and still fail when called, so a
  -- successful CREATE OR REPLACE is not evidence the gate runs.
  select count(*) into v_bad from public.release_gate_checks();
  if v_bad <= 0 then
    raise exception 'P6 failed: release_gate_checks() returned no rows';
  end if;

  raise notice 'org venue-identity safety hold: all postconditions passed (% gates)', v_bad;
end
$mig$;
