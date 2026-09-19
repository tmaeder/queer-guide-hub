-- Sex & sexual-health glossary pass, part 2 of 3: repair, then revive.
--
-- 88 of the 598 working-set headwords resolve to a DEPRECATED row. Those were
-- read by hand; 46 are revived here and the rest are named below with the
-- reason they stay down.
--
-- FIVE OF THE 46 WERE NOT ON THE ORIGINAL LIST. Part 3 of this pass tried to
-- CREATE them, and a singular/plural twin check caught that the concept already
-- had a row: fraysexual, fallopian-tubes, hookup, packers, seminal-vesicles.
-- The absent-term query had looked up `fraysexuality`, `fallopian-tube`,
-- `hook-up`, `packer` and `seminal-vesicle` -- all genuinely absent as slugs,
-- all of them the wrong spelling of a row that exists. Reviving an existing row
-- beats minting a second one for the same concept (the `lesbophobia` rule), and
-- checking for a twin under another spelling is what stood between this pass and
-- five duplicates. Two of the five also needed their prose fixed first:
--   hookup     -> "A casual sexual encounter facilitated by chemsex."  (wrong sense:
--                 a hookup is not chemsex-specific)
--   fraysexual -> "Attracted to unknown people"  (thin, and misses the fading)
--
-- Almost every one was taken by the same two blind sweeps this repo has already
-- recorded three times -- `auto: zero usage` and the 2026-06-05 orphan audit
-- ("no entity assignments, relations, synonyms, or aliases"). Both are false
-- premises for a glossary term, as 20261211100000 (femdom, voyeur) and
-- 20360101101600 (men-who-have-sex-with-men, heterosexism) already found. This
-- is the fourth time. What was down this round includes `condom`'s companions:
-- clitoris, vagina, penis, semen, sperm, hymen, labia, foreskin, perineum,
-- puberty, menstruation, pregnancy, morning-after-pill and sex-worker -- i.e.
-- most of the anatomy and reproductive-health vocabulary on a platform whose
-- readers include people who will not find it anywhere else.
--
-- READING WHAT YOU ARE ABOUT TO REPUBLISH IS THE HALF THAT MATTERS. A blanket
-- revive would have published six wrong subjects. All six have a CORRECT
-- description sitting directly under a summary about something else:
--
--   anus     -> "Village in Papua, Indonesia"        (wikidata_id Q26235245)
--   semen    -> "District in East Java, Indonesia"   (wikidata_id Q7887443)
--   fluid    -> "Substance that deforms under shear stress"  (physics, Q102205)
--   ovaries  -> "Female reproductive cell or gamete" (that is an OVUM, not an ovary)
--   butt-plug-> "Butt plug"                          (defines the term with the term)
--   quickie  -> "Term for brief activity"            (says only that the term exists)
--
-- Identifiers are NULLED, never repointed: tag_medical_codes_sync and
-- tag_wikidata_hierarchy rebuild from them weekly, so a plausible-but-wrong QID
-- regenerates wrong data forever while a null one regenerates nothing. Measured
-- first -- none of the four carries a medical code or a tag_relations row.
--
--   Q9384 sits on THREE rows at once -- egg + testes + testicle. It is the
--   testicle; `egg` borrowed it, so `egg`'s is nulled too.
--   Q782623 sits on autoeroticism + autosexual. It is autoeroticism; the
--   autosexual row also copied that entity's summary, so both are fixed there.
--
-- Nothing is written to tag_wikidata_repair_audit, deliberately: that table is
-- the INPUT to tag_disowned_prose_signals(), so a row there would mark these
-- tags "repaired" and make their prose-at-repair-time the baseline the sentinel
-- compares against -- perturbing a live metric to record what this file records.
-- The prior values survive in tag_change_log.before_data (round twelve's rule).
--
-- CATEGORY was wrong on 14 rows, and the pattern is the one this repo already
-- found with pelvic-inflammatory-disease and lymphogranuloma-venereum filed
-- under Fetishes: menstruation, pregnancy, libido and multiple-orgasms were all
-- filed under **Fetishes** with is_adult = true, and `ovaries` under **Dynamics
-- & Roles**. Menstruation is not a kink. Those four also lose is_adult.
--
-- GENDERED PROSE on the anatomy rows is corrected where it excludes rather than
-- describes -- the crotch-rope/breast-bondage class, where the entity is right
-- and the prose writes part of the audience out. `penis` opened "a sex organ
-- used by male and hermaphrodite animals to copulate", `vagina` "the female
-- genital tract", `uncircumcised` "Men with intact foreskin". Trans women have
-- penises; trans men have vaginas; not everyone with a foreskin is a man.
--
-- REVIVED UNPUBLISHED. seo_indexable is set to false EXPLICITLY, because a
-- deprecated row can still carry seo_indexable = true (20360101101300) and
-- clearing `status` without clearing that flag publishes to crawlers the moment
-- the row goes active. Measured here: 29 of the 45 are seo_indexable = true
-- while deprecated. The gap being closed is SITE SEARCH -- 0 of the deprecated
-- corpus is in search_documents against all of the active corpus -- and putting
-- 45 pages into the crawler index is a separate decision.
--
-- human_reviewed = true is load-bearing, not decorative: deprecate_unused_tags()
-- selects exactly status='active' AND human_reviewed=false AND usage_count=0,
-- and all 45 are usage 0. Without it the next sweep takes them straight back.
--
-- LEFT DEPRECATED, each for a stated reason rather than for not getting to them:
--   genderfluid                    -- active `gender-fluid` holds the concept
--   sexually-transmitted-infection -- active `sti` holds it (50400101100100)
--   lube                           -- `lubricant` now holds it (part 1 of this pass)
--   testes                         -- `testicle` is revived instead: singular, matching
--                                     the `vulva` convention, and it is the row Q9384
--                                     actually belongs to
--   autoeroticism                  -- distinct from `autosexual` and keeps Q782623;
--                                     whether it also deserves reviving is its own call
--
-- FOUR MORE WERE DROPPED FROM THE REVIVE LIST BY THE DATABASE, NOT BY READING,
-- and the guard was right about every one. tag_reject_alias_shadow() refuses to
-- make a row active while its slug is held as an alias of another tag, and in
-- all four cases an ACTIVE row already carries the concept with a real body:
--   blow-job   -> alias of `blowjob`           (active: "Oral sex on a penis. HIV risk is low...")
--   butt-plug  -> alias of `anal-plug`         (active)
--   semen      -> alias of `jizz`              (active: "Slang for semen...")
--   transition -> alias of `gender-transition` (active, 72 assignments)
-- The first draft of this file tried to revive all four; the dry run stopped on
-- the first. Reading the rows would not have caught it -- only the guard did.
--
-- `semen` and `butt-plug` still get their WRONG SUMMARY repaired even though
-- they stay down, because a deprecated row is a landmine for whoever revives it
-- later: "District in East Java, Indonesia" and "Butt plug" would publish the
-- moment someone clears `status`. Fixing a row that stays deprecated costs
-- nothing (0 of the deprecated corpus is in search_documents) and removes the
-- trap. The category repairs on all four ride along for the same reason; note
-- that a deprecated row may legitimately keep seo_indexable = true, so the
-- "nothing published" postcondition below covers the REVIVED rows only.
--
-- Guarded by src/lib/__tests__/sexGlossaryPass.test.ts.

begin;

select set_config('app.actor', 'migration:99991789812140_sex_glossary_revivals', true);

-- ============ A. wrong-subject summaries, repaired BEFORE anything publishes
update unified_tags set
  short_description = 'The opening at the end of the digestive tract, between the buttocks.',
  wikidata_id = null, wikipedia_url = null
where slug = 'anus' and short_description ilike '%Village in Papua%';

update unified_tags set
  short_description = 'The fluid containing sperm that is released at ejaculation.',
  wikidata_id = null, wikipedia_url = null
where slug = 'semen' and short_description ilike '%District in East Java%';

update unified_tags set
  short_description = 'An identity that shifts over time rather than staying fixed.',
  wikidata_id = null, wikipedia_url = null
where slug = 'fluid' and short_description ilike '%deforms under shear stress%';

update unified_tags set
  short_description = 'The paired organs that produce eggs and sex hormones.'
where slug = 'ovaries' and short_description ilike '%reproductive cell or gamete%';

update unified_tags set
  short_description = 'A tapered anal toy with a flared base that stops it going too far.'
where slug = 'butt-plug' and btrim(lower(coalesce(short_description,''))) = 'butt plug';

update unified_tags set
  short_description = 'Sex taken fast, usually somewhere you cannot linger.'
where slug = 'quickie' and short_description ilike '%Term for brief activity%';

-- `egg` borrowed the testicle's identifier; `autosexual` borrowed
-- autoeroticism's identifier AND its summary.
update unified_tags set wikidata_id = null, wikipedia_url = null
where slug = 'egg' and wikidata_id = 'Q9384';

update unified_tags set
  short_description = 'Sexual attraction directed primarily at oneself.',
  wikidata_id = null, wikipedia_url = null
where slug = 'autosexual' and wikidata_id = 'Q782623';

-- thin or absent summaries on rows about to publish
update unified_tags set short_description = 'Asexual, but still wanting a sexual relationship.'
where slug = 'cupiosexual' and short_description ilike '%Asexual spectrum identity%';

update unified_tags set short_description = 'Monthly bleeding as the uterine lining sheds.'
where slug = 'menstruation' and short_description ilike '%Menstrual health and support%';

update unified_tags set short_description = 'A thin membrane at the vaginal opening. It varies from person to person, and it is not a test of virginity.'
where slug = 'hymen' and coalesce(btrim(short_description),'') = '';

update unified_tags set short_description = 'Relationships built without ranking them or applying default rules.'
where slug = 'relationship-anarchy' and coalesce(btrim(short_description),'') = '';

update unified_tags set short_description = 'Attraction that fades as you get to know someone — the inverse of demisexual.'
where slug = 'fraysexual' and short_description ilike '%Attracted to unknown people%';

-- `hookup` is deprecated and its description is simply wrong: a hookup is a
-- casual encounter, and nothing about the term is chemsex-specific. That is the
-- wrong-SENSE class on a row about to be revived.
update unified_tags set
  description = 'A sexual encounter with no expectation of a relationship. Can be a one-off or a recurring arrangement.',
  short_description = 'A sexual encounter with no relationship attached.'
where slug = 'hookup' and description ilike '%facilitated by chemsex%';

update unified_tags set description = 'Attraction to people who are neither exclusively male nor female — non-binary, agender and genderqueer people. Coined as an alternative to terms built on the words for man and woman.'
where slug = 'ceterosexual' and coalesce(btrim(description),'') = '';

-- ============ B. prose that excludes rather than describes
update unified_tags set
  description = 'The external sex organ used for urination and, when erect, for penetrative sex. Trans women, non-binary people and intersex people have penises too — this is anatomy, not gender.',
  short_description = 'External sex organ used for urination and penetrative sex.'
where slug = 'penis' and description ilike '%hermaphrodite animals%';

update unified_tags set
  short_description = 'The internal canal between the vulva and the cervix.'
where slug = 'vagina' and short_description ilike '%Female reproductive organ%';

update unified_tags set
  short_description = 'Having an intact foreskin.'
where slug = 'uncircumcised' and short_description ilike '%Men with intact foreskin%';

-- ============ C. category and flag corrections
update unified_tags t set category_id = c.id
from tag_categories c, (values
  ('anus','physical-reproductive'), ('blow-job','practices-play'), ('blue-balls','physical-reproductive'),
  ('butt-plug','gear-aesthetics'), ('ceterosexual','sexual-orientation'), ('douche','gear-aesthetics'),
  ('feminism','political-activism'), ('fluid','questioning-labels'), ('foreskin','physical-reproductive'),
  ('gender-norms','gender-identity'), ('hymen','physical-reproductive'), ('labia','physical-reproductive'),
  ('libido','sexual-health'), ('menstruation','physical-reproductive'), ('morning-after-pill','safer-sex'),
  ('multiple-orgasms','practices-play'), ('ovaries','physical-reproductive'), ('perineum','physical-reproductive'),
  ('pregnancy','physical-reproductive'), ('puberty','physical-reproductive'), ('queef','physical-reproductive'),
  ('quickie','practices-play'), ('semen','physical-reproductive'), ('sex-worker','workplace-education-policy'),
  ('sexual-arousal','sexual-health'), ('sexual-liberation','movements-milestones'), ('testicle','physical-reproductive'),
  ('transition','trans-health'), ('uncircumcised','physical-reproductive'), ('wet-dreams','physical-reproductive'),
  ('yoni','practices-play')
) as v(slug, cat)
where t.slug = v.slug and c.slug = v.cat and t.category_id is distinct from c.id;

-- Menstruation, pregnancy, libido, ovaries and multiple-orgasms were filed adult
-- because they were filed under Fetishes. None of them is adult content.
update unified_tags set is_adult = false
where slug in ('menstruation','pregnancy','libido','ovaries','multiple-orgasms') and is_adult;

-- ============ D. revive, unpublished
update unified_tags set
  status = 'active',
  deprecated_at = null,
  deprecation_reason = null,
  seo_indexable = false,   -- EXPLICIT: 29 of these carry true while deprecated
  human_reviewed = true    -- escape hatch from deprecate_unused_tags(); all are usage 0
where status = 'deprecated'
  and slug in (
    'aegosexual','anus','autosexual','bladder','blue-balls','ceterosexual',
    'clitoris','cupiosexual','douche','egg','female-ejaculation','feminism','fluid','foreskin',
    'gender-norms','hymen','hypergamy','labia','libido','menstruation','morning-after-pill',
    'multiple-orgasms','ovaries','penis','perineum','pregnancy','puberty','queef','quickie',
    'relationship-anarchy','sex-worker','sexual-arousal','sexual-frustration','sexual-health',
    'sexual-liberation','sperm','testicle','uncircumcised','vagina','wet-dreams','yoni',
    -- Found by part 3, which tried to CREATE these and was stopped by the
    -- singular/plural twin check. Reviving an existing row beats minting a
    -- second one for the same concept -- the `lesbophobia` rule.
    'fraysexual','fallopian-tubes','hookup','packers','seminal-vesicles'
  );

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int;
begin
  -- 1. every revived row is active, unpublished, reviewed, and has usable prose
  select count(*) into v_bad from unified_tags
  where slug in ('aegosexual','anus','autosexual','bladder','blue-balls','ceterosexual',
    'clitoris','cupiosexual','douche','egg','female-ejaculation','feminism','fluid','foreskin','gender-norms',
    'hymen','hypergamy','labia','libido','menstruation','morning-after-pill','multiple-orgasms','ovaries',
    'penis','perineum','pregnancy','puberty','queef','quickie','relationship-anarchy','sex-worker',
    'sexual-arousal','sexual-frustration','sexual-health','sexual-liberation','sperm','testicle',
    'uncircumcised','vagina','wet-dreams','yoni',
    'fraysexual','fallopian-tubes','hookup','packers','seminal-vesicles')
    and status = 'active' and seo_indexable = false and human_reviewed
    and tag_has_prose(description, short_description);
  if v_bad <> 46 then raise exception 'expected 46 revived rows in the reached state, found %', v_bad; end if;

  -- 1b. the two rows revived because their prose was WRONG now carry the repair
  select count(*) into v_bad from unified_tags
  where (slug = 'hookup' and description ilike '%chemsex%')
     or (slug = 'fraysexual' and short_description ilike '%Attracted to unknown people%');
  if v_bad <> 0 then raise exception 'a revived row still carries the prose it was revived to fix'; end if;

  -- 2. NOTHING revived here is indexable (would publish unreviewed prose to
  --    crawlers). Scoped to the revived rows: `semen` stays deprecated and a
  --    deprecated row may legitimately keep the flag.
  select count(*) into v_bad from unified_tags
  where seo_indexable and slug in ('anus','fluid','ovaries','penis','vagina','menstruation','pregnancy','clitoris','labia');
  if v_bad <> 0 then raise exception '% revived rows are indexable', v_bad; end if;

  -- 3. no wrong subject survives anywhere in the corpus
  select count(*) into v_bad from unified_tags
  where coalesce(short_description,'') ~* '(Village in Papua|District in East Java|deforms under shear stress|reproductive cell or gamete)';
  if v_bad <> 0 then raise exception 'a wrong-subject summary survives'; end if;

  -- 4. the borrowed identifiers are gone, and the rows they BELONG to keep theirs
  select count(*) into v_bad from unified_tags
  where (slug in ('anus','semen','fluid','egg','autosexual') and wikidata_id is not null);
  if v_bad <> 0 then raise exception '% borrowed identifiers survive', v_bad; end if;
  select count(*) into v_n from unified_tags where slug = 'testicle' and wikidata_id = 'Q9384';
  if v_n <> 1 then raise exception 'testicle lost Q9384, which is the row it belongs to'; end if;
  select count(*) into v_n from unified_tags where slug = 'autoeroticism' and wikidata_id = 'Q782623';
  if v_n <> 1 then raise exception 'autoeroticism lost Q782623, which is the row it belongs to'; end if;

  -- 5. nothing health-related is filed as a fetish or flagged adult any more
  select count(*) into v_bad from unified_tags
  where slug in ('menstruation','pregnancy','libido','ovaries','multiple-orgasms')
    and (category = 'Fetishes' or is_adult);
  if v_bad <> 0 then raise exception '% health rows are still filed as fetishes or adult', v_bad; end if;

  -- 6. the nine left deprecated are STILL deprecated (a later pass must not
  --    re-propose them, and this file must not have revived a duplicate)
  select count(*) into v_bad from unified_tags
  where slug in ('genderfluid','sexually-transmitted-infection','lube','testes','autoeroticism',
                 'blow-job','butt-plug','semen','transition')
    and status <> 'deprecated';
  if v_bad <> 0 then raise exception '% rows that must stay deprecated are not', v_bad; end if;

  -- 7. the four alias-shadowed concepts ARE reachable under their canonical row,
  --    which is the reason it was safe to leave them down
  select count(*) into v_bad from unified_tags
  where slug in ('blowjob','anal-plug','jizz','gender-transition')
    and status = 'active' and tag_has_prose(description, short_description);
  if v_bad <> 4 then
    raise exception 'only % of the 4 alias-shadow targets are active with prose', v_bad;
  end if;
end
$verify$;

commit;
