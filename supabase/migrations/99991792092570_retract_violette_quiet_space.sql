-- Retract one ungrounded accessibility claim: violette-and-co / quiet-space.
--
-- WHY THIS IS A REGRESSION AND NOT A BACKLOG ITEM. 99991791030558 drove
-- venue_accessibility_evidence_signals().ungrounded_live_claims to 0 and
-- check-pipeline-health.mjs §20 records it as a zero-invariant that must never
-- be re-baselined. It reads 1 again. The row is from the 2026-09-14..17
-- auto-approve window 99991789843323 later sealed by making
-- run_review_queue_autoapprove honour review_field_registry.batchable -- the
-- review row is stamped `auto-approve: confidence 1.00 >= 0.90`, reviewed_at
-- 2026-09-14 15:32:00, reviewer_id null. So it is residue of that window that
-- 99991791030558's frozen 259-pair set did not cover, not a new producer
-- defect: the extractor guard (_shared/accessibility-evidence.ts) is intact.
--
-- WHY IT WAS INVISIBLE FOR A MONTH. check-pipeline-health.mjs is schedule-only
-- (`0 6 * * *`), so it gates no PR; and from 2026-10-13 its `Check pipeline
-- health` step was SKIPPED outright, because two TLS tests failed ahead of it
-- and that step has no continue-on-error. #4425 fixed the skip; this row is the
-- first thing the restored sentinel reported.
--
-- THE CLAIM IS RETRACTED, NOT RE-CITED, AND THE DISTINCTION IS MEASURED.
-- 99991791030558's rule is that an ungrounded citation does not by itself make
-- the CLAIM false -- it kept 4 of 263 by re-citing them to a supporting
-- sentence. So the venue's own text was asked the second question, and it says
-- nothing:
--
--   name         Violette and Co.
--   description  217 chars: "Librairie, café et espace associatif féministe et
--                LGBTQIA+ au 52 rue Jean-Pierre Timbaud, dans le 11e
--                arrondissement de Paris. Le site de Violette and Co publie son
--                programme de rencontres et ses informations d'accès."
--   tags         {queer-friendly}
--   citation     {"field":"accessibility","quote":"quiet..."}
--
-- `quiet` appears nowhere in the name, description or tags -- verified with
-- ilike against each -- and the stored quote is the fragment `quiet...`, which
-- is not a quotation of anything. There is no sentence to re-cite to, so the
-- claim goes.
--
-- WHY IT MATTERS MORE THAN ONE ROW SUGGESTS. 20260801150524 states the stake:
-- a wrong access claim is real-world harm. `quiet-space` is read by sensory-
-- sensitive and neurodivergent travellers; this told them a Paris bookshop-café
-- offers one on the strength of a model emitting `quiet...`. Honest absence is
-- strictly better.
--
-- accessibility_attributes becomes empty, which is correct and is asserted
-- below rather than assumed. The review row is deliberately left `approved` --
-- that IS what happened, and rewriting it to `rejected` would erase the
-- evidence of the auto-approve defect while gaining nothing, since the sentinel
-- keys on whether the slug is LIVE (99991791030558's rule). The retraction is
-- stamped on the row and content_revisions records the before/after, so it is
-- reversible from the row itself.

begin;

update public.venues v
set accessibility_attributes = (
      select coalesce(array_agg(a), '{}')
      from unnest(v.accessibility_attributes) a
      where a <> 'quiet-space'
    ),
    enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
      'accessibility_retracted', jsonb_build_object(
        'at', now(),
        'by', 'migration:99991792092570_retract_violette_quiet_space',
        'slugs', jsonb_build_array('quiet-space'),
        'reason', 'ungrounded_citation_and_unsupported_by_source',
        'detail', 'Auto-approved 2026-09-14 15:32 at confidence 1.00 with the citation {"field":"accessibility","quote":"quiet..."}. The word quiet appears in neither the name, the description nor the tags, so unlike the 4 claims 99991791030558 re-cited there is no supporting sentence to re-cite to.',
        'superseded_citation', jsonb_build_object('field', 'accessibility', 'quote', 'quiet...')
      )
    )
where v.slug = 'violette-and-co'
  and v.accessibility_attributes @> array['quiet-space']
  -- Content-guarded: if a human has since written real evidence for a quiet
  -- space into the description, this no-ops rather than deleting their work.
  and coalesce(v.description, '') not ilike '%quiet%'
  and coalesce(array_to_string(v.tags, ', '), '') not ilike '%quiet%';

do $verify$
declare
  v_live   int;
  v_sig    jsonb;
  v_stamp  jsonb;
  v_cohort int;
begin
  -- P1: the slug no longer publishes on that venue.
  select count(*) into v_live
  from public.venues
  where slug = 'violette-and-co' and accessibility_attributes @> array['quiet-space'];
  if v_live <> 0 then
    raise exception 'P1 failed: violette-and-co still publishes quiet-space (% rows)', v_live;
  end if;

  -- P2: the retraction is recorded on the row, so the removal is not silent.
  select enrichment_status -> 'accessibility_retracted' into v_stamp
  from public.venues where slug = 'violette-and-co';
  if v_stamp is null or v_stamp -> 'slugs' is null then
    raise exception 'P2 failed: no accessibility_retracted stamp on violette-and-co';
  end if;
  if coalesce(v_stamp ->> 'superseded_citation', '') = '' then
    raise exception 'P2b failed: the superseded citation was not preserved';
  end if;

  -- P3: call the gate's OWN predicate rather than restating it. A hand-written
  -- mirror of this one disagreed with the sentinel during diagnosis (it guessed
  -- enrichment_status for the citations, which live on entity_review_queue), so
  -- asserting against a restatement would prove nothing.
  select public.venue_accessibility_evidence_signals() into v_sig;
  if coalesce((v_sig ->> 'probe_ok')::boolean, false) is not true then
    raise exception 'P3 failed: evidence sentinel probe did not run';
  end if;
  if (v_sig ->> 'ungrounded_live_claims')::int <> 0 then
    raise exception 'P3 failed: ungrounded_live_claims = % (expected 0)',
      v_sig ->> 'ungrounded_live_claims';
  end if;

  -- P4: the zero is not vacuous. A sweep that emptied the cohort would also
  -- satisfy P3, so require the denominator to have survived.
  v_cohort := (v_sig ->> 'live_machine_claims')::int;
  if v_cohort < 700 then
    raise exception 'P4 failed: cohort collapsed to % machine claims — a zero over an empty cohort is not a clean corpus', v_cohort;
  end if;

  raise notice 'retract_violette_quiet_space: ungrounded 0, cohort % claims on % venues',
    v_cohort, v_sig ->> 'live_venues';
end $verify$;

commit;
