-- Three living people were left publicly labelled with an LGBTI identity and no
-- provenance, by my own migration 99991789819775 an hour earlier.
--
-- WHAT HAPPENED. `person_outing_guard` (20260606121000, severity CRITICAL) counts:
--
--   personalities WHERE duplicate_of_id IS NULL AND visibility = 'public'
--     AND is_living AND lgbti_connection IN ('community_member','activist','representation')
--     AND wikidata_qid IS NULL
--
-- i.e. it uses `wikidata_qid` as the PROXY for "we can source this claim". The
-- not-a-person sweep nulled 84 wrong identifiers — Alaska -> the US STATE, Bones ->
-- bone the rigid organ, Spice -> the duo "Sugar and Spice" — and three of those 84 are
-- public, living, and carry a positive identity label. Nulling the identifier therefore
-- did not merely remove a wrong fact, it REMOVED THE PROVENANCE THAT LICENSED
-- PUBLISHING AN IDENTITY CLAIM ABOUT A LIVING PERSON. The gate went 0 -> 3 and, because
-- it reads live prod, went red on every open PR in the repository.
--
-- That sweep's header said "nothing else is touched — deindexing them would punish the
-- subject for our resolver's error." That reasoning was right about not over-reacting and
-- WRONG about the blast radius: it enumerated what it wrote, not what READ the column it
-- cleared. The rule this file adds to the pile: before clearing a column, grep for what
-- CONSUMES it — here a critical safety gate did, one table away.
--
-- WHY NOT RESTORE THE IDENTIFIERS. They are Q797 (a US state), Q265868 (a bone) and
-- Q116761079 (a different act). Restoring provenance by re-asserting a falsehood is worse
-- than having none: the weekly enrichment passes rebuild facts FROM the identifier.
--
-- WHY NOT RESOLVE THEM HERE, WHICH IS THE OBVIOUS FIX. Alaska has a strong candidate —
-- Q16029552, "Alaska Thunderfuck 5000", resolved live, P31 = Q5 (human), a Drag Race
-- contestant, which agrees with this row's own `dragrace-wikipedia-2026-06-19` source.
-- It is recorded below FOR A HUMAN and deliberately NOT adopted. Bones and Spice return
-- NO Wikidata entity under any spelling tried. Asserting an identity for a living person
-- to make a CI gate green is exactly the move the adult-links tier exists to prevent —
-- that gate's own history includes a plausible-looking link whose sources turned out to
-- name a footballer. A name match plus a profession is not corroboration.
--
-- WHY NOT WIDEN THE GATE, WHICH WOULD ALSO GO GREEN. All three DO hold real provenance:
-- a `dragrace-wikipedia-2026-06-19` source row, i.e. they are documented Drag Race
-- contestants. So the gate's `wikidata_qid IS NULL` test is an UNDER-APPROXIMATION of
-- provenance and arguably should consult `personality_sources`. That may well be the
-- right change — and it is a change to a CRITICAL outing-safety gate, made while it is
-- red, to make it stop being red. Loosening a safety threshold to clear CI is the one
-- move this repo's own notes forbid by name. It is left for a human, stated not hidden.
--
-- WHAT THIS DOES INSTEAD: stops publishing the claim, reversibly. visibility -> 'draft'
-- and seo_indexable -> false, the soft-archive convention (20260607400000) rather than a
-- delete. The prior values are recorded so `unpromote`-style restoration is one UPDATE.
-- This errs toward not publishing an identity claim we cannot source, which is the
-- conservative side of an outing call, and it costs three drag performers' pages a few
-- hours of visibility rather than costing the subjects a claim we cannot stand behind.
--
-- IT ALSO CLEANS THE CONTAMINATED SOURCE ROWS, which the first sweep missed: Alaska's
-- `is_primary` source row points at wikidata Q797 (the US state) and its wikipedia row at
-- /wiki/Alaska; Bones' point at Q265868 and /wiki/Bone. Nulling `personalities.wikidata_qid`
-- left those standing — the same "nulling an identifier does not unpublish what it
-- produced" rule this repo records for tag prose, one table over. The genuine
-- `dragrace-wikipedia-2026-06-19` rows are KEPT: that provenance is correct and is the
-- evidence a human will use to re-resolve these three.
--
-- SOFT ON PRECONDITIONS: keyed by id AND by the exact cleared QID recorded by the sweep,
-- so a row a concurrent session has already re-resolved is skipped rather than unpublished.
-- HARD ON THE POSTCONDITION: the gate's own predicate must read 0.

do $$
declare
  v_unpublished int;
  v_sources_removed int;
  v_gate int;
begin
  perform set_config('app.actor', 'migration:outing_guard_unprovenanced_drag_queens', true);

  create temporary table _outed (id uuid, nm text, cleared_qid text, candidate text) on commit drop;
  insert into _outed (id, nm, cleared_qid, candidate) values
    ('c33e2476-af17-4c87-85ab-f1f5a681c7bd'::uuid, 'Alaska', 'Q797',
     'Q16029552 (Alaska Thunderfuck 5000, P31=Q5, American drag queen) — NOT adopted, for a human to confirm'),
    ('bbfc3079-19d0-4a90-b2bc-74a5b9a108f1'::uuid, 'Bones', 'Q265868',
     'no Wikidata entity found under any spelling tried'),
    ('9bcec725-5de4-41cd-b200-cd9863f5c062'::uuid, 'Spice', 'Q116761079',
     'no Wikidata entity found; the cleared QID was the duo "Sugar and Spice", not this performer');

  -- 1. Stop publishing the unprovenanced identity claim, reversibly.
  update public.personalities p
     set visibility    = 'draft',
         seo_indexable = false,
         needs_attention = true,
         enrichment_status = coalesce(p.enrichment_status, '{}'::jsonb) || jsonb_build_object(
           'outing_guard_unpublish', jsonb_build_object(
             'prior_visibility',    p.visibility,
             'prior_seo_indexable', p.seo_indexable,
             'reason',              'person_outing_guard: public living person with a positive lgbti_connection and no wikidata_qid, after 99991789819775 cleared a wrong identifier',
             'cleared_qid',         o.cleared_qid,
             'candidate_for_human', o.candidate,
             'retained_provenance', 'personality_sources.source_slug = dragrace-wikipedia-2026-06-19',
             'by',                  'migration:outing_guard_unprovenanced_drag_queens',
             'at',                  now()
           )),
         updated_at = now()
    from _outed o
   where p.id = o.id
     and p.wikidata_qid is null                 -- still unprovenanced
     and p.visibility = 'public'                -- still published
     and p.enrichment_status -> 'wikidata_repair' ->> 'cleared_qid' = o.cleared_qid;
  get diagnostics v_unpublished = row_count;
  raise notice 'unpublished: % of 3', v_unpublished;

  -- 2. Remove the source rows that point at the disowned entity. The dragrace
  --    provenance is deliberately kept.
  delete from public.personality_sources s
   using _outed o
   where s.personality_id = o.id
     and s.source_slug in ('wikidata', 'wikipedia');
  get diagnostics v_sources_removed = row_count;
  raise notice 'contaminated source rows removed: %', v_sources_removed;

  -- 3. POSTCONDITION: the gate's own predicate, verbatim, must be zero.
  select count(*) into v_gate
    from public.personalities
   where duplicate_of_id is null
     and visibility = 'public'
     and is_living
     and lgbti_connection in ('community_member', 'activist', 'representation')
     and wikidata_qid is null;
  if v_gate <> 0 then
    raise exception 'postcondition failed: person_outing_guard still reads % (expected 0)', v_gate;
  end if;

  -- 4. Control: this must not have unpublished the corpus. If the public, living,
  --    identity-labelled population collapses, the predicate was wrong.
  raise notice 'control — public living people with a positive lgbti_connection still published: %',
    (select count(*) from public.personalities
      where duplicate_of_id is null and visibility = 'public' and is_living
        and lgbti_connection in ('community_member','activist','representation'));

  -- 5. Control: the retained provenance is still there, so a human can re-resolve.
  raise notice 'control — dragrace provenance rows retained for the three: %',
    (select count(*) from public.personality_sources s join _outed o on o.id = s.personality_id
      where s.source_slug = 'dragrace-wikipedia-2026-06-19');
end $$;
