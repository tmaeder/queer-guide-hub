-- Drain the 2026-08-29 wrong-entity review backlog.
--
-- That pass cleared 1,506 tags and routed 254 to
-- tag_wikidata_repair_audit.disposition='review' for a human to decide.
-- Nobody ever came. Six days on, 109 of those rows are still active and still
-- carrying the identifier the pass flagged, 41 of them seo_indexable.
-- Finding a wrong link, filing it, and leaving it published is not a fix.
--
-- Judged the same way as the 89-group duplicate pass: against each QID's LIVE
-- Wikidata label, not against the flag. A 'review' verdict never meant "wrong",
-- it meant "unexamined" -- lgbtq-friendly and prostate-stimulator sit in this
-- same backlog and are both correct. Of the 109:
--
--   48 retracted here      the identifier denotes a different thing
--   14 left for review     ambiguous, or still-open groups from the 89-group pass
--   47 kept untouched      correct, or defensibly broader/narrower
--
-- KEEPING 47 is the point. The first pass's own recorded lesson is that
-- auto-clearing "wrong-looking" concept QIDs was measured to destroy ~70%
-- correct links, so a QID that is merely broader (relationship -> interpersonal
-- relationship, self-harm -> self-injury, theater -> theatre) is left alone.
-- Only a demonstrably different entity is cleared.
--
-- What that looks like in practice:
--   switch      -> Q19610114 the NINTENDO SWITCH console
--   switching   -> Q1429051  shunting RAILWAY vehicles
--   mutha       -> Q212761   Al Muthanna Governorate, Iraq
--   restraints  -> Q56162322 a WIKIDATA-INTERNAL WikiProject page
--   scat        -> Q30015788 subcutaneous adipose tissue
--   support     -> Q861259   the canvas a painting is stretched on (u=201)
--   feeder      -> Q1048902  the BASEBALL pitcher
--   size-l/-s   -> Q9927/Q9956 letters of the Latin alphabet
--   schoolgirl  -> Q48942    "child studying in a school", on a Fetishes tag
--
-- That last one is why this is not cosmetic. An adult roleplay archetype must
-- never resolve to an identifier for a real child, and 'whore' (Fetishes)
-- pointing at Q14915751 "prostitute" mislabels sex workers with a kink term.
--
-- wikipedia_url is cleared with the identifier, for the reason 20270105100000
-- recorded: it is the redirect target of the same wrong lookup, so leaving it
-- keeps serving the wrong identity from the same page.
--
-- Nothing is re-resolved. tag_medical_codes_sync and tag_wikidata_hierarchy
-- rebuild weekly from this column, so a plausible-but-wrong id regenerates
-- wrong data forever while a null one regenerates nothing.
--
-- Generated from scripts/data-quality/out/backlog-retractions.json by
-- scripts/data-quality/generate-tag-review-backlog-migration.mjs.
-- Do not hand-edit: src/lib/__tests__/tagReviewBacklog.test.ts round-trips the two.

do $do$
declare
  v_audited int;
  v_cleared int;
  v_skipped int;
  v_left    int;
begin
  -- Many of these are human_reviewed, and log_unified_tag_change() RAISEs when
  -- an undeclared system:% actor edits one. Declare a real actor so the
  -- before_data snapshot lands in tag_change_log and this stays reversible.
  perform set_config('app.actor', 'admin:tag-review-backlog-drain', true);

  create temp table _drain (
    slug   text primary key,
    qid    text not null,
    label  text,
    descr  text,
    reason text not null
  ) on commit drop;

  insert into _drain (slug, qid, label, descr, reason) values
  ('aftercare', 'Q494330', 'after-school activity', 'type of educational activity', 'BDSM aftercare. The QID is a type of educational activity.'),
  ('awareness', 'Q9081', 'knowledge', 'awareness of facts, familiarity with individuals and situations, or practical skill; encompasses descriptive, procedural, and acquaintance knowledge, typically characterized as justified true belief distinct from opinion or guesswork', 'Awareness-raising. The QID is knowledge/familiarity in general.'),
  ('binding', 'Q2648051', 'obligation', 'legal or moral requirement to take a certain course of action', 'Chest binding (Trans Health). The QID is a legal/moral obligation.'),
  ('bootblack', 'Q1517909', 'shoeshiner', 'occupation', 'Leather-community role (Dynamics & Roles). The QID is the occupation.'),
  ('decriminalization-of-homosexuality', 'Q1266145', 'sexual orientation and gender identity at the United Nations', 'legal concept, declarations and resolutions of the United Nations in favor of the universal decriminalization of homosexuality and the respect for the sexual orientation and gender identity of individuals', 'Decriminalisation specifically. The QID is the broad SOGI legal concept - a different claim.'),
  ('dependency', 'Q3044808', 'outbuilding', 'annex to a construction, as a distinct building or a secondary part of the main one', 'A BDSM dynamic. The QID is an annex to a building.'),
  ('devotee', 'Q193432', 'fan', 'person who is enthusiastically devoted to something or someone', 'A kink/community role. The QID is a sports-or-music fan.'),
  ('feeder', 'Q1048902', 'pitcher', 'player responsible for throwing ("pitching") the ball to the batters in a game of baseball or softball', 'A feedism role. The QID is the BASEBALL player who pitches.'),
  ('fire-bottom', 'Q110289863', 'grate inset', null, 'Receiver of fire play. The QID is a fireplace part.'),
  ('footboy', 'Q4382663', 'footman', 'male servant', 'A foot-fetish role. The QID is a male household servant.'),
  ('health-well-being', 'Q2284929', 'health risk assessment', 'screening tools and systematic approach in the field of health promotion for collecting information from individuals that identifies risk factors, providing feedback, and facilitating intervention to promote health and prevent disease', 'A health topic hub. The QID is a specific screening instrument.'),
  ('honorifics', 'Q135725', 'Z"l', 'abbreviation', 'Kink honorifics. The QID is a Hebrew abbreviation.'),
  ('host', 'Q947873', 'television presenter', 'person who introduces or hosts television programs', 'A kink role. The QID is a TV presenter.'),
  ('huntress', 'Q1714828', 'hunter', 'person who hunts', 'A kink role, and gendered. The QID is a person who hunts.'),
  ('international-solidarity', 'Q775858', 'humanitarianism', 'belief system to value human life and in actively assisting other humans to improve conditions of humanity', 'Political solidarity. The QID is humanitarianism.'),
  ('interracial', 'Q1378555', 'multiracial people', 'people of more than one race', 'A Fetishes tag. The QID is multiracial PEOPLE.'),
  ('leader', 'Q871232', 'editorial', 'journalism genre', 'An identity tag. The QID is the JOURNALISM genre (a leader column).'),
  ('librarians', 'Q58325960', 'library profession', null, 'A Fetishes archetype. The QID is the actual profession.'),
  ('locker-room', 'Q1070054', 'changing room', 'room where you can change your clothes', 'A Fetishes tag. The QID is a generic changing room.'),
  ('long-hair', 'Q14130', 'waist-length hair', 'any hairstyle where the head hair is allowed to grow past the shoulder but no longer than the waist', 'A Fetishes tag (attraction). The QID is a hair LENGTH.'),
  ('marineflieger', 'Q1898391', 'German Naval Aviation Command', 'aviation component of Germany''s navy', 'Filed under Sex & Kink. The QID is a branch of the German navy.'),
  ('medical-transition', 'Q136209093', null, 'book 2014', 'The QID is a BOOK published 2014, not the medical process.'),
  ('mutha', 'Q212761', 'Al Muthanna Governorate', 'governorate of Iraq', 'A kink term. The QID is a governorate of Iraq.'),
  ('office', 'Q294414', 'public office', 'elected or appointed political position', 'A workplace venue. The QID is an elected political position.'),
  ('old-theatre', 'Q32676474', 'Stamford Arts Centre', 'theatre in Stamford, England', 'A venue TYPE. The QID is one specific theatre in Stamford, England.'),
  ('owner', 'Q618532', 'landlord', 'owner of a house, apartment, condominium, land or real estate, which is rented or leased to an individual or business, called a tenant, lessee or renter', 'A BDSM role. The QID is a property landlord.'),
  ('pack', 'Q113469875', 'Packard Fellowship for Science and Engineering', 'science fellowship', 'A kink group dynamic. The QID is a science fellowship.'),
  ('packing', 'Q11640447', 'carrying', 'lifting and transporting something', 'Trans packing (a prosthetic). The QID is lifting and transporting things.'),
  ('pet-owner', 'Q123059176', 'pet keeper', 'person who owns a pet', 'A BDSM role. The QID is someone who owns an animal.'),
  ('restraints', 'Q56162322', 'WikiProject Property constraints', 'Wikidata project about property constraints', 'Bondage gear. The QID is a WIKIDATA-INTERNAL project page.'),
  ('rumpus-room', 'Q2911974', 'recreation room', 'room used for a variety of purposes, such as parties, games and other everyday or casual use', 'Its own prose says "in the context of kink". The QID is a domestic rec room.'),
  ('sacred-play', 'Q136232489', null, 'book 2007', 'The QID is a BOOK published 2007.'),
  ('scat', 'Q30015788', 'subcutaneous adipose tissue', 'adipose tissue that is part of the hypodermis', 'A kink practice. The QID is body fat.'),
  ('scent', 'Q485537', 'odor', 'thing sensed by smell', 'A Fetishes tag. The QID is odour in general.'),
  ('schoolgirl', 'Q48942', 'schoolchild', 'child studying in a school', 'A Fetishes archetype. The QID is "child studying in a school" - an adult roleplay tag must never resolve to a real child.'),
  ('sensualism', 'Q651205', 'sensationism', 'view in epistemology and cognitive psychology that perceptions underlie all cognition; thinking is recollection, modification, association,and comparison of perceptions', 'A kink lifestyle. The QID is a position in epistemology.'),
  ('size-l', 'Q9927', 'L/l', '12th letter of the basic Latin alphabet', 'A garment size. The QID is the 12th LETTER of the Latin alphabet.'),
  ('size-s', 'Q9956', null, '19th letter of the basic Latin alphabet', 'A garment size. The QID is the 19th LETTER of the Latin alphabet.'),
  ('stability', 'Q23611288', 'never changes', 'value of this property is not expected to change', 'Mental-health stability. The QID is a Wikidata property-constraint value.'),
  ('support', 'Q861259', 'painting support', 'material which forms the surface on which a painting of picture is applicated, for example canvas or paper', 'Community support (u=201). The QID is the canvas a painting sits on.'),
  ('suspension', 'Q87406427', 'account suspension', 'action performed by an administrative entity to deny an account from interacting with their website', 'Rope suspension. The QID is an administrative account ban.'),
  ('switch', 'Q19610114', null, 'hybrid video game console', 'The BDSM role. The QID is the NINTENDO SWITCH.'),
  ('switching', 'Q1429051', 'shunting', 'sorting railway vehicles into complete trains (or the reverse)', 'Alternating dom/sub roles. The QID is sorting RAILWAY vehicles.'),
  ('values', 'Q23766486', 'list of values as qualifiers', 'dummy value for "union of" P2737 and "disjoint union of" P2738 to specify the items of which this class is the union. Use "list item" P11260 as a qualifier to specify the items.', 'The QID is a Wikidata DUMMY value for a property union.'),
  ('vers', 'Q5185279', 'poem', 'form of literature, work of poetry, often composed of verses', 'Versatile (Dynamics & Roles). The QID is a form of poetry.'),
  ('whore', 'Q14915751', 'prostitute', 'person who has sex for money', 'A reclaimed kink term (Fetishes). The QID is a sex worker - conflating the two mislabels real people.'),
  ('women-only', 'Q133041419', null, 'exhibition in Centraal Museum, Utrecht, The Netherlands in 2002', 'The QID is an EXHIBITION at the Centraal Museum, Utrecht.'),
  ('workshop', 'Q746628', 'studio', 'working place set aside for artist to work, the term is generally applied to workspaces used by artists creating fine art, particularly art dating from the 16th century to the present', 'An event type (u=384). The QID is an artist’s studio room.');

  -- Only rows STILL carrying the audited identifier are touched; anything a
  -- concurrent session moved is skipped rather than overwritten.
  create temp table _target on commit drop as
    select t.id, t.slug, t.wikidata_id, t.wikipedia_url, d.label, d.descr, d.reason
      from public.unified_tags t
      join _drain d on d.slug = t.slug and d.qid = t.wikidata_id
     where t.status = 'active';

  select count(*) into v_skipped from _drain d
   where not exists (select 1 from _target g where g.slug = d.slug);

  -- tag_id is the PRIMARY KEY of the audit table, and every row here ALREADY
  -- has one carrying disposition='review' from 2026-08-29. The conflict arm
  -- promotes review -> cleared and deliberately does not rewrite previous_*:
  -- that is the first pass's evidence, and an audit row you overwrite is an
  -- audit row you no longer have.
  insert into public.tag_wikidata_repair_audit
    (tag_id, disposition, previous_wikidata_id, previous_wikipedia_url,
     wikidata_label, wikidata_description, reason, repaired_at)
  select g.id, 'cleared', g.wikidata_id, g.wikipedia_url,
         g.label, g.descr, g.reason, now()
    from _target g
  on conflict (tag_id) do update
     set disposition = 'cleared',
         reason      = excluded.reason,
         repaired_at = now();
  get diagnostics v_audited = row_count;

  -- 48 rows in one statement. Each write enqueues into search_reindex_queue
  -- via the tag search trigger; at this size that is fine, but do not widen the
  -- pattern to a four-figure sweep without batching it.
  update public.unified_tags t
     set wikidata_id   = null,
         wikipedia_url = null,
         updated_at    = now()
    from _target g
   where t.id = g.id;
  get diagnostics v_cleared = row_count;

  raise notice 'review backlog drain: % audited, % cleared, % skipped',
    v_audited, v_cleared, v_skipped;

  -- Re-assert the condition this migration exists to fix.
  select count(*) into v_left
    from public.unified_tags t
    join _drain d on d.slug = t.slug and d.qid = t.wikidata_id
   where t.status = 'active';

  if v_left <> 0 then
    raise exception 'review backlog drain incomplete: % tag(s) still carry the retracted identifier', v_left;
  end if;
  if v_cleared <> v_audited then
    raise exception 'audit/clear mismatch: % audited but % cleared', v_audited, v_cleared;
  end if;
end $do$;
