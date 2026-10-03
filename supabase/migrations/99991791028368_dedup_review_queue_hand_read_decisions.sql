-- Work the dedup-review queue: 14 open pairs, every one hand-read on both sides.
--
-- All 14 were queued by `dedup_truth_sweep` on 2026-10-03 at confidence 0.70 (venue)
-- and 0.85 (event) -- i.e. BELOW every auto bar, so the ladder correctly declined to
-- merge them and routed them to a human. Their `reason` values are the ladder's VETO
-- rungs, not evidence of duplication:
--
--   single_token_core (7)  -- `cardinality(core) >= 2` refused it. 20330101100000 added
--                             that rung because `dedup_core_tokens` strips the city name,
--                             so "Jessheim Pride" and "Fredrikstad Pride" both reduce to
--                             {pride} -- the one venue pair a human has ever rejected as
--                             auto_eligible, at exactly 0 m.
--   identity_conflict (5)  -- the ladder's TOP rung: the two sides carry addresses,
--                             domains or phones that disagree. 20330101100000 measured
--                             this bucket at ~7 distinct / ~3 real / 2 ambiguous out of
--                             12 read at random, which is why it is never bulk-closed.
--   title_containment_same_instant (2) -- 20270822093311 restored containment as a
--                             CANDIDATE GENERATOR ONLY, because its failure mode is
--                             SUB-EVENTS, not duplicates ("Muscle Classic V Pre-Party"
--                             vs "Muscle Classic V").
--
-- So none of the 14 may be decided from its reason. Each was decided from the two rows.
--
-- DISTANCE IS DISPLAY ONLY AND VETOES NOTHING, which 20330101100000 established and
-- this batch depends on: 2,665 live venues sit on 908 SHARED coordinate points because
-- a missing geocode falls back to a city centroid, and hand-read pairs with BYTE-
-- IDENTICAL street addresses measure up to 507 km apart. Three merges below are 1.19-
-- 3.25 km apart on identical street-and-number addresses. Conversely `dm = 0` is the
-- placeholder signature, not proximity -- so 0.00 km is not evidence either.
--
-- EVERY MERGE BELOW RESTS ON >= 2 INDEPENDENT SIGNALS, never on the name. The signals
-- used are street+house number, phone, and registrable domain.
--
-- CONTENT WAS MEASURED BEFORE CHOOSING DIRECTION, not assumed: across all 23 venues the
-- children are 0 events (except Labor Bar's 1, which is a REJECT), 0 images, 0 guide
-- picks, 1-3 venue_sources. So no merge below reparents editorial work, and direction is
-- a question of which identity gets published. It follows quality_score and the richer
-- identity, which agrees with the queued direction on every venue pair.
--
-- ============================ MERGE: 7 venue pairs ============================
-- Keep/drop as queued in each case.
--
-- 1. Pinokyo Bar <= Pinokyo (Istanbul, TR). "Istiklal cd. BuyukparmakkapI sk. No:26"
--    vs "26 Büyük Parmakkapı Sokak" -- the SAME street under transliteration, the SAME
--    house number 26, same city, same category. 3.25 km apart, which is the centroid
--    noise this file's header describes.
-- 2. Café Muzik <= Muzik (Juiz de Fora, BR). THREE signals: "R. Espírito Santo, 1081"
--    vs "Rua Espírito Santo, 1.081"; phone +553232139796 BYTE-IDENTICAL on both;
--    domain muzik.com.br on both (https vs http).
-- 3. Neighbours Seattle <= Neighbours (US). Address 1509 Broadway on both, domain
--    neighboursnightclub.com on both, 0.00 km, same category.
-- 4. Chambers Bar <= Chambers (Cork, IE). Washington Street on both, same city, same
--    category, 0.20 km. The keep row's address reads "26 Washington St, Ireland,
--    Indiana" -- the corrupt US-state artifact 20260807100200 documents, not a second
--    place.
-- 5. Tracks <= Tracks Denver (US). "3500 Walnut Street" vs "3500 Walnut St, RiNo
--    District" -- same street and number. 1.36 km is the drop row's bad geocode.
-- 6. Boutique Bar <= Boutique (Toronto, CA). Address 506 Church Street on both, domain
--    boutiquebar.ca on both. The drop row's own description reads "Boutique is a shop
--    in Bourbach-le-Haut, CH", i.e. its prose is already corrupt; its category `shop`
--    disagrees with its own domain.
-- 7. BUSTER <= Le Buster (Bordeaux, FR). "34 Rue Cursol" vs "34 rue de Cursol", phone
--    +33556925943 BYTE-IDENTICAL, 0.00 km. The category differs (bar vs sauna); that is
--    a FIELD question for the venue, not a reason to keep two rows, and the merge keeps
--    the keep row's `bar`. Recorded rather than silently resolved, because 20260915140000
--    is explicit that `sauna` asserts a sexual venue type and is never bulk-accepted.
--
-- ============================ MERGE: 2 event pairs ============================
--
-- 8. Texas Bear Round-Up Dallas 2027 <= Texas Bear Round Up. IDENTICAL start AND end
--    (2027-03-25 -> 2027-03-28), same venue_name (Hyatt Regency Dallas), same city.
--    Two spellings of one event. Direction as queued (qs 95 vs 90, fuller title).
--
-- 9. Matteo Lane & Bob The Drag Queen <= Paramount Theatre Club Seating: Matteo Lane...
--    THE CANONICAL IS FLIPPED, and this is the one pair where that matters. Same instant
--    (2026-10-11 00:30Z), same venue, same city. The row the sweep picked as keep is a
--    TICKET TIER -- Ticketmaster emits one listing per seating category -- so approving
--    as queued would publish "Paramount Theatre Club Seating: ..." as the event title a
--    reader meets. That is a ticketing artifact of the SAME performance, not the
--    sub-event class the containment veto exists for: a pre-party has its own start
--    time, and these share an instant to the minute. The drop side also carries 2
--    event_sources against the keep side's 1.
--
-- ===================== MERGE: 1 pair the sweep never queued =====================
--
-- 10. The Eagle <= The Eagle Bar (Auckland, NZ), ids 943513fb / 83cb5fdd. NOT a queued
--     pair, and it is included because rejecting #13 and #14 below without it would
--     leave the real duplicate standing while closing the two rows that pointed at it.
--     Both are "259 Karangahape Road", coordinates agree to 4 dp, and the keep carries
--     the NZ phone +6493094979. The cluster has been partly deduped before -- b69a1eab
--     and 41124786 are already `duplicate_of_id` -- so this closes it.
--
-- ============================ REJECT: 4 pairs ============================
--
-- 11. Labor Club / Labor Bar (Zürich, CH) -- DISTINCT. Sihlquai 240 vs Schiffbaustrasse
--     3, 0.84 km, different category (club vs bar), different domains. Two Zürich
--     venues sharing the word "Labor". The Labor Bar row also holds the only event in
--     this whole batch, which a merge would move onto the wrong venue.
-- 12. Sultana / Sultana Lounge Bar (Elche, ES) -- DISTINCT on the evidence available.
--     C/. Sant Pere 9 vs Calle Hospital 16 local 11: different streets. A relocation
--     would look the same, so this is a refusal to guess rather than a positive finding
--     of two venues. (The drop row's `city` reads "Bogotá D.C." while its state reads
--     Valencian Community -- a separate corruption, flagged below, not repaired here.)
-- 13. The Eagle / Eagle (Auckland) -- NOT A DUPLICATE, A MISFILED CITY. The drop row
--     db458e61 carries CARDIFF's identity throughout: address "39 Charles Street",
--     website eaglecardiff.com, phone +442920232859 (Cardiff's +44 29 20 code) -- while
--     its city and coordinates say Auckland. "The Eagle" is the namesake example
--     99991790379818 already records for venues. Merging would fuse a Welsh bar's
--     identity into a New Zealand venue.
-- 14. Eagle / The Eagle Bar (Auckland) -- same row, same reason, other side.
--
-- ============================ LEFT OPEN: 1 pair ============================
--
-- Bar Friends / FRIENDS Bar (Seoul, KR), queue row 36db651b. Deliberately NOT decided.
-- The keep side's ENTIRE address is the string "Seoul" and its coordinates are
-- 37.5665,126.978 -- the Seoul city centroid, i.e. the placeholder. The drop side has a
-- real address (88-2 Nakwon-dong, Jongno-gu, which is Seoul's gay district) and a phone.
-- There is no shared address, phone or domain, and "friends" is a single generic core
-- token -- precisely the shape the `single_token_core` veto exists for. Merging on the
-- name plus "one side is a shell" is the inference that produced the Jessheim/Fredrikstad
-- pair. It is left open rather than rejected because a rejection is a TOMBSTONE the sweep
-- will not re-propose, and this pair becomes decidable the moment either row gains an
-- address. The underlying defect is the centroid placeholder, not the pair.
--
-- ===================== Adjacent defects found and NOT fixed here =====================
-- Named rather than silently carried, each needing evidence this change does not have:
--   * db458e61 "Eagle" is Eagle Cardiff filed in Auckland. No Cardiff venue row exists
--     (checked: zero rows with city ilike cardiff), so repairing it means either
--     creating one or detaching -- a decision, not a cleanup.
--   * b05aa4f9 "The Eagle" is filed in Brighton with 42 Scotswood Road, a +44 191
--     (Newcastle) phone and Newcastle coordinates, beside 23aa31d1 "The Eagle
--     Newcastle" at the same address. Same misfiled-city class.
--   * 3c3cdb40 "Eagle" and f53d1546 "Eagle Bar" are both 15 Bloom Street, Manchester,
--     both live -- a real duplicate the sweep has not queued.
--   * 7160361a "Sultana Lounge Bar" has city "Bogotá D.C." with state Valencian
--     Community.
--
-- Reversibility: every merge here goes through `approve_dedup_review` -> `merge_venues`
-- / `merge_entities`, and 20350101100000 / 29000101100000 gave those cores the
-- `details.moved` + `schema:1` stamp, so each is undoable by `unmerge_venues` /
-- `unmerge_entities(audit_id)`. `reviewer_id` lands NULL because a migration has no
-- `auth.uid()`; the rejections carry their reasoning in `reviewer_note` instead, and
-- this header is the record for the merges.

-- Rejections first: they have no side effects, and #14's drop (83cb5fdd) is merged away
-- in step 10 below. Deciding in the other order would leave #14 pointing at a row that
-- had already become a duplicate.
do $reject$
begin
  perform public.reject_dedup_review('71a525a3-b2d6-47d2-abb0-0cf73bd91d2e'::uuid,
    'Distinct: Labor Club (Sihlquai 240, club) and Labor Bar (Schiffbaustrasse 3, bar) '
    'are two Zürich venues 0.84 km apart with different domains. Labor Bar holds a live '
    'event a merge would move onto the wrong venue.');

  perform public.reject_dedup_review('b932e402-4b5d-461b-a789-594ebd597ebc'::uuid,
    'Different streets in Elche: C/. Sant Pere 9 vs Calle Hospital 16 local 11. No '
    'shared phone, domain or coordinates. A relocation would look identical, so this is '
    'a refusal to guess rather than proof of two venues.');

  perform public.reject_dedup_review('5df803ac-d494-4537-b4f0-618588508f07'::uuid,
    'Not a duplicate -- a misfiled city. db458e61 carries Cardiff''s identity (39 '
    'Charles Street, eaglecardiff.com, +442920232859) while filed in Auckland. Merging '
    'would fuse a Welsh bar into a New Zealand venue. The real Auckland duplicate is '
    '943513fb <= 83cb5fdd, merged separately.');

  perform public.reject_dedup_review('f6006885-f50b-43c2-9b8e-6dfcef72645d'::uuid,
    'Same misfiled row as the other Eagle pair: db458e61 is Eagle Cardiff, not an '
    'Auckland venue. 83cb5fdd is the genuine Auckland Eagle Bar and is merged into '
    '943513fb separately.');
end $reject$;

-- The 7 venue merges, keep/drop as queued.
do $venues$
declare r record;
begin
  for r in select * from (values
      ('bf594cd4-bf13-40b8-8587-550d275e88ea'::uuid),  -- Pinokyo Bar <= Pinokyo
      ('12e93a51-9f12-48b2-b4d3-6d05f5a23521'::uuid),  -- Café Muzik <= Muzik
      ('67804bd1-11b4-4aa3-a347-d1cd018ea290'::uuid),  -- Neighbours Seattle <= Neighbours
      ('8eef4396-6c87-4404-bfb7-c0a9017adfff'::uuid),  -- Chambers Bar <= Chambers
      ('f5fc761c-10a3-4b5f-a475-fba8cb980d13'::uuid),  -- Tracks <= Tracks Denver
      ('29f42a88-5ca1-4138-98b7-1b5be5262722'::uuid),  -- Boutique Bar <= Boutique
      ('2fd904d9-e3e8-4cdb-a706-3d230324c265'::uuid)   -- BUSTER <= Le Buster
    ) as t(qid)
  loop
    perform public.approve_dedup_review(r.qid, null);
  end loop;
end $venues$;

-- The 2 event merges. The Matteo Lane pair passes an explicit p_keep_id to FLIP the
-- canonical onto the real event title; `approve_dedup_review` swaps the pair when
-- p_keep_id is the queued drop.
do $events$
begin
  perform public.approve_dedup_review('70081002-5404-4fb4-9d9e-28e974c075fb'::uuid, null);
  perform public.approve_dedup_review('6cdba7da-fec3-498e-ab66-d7c09df82ce5'::uuid,
                                      'fe18132a-e454-4049-8398-ccbce7abf0c8'::uuid);
end $events$;

-- The Auckland Eagle duplicate the sweep never queued (step 10 in the header).
do $eagle$
declare v_res jsonb;
begin
  if exists (select 1 from public.venues where id = '83cb5fdd-b85d-4d55-9ce0-0f1c8f885aaa'
               and duplicate_of_id is null)
  then
    v_res := public.merge_venues('943513fb-7449-4297-a26a-a6311312285f'::uuid,
                                 '83cb5fdd-b85d-4d55-9ce0-0f1c8f885aaa'::uuid);
    raise notice 'Auckland Eagle merged: %', v_res;
  else
    raise notice 'Auckland Eagle already merged -- nothing to do';
  end if;
end $eagle$;

do $verify$
declare
  v_open int; v_n int; v_name text; v_dup uuid;
begin
  -- P1: exactly ONE pair is still open, and it is the Seoul pair named in the header.
  --     Asserted positively rather than as "no bad rows", because a count of rows in a
  --     bad state also reads zero if the rows vanished from the corpus entirely.
  select count(*) into v_open
  from public.dedup_review_queue
  where status = 'open'
    and id in (
      '71a525a3-b2d6-47d2-abb0-0cf73bd91d2e','b932e402-4b5d-461b-a789-594ebd597ebc',
      '5df803ac-d494-4537-b4f0-618588508f07','f6006885-f50b-43c2-9b8e-6dfcef72645d',
      'bf594cd4-bf13-40b8-8587-550d275e88ea','12e93a51-9f12-48b2-b4d3-6d05f5a23521',
      '67804bd1-11b4-4aa3-a347-d1cd018ea290','8eef4396-6c87-4404-bfb7-c0a9017adfff',
      'f5fc761c-10a3-4b5f-a475-fba8cb980d13','29f42a88-5ca1-4138-98b7-1b5be5262722',
      '2fd904d9-e3e8-4cdb-a706-3d230324c265','70081002-5404-4fb4-9d9e-28e974c075fb',
      '6cdba7da-fec3-498e-ab66-d7c09df82ce5','36db651b-99b6-44fa-b308-7c0c768842b0');
  if v_open <> 1 then
    raise exception 'P1: expected exactly 1 open dedup pair (the Seoul shell); found %', v_open;
  end if;
  if not exists (select 1 from public.dedup_review_queue
                  where id = '36db651b-99b6-44fa-b308-7c0c768842b0' and status = 'open') then
    raise exception 'P1b: the one open pair is not the Seoul pair this file deliberately left';
  end if;

  -- P2: the 4 rejections are recorded AS rejections and carry a note. A rejection with
  --     no note is a decision nobody can re-read.
  select count(*) into v_n from public.dedup_review_queue
   where id in ('71a525a3-b2d6-47d2-abb0-0cf73bd91d2e','b932e402-4b5d-461b-a789-594ebd597ebc',
                '5df803ac-d494-4537-b4f0-618588508f07','f6006885-f50b-43c2-9b8e-6dfcef72645d')
     and status = 'rejected' and coalesce(btrim(reviewer_note),'') <> '';
  if v_n <> 4 then
    raise exception 'P2: expected 4 rejected pairs with a note; found %', v_n;
  end if;

  -- P3: the 7 venue merges + 2 event merges landed, each with a merge_audit_id. Without
  --     the audit id the merge is not reversible, which is the whole point of routing
  --     through approve_dedup_review rather than writing duplicate_of_id by hand.
  select count(*) into v_n from public.dedup_review_queue
   where id in ('bf594cd4-bf13-40b8-8587-550d275e88ea','12e93a51-9f12-48b2-b4d3-6d05f5a23521',
                '67804bd1-11b4-4aa3-a347-d1cd018ea290','8eef4396-6c87-4404-bfb7-c0a9017adfff',
                'f5fc761c-10a3-4b5f-a475-fba8cb980d13','29f42a88-5ca1-4138-98b7-1b5be5262722',
                '2fd904d9-e3e8-4cdb-a706-3d230324c265','70081002-5404-4fb4-9d9e-28e974c075fb',
                '6cdba7da-fec3-498e-ab66-d7c09df82ce5')
     and status = 'approved' and merge_audit_id is not null;
  if v_n <> 9 then
    raise exception 'P3: expected 9 approved pairs carrying a merge audit id; found %', v_n;
  end if;

  -- P4: the Matteo Lane FLIP actually flipped. Asserting "approved" alone passes just as
  --     well on the unflipped direction, which would publish a ticket tier as the event.
  select e.title into v_name from public.dedup_review_queue q
    join public.events e on e.id = q.keep_id
   where q.id = '6cdba7da-fec3-498e-ab66-d7c09df82ce5';
  if v_name is distinct from 'Matteo Lane & Bob The Drag Queen' then
    raise exception 'P4: the Matteo Lane canonical is %, expected the real event title', coalesce(v_name,'<null>');
  end if;
  if not exists (select 1 from public.events
                  where id = '2592aba3-fe68-4106-94fd-aaaeab09e54b' and duplicate_of_id is not null) then
    raise exception 'P4b: the Club Seating ticket-tier row is still canonical';
  end if;

  -- P5: the Auckland Eagle duplicate is closed, and the CARDIFF row is untouched. Both
  --     halves, because a sweep that merged all three Eagles would satisfy the first.
  select duplicate_of_id into v_dup from public.venues
   where id = '83cb5fdd-b85d-4d55-9ce0-0f1c8f885aaa';
  if v_dup is distinct from '943513fb-7449-4297-a26a-a6311312285f'::uuid then
    raise exception 'P5: Auckland Eagle Bar is not merged into 943513fb (duplicate_of_id=%)', coalesce(v_dup::text,'<null>');
  end if;
  if exists (select 1 from public.venues
              where id = 'db458e61-138e-4b44-9b11-939abf8dc584' and duplicate_of_id is not null) then
    raise exception 'P5b: the Cardiff-identity row was merged -- it must stay live and flagged for repair';
  end if;

  -- P6: every merge KEEP is still canonical. A merge that made a keep a duplicate of
  --     something else would otherwise pass every check above.
  select count(*) into v_n from public.venues
   where id in ('a6421320-fa77-40fc-b751-b954c639aaab','42b1fd21-33fb-4831-881c-bb13adb1d0dc',
                'e501f97a-ec5c-4b41-aaa5-ffdeb79ed8aa','e5b3b956-8531-40b5-8695-5eef5b357ba4',
                'd75eb4ca-c036-44dc-84cc-5af6ac392037','3d28a38c-83e1-49cc-9afa-a0a289859dcc',
                '4ccf3954-5033-4843-aec3-fdea4936cdb9','943513fb-7449-4297-a26a-a6311312285f')
     and duplicate_of_id is null and closed_at is null;
  if v_n <> 8 then
    raise exception 'P6: expected 8 live canonical venue keeps; found %', v_n;
  end if;

  -- P7: the REJECTED pairs' rows are all still live and independent -- a rejection must
  --     not have quietly merged anything.
  select count(*) into v_n from public.venues
   where id in ('e390a053-c704-426f-8ff5-49cb213946d5','ee57679a-6951-41ea-bac1-893769d06f52',
                'e57890b8-7a6f-44a3-bbe8-ede8b2e7f935','7160361a-10de-4da5-aaa8-917df998affa',
                'db458e61-138e-4b44-9b11-939abf8dc584')
     and duplicate_of_id is null;
  if v_n <> 5 then
    raise exception 'P7: a rejected pair''s rows were merged; % of 5 still canonical', v_n;
  end if;

  -- P8: the Seoul pair's two rows are both untouched, so "left open" means left alone.
  if exists (select 1 from public.venues
              where id in ('8cb9ea00-ac65-4cc4-ae3e-c153da6ec6f5','d8efd466-06da-48e2-9bf8-0a7aa2193759')
                and duplicate_of_id is not null) then
    raise exception 'P8: the deliberately-undecided Seoul pair was merged';
  end if;

  raise notice 'dedup queue worked: 9 merged, 4 rejected, 1 left open by design';
end $verify$;
