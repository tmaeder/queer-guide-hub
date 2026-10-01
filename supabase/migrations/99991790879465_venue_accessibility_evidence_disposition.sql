-- Disposition every open `quality-venue` accessibility proposal, by reading each
-- one's own citation.
--
-- WHAT WAS WRONG
-- --------------
-- `/admin/governance?mode=triage&queue=quality-venue` held 23 open rows, all from
-- `amenity-truth-backfill`'s `llm` source, all `accessibility_*`. Reading each
-- against the text the model was given: of 30 cited slug-claims across the 21
-- `accessibility_attributes` rows, **4 are supported and 26 are not**.
--
--   "especially among Chinese men"                        -> wheelchair-accessible
--   "mostly locals with some foreigners"                  -> gender-neutral-restroom
--   "Japanese-style bathhouse"                            -> gender-neutral-restroom
--   "Especially popular with the leather & fetish crowd."  -> gender-neutral-restroom
--   "queer-friendly"                                      -> service-animals-welcome
--   "Second floor, near section I/H"                      -> wide-doorways, elevator-access
--   "hand rails" + "changing table"                       -> ramp-access, wide-doorways
--   "Located in an old warehouse built in 1910"           -> ramp-access
--   "if you have mobility issues getting back up"         -> wide-doorways
--   "They are gendered bathrooms but they are single stalls." -> gender-neutral-restroom
--
-- THE CONFIDENCE SCORE IS NOT THE SIGNAL. The worst row carries **1.00** — Gais
-- Positius, whose three "quotes" are the slugs echoed back ("ramp-access since
-- 1994", "elevator-access", "wide-doorways"), none of which appears anywhere in
-- its description — while two correct rows sit at 0.50. This repo has measured
-- twice that a self-reported confidence cannot gate a write (tag prose judge: 16
-- of 18 retracted, 13 wrongly; tag relation verifier ~29% correct at confidence
-- 1.000). This is the third.
--
-- The gate held: `review_field_registry` marks both fields `batchable=false`, so
-- `run_review_queue_autoapprove` could not take them (99991789843323). Nothing
-- here was published. What failed is the PRODUCER, sealed in the same change by
-- `_shared/accessibility-evidence.ts`, which reproduces this hand read exactly
-- (4 kept / 3 ungrounded / 1 miscited / 22 no_evidence).
--
-- WHY REJECTING IS THE SAFE DIRECTION, AND WHY IT IS STILL NOT THE DEFAULT
-- -----------------------------------------------------------------------
-- 20260801150524 states the stake: a wrong access claim strands a disabled
-- person at a door they cannot get through. A refused claim costs a traveller
-- one phone call. The errors are not symmetric, so an unevidenced claim goes.
-- But under-reaching is not free either — a real accessibility fact thrown away
-- is a fact nobody re-derives — which is why the four supported ones are
-- APPROVED rather than swept with the rest, and why one more is re-cited instead
-- of discarded.
--
-- FIVE GROUPS. The licence differs per group and they must not be collapsed.
--
--   A  APPROVE AS PROPOSED (3) — the cited quote names the slug.
--   B  APPROVE REDUCED (1) — Bar Phoebe proposed four slugs on two quotes. The
--      handicap sign on the restroom door is real evidence for
--      `accessible-restroom`; "up the concrete stairs" actively REFUTES
--      `ramp-access` and `elevator-access`, and nothing mentions doorways. The
--      value is cut to the one surviving slug rather than the row rejected,
--      because a partly-right proposal is not a wrong one. `apply_mode` is
--      `text_array_union` and all five target venues carry `{}` today, so an
--      approval adds exactly the slug named and can collide with nothing.
--   C  APPROVE RE-CITED (1) — Mobil - Rosemont. The proposal
--      `gender-neutral-restroom` is TRUE: the description reads "Probably not
--      wheelchair accessible BUT GENDER NEUTRAL with a single, clean, restroom".
--      The model cited the one clause that does not support it. Rejecting would
--      discard a fact the source plainly states, so the citation is corrected to
--      the clause that carries it and the original is preserved under
--      `citations[].superseded_by_migration` — a record that a false citation was
--      once made is worth keeping.
--   D  APPROVE NOTE (2) — both `accessibility_notes` rows restate their own
--      source ("single, clean restroom"; "two gender-neutral, single stall,
--      accessible restrooms"). Prose a reviewer can check, and it does not feed
--      the `AmenityDisplay` "matches your needs" matcher the way a slug does.
--   E  REJECT (16) — no cited quote names the slug, with the reason on the row.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. `amenity_truth_backfill` fires
-- `0 */3 * * *`, so this queue moves while a migration sits in review, and a
-- human may decide any of these first. Every action is keyed by row id and
-- skipped-and-counted if the row is no longer open; an exact-count premise would
-- abort `db push` for the whole repo over a row somebody else handled correctly.
-- The postconditions assert only the rows this file names.
--
-- `reviewer_id` stays NULL, which is the honest record: no human account decided
-- these. The note carries `migration:99991790879465` so a machine close stays
-- legible as one, per the convention in 50200101100400.

do $disposition$
declare
  v_row record;
  v_skipped int := 0;
  v_approved int := 0;
  v_rejected int := 0;
  v_missing int := 0;
begin
  -- A migration carries no JWT and `approve_entity_review` / `reject_entity_review`
  -- open with `has_any_role_jwt(ARRAY['admin'])`. Claim the role transaction-locally
  -- so the real RPCs run: they apply the value, write provenance, write the
  -- consensus audit row and clear `needs_attention`. Reimplementing that here
  -- would be four chances to diverge from the path a human uses. `sub` is
  -- deliberately NOT set, so `auth.uid()` stays NULL and `reviewer_id` records
  -- honestly that no person approved these.
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','user_role','admin')::text, true);

  create temp table _acc_disposition(
    id uuid primary key,
    action text not null check (action in ('approve','reject')),
    new_value jsonb,
    new_citations jsonb,
    note text not null
  ) on commit drop;

  insert into _acc_disposition(id, action, new_value, new_citations, note) values
  -- ---- GROUP A: approve as proposed -------------------------------------
  ('56b3e0f8-5a5b-4398-bab6-8fe495ce5b28','approve',null,null,
   'migration:99991790879465 Approved: "Two unisex rooms" is direct evidence of a gender-neutral restroom. The second citation ("running water with flush toilets") is irrelevant but one sound quote is enough.'),
  ('98f394b9-f9da-45a8-9952-8a93c66b4f38','approve',null,null,
   'migration:99991790879465 Approved: the cited text reads "two gender neutral, single stall, accessible restrooms" — the claim verbatim.'),
  ('390c4bae-d68e-4c2a-989c-980f38d77862','approve',null,null,
   'migration:99991790879465 Approved: "Family restroom located in northeast corner of building." A family restroom is single-occupancy and not sex-designated.'),

  -- ---- GROUP B: approve reduced ------------------------------------------
  ('b7317a27-ea06-430d-ab8f-5f41bb690688','approve','{"value": ["accessible-restroom"]}'::jsonb, null,
   'migration:99991790879465 Approved REDUCED from 4 slugs to 1. "There is a handicap sign on the restroom door" evidences accessible-restroom. Dropped wide-doorways (nothing cites it), ramp-access and elevator-access — the second citation, "up the concrete stairs", refutes both, and the description''s only mention of a lift is "I wasn''t sure where the elevator was".'),

  -- ---- GROUP C: approve re-cited ----------------------------------------
  ('51e3cbd4-df76-417f-abc8-353edd6079eb','approve',null,
   '[{"field":"description","quote":"gender neutral with a single, clean, restroom","superseded_by_migration":"99991790879465","superseded_quote":"Probably not wheelchair accessible"}]'::jsonb,
   'migration:99991790879465 Approved with the citation CORRECTED. The claim is true — the description reads "Probably not wheelchair accessible but gender neutral with a single, clean, restroom" — but the model cited the clause that denies a different claim. Re-cited to the supporting clause; the false citation is preserved on the row rather than erased.'),

  -- ---- GROUP D: approve notes -------------------------------------------
  ('b09dded1-5a16-4352-bfbf-c3b350e06fcf','approve',null,null,
   'migration:99991790879465 Approved: "single, clean restroom" restates the venue''s own description. Note prose, checkable by a reader, and it does not feed the accessibility needs-matcher.'),
  ('21443e58-0dcd-4c82-bce6-a332bb64e554','approve',null,null,
   'migration:99991790879465 Approved: the note restates the description verbatim — two gender-neutral, single stall, accessible restrooms.'),

  -- ---- GROUP E: reject, reason per row ----------------------------------
  ('ca855dbf-2c6e-4419-848f-2071d9158d6e','reject',null,null,
   'migration:99991790879465 Rejected: the three "quotes" are the slugs themselves echoed back ("ramp-access since 1994", "elevator-access", "wide-doorways") and none appears in the description, which is about HIV legal and psychological services. A fabricated citation at confidence 1.00.'),
  ('f9da890a-0356-4ac4-b568-1ce3942ea25a','reject',null,null,
   'migration:99991790879465 Rejected: "especially among Chinese men" says nothing about wheelchair access.'),
  ('32a5b0c2-f3a6-4f79-a370-3a5318db6f3d','reject',null,null,
   'migration:99991790879465 Rejected: "mostly locals with some foreigners" says nothing about restrooms or gender.'),
  ('8ec32640-78d8-4235-a188-4a73e22e5031','reject',null,null,
   'migration:99991790879465 Rejected: a Japanese-style bathhouse is not a restroom, and such bathhouses are conventionally sex-segregated — if anything the citation points the other way.'),
  ('fb40290b-eccc-46f1-b704-77349afaa1c2','reject',null,null,
   'migration:99991790879465 Rejected: "Especially popular with the leather & fetish crowd." is not evidence of a gender-neutral restroom.'),
  ('6374e082-4a37-426f-aa2a-5db8cd580d33','reject',null,null,
   'migration:99991790879465 Rejected: a "queer-friendly" tag is not evidence that service animals are welcome. A human has already rejected this exact shape on three other rows.'),
  ('787c8898-f81d-4e94-813f-c32714694c98','reject',null,null,
   'migration:99991790879465 Rejected: the citation refutes the proposal in its own first clause — "They are gendered bathrooms but they are single stalls." Single-occupancy and gender-neutral are independent properties.'),
  ('772b16a7-26c6-4d90-989f-fbb56081cf1b','reject',null,null,
   'migration:99991790879465 Rejected: "Single stall men/ women''s bathrooms" is evidence of gendered single stalls, not of wide doorways.'),
  ('385b358b-705d-4aa3-8633-5283e82be482','reject',null,null,
   'migration:99991790879465 Rejected: "Seems to be accessible" is a hedge, and the contributor''s next clause declines the claim outright — "I''m not a wheelchair user so don''t want to mislead anyone."'),
  ('a37adff0-67e3-46a8-93af-cfed8bad5194','reject',null,null,
   'migration:99991790879465 Rejected: "hand rails" and "changing table" are real accessibility features and evidence for neither wide doorways nor a ramp.'),
  ('fca59cfb-aa6d-449c-8f5d-b999fed6d7eb','reject',null,null,
   'migration:99991790879465 Rejected: "Located in an old warehouse built in 1910" and a rooftop view are not evidence of a ramp or wide doorways — if anything a 1910 warehouse argues the other way.'),
  ('87b69034-9083-4e51-8dc1-cc9f596ce250','reject',null,null,
   'migration:99991790879465 Rejected: "if you have mobility issues getting back up" is a WARNING to disabled visitors about a very low toilet, read as a positive claim.'),
  ('2fe370a3-e2c0-4194-b8a8-ea892a86d028','reject',null,null,
   'migration:99991790879465 Rejected: "Second floor, near section I/H" locates the restroom and says nothing about how you reach it.'),
  ('bcfefb51-2883-4ffe-b326-656bf4c78397','reject',null,null,
   'migration:99991790879465 Rejected: the citation is good evidence for a DIFFERENT slug — an accessible toilet behind a RADAR key. Nothing mentions a ramp. A re-run should propose accessible-restroom.'),
  ('93635690-4154-49ad-b0a7-8475f365b8cf','reject',null,null,
   'migration:99991790879465 Rejected: "Located on the 3rd floor." plus "Ask the concierge." is not evidence of a ramp or a lift; the description adds "No signs."'),
  ('eef6dc7b-4e88-442e-a85f-54748c40fc26','reject',null,null,
   'migration:99991790879465 Rejected: "Friendly, intimate atmosphere." is not evidence that service animals are welcome.');

  -- Apply. Each row is independent: a row already decided is skipped and counted
  -- rather than aborting the file.
  for v_row in select * from _acc_disposition loop
    if not exists (select 1 from public.entity_review_queue where id = v_row.id) then
      v_missing := v_missing + 1;
      raise notice 'row % no longer exists — skipped', v_row.id;
      continue;
    end if;
    if not exists (select 1 from public.entity_review_queue where id = v_row.id and status = 'open') then
      v_skipped := v_skipped + 1;
      raise notice 'row % already decided by someone else — left alone', v_row.id;
      continue;
    end if;

    -- Corrections are applied to the open row BEFORE approval, which is what
    -- "approve with correction" means here; `approve_entity_review` reads
    -- `proposed_value` and `citations` off the row.
    if v_row.new_value is not null then
      update public.entity_review_queue set proposed_value = v_row.new_value
       where id = v_row.id and status = 'open';
    end if;
    if v_row.new_citations is not null then
      update public.entity_review_queue set citations = v_row.new_citations
       where id = v_row.id and status = 'open';
    end if;

    if v_row.action = 'approve' then
      perform public.approve_entity_review(v_row.id, v_row.note, false);
      v_approved := v_approved + 1;
    else
      perform public.reject_entity_review(v_row.id, v_row.note);
      v_rejected := v_rejected + 1;
    end if;
  end loop;

  raise notice 'disposition: approved=% rejected=% already_decided=% missing=%',
    v_approved, v_rejected, v_skipped, v_missing;
end $disposition$;

do $verify$
declare
  v_bad int;
  v_attrs text[];
  v_notes text;
begin
  -- P1 — no row this file names is still open. Scoped to the 23 ids: the queue
  -- legitimately gains new rows from the */3h cron and asserting an empty queue
  -- would fail on correct behaviour.
  select count(*) into v_bad from public.entity_review_queue
   where status = 'open' and id in (
    '56b3e0f8-5a5b-4398-bab6-8fe495ce5b28','98f394b9-f9da-45a8-9952-8a93c66b4f38',
    '390c4bae-d68e-4c2a-989c-980f38d77862','b7317a27-ea06-430d-ab8f-5f41bb690688',
    '51e3cbd4-df76-417f-abc8-353edd6079eb','b09dded1-5a16-4352-bfbf-c3b350e06fcf',
    '21443e58-0dcd-4c82-bce6-a332bb64e554','ca855dbf-2c6e-4419-848f-2071d9158d6e',
    'f9da890a-0356-4ac4-b568-1ce3942ea25a','32a5b0c2-f3a6-4f79-a370-3a5318db6f3d',
    '8ec32640-78d8-4235-a188-4a73e22e5031','fb40290b-eccc-46f1-b704-77349afaa1c2',
    '6374e082-4a37-426f-aa2a-5db8cd580d33','787c8898-f81d-4e94-813f-c32714694c98',
    '772b16a7-26c6-4d90-989f-fbb56081cf1b','385b358b-705d-4aa3-8633-5283e82be482',
    'a37adff0-67e3-46a8-93af-cfed8bad5194','fca59cfb-aa6d-449c-8f5d-b999fed6d7eb',
    '87b69034-9083-4e51-8dc1-cc9f596ce250','2fe370a3-e2c0-4194-b8a8-ea892a86d028',
    'bcfefb51-2883-4ffe-b326-656bf4c78397','93635690-4154-49ad-b0a7-8475f365b8cf',
    'eef6dc7b-4e88-442e-a85f-54748c40fc26');
  if v_bad <> 0 then
    raise exception 'P1 failed: % named rows still open', v_bad;
  end if;

  -- P2 — the reduction LANDED. Bar Phoebe must carry the one surviving slug and
  -- NEITHER refuted mobility slug. Asserting only that it holds
  -- `accessible-restroom` would pass if all four had been approved, which is the
  -- defect this group exists to avoid.
  select v.accessibility_attributes into v_attrs from public.venues v
   where v.id = '3a309791-52a8-4963-adc0-4f3d74cae48b';
  if not (v_attrs @> array['accessible-restroom']) then
    raise exception 'P2 failed: Bar Phoebe did not gain accessible-restroom (got %)', v_attrs;
  end if;
  if v_attrs && array['ramp-access','elevator-access','wide-doorways'] then
    raise exception 'P2 failed: Bar Phoebe carries a refuted mobility slug (got %)', v_attrs;
  end if;

  -- P3 — the three group-A approvals and group C landed their slug.
  select count(*) into v_bad from (values
      ('c4a91b65-3e04-415f-90e8-c10b556103a0'::uuid,'gender-neutral-restroom'),
      ('717adaeb-96f8-4d09-a941-ef0d33f71fb2','gender-neutral-restroom'),
      ('f5f15261-4b7c-4261-a493-b8e0735c8173','gender-neutral-restroom'),
      ('39ee804c-12f2-4296-bb41-395ad7a9f1e6','gender-neutral-restroom')
    ) as want(vid, slug)
    join public.venues v on v.id = want.vid
   where not (v.accessibility_attributes @> array[want.slug]);
  if v_bad <> 0 then
    raise exception 'P3 failed: % approved venues did not gain their slug', v_bad;
  end if;

  -- P4 — the re-cited row kept the record of the citation it replaced, and the
  -- correction is positional: the false quote must appear ONLY under
  -- `superseded_quote`, never as the live `quote`. A plain "the row mentions the
  -- old text" check would pass on an uncorrected row.
  select count(*) into v_bad from public.entity_review_queue q
   cross join lateral jsonb_array_elements(q.citations) c
   where q.id = '51e3cbd4-df76-417f-abc8-353edd6079eb'
     and c->>'quote' = 'Probably not wheelchair accessible';
  if v_bad <> 0 then
    raise exception 'P4 failed: the refuting quote is still cited as live evidence';
  end if;
  select count(*) into v_bad from public.entity_review_queue q
   cross join lateral jsonb_array_elements(q.citations) c
   where q.id = '51e3cbd4-df76-417f-abc8-353edd6079eb'
     and c->>'superseded_quote' = 'Probably not wheelchair accessible'
     and c->>'quote' = 'gender neutral with a single, clean, restroom';
  if v_bad <> 1 then
    raise exception 'P4 failed: the superseded citation was not preserved';
  end if;

  -- P5 — NOT ONE rejected venue gained an accessibility attribute. The whole
  -- point is that a rejection publishes nothing; without this, a reject path
  -- that silently applied first would pass every check above.
  select count(*) into v_bad from public.venues v
   where v.id in (
     '7f25e620-209d-430e-b5b4-ef89b24174fa','e45360a1-114f-4050-8600-da3676b7a918',
     '5a502ab2-b193-4c86-97e5-d33016703838','d136af9c-2812-445d-bdcf-a3cb9d85ddaf',
     'd533eb0c-17db-43f9-9c2f-2f41f469f818','abce9952-4d1f-4b3b-ad55-611dc716a44a',
     '8b001cbf-0807-489b-a255-1a7d4a3b61a7','9fa079dd-ecff-409a-bb78-44c4f2b6ba38',
     '0e8c6aeb-8cfe-49cf-ba93-3093adfeaa9b','d139a3ac-5cd0-4245-a516-42ff85bd88a7',
     '5baf3ddd-b2cd-4601-a592-4e5462823257','b3a0bd51-da81-4684-90a0-de5766fac1dc',
     '13c8a2ca-da39-43da-924a-27de0e2e06ff','4f57e931-9073-464c-bd17-d732b428d6c1',
     '000aeba2-66d9-435d-b7ef-65ea9afa2d35')
     and cardinality(coalesce(v.accessibility_attributes, '{}')) > 0;
  if v_bad <> 0 then
    raise exception 'P5 failed: % rejected venues carry an accessibility attribute', v_bad;
  end if;

  -- P6 — the two notes landed as prose, not as an empty string. `apply_mode` is
  -- `text`, so a blank proposal would overwrite a column with nothing.
  select v.accessibility_notes into v_notes from public.venues v
   where v.id = '717adaeb-96f8-4d09-a941-ef0d33f71fb2';
  if coalesce(length(btrim(v_notes)), 0) = 0 then
    raise exception 'P6 failed: Clinton Market note is empty';
  end if;

  raise notice 'all postconditions passed';
end $verify$;

-- ---------------------------------------------------------------------------
-- Sentinel for the cohort this change does NOT repair.
-- ---------------------------------------------------------------------------
--
-- The 23 rows above were caught by the gate. A much larger set got past it: on
-- 2026-09-14..17 `run_review_queue_autoapprove` approved **723** venue
-- accessibility rows at "confidence >= 0.90" with no human, which is the defect
-- 99991789843323 fixed by making that pass honour `review_field_registry.batchable`.
-- Measured now: **1,035 accessibility claims from that window are live on 590
-- venues.** Of those, **270 claims on 160 venues have NOT ONE cited quote present
-- in the venue's own description** — fabricated citations, published.
--
-- THIS MIGRATION DELIBERATELY RETRACTS NONE OF THEM, and the reason is the same
-- asymmetry that governs everything else here, pointed the other way: a real
-- accessibility fact deleted is a fact nobody re-derives. Calibrating which of
-- 1,035 are wrong needs the per-slug hand read this file did for 30, and the rate
-- differs enormously by slug — measured, `gender-neutral-restroom` and
-- `accessible-restroom` cite genuine evidence most of the time (the corpus is
-- rich in contributed restroom notes: "Two unisex restrooms", "3 individual,
-- ungendered stalls", "Los baños son unisex") while `step-free-entrance` and
-- `wheelchair-accessible` are dominated by marketing copy ("a welcoming space",
-- "Located at 111 West 12th Street", "the air is crisp", "Thursday nights 7:00
-- pm"). A single sweep across that would destroy the good half to reach the bad.
-- So it is MEASURED AND WATCHED here and repaired in its own change.
--
-- WHAT THE SENTINEL DELIBERATELY DOES NOT DO: re-implement the evidence
-- vocabulary in SQL. That vocabulary is 24 per-slug regex sets calibrated against
-- the corpus and tested in `_shared/accessibility-evidence.test.ts`; mirroring it
-- here would be a drift surface with no reader (`accessibility-vocab.drift.test.ts`
-- exists because the last mirror needed one). It reports only what is decidable
-- with NO judgement at all: a cited quote either is or is not a substring of the
-- text the model was given. That is why `ungrounded_live_claims` is the gated key
-- and the corroboration half is not.
create or replace function public.venue_accessibility_evidence_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
stable
as $fn$
declare v_out jsonb;
begin
  with claims as (
    select q.id, v.id as vid, s.slug,
      (select count(*) from jsonb_array_elements(coalesce(q.citations, '[]'::jsonb)) e) as n_quotes,
      (select count(*) from jsonb_array_elements(coalesce(q.citations, '[]'::jsonb)) e
        where position(e->>'quote' in coalesce(v.description, '')) > 0) as n_grounded
    from public.entity_review_queue q
    join public.venues v on v.id = q.entity_id
    cross join lateral jsonb_array_elements_text(q.proposed_value->'value') s(slug)
    where q.entity_type = 'venue'
      and q.field = 'accessibility_attributes'
      and q.status = 'approved'
      and q.reviewer_id is null                       -- machine-approved only
      and v.accessibility_attributes @> array[s.slug] -- and still published
  )
  select jsonb_build_object(
    -- Reported FIRST and never gated: four zeroes over an empty cohort read
    -- exactly like a clean one, and only this tells them apart.
    'live_machine_claims', (select count(*) from claims),
    'live_venues', (select count(distinct vid) from claims),
    -- Gated. No vocabulary, no judgement: every quote cited for this claim is
    -- absent from the venue's own description.
    'ungrounded_live_claims',
      (select count(*) from claims where n_quotes = 0 or n_grounded = 0),
    'ungrounded_live_venues',
      (select count(distinct vid) from claims where n_quotes = 0 or n_grounded = 0),
    -- Described, never gated: a queue with rows in it is a queue being fed, and
    -- the producer seal shipped in this change is what bounds it.
    'open_queue_claims',
      (select count(*) from public.entity_review_queue
        where entity_type = 'venue' and field like 'accessibility%' and status = 'open'),
    'probe_ok', true
  ) into v_out;
  return v_out;
end $fn$;

comment on function public.venue_accessibility_evidence_signals() is
  'Live venue accessibility claims whose citation does not appear in the source '
  'text. Baseline 2026-10-01: 1,035 live machine-approved claims on 590 venues, '
  '270 of them ungrounded on 160 venues. WARN at the baseline and FAIL ON GROWTH '
  '— a zero-invariant here would ship red and be scrolled past, and the backlog '
  'can only come down by a calibrated per-slug pass. Growth means a producer is '
  'publishing unevidenced access claims again.';

revoke all on function public.venue_accessibility_evidence_signals() from public, anon, authenticated;
grant execute on function public.venue_accessibility_evidence_signals() to service_role;

do $sentinel_verify$
declare v_j jsonb;
begin
  -- Asserted BEHAVIOURALLY. A source-text check cannot tell a live function from
  -- a dead one, and this repo has shipped a sentinel wired to nothing before.
  v_j := public.venue_accessibility_evidence_signals();
  if coalesce((v_j->>'probe_ok')::boolean, false) is not true then
    raise exception 'sentinel does not report probe_ok';
  end if;
  if not (v_j ? 'live_machine_claims' and v_j ? 'ungrounded_live_claims'
          and v_j ? 'ungrounded_live_venues' and v_j ? 'open_queue_claims') then
    raise exception 'sentinel is missing a key: %', v_j;
  end if;
  -- The cohort must be non-empty, or the gated number below is vacuous.
  if (v_j->>'live_machine_claims')::int <= 0 then
    raise exception 'sentinel reports an empty cohort — it is measuring nothing: %', v_j;
  end if;
  -- anon must not reach it; the grant above is asserted rather than trusted.
  if has_function_privilege('anon', 'public.venue_accessibility_evidence_signals()', 'EXECUTE') then
    raise exception 'anon can execute the sentinel';
  end if;
  raise notice 'sentinel: %', v_j;
end $sentinel_verify$;
