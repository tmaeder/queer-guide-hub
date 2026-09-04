-- Retract wrong Wikidata identifiers from unified_tags.
--
-- 89 QIDs are shared by more than one ACTIVE tag. The brief that opened this
-- work read that as 83 merge candidates. It is not: for 34 of those rows the
-- QID denotes something the tag simply is not, so the two members are two
-- THINGS wearing one name, not two names for one thing. Merging them would
-- have destroyed a distinct concept apiece. The sharpest cases:
--
--   questioning        -> Q327018  "interrogation"  (law-enforcement questioning)
--   femminiello        -> Q1052281 "trans woman"    (a Neapolitan identity, not a synonym)
--   cunt               -> Q2192288 "vulva"          (a reclaimed slur vs an anatomy page)
--   teacher (Fetishes) -> Q37226   "teacher"        (the profession)
--   offering/submission-> Q76903164 "submission"    (submitting an item for approval)
--   man/male/boy/masc  -> Q6581097 "male"           (the P21 sex-or-gender VALUE, not a concept)
--
-- This is the namesake/wrong-sense class of 2026-08-29, one vocabulary later.
--
-- wikipedia_url goes WITH the QID. 28 of the 34 carry a live link to the wrong
-- article (questioning -> Interrogation, femminiello -> Trans_woman, cunt ->
-- Vulva); retracting the identifier while leaving the link published would keep
-- serving the wrong identity from the same page. tag_wikidata_repair_audit
-- already carries previous_wikipedia_url for exactly this reason.
--
-- Nothing is RE-RESOLVED. tag_medical_codes_sync and tag_wikidata_hierarchy
-- rebuild weekly from this identifier, so a plausible-but-wrong QID regenerates
-- wrong data forever while a null one regenerates nothing. Prefer NULL to a guess.
-- (Measured: 0 of these 34 currently carry a diagnostic code, so no clinical
-- claim is being unwound here -- but that is luck, not design.)
--
-- Prose is deliberately NOT touched. femminiello's description was overwritten
-- from the wrong entity and still opens "A trans woman ... assigned male at
-- birth"; that is real harm and it is a separate, reviewed pass, not a silent
-- side effect of a QID cleanup.
--
-- Merges are a SEPARATE migration. Retraction only nulls two columns; a merge
-- moves content and can carry the loser's category junction onto the winner.
-- Different risk, different change.
--
-- Generated from scripts/data-quality/out/decisions.json by
-- scripts/data-quality/generate-tag-qid-retraction-migration.mjs.
-- Do not hand-edit: src/lib/__tests__/tagQidRetraction.test.ts round-trips the two.

do $do$
declare
  v_audited int;
  v_cleared int;
  v_skipped int;
  v_left    int;
begin
  -- 30 of these rows are human_reviewed, and log_unified_tag_change() RAISEs
  -- when an undeclared system:% actor edits one. Declare a real actor so the
  -- before_data snapshot lands in tag_change_log and this stays reversible.
  perform set_config('app.actor', 'admin:tag-qid-retraction', true);

  create temp table _retract (
    slug   text primary key,
    qid    text not null,
    label  text,
    descr  text,
    reason text not null
  ) on commit drop;

  insert into _retract (slug, qid, label, descr, reason) values
  ('abrosexual', 'Q19810527', 'sexual fluidity', 'changes in sexuality or sexual identity', 'Q is "sexual fluidity"; abrosexual is its own label.'),
  ('accipiosexual', 'Q124822805', 'iamvanosexuality', null, 'Distinct micro-labels; the QID is iamvanosexuality.'),
  ('algolagnia', 'Q2211650', 'sadomasochism', 'term covering phenomena of giving or receiving of pleasure from acts involving the receipt (M) or infliction (S) of pain or humiliation', 'Q is "sadomasochism"; algolagnia/algophilia are distinct clinical terms.'),
  ('algophilia', 'Q2211650', 'sadomasochism', 'term covering phenomena of giving or receiving of pleasure from acts involving the receipt (M) or infliction (S) of pain or humiliation', 'Q is "sadomasochism"; algolagnia/algophilia are distinct clinical terms.'),
  ('anal-creampie', 'Q833304', 'creampie', 'ejaculation in and subsequent leakage of semen from anus or vagina', 'anal vs vaginal - distinct entries.'),
  ('boy', 'Q6581097', 'male', 'to be used in "sex or gender" (P21) to indicate that the human subject is a male or "semantic gender" (P10339) to indicate that a word refers to a male person', 'Q6581097 is the P21 sex-or-gender VALUE "male", not a glossary concept. boy/masc are distinct terms in this corpus.'),
  ('catboy', 'Q27303706', 'anthropomorphic cat', 'cat with human-like traits', 'Q27303706 is "anthropomorphic cat". catboy and catgirl are gendered and distinct, and NEITHER is that QID. Both retract.'),
  ('catgirl', 'Q27303706', 'anthropomorphic cat', 'cat with human-like traits', 'Q27303706 is "anthropomorphic cat". catboy and catgirl are gendered and distinct, and NEITHER is that QID. Both retract.'),
  ('cunnilinguist', 'Q8402', 'cunnilingus', 'oral sex on the vulva by a sexual partner', 'Role (a person) vs the act. Not synonyms.'),
  ('cunt', 'Q2192288', 'vulva', 'external genital organs of the female mammal', 'Q2192288 is the anatomical "vulva". "cunt" is filed Dynamics & Roles / adult. Merging puts a reclaimed slur on an anatomy page or vice versa.'),
  ('event-organizer', 'Q1419997', 'event producer', 'person specializing in planning and execution of parties, events, exhibitions, meetings, conventions, weddings and other things', '"organizer" is an events descriptor; "event-organizer" is filed Dynamics & Roles/adult. Different senses.'),
  ('feedee', 'Q127443415', 'feeding', 'fetishism of gaining weight.', 'Role (feedee) vs practice (feedism) are distinct entries.'),
  ('femminiello', 'Q1052281', 'trans woman', 'woman assigned male at birth', 'HARM. Q1052281 is "trans woman". Femminiello is a specific Neapolitan cultural identity, not a synonym; merging erases it.'),
  ('girl', 'Q6581072', 'female', 'to be used in "sex or gender" (P21) to indicate that the human subject is a female or "semantic gender" (P10339) to indicate that a word refers to a female person', 'Q6581072 is the P21 value "female". "lady" is a kink honorific (Dynamics & Roles/adult), not a synonym for woman.'),
  ('god', 'Q178885', 'deity', 'natural or supernatural god or goddess, divine being', 'Q178885 is "deity". god/goddess are gendered honorifics; merging deletes one.'),
  ('goddess', 'Q178885', 'deity', 'natural or supernatural god or goddess, divine being', 'Q178885 is "deity". god/goddess are gendered honorifics; merging deletes one.'),
  ('group-masturbation', 'Q10048327', 'mutual masturbation', 'sex act in which two or more people simultaneously stimulate their own genitalia or each other''s', 'group vs mutual masturbation are distinct.'),
  ('lady', 'Q6581072', 'female', 'to be used in "sex or gender" (P21) to indicate that the human subject is a female or "semantic gender" (P10339) to indicate that a word refers to a female person', 'Q6581072 is the P21 value "female". "lady" is a kink honorific (Dynamics & Roles/adult), not a synonym for woman.'),
  ('live-music-venue', 'Q182832', 'concert', 'live performance of music', 'Q182832 is "concert" (an event). live-music-venue is a VENUE type.'),
  ('man', 'Q6581097', 'male', 'to be used in "sex or gender" (P21) to indicate that the human subject is a male or "semantic gender" (P10339) to indicate that a word refers to a male person', 'Q6581097 is the P21 sex-or-gender VALUE "male", not a glossary concept. boy/masc are distinct terms in this corpus.'),
  ('masc', 'Q6581097', 'male', 'to be used in "sex or gender" (P21) to indicate that the human subject is a male or "semantic gender" (P10339) to indicate that a word refers to a male person', 'Q6581097 is the P21 sex-or-gender VALUE "male", not a glossary concept. boy/masc are distinct terms in this corpus.'),
  ('mommy', 'Q7560', 'mother', 'female parent', 'Q7560 is the kinship "mother". "mommy" is a kink honorific.'),
  ('nantaimori', 'Q1063174', 'nyotaimori', 'serving sushi or sashimi on naked bodies', 'nyotaimori (female body) vs nantaimori (male body) are distinct practices.'),
  ('noetisexual', 'Q20011275', 'sapiosexuality', 'sexual attraction based primarily on intellect', 'Distinct label from sapiosexual.'),
  ('offering', 'Q76903164', 'submission', 'act of putting forward an item for consideration for approval, consideration, marking etc.', 'Q76903164 is bureaucratic "submission" (putting an item forward for approval). Neither BDSM member belongs on it. Both retract.'),
  ('omniromantic', 'Q96188028', 'panromantic', 'romantic attraction towards person(s) of any, every, and all genders (panromanticism)', 'omniromantic and panromantic are deliberately distinct labels.'),
  ('pillow-prince', 'Q127630273', 'pillow princess', null, 'Gendered counterpart, not a synonym.'),
  ('play-room', 'Q2911974', 'recreation room', 'room used for a variety of purposes, such as parties, games and other everyday or casual use', 'Q2911974 is a domestic "recreation room". A play-room here is a sex-club space.'),
  ('questioning', 'Q327018', 'interrogation', 'interviewing employed by law enforcement officers, military personnel, and intelligence agencies with the goal of eliciting useful information', 'HARM. Q327018 is law-enforcement INTERROGATION. "questioning" is the LGBTQ+ identity - a namesake collision, the exact 2026-08-29 class. Merging would publish the questioning identity as a kink fetish.'),
  ('rough-sex', 'Q190845', 'BDSM', 'erotic practices involving domination and sadomasochism', 'Q190845 is BDSM (a subculture). rough-sex is not BDSM.'),
  ('sister', 'Q191808', 'nun', 'female member of a monastic order', 'Q191808 is "nun". "sister" is a distinct role/term in this corpus.'),
  ('submission', 'Q76903164', 'submission', 'act of putting forward an item for consideration for approval, consideration, marking etc.', 'Q76903164 is bureaucratic "submission" (putting an item forward for approval). Neither BDSM member belongs on it. Both retract.'),
  ('teacher', 'Q37226', 'teacher', 'person who helps others to acquire knowledge, competences or values', 'Q37226 is the profession "teacher". "teacher" here is filed Fetishes/adult. Merging would carry is_adult onto "educator" - the recorded category-junction trap.'),
  ('woman', 'Q6581072', 'female', 'to be used in "sex or gender" (P21) to indicate that the human subject is a female or "semantic gender" (P10339) to indicate that a word refers to a female person', 'Q6581072 is the P21 value "female". "lady" is a kink honorific (Dynamics & Roles/adult), not a synonym for woman.');

  -- Only rows that STILL carry the audited identifier are touched. A row that
  -- moved under a concurrent session is skipped, not overwritten -- the same
  -- rule that let 20261008100000 compose with a hand pass running beside it.
  create temp table _target on commit drop as
    select t.id, t.slug, t.wikidata_id, t.wikipedia_url,
           r.label, r.descr, r.reason
      from public.unified_tags t
      join _retract r on r.slug = t.slug and r.qid = t.wikidata_id
     where t.status = 'active';

  select count(*) into v_skipped from _retract r
   where not exists (select 1 from _target g where g.slug = r.slug);

  insert into public.tag_wikidata_repair_audit
    (tag_id, disposition, previous_wikidata_id, previous_wikipedia_url,
     wikidata_label, wikidata_description, reason, repaired_at)
  -- 'cleared' is the disposition the 2026-08-29 repair used and the only one
  -- besides 'review' that tag_wikidata_repair_audit_disposition_check accepts;
  -- a new value is rejected by the CHECK (found by dry-running this on prod).
  --
  -- tag_id is the PRIMARY KEY here: this is one row per tag, not an append-only
  -- log. 8 of these tags already carry a row -- accipiosexual, boy, catgirl,
  -- event-organizer, group-masturbation, live-music-venue, play-room and
  -- questioning were all flagged disposition='review' by the 2026-08-29 pass,
  -- with the IDENTICAL previous_wikidata_id, and were never actioned. They have
  -- been publishing the wrong identity for the six days since. So the conflict
  -- arm upgrades review -> cleared and deliberately does NOT rewrite the
  -- previous_* columns: that is the first pass's recorded evidence, and an
  -- audit row you overwrite is an audit row you no longer have.
  select g.id, 'cleared', g.wikidata_id, g.wikipedia_url,
         g.label, g.descr, g.reason, now()
    from _target g
  on conflict (tag_id) do update
     set disposition = 'cleared',
         reason      = excluded.reason,
         repaired_at = now();
  get diagnostics v_audited = row_count;

  -- One statement over 34 rows. Each write enqueues into
  -- search_reindex_queue via the tag search trigger; at this size that is a
  -- rounding error, but do NOT widen this pattern to a four-figure sweep
  -- without batching it.
  update public.unified_tags t
     set wikidata_id  = null,
         wikipedia_url = null,
         updated_at   = now()
    from _target g
   where t.id = g.id;
  get diagnostics v_cleared = row_count;

  raise notice 'qid retraction: % audited, % cleared, % skipped (moved under us)',
    v_audited, v_cleared, v_skipped;

  -- Re-assert the condition this migration exists to fix, rather than trusting
  -- the row counts above. Every slug named here must no longer carry the QID it
  -- was retracted from. A row that MOVED to a different identifier is fine; a
  -- row still sitting on the wrong one is not.
  select count(*) into v_left
    from public.unified_tags t
    join _retract r on r.slug = t.slug and r.qid = t.wikidata_id
   where t.status = 'active';

  if v_left <> 0 then
    raise exception
      'tag QID retraction incomplete: % active tag(s) still carry the retracted identifier', v_left;
  end if;

  if v_cleared <> v_audited then
    raise exception 'audit/clear mismatch: % audited but % cleared', v_audited, v_cleared;
  end if;
end $do$;
