-- Tag description standard, measured rewrite batch 9.
--
-- TWO LABELLED GROUPS, because the risk of a mixed file is that a later reader
-- takes the looser group's licence and applies it to the rest.
--
-- GROUP A -- the lead-shape axis, continued (the description opens by restating
-- the tag's own name, the Wikipedia-import signature). 25 rows read by usage,
-- excluding everything batches 6-8 took or deferred. 2 taken: 8%, against 27%,
-- 25% and 12% for batches 6, 7 and 8. THE AXIS IS WORKING OUT and that is
-- reported rather than padded -- see the note at the foot of this header.
--
-- THE MATCHER'S SIXTH CONTROL FAILED AND THAT IS WHY IT EXISTS. v1 required the
-- tag's own name to appear anywhere in the 60 characters before a copula, and it
-- matched "Worn at fetish events, leather is a community staple" -- correct prose
-- that merely mentions its own subject mid-sentence. v2 requires the name to LEAD
-- the phrase (a leading article tolerated). Re-run standalone -- never UNION'd
-- into the tranche query, which is how this series lost a control twice -- all
-- EIGHT controls now report correctly in both directions.
--
--   lgbtq-support  86 venues, indexable, `Community Life & Support` -- spends its
--                  first TWO sentences defining the ACRONYM LGBTQ+, which the
--                  separate live `lgbtq` row (5,340 uses) already defines, and
--                  only reaches its own subject in sentence three. The corpus
--                  states the acronym twice and the support page said almost
--                  nothing about support. The evidence is on the row TWICE: its
--                  own summary ("Resources for LGBTQ+ support") and its own body
--                  ("This tag is for individuals seeking help and resources").
--                  Repaired by DELETING the two acronym sentences; sentence three
--                  survives BYTE-IDENTICAL, by construction, because a replace()
--                  cannot author prose.
--   civil-rights   84 news, indexable, `Laws & Legal Rights` -- defined civil
--                  rights as belonging to every individual "regardless of their
--                  race", and nothing else. On an LGBTQ+ platform that writes the
--                  entire audience out of their own entry: the `femme`/`man`/
--                  `drag-show`/`masc` NARROWING class. Both other prose fields on
--                  the row are broader -- summary "Rights protecting individual
--                  freedom", body "Civil rights prevent the infringement of
--                  personal freedom by governments, social organizations, and
--                  private individuals" -- so the description contradicts the row
--                  twice over. The clause is DELETED rather than rewritten to
--                  enumerate protected characteristics, which would be authoring;
--                  under-reaching is the correct error.
--
-- GROUP B -- found OFF-AXIS, while establishing what `color-rainbow` means. Kept
-- in its own group so Group A's 8% stays an honest measurement of the lead-shape
-- axis and is not inflated by a find that axis could not make. Neither row has a
-- copula lead, so the matcher above is structurally blind to both.
--
--   pride-flag           184 news, indexable, human_reviewed, `Symbols & Flags`,
--                        Q51401 -- published a DICTIONARY CROSS-REFERENCE as its
--                        definition: the description is, in full, `See "Rainbow
--                        flag (LGBT)."` It names an article title the reader
--                        cannot click and says nothing usable. Round eleven's
--                        "states nothing a reader can use" class, one field over.
--                        The replacement restates the row's OWN summary and body
--                        and chooses no new sense.
--   progress-pride-flag  1 news, indexable, human_reviewed, Q96633914 -- published
--                        the RAINBOW FLAG's definition and origin story ("began in
--                        San Francisco") on the PROGRESS flag's page. They are
--                        different flags by different designers forty years apart.
--                        Its QID is CORRECT, so this is the `methadone` rule: a
--                        correct identifier does not make the prose derived from
--                        it correct, and the fix is the prose, not the id. Its own
--                        body already describes the right flag.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING (pride-flag and progress-pride-flag are
-- both human_reviewed = true), the same as batches 6 and 8 and the opposite of
-- batch 7. Verified live with a REAL value change, not a self-assignment: batch 5
-- recorded that `set description = description` returns ALLOWED because a trigger
-- gating on a change never fires, which reads exactly like "not needed here".
--
-- DEFERRED, and `color-rainbow` is the one worth stating, because measuring it
-- overturned TWO readings in a row:
--   color-rainbow (135 news, Q1052) publishes atmospheric optics -- refraction,
--     water droplets, mist and airborne dew. By its slug it looks like the
--     `color-black`/`color-red`/`color-blue` marketplace-facet class batches 6-8
--     repaired, and IT IS NOT: those three carry 96, 24 and 11 marketplace
--     listings, this one carries 135 news and ZERO marketplace. Reading 18 of
--     those articles by hand settles the real sense -- Cape Town's rainbow
--     crossing vandalised twice, pride flag searches, sidewalk art, "You Cannot
--     Vandalise the Rainbow in the Name of Jesus" -- not one is meteorological.
--     So the prose is wrong under every reading. It is STILL NOT REPAIRED, because
--     the live `pride-flag` row (184 uses, repaired above) already holds the
--     pride-symbol concept, and writing that sense here would mint a SECOND live
--     row for one concept. That is a MERGE decision, not a prose repair -- the
--     `watersports`/`piss-play` disposition -- and it is recorded here rather than
--     guessed at.
--   sti (95, Sexual Health) closes with "Regular testing, safe sex practices, and
--     open communication with partners are essential for prevention and
--     management". That is the advice register round thirteen REFUSED to sweep,
--     and this row is exactly why: the sentence is real sexual-health guidance,
--     not contentless exhortation. Deferred, and the refusal stands.
--   kink (2,728) is loose community-voice prose, not the wrong subject; rewriting
--     400 characters of it is authoring.
--   meeting (89 events, `Dating & Connection`) publishes the business-meeting
--     sense. Its category says dating, its usage says events, and the two point at
--     different senses -- the `host`/`unicorn` shape, where choosing is the guess
--     this class came from.
--   lgbtqia-rights, cruising, gay-owned, fashion, gay-men, sexual-orientation,
--     allyship, stonewall, aids, friedrichstadt-palast -- accurate as written.
--   drink and occ-holiday are generic but not wrong -- the `ice-cream`/`tapas`
--     disposition, not the `rooftop` one.
--   the geography cohort (kreuzberg, mitte, friedrichshain, california, canada,
--     india, south-africa) -- encyclopedic but not wrong, exactly as batches 6, 7
--     and 8 left it.
--
-- ON THE FALLING YIELD: 27% -> 25% -> 12% -> 8% across four tranches of the same
-- axis. The lead-shape head is worked out the way the usage head was before it.
-- This is recorded, not padded: the temptation at 8% is to add generic-but-not-
-- wrong rows so the file looks worth shipping, which is the bulk sweep wearing a
-- measured pass's clothes.
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b9', true);

-- ---- GROUP A: the lead-shape axis ------------------------------------------

-- Two sentences of acronym definition before the row reaches its own subject.
-- DELETION ONLY: sentence three survives byte-identical by construction.
update unified_tags set description = replace(description,
  'LGBTQ+ is an acronym that stands for Lesbian, Gay, Bisexual, Transgender, and Queer (or Questioning), with the “+” representing other diverse sexual orientations and gender identities. It is an inclusive term used to encompass the diverse range of sexual orientations, gender identities, and gender expressions. ',
  '')
where slug = 'lgbtq-support' and status = 'active'
  and description like 'LGBTQ+ is an acronym%';

-- "regardless of their race" narrows a concept both other fields state broadly.
-- DELETION ONLY: enumerating protected characteristics would be authoring.
update unified_tags set description = replace(description, ', regardless of their race', '')
where slug = 'civil-rights' and status = 'active'
  and description like '%regardless of their race%';

-- ---- GROUP B: found off-axis, Symbols & Flags -------------------------------

-- A dictionary cross-reference published as the definition.
update unified_tags set description =
  'A flag symbolizing LGBTQ+ pride, either for the community as a whole or for a particular part of it.'
where slug = 'pride-flag' and status = 'active'
  and description like 'See %Rainbow flag%';

-- The rainbow flag's definition and origin on the Progress flag's page.
update unified_tags set description =
  'A variation of the rainbow flag that adds a five-stripe chevron along the hoist — black, brown, light blue, pink and white — designed to be more inclusive of marginalized communities.'
where slug = 'progress-pride-flag' and status = 'active'
  and description like 'The rainbow flag or pride flag is a symbol%';

do $verify$
declare
  v_bad int;
begin
  -- 1. THE REACHED STATE, COUNTED POSITIVELY. Counting rows in a BAD state
  --    returns zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='lgbtq-support'       and description = 'LGBTQ+ support refers to creating a safe and inclusive environment, providing resources, and promoting equality and acceptance for individuals who identify as LGBTQ+.')
    or (slug='civil-rights'        and description = 'The rights and freedoms that every individual is entitled to, including the right to equality, justice, and non-discrimination.')
    or (slug='pride-flag'          and description like 'A flag symbolizing LGBTQ+ pride%')
    or (slug='progress-pride-flag' and description like 'A variation of the rainbow flag%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b9: expected 4 rows in the reached state, found %', v_bad;
  end if;

  -- 2. NO REPAIRED ROW STILL PUBLISHES ITS OLD SUBJECT.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='lgbtq-support'       and description like '%is an acronym%')
    or (slug='civil-rights'        and description like '%regardless of their race%')
    or (slug='pride-flag'          and description like 'See %')
    or (slug='progress-pride-flag' and description like '%San Francisco%')
  );
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b9: % row(s) still publish the old subject', v_bad;
  end if;

  -- 3. THE TWO DELETIONS DELETED AND DID NOT REWRITE. Asserting the surviving
  --    text byte-for-byte is the point: "the acronym is gone" passes equally
  --    against a full rewrite, which is the retired bulk experiment in a fix's
  --    clothes. (Postcondition 1 already pins both to an exact string; this
  --    checks the half that a replace() must have LEFT ALONE.)
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='lgbtq-support' and description like '%promoting equality and acceptance for individuals who identify as LGBTQ+.')
    or (slug='civil-rights'  and description like '%including the right to equality, justice, and non-discrimination.')
  );
  if v_bad <> 2 then
    raise exception 'tag_description_measured_rewrite_b9: a deletion rewrote its surviving text (found % of 2)', v_bad;
  end if;

  -- 4. progress-pride-flag DESCRIBES THE PROGRESS FLAG, NOT THE RAINBOW FLAG.
  --    The chevron is the whole distinction between the two.
  select count(*) into v_bad from unified_tags
  where slug = 'progress-pride-flag' and status = 'active'
    and description ilike '%chevron%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b9: progress-pride-flag no longer names the chevron';
  end if;

  -- 5. THE DEFERRED ROWS ARE STILL DEFERRED. A later pass that sweeps this axis
  --    has to break this check first. color-rainbow is included deliberately:
  --    its repair is a MERGE decision, and a prose pass must not pre-empt it.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='color-rainbow' and description like 'A rainbow is an optical phenomenon%')
    or (slug='sti'           and description like '%Regular testing, safe sex practices%')
    or (slug='kink'          and description like 'Kink or kinky is seen as%')
    or (slug='meeting'       and description like 'A meeting is when two or more people%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b9: a deferred row was rewritten (found % of 4)', v_bad;
  end if;

  -- 6. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('lgbtq-support','civil-rights','pride-flag','progress-pride-flag')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling|colour|marginalised)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b9: % row(s) carry a voice violation', v_bad;
  end if;

  -- 7. EVERY REPAIRED ROW STAYS PUBLISHABLE. Call the real predicate rather than
  --    restating its OR -- a hand-rolled "both fields present" form would be a
  --    different, stricter gate than the one the database actually enforces.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('lgbtq-support','civil-rights','pride-flag','progress-pride-flag')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b9: % row(s) would fail the thin-page gate', v_bad;
  end if;
end $verify$;

commit;
