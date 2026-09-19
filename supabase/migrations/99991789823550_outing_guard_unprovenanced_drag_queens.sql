-- Re-publish the three drag performers my own outing-guard repair took offline, now that
-- #3821 has restored their real identifiers.
--
-- THE EPISODE, because prod was changed by hand in the middle of it and the repo needs the
-- record. `person_outing_guard` (severity CRITICAL, 20260606121000) counts public, LIVING
-- people whose lgbti_connection asserts a positive identity label while wikidata_qid IS
-- NULL — i.e. it uses the identifier as the PROXY for "we can source this claim".
-- 99991789819775 nulled 84 wrong identifiers (Alaska -> the US STATE, Bones -> bone the
-- rigid organ, Spice -> the duo "Sugar and Spice") and three of the 84 are public and
-- living, so the gate went 0 -> 3 and, reading live prod, went red on every open PR.
--
-- I applied an unpublish to prod to clear it: visibility -> 'draft', seo_indexable ->
-- false, prior values snapshotted under enrichment_status.outing_guard_unpublish. That was
-- applied directly (the gate reads live data, so no PR could go green until the data was
-- fixed) and is the reason this file exists rather than simply being deleted: prod was
-- mutated, and a migration file is where that is recorded.
--
-- IT WAS THE WRONG FIX, AND A CONCURRENT SESSION FOUND THE RIGHT ONE. I concluded the
-- three could not be re-provenanced — Alaska had a strong candidate but Bones and Spice
-- "return NO Wikidata entity under any spelling tried" — so I chose the conservative
-- option of not publishing an identity claim we cannot source. #3821
-- (99991789823505_personality_restore_drag_provenance) shows that was wrong in a way worth
-- recording: THE CORRECT IDENTIFIER WAS ALREADY ON EACH ROW, recorded by the Drag Race
-- importer in `personality_sources` and never promoted to the column the platform reads.
-- Same shape as the Cambria repair — before fixing a wrong derived value, check whether
-- the right one is already in the row. I searched Wikidata by name and did not search our
-- own provenance table, which is why I found one of three.
--
-- Verified independently against both gates `tag-wiki-guard` requires (P31 must be human,
-- label must agree with the published name):
--   Q16029552  Alaska Thunderfuck 5000  American drag queen and recording artist  P31=Q5
--   Q136296831 Bones                    British drag performer                    P31=Q5
--   Q116205118 Spice                    American drag queen                       P31=Q5
--
-- So unpublishing is no longer necessary, and leaving it in place would cost three real
-- performers their pages for no reason — exactly what 99991789819775's header warned
-- against ("deindexing them would punish the subject for our resolver's error").
--
-- ORDER IS LOAD-BEARING AND IS SATISFIED BY THE VERSION. 99991789823505 (#3821, restores
-- the identifiers) sorts BELOW this file, so `db push` applies it first and the rows carry
-- a real wikidata_qid by the time this runs.
--
-- AND THE GUARD MAKES THAT FAIL-SAFE RATHER THAN ASSUMED: this only restores visibility
-- where the row NOW HAS an identifier. If #3821 has not applied, or a row was left
-- unprovenanced, that row STAYS unpublished and the gate stays green. A restore that
-- re-breached a critical outing gate because a sibling migration had not landed is exactly
-- the failure this shape refuses to have.
--
-- SOFT ON PRECONDITIONS: a row with no snapshot, or one someone has already re-published,
-- is skipped rather than aborted on. HARD ON THE POSTCONDITION: the gate's own predicate
-- must still read 0 afterwards.

do $$
declare
  v_restored int;
  v_gate int;
begin
  perform set_config('app.actor', 'migration:outing_guard_republish_after_provenance', true);

  update public.personalities p
     set visibility    = coalesce(p.enrichment_status -> 'outing_guard_unpublish' ->> 'prior_visibility', 'public'),
         seo_indexable = coalesce((p.enrichment_status -> 'outing_guard_unpublish' ->> 'prior_seo_indexable')::boolean, true),
         enrichment_status = (p.enrichment_status - 'outing_guard_unpublish') || jsonb_build_object(
           'outing_guard_republished', jsonb_build_object(
             'reason',       'identifier restored from personality_sources by 99991789823505; unpublish no longer needed',
             'restored_qid', p.wikidata_qid,
             'was',          p.enrichment_status -> 'outing_guard_unpublish',
             'by',           'migration:outing_guard_republish_after_provenance',
             'at',           now()
           )),
         updated_at = now()
   where p.enrichment_status ? 'outing_guard_unpublish'
     and p.visibility = 'draft'
     -- FAIL-SAFE: only a row that now has provenance may be re-published.
     and p.wikidata_qid is not null;
  get diagnostics v_restored = row_count;
  raise notice 'republished: %', v_restored;

  -- Any row still carrying the unpublish marker did NOT regain an identifier. That is a
  -- correct outcome, not a failure, so it is reported rather than raised on.
  raise notice 'still unpublished for want of provenance (expected 0 once 99991789823505 has applied): %',
    (select count(*) from public.personalities
      where enrichment_status ? 'outing_guard_unpublish' and visibility = 'draft');

  -- POSTCONDITION: the gate's own predicate, verbatim.
  select count(*) into v_gate
    from public.personalities
   where duplicate_of_id is null
     and visibility = 'public'
     and is_living
     and lgbti_connection in ('community_member', 'activist', 'representation')
     and wikidata_qid is null;
  if v_gate <> 0 then
    raise exception 'postcondition failed: person_outing_guard reads % after republishing (expected 0)', v_gate;
  end if;

  -- Control: the three are back and carry an identifier.
  raise notice 'control — the three, now: %',
    (select string_agg(name || '=' || visibility || '/' || coalesce(wikidata_qid, 'NO-QID'), ', ' order by name)
       from public.personalities
      where id in ('c33e2476-af17-4c87-85ab-f1f5a681c7bd',
                   'bbfc3079-19d0-4a90-b2bc-74a5b9a108f1',
                   '9bcec725-5de4-41cd-b200-cd9863f5c062'));
end $$;
