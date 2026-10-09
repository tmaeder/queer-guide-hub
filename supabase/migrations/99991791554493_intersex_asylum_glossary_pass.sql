-- Intersex & queer-asylum glossary pass
--
-- SOURCES READ (full text, extracted and quoted from the publishers' own PDFs):
--   * OII Europe, "Indicators for effective protection of the rights of intersex people,
--     in particular protection from IGM", May 2023. Definitions of IGM, sex characteristics,
--     variation of sex characteristics, vital intervention, informed consent (indicators 1-3, 12-13).
--   * OII Europe, "How to be a great intersex ally. A toolkit for NGOs and decision makers",
--     December 2015. Definition of intersex; the FRA 2015 figure; the protected-ground survey.
--   * OII Europe, Malta Declaration (3rd International Intersex Forum, Valletta, 29 Nov - 1 Dec 2013;
--     34 activists, 30 organisations).
--   * NEK-CNE (Swiss National Advisory Commission on Biomedical Ethics), Stellungnahme Nr. 20/2012,
--     "Zum Umgang mit Varianten der Geschlechtsentwicklung", adopted 31 August 2012 — recommendations 3-5.
--   * CJEU Joined Cases C-199/12 to C-201/12 X, Y and Z, 7 November 2013 — operative part, verbatim.
--
-- SOURCES NOT READ, and nothing is attributed to them: the ~30 further PDFs in the brief
-- (InterAction Suisse factsheets and UN submissions, OII legal toolkit, "Supporting your intersex
-- child", ECRI 2020, CESCR/CEDAW/CRC/GREVIO submissions, and the whole German queer-refugee set:
-- praxisleitfaden-lsbti, the BMFSFJ minimum standards, bildungsmappe queer und hier, the
-- Queer-Refugees flyers, the asylum-procedure expertises). They were attached from a local
-- Downloads folder this session could not reach, and the publishers' copies either 404'd or were
-- not located. Recorded as unread rather than quietly dropped — a second pass over the German
-- asylum-practice set in particular is still owed.
--
-- WHAT THIS FIXES. The headline is /tags/asylum, usage 81: its `description` correctly defines
-- international protection while its summary read "Hospital for severe mental health conditions"
-- and its body was four sentences about psychiatric hospitals. That is the wrong-SENSE class
-- (darkroom -> photography, lubricant -> industrial, trampling -> crowd deaths), and it is
-- reader-facing: `short_description` WINS over `description` on TagIndexCard.tsx:46 (the /tags
-- index), on TagDefinitionCard.tsx:34 (every hover/definition card), and FromTheGlossary.tsx:11
-- scores a preview 2 for having one against 1 for a description, i.e. it actively UP-RANKS this
-- row into the homepage glossary band. `fetchTagPreviews` filters `status='active'` and nothing
-- else, so being `utility` and deindexed does not hide it. Measured against the live source files,
-- not inferred.
--
-- FOUR LABELLED GROUPS, because the licence differs and a later reader must not take the loosest
-- group's licence and apply it to the rest.
--   A  wrong subject: summary and/or body publish a different thing (2 rows).
--   B  surgical: ONE false or padded sentence removed or swapped by exact-phrase replace(), every
--      other sentence byte-identical BY CONSTRUCTION rather than by retyping (4 rows).
--   C  pathologising / gendering register, replaced against the sources above (2 rows).
--   D  description truncated mid-sentence or saying nothing, replaced from the row's own evidence (3 rows).
--
-- `endosex` IS DELIBERATELY NOT CREATED. It is already an APPROVED alias of `dyadic`, so
-- `tag_reject_alias_shadow()` would refuse it: it was never a gap, and `intersexuality`'s own body
-- saying "The opposite of intersex is endosex" already routes correctly. The guard working, not a hole.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING FOR EXACTLY ONE ROW. `asylum-refugees` is
-- human_reviewed=true AND is_sensitive=true, so `tag_prose_apply()` hard-refuses it whatever the
-- caller claims and `log_unified_tag_change()` RAISEs for an undeclared `system:%` actor — a
-- migration is the only path. The other eight corrected rows are human_reviewed=false, where the
-- declaration is attribution only. Stated so the next pass does not copy the wrong precedent.
--
-- DEFERRED, with the reason rather than counted:
--   * `ambiguous-genitalia` — its clinical description is accurate and its summary is serviceable.
--     OII Europe places 'ambiguous' in scare quotes, so a "this term is contested" note is warranted,
--     but that is a terminology decision across the whole Intersex & Bodies category, not a defect
--     on one row. Under-reaching is the correct error.
--   * `congenital-abnormalities` — "abnormal"/"birth defect" is exactly the register the sources
--     reject, but the row is filed `Health`, not `Intersex & Bodies`, and congenital abnormality is a
--     real general-medicine category. The generic-but-not-wrong disposition (`food`, `ice-cream`).
--   * `dublin-event` — all three prose fields NULL, filed `Events & Parties`, usage 2. Either Dublin
--     the city's events or the Dublin Regulation; the row carries no evidence which, and guessing a
--     sense is how the wrong-sense class arose (the `host`/`unicorn` shape).
--   * `displacement`, `lgbtq-refugees`, `refugee-services`, `refugee-support`, `migrant-support` —
--     all prose fields NULL. Filling five empty rows is its own pass.
--   * The duplicate pairs this audit surfaced and did NOT merge, because rewriting one side to make
--     them differ is what papers over a duplicate: `intersex`/`intersexuality`,
--     `androgen-insensitivity-syndrome`/`-ais`, `congenital-adrenal-hyperplasia`/`-cah`,
--     `klinefelter-syndrome`/`-xxy`, `variations-of-sex-development-dsd`/`-vsd`,
--     `lgbtq-asylum-seekers`/`-etc`, `intersex-conditions`/`intersex-variations`.
--   * SELF-CITATION IS 51 ROWS CORPUS-WIDE, not the 0 CLAUDE.md records after 50400101100400.
--     Two are in this pass's scope and are fixed here; the other 49 are a separate pass. The figure
--     is re-derivable: active rows where description||long_description ~* 'according to (a )?scientific (article|research)'.

set local lock_timeout = '10s';
select set_config('app.actor', 'migration:99991791554493_intersex_asylum_glossary_pass', true);

-- ============================================================================
-- PRE-FLIGHT: report, never abort. Soft on preconditions, hard on postconditions —
-- an exact-match premise turns a concurrent repair into a db push failure that blocks the repo.
-- ============================================================================
do $pre$
declare r record; v_n int := 0;
begin
  for r in
    select c.slug, (t.slug is not null) as present
    from (values ('asylum'),('hermaphrodite'),('intersex'),('refugee'),
                 ('intersex-conditions'),('variations-of-sex-development-vsd'),
                 ('sex-chromosome-anomaly'),('turner-syndrome-x'),
                 ('dsd-disorders-of-sex-development'),('asylum-refugees'),('intersex-variations')
         ) c(slug)
    left join unified_tags t on t.slug = c.slug
  loop
    if not r.present then
      raise notice 'pre-flight: target row % is absent — its UPDATE will no-op', r.slug;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 then raise notice 'pre-flight: % of 11 target rows absent', v_n; end if;
end $pre$;

-- ============================================================================
-- GROUP A — WRONG SUBJECT
-- ============================================================================

-- A1. /tags/asylum (usage 81). `description` already defines international protection; the summary
--     and body published the psychiatric-institution sense. The last clause names the collision so a
--     later sweep does not reintroduce it — the `nudist` ("a person, not a place") precedent.
update unified_tags set
  short_description = 'International protection granted to someone at risk of persecution in their own country.',
  long_description = 'Asylum is protection a state grants to someone who cannot safely return home because they face persecution there. The 1951 Refugee Convention sets out five grounds — race, religion, nationality, political opinion, and membership of a particular social group — and claims based on sexual orientation or gender identity are assessed under the last of these.

The unrelated older English sense of the word, a psychiatric institution, is not what this term means here.'
where slug = 'asylum'
  and long_description ilike '%psychiatric hospital%';

-- A2. `hermaphrodite`. Its own description says the term is outdated and derogatory; the summary and
--     body published the botany/zoology sense (organisms producing both gametes, plants and animals).
--     On an intersex glossary that is the generic sense of a slur used against intersex people.
update unified_tags set
  short_description = 'Outdated and offensive term once applied to intersex people.',
  long_description = 'An obsolete term that was applied to intersex people, and is now widely rejected as stigmatising and inaccurate. It survives in two places that should not be confused with each other: as a slur, and as a biological term for organisms — many plants and some animals — that produce both kinds of gamete. People do not.

The word carries the history it was used for: intersex bodies treated as a spectacle and as a problem to be corrected. Where someone has reclaimed it for themselves, that is their choice to make and not a general licence.'
where slug = 'hermaphrodite'
  and long_description ilike '%gonochoric%';

-- ============================================================================
-- GROUP B — SURGICAL. One sentence each, by exact-phrase replace(). A replace() cannot author
-- prose, so every other sentence survives byte-identically by construction.
-- ============================================================================

-- B1. `intersex-variations` — removes the false citation outright. Three sentences survive untouched.
update unified_tags set
  long_description = replace(long_description,
    'According to scientific research published in 2018, intersex variations are a natural part of human diversity. ',
    'Intersex variations are a natural part of human diversity. ')
where slug = 'intersex-variations'
  and long_description like '%According to scientific research published in 2018%';

-- B2. `intersex-conditions` — the sentence bundled a false citation with an unsourced statistic.
--     Both go; the defensible half stays. A reduction, which is the safe direction.
update unified_tags set
  long_description = replace(long_description,
    'According to scientific research, intersex conditions are natural and occur in approximately 1 in 100 births.',
    'Intersex variations are a natural part of human diversity.')
where slug = 'intersex-conditions'
  and long_description like '%According to scientific research, intersex conditions are natural%';

-- B3. `dsd-disorders-of-sex-development` — removes the two-sentence advice-padding tail that
--     TAG_STYLE_SYSTEM bans. The two substantive sentences before it survive byte-identically.
update unified_tags set
  long_description = replace(long_description,
    ' It''s essential to approach discussions around DSD with sensitivity and respect for individuals'' identities and experiences. Medical understanding and terminology are constantly evolving, and it''s crucial to prioritize respectful and inclusive language.',
    '')
where slug = 'dsd-disorders-of-sex-development'
  and long_description like '%essential to approach discussions around DSD with sensitivity%';

-- B4. `asylum-refugees` (usage 98, INDEXABLE, human_reviewed, sensitive). Swaps the tag-admin-note
--     opener ("This tag is for individuals...") for a definition. Three sentences survive untouched.
--     Its 34-character description restated the tag's own name, so that is replaced too.
update unified_tags set
  description = 'LGBTQ+ people who have fled their own country because of persecution based on their sexual orientation, gender identity, gender expression or sex characteristics, and who are seeking or have been granted protection elsewhere.',
  long_description = replace(long_description,
    'This tag is for individuals seeking refuge due to persecution based on their sexual orientation or gender identity.',
    'People who have fled persecution based on their sexual orientation, gender identity, gender expression or sex characteristics.')
where slug = 'asylum-refugees'
  and long_description like 'This tag is for individuals seeking refuge%';

-- ============================================================================
-- GROUP C — PATHOLOGISING / GENDERING REGISTER
-- Grounded in OII Europe's de-pathologising aim (IGM Indicators 2023, stated goal: "that a human
-- rights based and de-pathologizing perspective ... is being mainstreamed among professionals") and
-- in the Malta Declaration's demand to remove variations of sex characteristics from medical
-- classifications. The NEK-CNE's own 2012 title chose "Varianten der Geschlechtsentwicklung".
-- ============================================================================

-- C1. `sex-chromosome-anomaly`. Published "anomaly", "abnormal" and "irregularity" for a variation,
--     and opened "Normally, females have two X chromosomes (XX), and males have one X and one Y" —
--     the normalising and gendering claim the sources exist to refuse. The NAME is left alone:
--     renaming a tag moves its slug, which is a separate decision.
update unified_tags set
  description = 'A sex chromosome pattern other than XX or XY — for example XXY, a single X, or a mix of patterns across different cells. These are variations in how bodies develop, not defects, and many people who have one never learn of it.',
  short_description = 'A sex chromosome pattern other than XX or XY.',
  long_description = 'Most people have either two X chromosomes or an X and a Y. Some have another pattern: an extra X or Y, a single X, a partial chromosome, or different patterns in different cells. Klinefelter and Turner syndromes are the two most often named, and there are others.

What follows from a given pattern varies widely, and for many people nothing follows at all. Where it does — most often around puberty or fertility — that is a question for the person whose body it is. Intersex organisations ask that these patterns be described as variations rather than as disorders, which is the framing used here.'
where slug = 'sex-chromosome-anomaly'
  and (description ilike '%irregularity%' or short_description ilike '%abnormal%');

-- C2. `turner-syndrome-x`. "Genetic condition affecting females" and "affects females" write trans
--     men and non-binary people with the variation out of their own entry — the femme/masc/drag-show
--     gendering class. The body also closed on generic filler. The contested-identity fact is stated
--     rather than resolved: OII Europe's indicator 3 asks that no variation be excluded from legal
--     protection, which is not the same as telling anyone what they are.
update unified_tags set
  description = 'A variation where one X chromosome is wholly or partly absent. It occurs in people assigned female at birth, who may be women, trans men or non-binary.',
  short_description = 'A variation where one X chromosome is wholly or partly absent.',
  long_description = 'Turner syndrome describes a pattern in which one of the two X chromosomes is missing or incomplete. It is usually identified in childhood or around puberty, and most often raises questions about growth, heart and kidney development, and fertility.

Whether it counts as an intersex variation is genuinely contested. It falls inside the definition of a variation of sex characteristics that intersex organisations use, and OII Europe asks that no variation be excluded from legal protection from non-consensual intervention. Many people with Turner syndrome nonetheless do not describe themselves as intersex. Both of those can be true, and neither is anyone else''s to settle.'
where slug = 'turner-syndrome-x'
  and (short_description ilike '%affecting females%' or long_description ilike '%affects females%');

-- ============================================================================
-- GROUP D — TRUNCATED OR SAYING NOTHING. Replaced from the row's own evidence.
-- NOTE these are NOT the 500-character truncation cohort, which must stay as it is: there the
-- content was lost and appending to it would convert a visibly incomplete entry into a plausibly
-- complete one. Here the full sense is recoverable from the row's own body or from the sources.
-- ============================================================================

-- D1. /tags/intersex (usage 193 — the largest row in this pass). Its description carried a U+FFFD
--     replacement character ("don<?>t fit") and was 111 characters. Replaced with OII Europe's own
--     four-part definition (IGM Indicators 2023) plus the fact their 2015 toolkit leads on: when a
--     person finds out varies, and some never do.
update unified_tags set
  description = 'People born with a variation of sex characteristics — sexual anatomy, reproductive organs, hormonal structure or levels, and/or chromosome patterns — that does not fit the typical definition of male or female bodies. Intersex is not a medical condition and not a gender identity: intersex people may be women, men or non-binary.',
  short_description = 'Born with sex characteristics that do not fit typical male or female definitions.',
  long_description = 'Intersex covers the spectrum of variations of sex characteristics that occur naturally in humans. The characteristics in question are sexual anatomy, reproductive organs, hormonal structure and levels, and chromosome patterns.

When someone learns they are intersex varies: through prenatal testing, at birth, in childhood, at puberty, in adulthood, or never. That is not incidental — much of what intersex organisations campaign about follows from decisions taken about a body before the person could be asked.

The word itself was long used as the name of a disorder to be fixed. Over the past two decades intersex people and their organisations have reclaimed it as a human-rights umbrella term, which is the sense used here.'
where slug = 'intersex'
  and (description like '%' || chr(65533) || '%' or length(coalesce(description,'')) < 140);

-- D2. `refugee`. Its description stopped mid-sentence at "due to a" — 76 characters, no terminal
--     clause. The full sense was already in the row's own body, so this is recoverable rather than
--     regenerated.
update unified_tags set
  description = 'Someone who has fled their own country because of a well-founded fear of persecution and cannot safely return. Recognised refugee status carries rights under the 1951 Refugee Convention, including protection from being returned to the place of danger.'
where slug = 'refugee'
  and description like '%due to a';

-- D3. `variations-of-sex-development-vsd`. Its description was "Another term for intersex." — which
--     says only that the term exists. Replaced with what the term adds over `intersex`.
update unified_tags set
  description = 'A clinical umbrella term for innate variations of sex characteristics, used in place of "disorders of sex development". Intersex organisations generally prefer "intersex" or "variations of sex characteristics"; where a medical setting uses VSD, it means the same bodies.'
where slug = 'variations-of-sex-development-vsd'
  and description = 'Another term for intersex.';

-- ============================================================================
-- CREATIONS — 9 rows, unpublished.
-- `seo_indexable=false` is set EXPLICITLY: the gap being closed is site search and internal
-- vocabulary, and putting nine pages into the crawler index is a separate decision.
-- `human_reviewed=true` is the documented escape hatch from deprecate_unused_tags(), which selects
-- exactly `active AND human_reviewed=false AND usage_count=0` — all nine are usage 0.
-- `publication_role` is set explicitly because the column is NOT NULL with NO default, and on a
-- NULL `validate_tag_entity_target()` raises a misleading error about entity redirects.
-- ALL THREE CATEGORY REPRESENTATIONS are written by hand, because neither category trigger fires
-- on INSERT — the 194-row finding of 50100101100100, which is still not repaired.
-- ============================================================================

with newrows(slug, name, cat_slug, sens, de, sd, ld) as (values
  ('intersex-genital-mutilation', 'Intersex Genital Mutilation', 'intersex-bodies', true,
   'Surgical, hormonal or other medical intervention on an intersex person''s sex characteristics carried out without their free, prior, personal and fully informed consent — usually in infancy or early childhood, and usually for cosmetic or social reasons rather than to avert a threat to life or health.',
   'Non-consensual medical intervention on an intersex person''s sex characteristics.',
   'OII Europe defines IGM as a harmful practice entailing surgical and medical procedures, or hormonal treatments, on the sex characteristics of an intersex person, often performed at a very early age, without the person''s free, personal, prior and fully informed consent. Named procedures include clitoral reduction or recession, removal of the labia, relocating the urethral opening, vaginoplasty, gonadectomy and hypospadias repair.

The distinction that does the work is vital versus non-vital. An intervention counts as vital only if it is performed to avert a threat to life or serious damage to physical health; interventions performed for social, cultural or aesthetic reasons do not count, and almost all of these are deferrable until the person can decide. Consent by a parent or legal guardian is not a substitute for the person''s own.

IGM has been identified as a harmful practice by the UN High Commissioner for Human Rights, UN treaty bodies, the Council of Europe Commissioner for Human Rights, the Parliamentary Assembly of the Council of Europe, the European Commission and the European Parliament. As of May 2023, six Council of Europe member states had adopted laws prohibiting it. The EU Agency for Fundamental Rights reported in 2015 that "normalising" surgery was carried out on intersex children in at least 21 member states.'),

  ('sex-characteristics', 'Sex Characteristics', 'intersex-bodies', false,
   'A person''s sexual anatomy, reproductive organs, hormonal structure and levels, and chromosome patterns — the physical features by which bodies are sorted as male or female. It is also the wording used by laws that protect intersex people from discrimination and from non-consensual intervention.',
   'Sexual anatomy, reproductive organs, hormones and chromosome patterns.',
   'Sex characteristics are the four things the definition of intersex turns on: sexual anatomy, reproductive organs, hormonal structure and levels, and chromosome patterns. Primary characteristics are present from birth; secondary ones develop at puberty.

The term matters legally as well as descriptively. Protecting bodily integrity and self-determination "on the ground of sex characteristics" is the formulation Malta used and that other jurisdictions have followed, and it is deliberately not the same as protecting gender identity or sexual orientation: a law that covers only those two leaves intersex people out, because what is done to them is done to their bodies rather than on account of who they are attracted to or how they identify.'),

  ('variation-of-sex-characteristics', 'Variation of Sex Characteristics', 'intersex-bodies', false,
   'Any innate variation of a person''s primary or secondary sex characteristics that is not aligned with societal norms of female or male sex characteristics in appearance or function. The phrase intersex organisations use in place of "disorder" or "difference" of sex development.',
   'An innate variation of sex characteristics, in appearance or function.',
   'The wording is OII Europe''s and is chosen carefully. "Variation" rather than "disorder" because the bodies in question are not diseased. "Innate" because it is about how a person was born rather than anything done later. "In appearance or function" because the norm being departed from is sometimes about how a body looks and sometimes about what it does.

The practical reason the definition is drawn this wide is legal: a prohibition on non-consensual intervention that lists specific diagnoses can be worked around by naming a variation it left out, so OII Europe''s indicators ask that no variation be excluded.'),

  ('bodily-integrity', 'Bodily Integrity', 'legal-rights', false,
   'The right to be free from interference with one''s own body without consent. For intersex people it is the right at stake in non-consensual surgery and hormone treatment; it is also the frame for forced sterilisation and for coerced medical requirements in legal gender recognition.',
   'The right not to have your body interfered with without your consent.',
   'Bodily integrity is the principle that a person''s body is theirs, and that interfering with it requires their consent. It is the right the Malta Declaration puts first: intersex people must be empowered to make their own decisions affecting their own bodily integrity.

It does more work than "autonomy" alone in two ways. It covers people who cannot yet consent — which is the whole of the intersex case, since the interventions at issue are performed on infants — and it is violated by an act rather than by a belief, so it does not depend on proving anyone meant harm. The Swiss National Advisory Commission on Biomedical Ethics put it as the protection of the child''s integrity, and concluded that a psychosocial indication alone cannot justify irreversible genital surgery on a child not yet capable of judgement.'),

  ('vital-intervention', 'Vital Intervention', 'intersex-bodies', false,
   'A medical intervention performed to avert a threat to life or serious damage to physical health. The test that separates treatment which cannot wait from treatment which can — and which, on an intersex child, must.',
   'Treatment needed to avert a threat to life or serious damage to health.',
   'The word carries the whole of the distinction in intersex medical ethics. OII Europe''s indicators are met only where interventions on a person with a variation of sex characteristics count as vital when, and only when, they are performed to avert a threat to the person''s life or serious damage to their physical health. Interventions performed for social, cultural or aesthetic reasons are explicitly not vital.

Everything that is not vital is deferrable, and if it is deferrable it waits for the person. The Swiss ethics commission reached the same place in 2012: all non-trivial sex-assigning treatment decisions with irreversible consequences that can be deferred should be taken only once the person concerned can decide for themselves — naming genital surgery and removal of the gonads, absent a medical urgency such as an elevated cancer risk.'),

  ('malta-declaration', 'Malta Declaration', 'movements-milestones', false,
   'The founding statement of the international intersex movement, agreed at the Third International Intersex Forum in Valletta in December 2013 by 34 activists from 30 intersex organisations across every continent.',
   'The 2013 founding statement of the international intersex movement.',
   'The Malta Declaration was adopted on 1 December 2013 at the close of the Third International Intersex Forum, held in Valletta from 29 November and supported by ILGA and ILGA-Europe. Thirty-four activists representing thirty intersex organisations from all continents agreed it.

Its demands are the ones the movement has argued from ever since: end mutilating and "normalising" practices, including genital surgery and psychological and other medical treatment; ban non-consensual sterilisation; stop prenatal screening and selective abortion of intersex foetuses; remove variations of sex characteristics from medical classifications such as the ICD; register intersex children as female or male while recognising they may later identify differently, and make changing that marker a simple administrative matter with options beyond female and male; and, eventually, stop putting sex or gender on birth certificates and identity documents at all. Alongside those: access to one''s own medical records, redress for past harms, trained healthcare providers, protection from discrimination, and peer and psychosocial support.'),

  ('discretion-requirement', 'Discretion Requirement', 'legal-rights', false,
   'The now-rejected expectation that an LGBTQ+ asylum applicant could avoid persecution by hiding who they are. The Court of Justice of the EU held in 2013 that authorities cannot reasonably expect an applicant to conceal their sexual orientation or to exercise reserve in expressing it.',
   'The rejected idea that an applicant could just be discreet instead.',
   'For years asylum claims based on sexual orientation were refused on the reasoning that the applicant would be safe at home provided they were careful — that the risk was contingent on their own behaviour rather than on the state''s.

The Court of Justice of the European Union closed that off in Joined Cases C-199/12 to C-201/12, X, Y and Z, decided 7 November 2013. Its ruling states that when assessing an application for refugee status "the competent authorities cannot reasonably expect, in order to avoid the risk of persecution, the applicant for asylum to conceal his homosexuality in his country of origin or to exercise reserve in the expression of his sexual orientation".

The same judgment settled two further points. Criminal laws specifically targeting homosexuals support the finding that those people form a particular social group. And criminalisation in itself is not an act of persecution — but a term of imprisonment for homosexual acts that is actually applied in the country concerned is a disproportionate or discriminatory punishment, and therefore is.'),

  ('particular-social-group', 'Particular Social Group', 'legal-rights', false,
   'One of the five grounds of persecution in the 1951 Refugee Convention, and the one under which claims based on sexual orientation, gender identity and sex characteristics are assessed.',
   'The Refugee Convention ground that LGBTQ+ asylum claims are decided under.',
   'The Refugee Convention protects people persecuted for reasons of race, religion, nationality, political opinion, or membership of a particular social group. Sexual orientation and gender identity appear nowhere in the list by name, so LGBTQ+ claims are decided under the fifth ground.

That is not a technicality, because whether a group exists is itself arguable and has been argued. In X, Y and Z the Court of Justice of the EU held that the existence of criminal laws specifically targeting homosexuals supports the finding that those people must be regarded as forming a particular social group — and that requiring members of such a group to conceal the very characteristic that defines it cannot be squared with recognising the group at all.'),

  ('credibility-assessment', 'Credibility Assessment', 'legal-rights', true,
   'The part of an asylum decision that judges whether an applicant''s account is believed. In LGBTQ+ claims it is usually where the case is won or lost, because the fact to be established is something internal that documents rarely evidence.',
   'The stage where an asylum decision judges whether an account is believed.',
   'Most LGBTQ+ asylum claims do not turn on the law or on what the country of origin is like. They turn on whether the decision-maker accepts that the applicant is who they say they are — and that is a question about an inner life, asked of someone who in many cases has spent their whole life concealing it, through an interpreter, often shortly after arriving.

The recurring failures are well documented: expecting a coming-out narrative shaped like a Western one, treating a late disclosure as evidence of invention when fear of authorities is the obvious explanation, reading a previous marriage or children as a contradiction, and expecting knowledge of a scene the applicant had every reason to stay away from. Intrusive questioning about sexual practices, and any purported test of orientation, are not legitimate methods of establishing it.')
)
insert into unified_tags (
  slug, name, description, short_description, long_description,
  category, category_id, status, publication_role, seo_indexable,
  is_sensitive, is_adult, human_reviewed, usage_count
)
select n.slug, n.name, n.de, n.sd, n.ld,
       c.name, c.id, 'active', 'utility', false,
       n.sens, false, true, 0
from newrows n join tag_categories c on c.slug = n.cat_slug
on conflict (slug) do nothing;

-- All three category representations: the junction row the detail page actually renders.
insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, t.category_id, true
from unified_tags t
where t.slug in ('intersex-genital-mutilation','sex-characteristics','variation-of-sex-characteristics',
                 'bodily-integrity','vital-intervention','malta-declaration',
                 'discretion-requirement','particular-social-group','credibility-assessment')
  and t.category_id is not null
  and not exists (select 1 from tag_category_assignments a where a.tag_id = t.id)
on conflict do nothing;

-- `igm` as an APPROVED alias: display, auto-tagging and the search bridge are all approved-only
-- since 20261012090000, so an `auto` alias would be stored and route nothing.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, 'IGM', 'igm', 'synonym', 'approved'
from unified_tags t where t.slug = 'intersex-genital-mutilation'
on conflict (alias_slug) do nothing;

-- ============================================================================
-- POSTCONDITIONS. Hard. Each asserts the END STATE positively (`v_bad <> N`), never a count of
-- rows in a bad state — that form returns zero for a slug that has gone missing from the corpus,
-- which is exactly what the softened pre-flight now lets through.
-- ============================================================================
do $verify$
declare v_bad int;
begin
  -- P1: group A — neither row still publishes the other subject, and both carry a real summary.
  select count(*) into v_bad from unified_tags
  where slug in ('asylum','hermaphrodite')
    and coalesce(long_description,'') not ilike '%psychiatric hospital%'
    and coalesce(long_description,'') not ilike '%gonochoric%'
    and coalesce(short_description,'') <> ''
    and short_description not ilike '%Hospital for severe%'
    and short_description not ilike '%produces both male and female gametes%';
  if v_bad <> 2 then raise exception 'P1 failed: group A reached state on % of 2 rows', v_bad; end if;

  -- P2: group B — the four removed sentences are gone, and the surrounding prose SURVIVED.
  --     Both halves asserted: "the bad sentence is gone" alone passes against a full rewrite.
  select count(*) into v_bad from unified_tags
  where (slug = 'intersex-variations'
         and long_description not like '%According to scientific%'
         and long_description like '%These variations can occur in physical characteristics such as chromosomes, genitalia, or reproductive organs.%')
     or (slug = 'intersex-conditions'
         and long_description not like '%According to scientific%'
         and long_description like '%They can be caused by various genetic, hormonal, or environmental factors.%')
     or (slug = 'dsd-disorders-of-sex-development'
         and long_description not ilike '%essential to approach discussions%'
         and long_description like '%may involve variations in genital, gonadal, or chromosomal sex.%')
     or (slug = 'asylum-refugees'
         and long_description not like 'This tag is for individuals%'
         and long_description like '%LGBTQ+ refugees often face unique challenges in the asylum process.%'
         and length(coalesce(description,'')) > 100);
  if v_bad <> 4 then raise exception 'P2 failed: group B reached state on % of 4 rows', v_bad; end if;

  -- P3: group C — the gendering and pathologising phrasings are gone from every prose field.
  select count(*) into v_bad from unified_tags
  where slug in ('sex-chromosome-anomaly','turner-syndrome-x')
    and (coalesce(description,'')||coalesce(short_description,'')||coalesce(long_description,'')) !~* '(affect(s|ing) females|abnormal|irregularity|Normally, females have)';
  if v_bad <> 2 then raise exception 'P3 failed: group C reached state on % of 2 rows', v_bad; end if;

  -- P4: group D — no replacement character, nothing truncated, nothing saying only that a term exists.
  select count(*) into v_bad from unified_tags
  where (slug = 'intersex' and description not like '%'||chr(65533)||'%' and length(description) > 200)
     or (slug = 'refugee' and description not like '%due to a' and length(description) > 150)
     or (slug = 'variations-of-sex-development-vsd' and description <> 'Another term for intersex.' and length(description) > 100);
  if v_bad <> 3 then raise exception 'P4 failed: group D reached state on % of 3 rows', v_bad; end if;

  -- P5: all 9 creations exist, unpublished, with ALL THREE category representations.
  --     The junction is what /tags/:slug renders; the text column is what the search facet reads.
  select count(*) into v_bad from unified_tags t
  where t.slug in ('intersex-genital-mutilation','sex-characteristics','variation-of-sex-characteristics',
                   'bodily-integrity','vital-intervention','malta-declaration',
                   'discretion-requirement','particular-social-group','credibility-assessment')
    and t.status = 'active' and t.publication_role = 'utility'
    and t.seo_indexable = false and t.human_reviewed = true
    and t.category_id is not null and coalesce(t.category,'') <> ''
    and exists (select 1 from tag_category_assignments a
                where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary)
    and public.tag_has_prose(t.description, t.short_description);
  if v_bad <> 9 then raise exception 'P5 failed: % of 9 creations reached the intended state', v_bad; end if;

  -- P6: the `igm` alias resolves to the new row and is APPROVED (an `auto` alias routes nothing).
  select count(*) into v_bad from tag_aliases a
  join unified_tags t on t.id = a.canonical_tag_id
  where a.alias_slug = 'igm' and t.slug = 'intersex-genital-mutilation' and a.review_status = 'approved';
  if v_bad <> 1 then raise exception 'P6 failed: igm alias not resolving to the canonical row'; end if;

  -- P7: `endosex` was NOT created. It is an approved alias of `dyadic`; minting a tag would be the
  --     duplicate the alias guard exists to refuse. A later pass must break this check to reverse it.
  select count(*) into v_bad from unified_tags where slug = 'endosex';
  if v_bad <> 0 then raise exception 'P7 failed: endosex exists as a tag; it is an alias of dyadic'; end if;

  -- P8: the deferred rows SURVIVED untouched. A sweep that took them would satisfy P1-P5 equally.
  select count(*) into v_bad from unified_tags
  where (slug = 'ambiguous-genitalia' and description ilike '%urethral opening%')
     or (slug = 'congenital-abnormalities' and short_description ilike '%Abnormal conditions present at birth%')
     or (slug = 'dublin-event' and description is null and long_description is null);
  if v_bad <> 3 then raise exception 'P8 failed: % of 3 deferred rows intact — a deferral was swept', v_bad; end if;

  raise notice 'intersex/asylum glossary pass: all 8 postconditions passed';
end $verify$;
