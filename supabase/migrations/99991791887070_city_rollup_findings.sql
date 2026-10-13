-- Three city codes are derived roll-ups, not decisions.
--
-- 99991791872772 split the review queue into DECISIONS and detector FINDINGS, and deliberately
-- under-reached: a row counted as a finding only where it says a field is empty. Everything else
-- stayed a decision on the stated ground that "a human genuinely could decide each one".
--
-- Reading the producers shows that ground is false for three of them. `run_city_quality_issue_sync`
-- is a MIRROR of `city_quality_profile.issue_codes`, not a backlog: it re-inserts from the view on
-- every run and auto-resolves rows whose signal cleared. Measured on prod, of 20,583 CITY_* rows
-- ever created, 826 have left the queue and ALL 826 were cleared by the machine
-- (`resolution = 'quality_signal_cleared'`, `resolved_by` NULL). No human has ever decided one, and
-- a human verdict is not a mechanism here -- the partial unique index covers `status='pending'`
-- only, so a row a human resolved gets a FRESH pending row on the next sync while its signal holds.
--
-- The test applied, which is narrower than "does the queue action change the record" (that test
-- would make every event-quality row a finding, including the dedup and image pairs that genuinely
-- need eyes): CAN A HUMAN LOOKING AT THIS ROW PRODUCE INFORMATION THE MACHINE DOES NOT ALREADY
-- HAVE? Read off the view's own predicates:
--
--   CITY_IDENTITY_AMBIGUOUS      seo_indexable AND wikidata_qid IS NULL AND wikipedia_title IS NULL
--                                -> No. A human cannot invent an identifier. Resolving one against
--                                   Wikidata is `city_qid_gap_link`'s job and is a live engine.
--                                   The name misleads: this is a missing-field detector, the same
--                                   shape as business-quality's `description_missing_or_thin`.
--   CITY_CATEGORY_UNCLASSIFIED   category_other_count / categorized_entity_count > 0.20
--                                -> No. A ratio over CHILD venues. The decision is on the children,
--                                   and that backlog has its own engine and its own sentinel
--                                   (`venue_category_signals().mappable_still_other`).
--   CITY_LINK_UNRESOLVED         unlinked_venue_candidates + unlinked_event_candidates > 0
--                                -> No, and this one DOUBLE-COUNTS: it is a roll-up of candidates
--                                   that already appear individually as the `venue_link_candidate`
--                                   rows, which stay decisions. One city row stands for N pair rows.
--
-- DELIBERATELY NOT RECLASSIFIED, and asserted below so a later sweep cannot take them quietly:
--   NAMED_VENUE_UNLINKED (the largest remaining block) stays a DECISION. A human genuinely can
--     answer "is the 'The Eagle' this event names the 'The Eagle' we hold?" -- that is the namesake
--     judgement the linker refuses by design, and its gate is already name_exact AND <500 m with a
--     measured 0.12% live error rate, so the answer is not to loosen the producer.
--   CITY_LIFECYCLE_UNRESOLVED stays a DECISION: "is this a real place?" needs a human, and
--     `archive_city_as_nonplace` is the action that exists for it.
--   CITY_IMAGE_* and the *_REUSED / DEDUP / merge codes stay DECISIONS: a human looks and decides.
--
-- NO COUNT IS PINNED. The corpus moves between measuring and applying -- the category code read
-- 6,484 in review_queue and 6,483 through the view minutes later -- so every postcondition asserts
-- a RELATIONSHIP (non-empty, partitions, mirror survives), never a total.

insert into public.admin_review_finding_codes (queue_key, code, subtitle_match, note) values
  ('general-review', 'CITY_IDENTITY_AMBIGUOUS', 'city identity ambiguous',
   'Indexable city with neither wikidata_qid nor wikipedia_title. A missing-identifier detector, '
   'not an adjudication; resolving it is city_qid_gap_link''s work.'),
  ('general-review', 'CITY_CATEGORY_UNCLASSIFIED', 'city category unclassified',
   'Over 20% of this city''s categorized venues sit at category=other. A ratio over child rows; '
   'the decision belongs to the venue category reclassifier.'),
  ('general-review', 'CITY_LINK_UNRESOLVED', 'city link unresolved',
   'Count of unlinked venue/event candidates > 0. A roll-up of the venue_link_candidate rows, '
   'which remain decisions -- so counting this as one too double-counts the same work.')
on conflict (queue_key, code) do update
  set subtitle_match = excluded.subtitle_match, note = excluded.note;

do $verify$
declare
  v_bad   integer;
  v_res   jsonb;
  v_names text;
begin
  -- P1: every code seeded here must match live rows. A typo in subtitle_match classifies NOTHING
  -- and is otherwise silent -- the join simply never fires and the number does not move.
  select count(*) into v_bad
  from (values ('city identity ambiguous'), ('city category unclassified'),
               ('city link unresolved')) as s(sub)
  where not exists (
    select 1 from public.admin_review_src_general_review g where g.subtitle = s.sub
  );
  if v_bad <> 0 then
    raise exception 'P1 failed: % seeded subtitle(s) match no live row', v_bad;
  end if;

  -- P2: the three must now read as findings through the registry join the function uses.
  select count(*) into v_bad
  from (values ('city identity ambiguous'), ('city category unclassified'),
               ('city link unresolved')) as s(sub)
  where not exists (
    select 1 from public.admin_review_finding_codes f
    where f.queue_key = 'general-review' and f.subtitle_match = s.sub
  );
  if v_bad <> 0 then
    raise exception 'P2 failed: % of the three are not registered as findings', v_bad;
  end if;

  -- P3: MIRROR. The codes that must stay decisions must NOT be registered. Without this an
  -- over-reaching sweep that classified the whole queue would satisfy P1 and P2 untouched.
  select string_agg(s.sub, ', ') into v_names
  from (values ('NAMED_VENUE_UNLINKED'), ('city lifecycle unresolved'), ('city image reused'),
               ('city image flagged'), ('city image ambiguous'), ('city ghost has live children'),
               ('city description reused'), ('venue link candidate'), ('merge candidate'),
               ('date mismatch')) as s(sub)
  where exists (
    select 1 from public.admin_review_finding_codes f where f.subtitle_match = s.sub
  );
  if v_names is not null then
    raise exception 'P3 failed: these must remain decisions but are registered as findings: %',
      v_names;
  end if;

  -- P4: the two populations must still partition the queue exactly, and NEITHER may be empty --
  -- zero findings means the registry matched nothing, zero decisions means the classification
  -- swallowed the queue, and a presence-only check passes in both of those states.
  perform set_config('request.jwt.claims', '{"user_role":"admin","role":"authenticated"}', true);
  v_res := public.get_admin_review_queue(null, null, null, 'priority', 1, 1, 'decisions');
  if (v_res->>'decisions_total')::bigint + (v_res->>'findings_total')::bigint
       <> (v_res->>'all_total')::bigint then
    raise exception 'P4 failed: % decisions + % findings <> % total',
      v_res->>'decisions_total', v_res->>'findings_total', v_res->>'all_total';
  end if;
  if (v_res->>'findings_total')::bigint <= 0 or (v_res->>'decisions_total')::bigint <= 0 then
    raise exception 'P4 failed: degenerate split, decisions=% findings=%',
      v_res->>'decisions_total', v_res->>'findings_total';
  end if;

  -- P5: the scope filter must actually follow the classification, or the headline is relabelled
  -- while the list still leads with detector output.
  if (v_res->>'total')::bigint <> (v_res->>'decisions_total')::bigint then
    raise exception 'P5 failed: scope=decisions returned % against decisions_total %',
      v_res->>'total', v_res->>'decisions_total';
  end if;

  raise notice 'city roll-up findings registered: decisions=% findings=% total=%',
    v_res->>'decisions_total', v_res->>'findings_total', v_res->>'all_total';
end
$verify$;
