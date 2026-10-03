-- Retract every live venue accessibility claim whose citation is absent from the
-- text the model was given, and re-cite the four whose source does support them.
--
-- WHAT WAS WRONG
-- --------------
-- 99991790879465 sealed the producer and dispositioned the 23 rows still open in
-- the triage queue. It deliberately left the cohort that had already been
-- PUBLISHED: on 2026-09-14..17 `run_review_queue_autoapprove` approved 723 venue
-- accessibility rows at "confidence >= 0.90" with no human — the defect
-- 99991789843323 fixed by making that pass honour `review_field_registry.batchable`.
--
-- Measured now: **262 live claims on 153 venues have NOT ONE cited quote present
-- in the text the model was shown** — name + description + the prompt's tag line.
-- (Grounding against the description alone reports 270; tags account for 6 of the
-- difference and the venue NAME for 2.) The retract set is 259: those 262 minus the
-- 4 whose SOURCE supports the claim, plus 1 that is grounded in the name yet
-- uncorroborated by it.
--
-- **93% of them — 243 of 259 — cite a BARE SLUG STRING as their own quote.** The
-- citation for `not-wheelchair-accessible` is the literal text
-- "not-wheelchair-accessible". That is the `Gais Positius` signature from the
-- previous pass, at a hundred times the scale, and it is why grounding is the arm
-- that decides here while corroboration decided there: a slug trivially
-- corroborates itself, so only "is this quote actually in the source" can see it.
--
-- **95% OF THE COHORT IS NEGATIVE ASSERTIONS** — `not-wheelchair-accessible` 143,
-- `not-step-free` 109 — i.e. the platform was telling disabled travellers that
-- 150 venues are inaccessible on the strength of nothing at all. 20260801150524
-- made those terms first-class vocabulary because "we checked and it is NOT
-- accessible" beats silence; an INVENTED one inverts that and shrinks a disabled
-- reader's world instead. Retracting returns the venue to "unknown", which is
-- honest, and is the `prefer NULL to a guess` rule.
--
-- THREE CONFOUNDS WERE MEASURED AND CLEARED BEFORE ANYTHING WAS TOUCHED
-- --------------------------------------------------------------------
-- (1) **The prompt carried more than the description.** The sentinel grounded
--     against `description` alone; the prompt also carried the venue's TAGS and
--     its NAME. Tags rescue **6** claims (270 -> 264) and the name rescues **2**
--     more, one of which is a sound claim — so the gated number was over-strict in
--     two separate ways. The sentinel is corrected here to test what the model was
--     actually shown, minus the ALLOWED-slug lines, which would let every slug
--     ground-match itself.
-- (2) **A description that moved underneath the claim.** A quote genuine at
--     proposal time would read as fabricated today. `content_revisions` settles
--     it: **0 of the 154 rows have a later `description` write**, against 12,597
--     description writes on venues overall and a revision for all 154 of those
--     venues — so the trail is not blind to the field or to these rows. The text
--     did not move; the quotes were never in it.
--     **A first pass reported 154 of 154 and that was an artifact of counting the
--     left side of a LEFT JOIN** — `count(distinct c.id)` counts the claim even
--     when no revision matched. Require the join.
-- (3) **OSM.** `venue-accessibility-osm` writes the same negative slugs from real
--     `wheelchair=no` tags, and retracting those would delete well-sourced data.
--     Measured: **0** OSM provenance rows and **0** venues stamped
--     `accessibility_osm` across the cohort. These did not come from OSM.
--
-- WHAT IS KEPT, AND WHY THAT HALF MATTERS MOST
-- -------------------------------------------
-- An ungrounded citation does not make the CLAIM false. Each claim was therefore
-- asked a second question with the same shipped guard — does the venue's own text
-- carry evidence for this slug at all? **Four do**, all `gender-neutral-restroom`,
-- and all four are plainly right:
--
--   Grocery Outlet          "a large bathroom with an “All Gender Restroom” sign"
--   Tang Jip                "there are two unisex restoom"
--   Stilson Transit Center  "Two gender neutral restrooms"
--   Thee Stork Club         "Both are all gender."
--
-- Those are RE-CITED to the supporting sentence rather than retracted, because a
-- real accessibility fact thrown away is a fact nobody re-derives. The false
-- citation is preserved on the row under `superseded_quote`. Re-citing them is
-- also what lets the sentinel become a zero-invariant instead of sitting at a
-- baseline of 4 that a reader would learn to scroll past.
--
-- THE SET IS FROZEN, NOT RE-DERIVED AT APPLY TIME
-- -----------------------------------------------
-- 259 (venue, slug) pairs are listed literally. The classification was made by
-- `_shared/accessibility-evidence.ts` — 24 per-slug regex sets calibrated against
-- this corpus and tested — and that vocabulary is deliberately NOT mirrored into
-- SQL (a drift surface with no reader). So the migration cannot recompute the
-- decision; freezing is what makes what lands exactly what was verified.
--
-- NOTHING IS DELETED SILENTLY. Each touched venue is stamped
-- `enrichment_status.accessibility_retracted` with the slugs, the reason and this
-- migration, and `content_revisions` records the before/after of every write, so
-- the removal is reversible from the row itself.
--
-- THE REVIEW ROWS ARE DELIBERATELY LEFT `approved`. That IS what happened — a
-- machine approved them — and rewriting them to `rejected` would erase the
-- evidence of the auto-approve defect while gaining nothing: the producer is
-- sealed, so nothing re-proposes these, and the sentinel keys on whether the slug
-- is LIVE rather than on queue status.
--
-- NOT FIXED HERE, AND NAMED RATHER THAN COUNTED: **58 of the 150 venues are
-- `category='other'` and several are not venues at all** — "The Changing Wealth of
-- Nations", "IDA Statement Of Income", "Manufactures Unit Value Index", "Global
-- Bilateral Migration", "Afghanistan Reconstruction Trust Fund" are World Bank
-- dataset records misfiled into `venues`, and the model was asked whether a data
-- series is wheelchair accessible. Only 3 carry `nonvenue_candidate`. That is a
-- separate disposition with its own evidence and is not bundled in here.

do $retract$
declare
  v_pairs int := 0;
  v_venues int := 0;
  v_recited int := 0;
begin
  create temp table _acc_retract(venue_id uuid, slugs text[]) on commit drop;
  insert into _acc_retract(venue_id, slugs) values
  ('008bbba8-de3e-488e-be5e-532ea9931306','{not-step-free,not-wheelchair-accessible}'),
  ('0264ab4b-ff67-4d88-bb79-bbcbce8a1f37','{not-wheelchair-accessible}'),
  ('06f0b008-3e0d-442d-bc4f-06f9b7dd20b1','{not-wheelchair-accessible}'),
  ('0d422983-9645-4ebc-8038-58d01ac19ced','{not-step-free,not-wheelchair-accessible}'),
  ('0dac4d60-e79d-4897-ae8e-57c999fa05a0','{not-wheelchair-accessible}'),
  ('0ed4ac87-7abc-4aa4-8faa-7c84659bce11','{not-step-free,not-wheelchair-accessible}'),
  ('0eff4bc1-27a5-4b13-901d-2ea0b0cd48c7','{not-step-free,not-wheelchair-accessible}'),
  ('0fd13ee8-b0a1-4f46-9f9d-756877f60769','{not-step-free,not-wheelchair-accessible}'),
  ('16231f48-592a-4fe1-8891-3ed97d91ecda','{not-wheelchair-accessible}'),
  ('16c6773e-03c8-4454-aac1-271637462312','{not-step-free,not-wheelchair-accessible}'),
  ('16d089dd-e33e-4af5-9cf7-72011d3e9f43','{not-wheelchair-accessible}'),
  ('1aced079-e6ac-42eb-a520-abcbef03164a','{not-step-free,not-wheelchair-accessible}'),
  ('1b09df2e-9448-4e17-84b6-aa69d380b287','{not-step-free,not-wheelchair-accessible}'),
  ('1e60ff56-ea03-48b7-ac86-52acf440d307','{not-step-free,not-wheelchair-accessible}'),
  ('1e9b4bdf-6fa7-4a0d-976c-db71fa79c3e4','{not-wheelchair-accessible}'),
  ('220983d2-21d6-4ba4-8699-f5629e994177','{not-step-free,not-wheelchair-accessible}'),
  ('2409b7d8-82c5-4077-a1dd-091507512878','{not-step-free,not-wheelchair-accessible}'),
  ('25c89894-223a-4e74-9ed2-d5ae066c444e','{not-step-free,not-wheelchair-accessible}'),
  ('279368f9-7614-420c-89d9-56bcb65e2ec2','{not-step-free,not-wheelchair-accessible}'),
  ('28980c7a-0de4-468a-bccb-faaeb5894321','{not-wheelchair-accessible}'),
  ('29e9fbe3-c94a-485f-bde7-7a1dd64a576d','{gender-neutral-restroom}'),
  ('2d484030-0a88-471c-af8e-7d8deb68c78c','{not-wheelchair-accessible}'),
  ('39949244-62e0-4330-8561-2e00fe05d530','{not-step-free,not-wheelchair-accessible}'),
  ('39a0623f-349f-46a2-895d-baf4ad70b78a','{not-step-free,not-wheelchair-accessible}'),
  ('3a5c2ae6-6d1e-4c76-9772-0ef7f93c3553','{not-step-free,not-wheelchair-accessible}'),
  ('3a612e45-3f17-47b0-8fa5-7c973aa4b6f4','{not-step-free,not-wheelchair-accessible}'),
  ('3aafa081-b8ef-4f80-8414-abf985bd0bd8','{not-wheelchair-accessible}'),
  ('3cff4ee9-d4a9-4fec-a7d9-f81eb2412f66','{not-wheelchair-accessible}'),
  ('3d6d6a9c-ba53-4a0b-bae1-1099ece0749c','{not-step-free,not-wheelchair-accessible}'),
  ('3e975f48-249e-45b3-af8f-76b979ee835b','{not-step-free,not-wheelchair-accessible}'),
  ('405055ba-8fa0-4c35-a299-d09cd9426eab','{step-free-entrance}'),
  ('4244924f-af3b-4262-b0ac-c531517127f4','{not-step-free,not-wheelchair-accessible}'),
  ('4478442d-9230-4b00-bbff-f0bcb224f9a2','{not-step-free,not-wheelchair-accessible}'),
  ('48dcaedf-24de-40d5-9469-07f1c4bed7ad','{not-wheelchair-accessible}'),
  ('49840914-240e-4620-8d0c-74ee9db19786','{step-free-entrance,wheelchair-accessible}'),
  ('4dd61a92-bb9f-4b40-b658-0c89693622b1','{not-wheelchair-accessible}'),
  ('4f58f16c-d81e-4b0c-938d-86124a6d08ad','{not-wheelchair-accessible}'),
  ('4fc4d13f-d813-4734-81c1-bffbc5d1cd07','{not-step-free,not-wheelchair-accessible}'),
  ('56c48268-12b7-4d64-bc3c-d8601bcc948d','{not-step-free,not-wheelchair-accessible}'),
  ('5a0b754f-e724-439f-ad17-e90f2ba50df2','{not-step-free,not-wheelchair-accessible}'),
  ('5c1278fe-8c68-4f75-b380-87ca15c2bcb8','{not-step-free,not-wheelchair-accessible}'),
  ('5c3ee23e-0aec-4455-aaaf-1c572db8b4d6','{not-step-free,not-wheelchair-accessible}'),
  ('5c4d821b-1333-4861-8887-70b2ab3a39c9','{not-step-free,not-wheelchair-accessible}'),
  ('5eac23be-1044-4b8c-a0a8-368cfd759c8e','{not-step-free,not-wheelchair-accessible}'),
  ('5fb6d510-69d7-4c38-b2ec-60237ed694cb','{not-wheelchair-accessible}'),
  ('60714099-0115-405f-a4a7-7ef6ff031ba6','{not-wheelchair-accessible}'),
  ('61c6c5e1-9d3c-48a5-90cb-ff3f952405d6','{not-step-free,not-wheelchair-accessible}'),
  ('6305ba1d-838f-4531-bfb1-f48941bbe81a','{not-wheelchair-accessible}'),
  ('63d9ea4c-e167-4510-8880-1e4299608d8e','{not-step-free,not-wheelchair-accessible}'),
  ('6881a362-d897-4190-91d5-cfaeec7fc10d','{not-step-free,not-wheelchair-accessible}'),
  ('6a18b469-ddc4-47da-ae19-79a42dc5b03a','{not-step-free,not-wheelchair-accessible}'),
  ('6c226b4e-145d-4da6-8f25-210468f9beea','{not-step-free,not-wheelchair-accessible}'),
  ('6da0164e-50ab-4052-b03f-3a4603f628c8','{not-wheelchair-accessible}'),
  ('6ffe087d-4043-4426-b249-925717696a7f','{not-step-free,not-wheelchair-accessible}'),
  ('701d45fa-9714-4c89-8049-e61b135dae73','{not-step-free,not-wheelchair-accessible}'),
  ('7376077d-cba5-4511-beb9-3eee9ba04615','{not-wheelchair-accessible}'),
  ('73792ce3-03d4-4aa6-a4b5-875f9c4f54b9','{not-step-free,not-wheelchair-accessible}'),
  ('75c4472e-8190-447f-9623-f06d4d8bd12c','{not-step-free}'),
  ('7862a6dd-a81a-49c2-9274-fe4d11a47f0c','{not-wheelchair-accessible}'),
  ('786fa2ea-63a0-4719-9529-02d976081806','{not-step-free,not-wheelchair-accessible}'),
  ('789767dc-c75c-4260-adaa-74c78df3b210','{not-step-free,not-wheelchair-accessible}'),
  ('79c94e5a-08f9-415c-bf0e-44528b75fd8f','{not-wheelchair-accessible}'),
  ('79d54ed6-2e4f-4c87-8852-bbe2a9ff50e2','{not-step-free,not-wheelchair-accessible}'),
  ('7a216e85-596a-44e6-9d45-5342cef60f97','{not-wheelchair-accessible}'),
  ('7aa773db-08dd-4c98-a541-c4fb22407953','{not-step-free,not-wheelchair-accessible}'),
  ('7d80b02a-5f4c-402b-8597-3ee127fba164','{not-wheelchair-accessible}'),
  ('808a1e71-297e-4595-b11b-15853028754a','{not-step-free,not-wheelchair-accessible}'),
  ('811d8c5e-724e-4dd8-89fd-223ee2d25fd8','{not-wheelchair-accessible}'),
  ('8310ad3b-d4b9-4d16-b7c5-59f4e77e4003','{not-step-free,not-wheelchair-accessible}'),
  ('834db4b8-3cb7-4c5b-9769-5fd0c8e8d5b3','{not-step-free,not-wheelchair-accessible}'),
  ('8387726b-511d-4581-b3ad-2196dc8158a9','{not-step-free,not-wheelchair-accessible}'),
  ('8443ac2e-dc5f-4f9c-b2be-11eb026b4869','{not-step-free,not-wheelchair-accessible}'),
  ('84abb9bd-8d9f-4920-b272-1e529d028d85','{not-step-free,not-wheelchair-accessible}'),
  ('8aa2f813-4878-41af-b206-0759a34ce28c','{not-step-free,not-wheelchair-accessible}'),
  ('8b18ff3b-840a-4fed-ab1e-9e135c27d513','{not-wheelchair-accessible}'),
  ('8c569e11-4e51-42d9-bb02-1d21e869040a','{not-wheelchair-accessible}'),
  ('8d5f2717-59da-4d01-823d-aa268956a9d6','{not-step-free,not-wheelchair-accessible}'),
  ('8fb9d5bb-d785-4cd5-a422-8986a44212b6','{not-step-free,not-wheelchair-accessible}'),
  ('90a549a1-a7ab-4519-863e-35c82bdc260f','{not-wheelchair-accessible}'),
  -- `elevator-access` is deliberately NOT retracted here. Its citation,
  -- "3rd f.+lift", is absent from the description but IS in the venue's own NAME
  -- ("… in Montmartre - 3rd f.+lift"), which the prompt carries as its first line —
  -- so the quote is grounded in what the model was shown and a lift corroborates
  -- the slug. `wheelchair-accessible` still goes: a lift to the third floor is not
  -- a step-free entrance, and that is the one distinction a disabled reader needs.
  ('919ab67b-8a54-428e-a20e-326551877380','{wheelchair-accessible}'),
  ('935a5ad1-4e26-4e2b-8783-ad1a2f74e7b1','{not-step-free,not-wheelchair-accessible}'),
  ('972e12b5-95c6-4612-99a2-cc38d1ed3f29','{not-step-free,not-wheelchair-accessible}'),
  ('98ae62e5-0de6-4f67-9546-aebf562ada44','{not-wheelchair-accessible}'),
  ('98bbad41-3f89-4fbe-a944-2fb147c1c7ea','{not-step-free,not-wheelchair-accessible}'),
  ('98d7a9a1-9a5b-440d-b84c-9a29a10852cd','{not-step-free}'),
  ('99c9080c-bb0a-4795-a774-2e3ad6bd0961','{not-step-free,not-wheelchair-accessible}'),
  ('9af562ef-fb66-45ec-ace0-e043caf0a34a','{not-step-free,not-wheelchair-accessible}'),
  ('9c10ca09-66ae-4636-9f18-7e3765b6d26e','{not-step-free,not-wheelchair-accessible}'),
  ('9cfa5e99-c16a-48c1-820d-604b2718a8f4','{not-step-free,not-wheelchair-accessible}'),
  ('9d09838c-9bb5-4e6f-b163-5296dae99d5d','{not-step-free,not-wheelchair-accessible}'),
  ('9d24d257-ee45-4305-8ec8-c6aa513074a6','{not-step-free,not-wheelchair-accessible}'),
  ('9d948703-b27e-43cf-b08a-a2af0faae230','{not-step-free,not-wheelchair-accessible}'),
  ('9ef52fea-daf4-4bc9-b4aa-a693a17bb093','{not-step-free,not-wheelchair-accessible}'),
  ('a019ca36-1cde-451c-9020-153e030d628e','{not-step-free,not-wheelchair-accessible}'),
  ('a5fdae8d-a1e2-4740-b2e9-ffb5f57c3cf1','{not-wheelchair-accessible}'),
  ('a6dd9f89-6a99-435f-89c1-1d09ca29a67e','{not-step-free,not-wheelchair-accessible}'),
  ('a71603e0-1132-498a-a93d-35899bf215c1','{not-step-free,not-wheelchair-accessible}'),
  ('a92d5863-f728-48f8-b392-219ed1ea0555','{not-wheelchair-accessible}'),
  ('aacc15d4-eb06-4467-ad9f-6567040af708','{not-step-free,not-wheelchair-accessible}'),
  ('b05442e9-0565-41a4-b1eb-b5433a9d04b3','{not-step-free,not-wheelchair-accessible}'),
  ('b0a5138f-44f3-40ae-9702-2b5bc00c2b6b','{not-step-free,not-wheelchair-accessible}'),
  ('b1f1b849-38f2-4e48-885a-b7f38b7fab98','{not-step-free,not-wheelchair-accessible}'),
  ('b2a81200-4b0f-4626-938c-e9d61b81fd84','{not-step-free,not-wheelchair-accessible}'),
  ('b3db9833-b3ff-4b2f-bbef-fd3c9fbbf38b','{not-wheelchair-accessible}'),
  ('b5ccaae6-a8e8-4f94-a991-440e0332517d','{not-step-free,not-wheelchair-accessible}'),
  ('b6fe52e5-8f86-4162-a3d7-9412ef40afba','{not-step-free,not-wheelchair-accessible}'),
  ('b99f73c9-ada0-4483-acca-7fffaab5ab13','{not-wheelchair-accessible}'),
  ('ba66f391-91ec-437c-9d63-95666af29140','{not-step-free,not-wheelchair-accessible}'),
  ('bc765311-e422-468a-bd73-0c31c02d7859','{not-step-free,not-wheelchair-accessible}'),
  ('bfff0f54-f199-431a-afe5-41c8965729be','{not-wheelchair-accessible}'),
  ('c0272f33-ed28-4a58-9ffb-5b355a77dfeb','{not-step-free,not-wheelchair-accessible}'),
  ('c2881ef3-2c50-4f5d-919d-193a31adcc5d','{not-step-free,not-wheelchair-accessible}'),
  ('c3f7ee48-245a-4ac7-b0a6-702f2ea216ae','{not-step-free,not-wheelchair-accessible}'),
  ('c61f1688-02ac-49a4-a9ea-d60e4a98d372','{not-step-free,not-wheelchair-accessible}'),
  ('c9abe0f5-9e51-41cf-93b8-8473ef66350e','{not-step-free,not-wheelchair-accessible}'),
  ('ca05f081-f847-4f01-9df2-4edadf89482e','{not-step-free,not-wheelchair-accessible}'),
  ('ce0911e1-6c81-461d-aa92-1c94f7dba415','{not-step-free,not-wheelchair-accessible}'),
  ('ced008bd-49c6-4294-b2a7-7c0ff63555b0','{not-step-free,not-wheelchair-accessible}'),
  ('d2ab17ee-fbc4-4d44-b80f-0cf152c221da','{not-step-free,not-wheelchair-accessible}'),
  ('d43aabb8-0712-423c-9121-55d7f8fc8b5c','{not-step-free,not-wheelchair-accessible}'),
  ('d5986ad4-299a-412c-a952-56aa7614e4a2','{not-step-free,not-wheelchair-accessible}'),
  ('d59dfbf5-ceda-41c7-b6d2-73e58cbbbd3b','{not-step-free,not-wheelchair-accessible}'),
  ('d934300b-7c4e-4d92-9bdc-5637e101dcc3','{not-step-free,not-wheelchair-accessible}'),
  ('db0354b9-26ad-44ea-bab9-2ee7ac598665','{not-step-free,not-wheelchair-accessible}'),
  ('db355fc8-ad28-4c15-a849-ff2334e10d02','{not-step-free,not-wheelchair-accessible}'),
  ('db4ee11e-596a-4f10-a16a-eb344a41d47f','{not-wheelchair-accessible}'),
  ('def62c1c-c1da-4432-a85c-c2ce1257f787','{not-step-free,not-wheelchair-accessible}'),
  ('dfee2de1-76a2-4913-8b45-daf8240cdb0a','{not-step-free,not-wheelchair-accessible}'),
  ('e1172822-f443-4c46-a009-ce89dd1dff79','{not-step-free,not-wheelchair-accessible}'),
  ('e1b9e40c-45f8-4569-a96f-542dd34346f4','{not-step-free,not-wheelchair-accessible}'),
  ('e3abdcd4-ff22-47ac-beed-28836f6ad1e5','{not-step-free,not-wheelchair-accessible}'),
  ('e3c158ac-529e-45f6-9186-4329f9b0c21c','{not-step-free,not-wheelchair-accessible}'),
  ('e4dfee88-519e-4215-9b24-dd98a05cf670','{not-step-free,not-wheelchair-accessible}'),
  ('e6efd6f2-fc24-4396-b713-7d9b8f435232','{not-step-free,not-wheelchair-accessible}'),
  ('ea8b463d-efa8-4922-be46-893db96e6f64','{not-step-free,not-wheelchair-accessible}'),
  ('eb4b6721-3c6d-40c6-b5fd-26460f8ae7e5','{not-step-free,not-wheelchair-accessible}'),
  ('ed7ba7a6-fd59-4d8c-a948-f04586e6db28','{not-wheelchair-accessible}'),
  ('ee09c03c-546f-4d53-a7a2-d46d30e2242d','{not-step-free,not-wheelchair-accessible}'),
  ('ee2ef16d-16ce-4789-a99e-8f3033778f65','{not-step-free,not-wheelchair-accessible}'),
  ('ee366dec-e3f7-46a9-b45d-acc1ca69ae9a','{not-wheelchair-accessible}'),
  ('efb4d8c0-0e96-447a-9ebb-b267f33efe34','{not-step-free,not-wheelchair-accessible}'),
  ('f00c2357-dbc0-4f58-8595-2c056f0c1c6a','{not-step-free,not-wheelchair-accessible}'),
  ('f110b1c2-e9bf-4711-b8aa-6e21a9e3ce48','{not-step-free,not-wheelchair-accessible}'),
  ('f15b5322-a9a5-4d88-a703-57574a6d4c8a','{not-step-free,not-wheelchair-accessible}'),
  ('f1d1d3c9-6948-46f7-a97d-23c6fc4c4d68','{not-step-free,not-wheelchair-accessible}'),
  ('f2371f3f-ba59-4fb7-9299-fcda43a2001d','{step-free-entrance,wheelchair-accessible}'),
  ('f7517a37-0f39-4322-98ef-c8add0c440b6','{not-wheelchair-accessible}'),
  ('f879a400-0ec0-4466-a89d-b132376c93d8','{not-step-free,not-wheelchair-accessible}'),
  ('f9e06e02-d5a8-4e21-a649-99d783e2b18e','{not-step-free,not-wheelchair-accessible}'),
  ('ffeb1c83-3c80-4887-aac6-162216fc037f','{not-step-free,not-wheelchair-accessible}')  ;

  select count(*), sum(cardinality(slugs)) into v_venues, v_pairs from _acc_retract;
  raise notice 'retract set: % venues, % (venue,slug) pairs', v_venues, v_pairs;

  -- Re-cite the four whose source DOES support the claim, before the retraction
  -- runs, so an abort cannot leave them stripped of their citation.
  with recite(rid, quote) as (values
    ('7ba8c77f-9378-43ff-83e2-6c374b566846'::uuid, 'On the immediate left of the hallway will be a large bathroom with an “All Gender Restroom” sign.'),
    ('8d1928bd-caef-4b66-bb4a-fa39924478f0', 'Paying customer only and there are two unisex restoom'),
    ('e99b75b9-4cec-48c2-9ce0-44ac8fcc5651', 'Two gender neutral restrooms'),
    ('f14ded17-a02a-4ebf-9725-ba27c4abed06', 'Both are all gender.')
  )
  update public.entity_review_queue q
     set citations = jsonb_build_array(jsonb_build_object(
           'field','description',
           'quote', r.quote,
           'superseded_by_migration','99991791028169',
           'superseded_quote', coalesce(q.citations->0->>'quote','(none)')))
    from recite r
   where q.id = r.rid
     and q.entity_type = 'venue'
     and q.field = 'accessibility_attributes';
  get diagnostics v_recited = row_count;
  raise notice 're-cited % row(s)', v_recited;

  -- Retract. Guarded on the slug being present, so a re-run is a no-op, and
  -- `array_agg ... where` keeps everything the set does not name (measured: there
  -- is nothing else on these venues today, but a slug written between authoring
  -- and apply must survive).
  update public.venues v
     set accessibility_attributes = coalesce(
           (select array_agg(x order by x) from unnest(v.accessibility_attributes) x
             where not (x = any(r.slugs))), '{}'::text[]),
         enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
           'accessibility_retracted', jsonb_build_object(
             'at', now(),
             'by', 'migration:99991791028169',
             'slugs', to_jsonb(r.slugs),
             'reason', 'citation absent from the text the model was shown; 93% of this cohort cited a bare slug string as its own quote'))
    from _acc_retract r
   where v.id = r.venue_id
     and v.accessibility_attributes && r.slugs;
end $retract$;

-- ---------------------------------------------------------------------------
-- Sentinel correction: ground against what the model was SHOWN
-- ---------------------------------------------------------------------------
-- The original grounded against `description` alone. The prompt also carried a
-- tag line, so a quote taken from the tags read as fabricated — measured, that is
-- 6 claims (270 vs 264). Testing the real prompt text is both more correct and
-- what makes the gate below reachable at zero.
--
-- `live_machine_claims` also now EXCLUDES rows this programme dispositioned by
-- hand: they are `reviewer_id IS NULL` by design, so the previous migration's own
-- 7 approvals inflated the cohort it was meant to describe (1,035 -> 1,040). The
-- gated key never moved, but a cohort number that counts the repair is a number a
-- reader will misread.
create or replace function public.venue_accessibility_evidence_signals()
returns jsonb
language plpgsql
security definer
set search_path to ''
stable
as $fn$
declare v_out jsonb;
begin
  with claims as (
    select q.id, v.id as vid, s.slug,
      (select count(*) from jsonb_array_elements(coalesce(q.citations, '[]'::jsonb)) e) as n_quotes,
      (select count(*) from jsonb_array_elements(coalesce(q.citations, '[]'::jsonb)) e
        -- The prompt's first line is `Venue: <name> | Category: …`, so a quote
        -- taken from the NAME is grounded in what the model was shown. Measured:
        -- 2 claims turn on this. The ALLOWED-slug lines of the prompt are
        -- deliberately NOT included — every slug would corroborate itself.
        where coalesce(e->>'quote', '') <> ''
          and position(e->>'quote' in (
          coalesce(v.name, '') || E'\n' || coalesce(v.description, '')
          || E'\nTags: ' || coalesce(array_to_string(v.tags, ', '), ''))) > 0) as n_grounded
    from public.entity_review_queue q
    join public.venues v on v.id = q.entity_id
    cross join lateral jsonb_array_elements_text(q.proposed_value->'value') s(slug)
    where q.entity_type = 'venue'
      and q.field = 'accessibility_attributes'
      and q.status = 'approved'
      and q.reviewer_id is null
      and v.accessibility_attributes @> array[s.slug]
      -- Exclude the rows this programme decided by hand; they are machine-signed
      -- only because a migration has no `auth.uid()`.
      and coalesce(q.reviewer_note, '') not like 'migration:99991790879465%'
  )
  select jsonb_build_object(
    'live_machine_claims', (select count(*) from claims),
    'live_venues', (select count(distinct vid) from claims),
    'ungrounded_live_claims',
      (select count(*) from claims where n_quotes = 0 or n_grounded = 0),
    'ungrounded_live_venues',
      (select count(distinct vid) from claims where n_quotes = 0 or n_grounded = 0),
    'open_queue_claims',
      (select count(*) from public.entity_review_queue
        where entity_type = 'venue' and field like 'accessibility%' and status = 'open'),
    'probe_ok', true
  ) into v_out;
  return v_out;
end $fn$;

comment on function public.venue_accessibility_evidence_signals() is
  'Live venue accessibility claims whose citation is absent from the text the '
  'model was shown (description + the prompt tag line). ZERO-INVARIANT since '
  '99991791028169 retracted the 260-claim backlog: the producer can no longer emit '
  'an unevidenced slug, so any non-zero reading is a new regression rather than a '
  'backlog. Grounds against description AND tags — description alone over-reports '
  'by 6. Excludes rows dispositioned by migration 99991790879465, which are '
  'machine-signed only because a migration has no auth.uid().';

revoke all on function public.venue_accessibility_evidence_signals() from public, anon, authenticated;
grant execute on function public.venue_accessibility_evidence_signals() to service_role;

do $verify$
declare v_bad int; v_attrs text[]; v_sig jsonb;
begin
  -- P1 — no venue carrying the retraction stamp still publishes a slug the stamp
  -- says was removed. Self-referential on purpose: it reads the record the
  -- migration wrote, so it cannot pass by the stamp and the write disagreeing.
  select count(*) into v_bad
    from public.venues v
    cross join lateral jsonb_array_elements_text(
      v.enrichment_status->'accessibility_retracted'->'slugs') s(slug)
   where v.enrichment_status->'accessibility_retracted'->>'by' = 'migration:99991791028169'
     and v.accessibility_attributes @> array[s.slug];
  if v_bad <> 0 then
    raise exception 'P1 failed: % retracted slug(s) are still live', v_bad;
  end if;

  -- P2 — for EVERY venue in the frozen set, either this migration stamped it or
  -- none of its named slugs are live any more (somebody else got there first).
  --
  -- Deliberately NOT `stamp count = 150`. That reads like a postcondition and is
  -- an exact-match PRECONDITION in disguise: the `&& r.slugs` guard correctly
  -- skips a venue whose slug another session already removed, and aborting on
  -- that takes `db push` — and every migration queued behind it — down over a row
  -- somebody else handled correctly. This asserts the END STATE, true either way.
  select count(*) into v_bad
    from _acc_retract r
    join public.venues v on v.id = r.venue_id
   where v.enrichment_status->'accessibility_retracted'->>'by' is distinct from 'migration:99991791028169'
     and v.accessibility_attributes && r.slugs;
  if v_bad <> 0 then
    raise exception 'P2 failed: % venue(s) still publish a named slug and carry no stamp', v_bad;
  end if;

  -- P2b — but something must have happened. A silently empty sweep passes every
  -- "nothing is wrong" check above.
  select count(*) into v_bad from public.venues v
   where v.enrichment_status->'accessibility_retracted'->>'by' = 'migration:99991791028169';
  if v_bad = 0 then
    raise exception 'P2b failed: the retraction stamped no venues at all';
  end if;
  raise notice 'retraction stamped % venue(s) (frozen set: 150)', v_bad;

  -- P3 — MIRROR. The four whose source supports the claim must STILL publish it.
  -- Without this, a sweep that took everything satisfies P1 perfectly.
  select count(*) into v_bad from public.venues v
   where v.id in ('00823aee-d902-4ffe-a0e6-ea7b38f8d404','31e53ad9-9834-4895-b5e2-ca26bca98101',
                  '3c3c4e15-883b-46b9-b662-d713d18e487b','9acb8e6c-bed5-4d08-88e0-4b31d4839a25')
     and not (v.accessibility_attributes @> array['gender-neutral-restroom']);
  if v_bad <> 0 then
    raise exception 'P3 failed: % of the 4 source-supported venues lost their slug', v_bad;
  end if;

  -- P3b — THE SPLIT ROW. The Montmartre listing's citation "3rd f.+lift" is absent
  -- from its description but present in its NAME, which the prompt's first line
  -- carries — so the quote is grounded. `elevator-access` is corroborated by it and
  -- must SURVIVE; `wheelchair-accessible` is not (a lift to the third floor is not
  -- a step-free entrance) and must GO. Asserting only one half would pass on a
  -- sweep that took both or kept both, and this is the one row where grounding and
  -- corroboration disagree.
  select v.accessibility_attributes into v_attrs from public.venues v
   where v.id = '919ab67b-8a54-428e-a20e-326551877380';
  if not (v_attrs @> array['elevator-access']) then
    raise exception 'P3b failed: the lift evidenced by the venue name was retracted (got %)', v_attrs;
  end if;
  if v_attrs @> array['wheelchair-accessible'] then
    raise exception 'P3b failed: a lift was allowed to stand as a step-free entrance (got %)', v_attrs;
  end if;

  -- P4 — the re-citation is POSITIONAL: the new quote is live and the old one
  -- survives only under `superseded_quote`.
  select count(*) into v_bad from public.entity_review_queue q
   where q.id in ('7ba8c77f-9378-43ff-83e2-6c374b566846','8d1928bd-caef-4b66-bb4a-fa39924478f0',
                  'e99b75b9-4cec-48c2-9ce0-44ac8fcc5651','f14ded17-a02a-4ebf-9725-ba27c4abed06')
     and not exists (select 1 from jsonb_array_elements(q.citations) c
                      where c->>'superseded_by_migration' = '99991791028169'
                        and coalesce(c->>'quote','') <> '');
  if v_bad <> 0 then
    raise exception 'P4 failed: % re-cited row(s) lack a positional citation', v_bad;
  end if;

  -- P5 — CONTROL. The claims the previous pass approved on evidence are outside
  -- this sweep and must be untouched.
  select v.accessibility_attributes into v_attrs from public.venues v
   where v.id = '3a309791-52a8-4963-adc0-4f3d74cae48b';   -- Bar Phoebe
  if not (v_attrs @> array['accessible-restroom']) then
    raise exception 'P5 failed: the sweep reached Bar Phoebe (got %)', v_attrs;
  end if;
  select count(*) into v_bad from public.venues v
   where v.id in ('c4a91b65-3e04-415f-90e8-c10b556103a0','717adaeb-96f8-4d09-a941-ef0d33f71fb2',
                  'f5f15261-4b7c-4261-a493-b8e0735c8173','39ee804c-12f2-4296-bb41-395ad7a9f1e6')
     and not (v.accessibility_attributes @> array['gender-neutral-restroom']);
  if v_bad <> 0 then
    raise exception 'P5 failed: the sweep reached % previously-approved venue(s)', v_bad;
  end if;

  -- P6 — the invariant the sentinel now gates on is actually reached. Asserted by
  -- CALLING it, because a source-text check cannot tell a live probe from a dead one.
  v_sig := public.venue_accessibility_evidence_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'P6 failed: sentinel does not report probe_ok';
  end if;
  if (v_sig->>'ungrounded_live_claims')::int <> 0 then
    raise exception 'P6 failed: % ungrounded claim(s) remain live — %',
      v_sig->>'ungrounded_live_claims', v_sig;
  end if;
  -- The cohort must still be non-empty, or a zero above is vacuous.
  if (v_sig->>'live_machine_claims')::int <= 0 then
    raise exception 'P6 failed: cohort is empty, so the zero means nothing — %', v_sig;
  end if;

  raise notice 'all postconditions passed: %', v_sig;
end $verify$;
