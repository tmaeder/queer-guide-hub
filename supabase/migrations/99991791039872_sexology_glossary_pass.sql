-- Sexology / trans / BDSM glossary comparison pass.
--
-- Compared `unified_tags` against THIRTEEN external glossaries in three
-- families: sexology (ffzg.unizg.hr Dictionary of Sexology, sexology.it,
-- masterclass, gettingiton.org.uk A-Z, Planned Parenthood), trans & gender
-- (transactual.org.uk, genderminorities.com, apa.org CE-corner), and BDSM
-- (Wikipedia Glossary of BDSM, getkneel, andana-bizarr, naturallynaughty
-- Kinkipedia, mercyindustries, thesubcoven). Headwords are persisted per source
-- under scripts/data-quality/out/sexology-pass/ and the slug->source map in
-- slug-map.json, so the join is re-derivable rather than asserted.
--
-- A fourteenth source was requested and is NOT represented here: the Make UK
-- "Glossary of Transgender and Gender Diverse Terms" PDF. ~/Downloads is
-- sandboxed in this environment -- both Read and `cp` return EPERM -- so the
-- file was never opened. A source that could not be read is recorded as unread
-- rather than quietly dropped from the source list; nothing below is attributed
-- to it.
--
-- MECHANICAL RESULT, 1,347 distinct slugs (the numbers anyone can re-derive):
--   active                 585  (485 already carry both description and body)
--   absent                 659
--   alias_only              49
--   merged                  38
--   deprecated              16  (14 with a real body)
-- So the corpus already covers 51% outright. That is the expected shape: a sex
-- & sexual-health pass already shipped (99991789812141, #3807 + #3810), a WebMD
-- pass before it, and sexuality-vocabulary-candidates.json had already triaged
-- Wikipedia's Glossary of BDSM at 6,319 rows. This file is the residue, and the
-- residue is small on purpose.
--
-- THE 659 ABSENT ARE NOT 659 GAPS, and the triage is the substance of the pass.
-- Four classes are refused wholesale, with reasons, rather than counted:
--
-- (1) THE PARAPHILIA TAXONOMY OF THE 1970s CLINICAL DICTIONARY. ffzg is Money's
--     vocabulary, and a large part of its -philia cohort names child sexual
--     abuse and sexual homicide: pedophilia, nepiophilia, hebephilia,
--     ephebophilia, biastophilia, raptophilia, erotophonophilia, homicidophilia,
--     lust-murder, necrophilia. Creating a tag here is not describing a word --
--     it mints a page AND an auto-tagging rule on an LGBTQ+ community platform.
--     Refused outright. This is the single most important call in the pass, and
--     it is why the headword list was triaged by hand rather than swept.
-- (2) GENERAL MEDICINE AND NEUROANATOMY. amygdala, hypothalamus, limbic-system,
--     pituitary-gland, adrenogenital-syndrome, abuse-dwarfism, agnosia,
--     alexithymia, follicle-stimulating-hormone, radioimmunoassay. Real terms,
--     not glossary vocabulary for this platform.
-- (3) US POLICY AND CASE LAW. comstock-act, hyde-amendment, abortion-funds,
--     anti-choice, pro-choice. Planned Parenthood is a US advocacy organisation;
--     its policy vocabulary is not this platform's subject.
-- (4) ONE STUDIO'S EQUIPMENT LIST. ultra-chair, gyno-chair, spread-bench,
--     scrotum-stretcher, hoist, dilatator -- andana-bizarr is a single Swiss
--     studio and these are its room inventory, not shared vocabulary. Contrast
--     st-andrews-cross, which IS standard and which the corpus already holds.
--
-- WHAT THE COLLISION CHECK CAUGHT, which is the `pinkwashing` lesson working:
-- four proposed creations were already covered and were dropped before writing
-- a line of SQL -- `forced-orgasm` and `st-andrews-cross` are ACTIVE already,
-- and `u-u` / `st-andrew-s-cross` are slugification artifacts shadowed by the
-- NAMES of `U=U` and `St Andrew's Cross`, so an alias there would be refused by
-- tag_reject_alias_shadow() anyway. Three more would-be creations are held by
-- existing rows under another name: greysexual (not grey-asexual), dyadic (not
-- endosex), top-surgery (not chest-surgery). Those became aliases, not rows.
--
-- ALL 16 DEPRECATED ROWS ARE CORRECTLY DEPRECATED AND NONE IS REVIVED. Every
-- one carries an explicit `deprecation_reason` of the form "canonical alias of
-- X; duplicate vocabulary row retired" with a named target. This is the OPPOSITE
-- of the cohort earlier passes kept finding, where the 2026-06-05 orphan audit
-- and the zero-usage sweep had culled core vocabulary on a false premise; here
-- the deprecations are principled and a blanket revive would have minted 16
-- duplicates. Recorded as a finding rather than acted on.
--
-- TWO of those canonical targets are nevertheless WRONG, and are reported here
-- rather than repaired, because `deprecation_reason` is prose and not a redirect
-- mechanism, so nothing is being served off it:
--   * `sex` -> "canonical alias of biological-sex". That row's own description
--     reads "sexual intercourse and intimate physical acts between consenting
--     partners", which is not biological sex. The concept IS covered -- by the
--     active `sexual-activity` -- so there is no gap, only a mislabel.
--   * `dom` -> "canonical alias of dominatrix". A dom is not a dominatrix;
--     `dominatrix` is specifically female-identified per its own prose. The
--     concept is held by the active `dominant`.
--
-- Guarded by src/lib/__tests__/sexologyGlossaryPass.test.ts.

begin;

select set_config('app.actor', 'migration:sexology_glossary_pass', true);

-- ---------------------------------------------------------------------------
-- PART A -- two prose defects on LIVE rows. Found by reading the rows the join
-- flagged as thin, not by any sentinel: both are the half-repaired shape, where
-- one prose field is correct and another is junk, which no check reading either
-- field alone can see.
-- ---------------------------------------------------------------------------

-- `binder` -- ACTIVE, usage 91. Its `description` is correct ("A compression
-- garment worn by some transgender individuals to flatten their chest") while
-- its `short_description` read, in full, "Family name". That is the disowned-
-- prose namesake class, and short_description is the LEAD LINE on /tags/:slug
-- AND is in trg_search_documents_tag's column list, so it is also the search
-- facet text. Replaced rather than nulled: the row is live and rendering, so a
-- retraction leaves a 91-use page with no lead where a replacement leaves it
-- correct. Content-guarded, so a human who fixes it first keeps their wording.
update unified_tags
set short_description = 'A compression garment worn to flatten the chest.'
where slug = 'binder'
  and status = 'active'
  and btrim(short_description) = 'Family name';

-- `men-who-have-sex-with-men` -- ACTIVE, usage 83. Its `description` was the
-- truncated generation artifact "The term Here's a breakdown of the term and
-- some key points:" -- a sentence that names no subject and breaks mid-clause.
-- The row's `short_description` and body are both fine, so only the wrong FIELD
-- is touched (the `casting`/`trauma` rule). The replacement states the one thing
-- that makes the term load-bearing: it is defined by behaviour, not identity,
-- which is exactly why public health uses it and why it is not a synonym for
-- "gay men".
update unified_tags
set description = 'A public-health category defined by behaviour rather than identity, usually written MSM. It covers men who have sex with men whether they identify as gay, bisexual, straight or none of those, which is precisely why epidemiology uses it — and why it is not a synonym for "gay men".'
where slug = 'men-who-have-sex-with-men'
  and status = 'active'
  and description like 'The term %breakdown of the term%';

-- ---------------------------------------------------------------------------
-- PART B -- two category misfilings on live rows, found incidentally.
--
-- Written as `category_id` ALONE, letting trg_sync_tag_category derive the
-- `category` text and trg_sync_tag_category_after move the primary junction row
-- (the 20261006110000 precedent). Both triggers are guarded `category_id is
-- distinct from old.category_id`, so writing the text or the junction directly
-- would propagate nothing -- and since /tags/:slug renders the JUNCTION while
-- the search facet renders the TEXT, a partial write leaves the two disagreeing.
-- ---------------------------------------------------------------------------

-- A cervical screening test filed under Events & Parties.
update unified_tags
set category_id = (select id from tag_categories where slug = 'sexual-health')
where slug = 'pap-smear'
  and category = 'Events & Parties';

-- A bodily fluid filed as a role -- and this one is seo_indexable, so the wrong
-- facet is what a crawler sees.
update unified_tags
set category_id = (select id from tag_categories where slug = 'physical-reproductive')
where slug = 'jizz'
  and category = 'Dynamics & Roles';

-- ---------------------------------------------------------------------------
-- PART C -- TERF has no live row at all.
--
-- `terf` is deprecated as "canonical alias of trans-exclusionary-radical-
-- feminist", AND THAT TARGET IS ITSELF DEPRECATED. So the redirect resolves to
-- a page that does not render, and a significant term in trans discourse has no
-- entry on a platform whose own corpus carries transmisogyny, cissexism and
-- transphobia. Same shape as the dead-merge-target class that
-- tag_merge_graph_signals() watches, reached through deprecation_reason prose
-- instead of merged_into_id -- which is why that sentinel cannot see it.
--
-- The acronym wins over the spelled-out form: it is what the term is actually
-- called, and it is the shorter slug.
--
-- THE ORDER OF THE NEXT TWO STATEMENTS IS LOAD-BEARING, and the first dry run
-- against prod is what established it. `tag_reject_alias_shadow()` fires on the
-- TAG UPDATE as well as on alias writes, so reviving the row while its own alias
-- still exists raises
--   P0001 tag ... cannot be active: the slug terf is held as an alias of
--   another tag
-- The alias must be deleted FIRST. Reading the trigger name suggests it guards
-- the alias table; it guards both directions.
--
-- The alias is deleted rather than re-pointed: with `terf` live, pointing it at
-- itself would mint the corpus's first SELF-alias, a state 20270601200100
-- measured at 0 and calls "junk of a different kind" -- and BOTH existing guards
-- miss that shape, since tag_reject_alias_shadow() explicitly excludes
-- canonical_tag_id = NEW.id and `alias_equals_name` compares NAMES. Deleting is
-- the `queer-theory` precedent. (The alias is also mistyped `multilingual`:
-- TERF is an abbreviation of the English phrase, not a translation of it.)
--
-- The search_synonyms delete comes first in turn, because that FK is ON DELETE
-- SET NULL rather than CASCADE, so deleting the alias alone would strand a row
-- pointing at nothing. Measured: 0 such rows exist today, so this is defensive
-- and not load-bearing -- but it is the order the trigger's own HINT asks for.
delete from search_synonyms
where tag_alias_id in (
  select a.id from tag_aliases a
  join unified_tags t on t.id = a.canonical_tag_id
  where a.alias_slug = 'terf' and t.slug = 'trans-exclusionary-radical-feminist'
);

delete from tag_aliases
where alias_slug = 'terf'
  and canonical_tag_id = (select id from unified_tags where slug = 'trans-exclusionary-radical-feminist');

update unified_tags
set status = 'active',
    seo_indexable = false,
    human_reviewed = true,
    deprecation_reason = null,
    deprecated_at = null
where slug = 'terf'
  and status = 'deprecated';

-- ---------------------------------------------------------------------------
-- PART D -- creations. Twelve rows, each absent from the corpus under every
-- spelling checked, each carried by a source read for this pass, and each
-- belonging to a family the corpus already has a category for.
--
-- Created UNPUBLISHED (seo_indexable = false) with human_reviewed = true, for
-- the reasons the prior pass states: the gap being closed is SITE SEARCH (0 of
-- 1,477 deprecated tags are in search_documents against the active rows, which
-- all are), and putting twelve new pages into the crawler index is a separate
-- decision.
--
-- All THREE category representations are set by hand, because neither category
-- trigger fires on INSERT -- the 194-row finding of 50100101100100, still
-- unrepaired corpus-wide. This file does not add to it.
-- ---------------------------------------------------------------------------

create temporary table _new_tags (
  slug text primary key, name text not null, cat text not null,
  descr text not null, summ text not null,
  adult boolean not null default false, sensitive boolean not null default false
) on commit drop;

insert into _new_tags (slug, name, cat, descr, summ, adult, sensitive) values
-- ---- consent & protocol. The highest-value creation in the pass: a safety
-- vocabulary item, and the one piece of BDSM negotiation language the corpus was
-- missing while already holding safe-word, hard-limits, soft-limits and consent.
('traffic-light-system','Traffic Light System','consent-negotiation','A three-word safeword scheme used during a scene: green means carry on, yellow means ease off or check in, red means stop now. Its advantage over a single safeword is that yellow exists — it lets someone adjust an intensity without ending the scene, which is the adjustment most people actually need.','Green, yellow, red — a safeword scheme that allows "ease off" as well as "stop".',true,false),
-- ---- gear. Sibling of the existing `day-collar`: the corpus held the collar
-- worn in ordinary life and not the one worn only in a scene.
('play-collar','Play Collar','gear-aesthetics','A collar worn only during a scene, as opposed to a day collar worn in ordinary life. The distinction is about what the collar is claiming: a play collar belongs to the scene and comes off with it.','A collar worn only during a scene, not in ordinary life.',true,false),
-- ---- contraception. This one exists because the obvious slug is TAKEN BY
-- ANOTHER SENSE: `withdrawal` is filed under Substances & Recovery and is about
-- a body adapted to a substance. Aliasing "pulling out" onto it would have been
-- precisely the wrong-sense defect this corpus keeps finding, so the
-- contraceptive method gets its own row under the name the sources use.
('pulling-out','Pulling Out','safer-sex','Withdrawing the penis before ejaculation as a contraceptive method, also called withdrawal or coitus interruptus. Markedly less reliable than barrier or hormonal methods — pre-ejaculate can carry sperm — and it offers no STI protection at all. Not to be confused with substance withdrawal, which is a separate entry.','Withdrawing before ejaculation; unreliable, and no STI protection.',true,false),
-- ---- UK legal instruments. The platform already has a Laws & Legal Rights
-- category and a tag_sources citation machinery for named instruments.
('gender-recognition-certificate','Gender Recognition Certificate','legal-rights','The UK document that changes a person''s legally recognised gender under the Gender Recognition Act 2004. A GRC is not required in order to transition, to change a name, or to update most records, and many trans people in the UK never obtain one — a distinction worth knowing before treating it as a prerequisite for anything.','UK certificate changing legally recognised gender; not required to transition.',false,false),
('gillick-competence','Gillick Competence','legal-rights','The UK legal test for whether a person under 16 understands a proposed treatment well enough to consent to it themselves. It matters in trans healthcare because it governs whether a young person can consent without a parent, and it is assessed per decision rather than granted once.','UK test for whether an under-16 can consent to their own treatment.',false,false),
-- ---- gender vocabulary
('gender-modality','Gender Modality','gender-identity','How a person''s gender relates to the one they were assigned at birth — cisgender and transgender are the two most common modalities, but not the only ones. The term exists so that "cis" and "trans" can be named as answers to one question rather than as a default and a deviation from it.','How someone''s gender relates to the one assigned at birth.',false,false),
('person-with-a-trans-history','Person with a Trans History','gender-identity','Someone who has transitioned and no longer describes themselves as trans in the present tense, treating it as something that happened rather than something they are. Worth knowing because it is a stated preference about how to be referred to, not a synonym for "stealth".','Someone who has transitioned and does not use "trans" in the present tense.',false,false),
('non-op','Non-op','trans-health','A trans person who does not intend to have gender-affirming surgery, or has not and may not. Not a stage on the way to anything: surgery is one option among several, and a transition without it is complete if the person says it is.','A trans person not seeking gender-affirming surgery.',false,false),
-- ---- the counterpart the corpus was missing. It holds cissexism but not the
-- intersex equivalent, and it already holds `dyadic`, which is this term's root.
('endosexism','Endosexism','violence-hate','Discrimination against intersex people, and the assumption that bodies which are not intersex are the only normal ones. The structural counterpart to cissexism, and the reason non-consensual surgery on intersex infants was treated for decades as correction rather than harm.','Discrimination against intersex people; the counterpart to cissexism.',false,false),
-- ---- Pacific identities. Directly relevant to a travel platform covering
-- Oceania, and absent from the corpus under every spelling checked.
('mvpfaff','MVPFAFF+','questioning-labels','An umbrella acronym for Pacific gender and sexuality identities — Māhū, Vaka sa lewa lewa, Palopa, Fa''afafine, Akava''ine, Fakaleitī and Fakafifine. Each names a role with its own history in its own culture, which is the point of the acronym: they are not local translations of "trans" or "non-binary".','Umbrella acronym for Pacific gender and sexuality identities.',false,false),
-- ---- HIV treatment. The corpus holds prep, u-equals-u and hiv; it did not hold
-- the drug class all three are defined in terms of.
('antiretroviral','Antiretroviral','sexual-health','A drug that suppresses HIV replication. Modern antiretroviral therapy takes most people to an undetectable viral load, at which point HIV is not sexually transmissible — the fact behind U=U — and it is also what PrEP and post-exposure prophylaxis are made of.','Drug class that suppresses HIV; the basis of treatment, PrEP and PEP.',false,true),
-- ---- community structure. Relevant to a platform with groups and events.
('tng','TNG','kink-community','"The Next Generation" — kink groups and events run by and for younger people, conventionally under 35. They exist because a scene whose events skew much older is hard to enter at 20, and most cities with a kink community have one.','Kink groups and events run by and for people under about 35.',true,false);

-- `publication_role` IS SET EXPLICITLY, and omitting it is a hard error rather
-- than a style lapse -- the second thing the prod dry run caught. The column has
-- NO default and is NOT NULL, and validate_tag_entity_target() opens with
--   if new.publication_role <> 'entity_redirect' then ... return new; end if;
-- so on a NULL that comparison is NULL, the early return is SKIPPED, and the
-- next branch raises `An entity redirect requires a reviewed type, ID, and path`
-- on a row that is not a redirect and never claimed to be. The three-valued
-- logic turns a missing column into an error about a feature this file does not
-- use. 99991789812141 omitted the column and its rows all ended up `utility`, so
-- something changed between that pass and this one; the explicit value is what
-- makes this file independent of whatever that was.
insert into unified_tags (
  name, slug, description, short_description, category_id, category,
  status, seo_indexable, human_reviewed, is_adult, is_sensitive, usage_count,
  publication_role
)
select n.name, n.slug, n.descr, n.summ, c.id, c.name,
       'active', false, true, n.adult, n.sensitive, 0,
       'utility'
from _new_tags n
join tag_categories c on c.slug = n.cat
where not exists (select 1 from unified_tags t where t.slug = n.slug)
  and not exists (select 1 from tag_aliases a where a.alias_slug = n.slug);

insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
from _new_tags n
join unified_tags t on t.slug = n.slug
join tag_categories c on c.slug = n.cat
where not exists (
  select 1 from tag_category_assignments x where x.tag_id = t.id and x.is_primary
);

-- ---------------------------------------------------------------------------
-- PART E -- aliases. Twelve spellings and abbreviations the sources use that
-- route onto rows the corpus already has. These mint NO pages; they close a
-- routing gap in display, auto-tagging and the search bridge, all three of which
-- have been approved-only since 20261012090000 -- so an `auto` alias here would
-- be stored and route nothing.
--
-- TWO ARE DELIBERATELY REFUSED and must not be re-proposed:
--   * `pulling-out` -> `withdrawal`. Wrong sense; see PART D.
--   * `warts` -> `genital-warts`. An approved alias is an auto-tagging RULE as
--     well as a displayed synonym, and "warts" is an ordinary word covering
--     plantar and common warts. The routing gain is small, the false-tagging is
--     not -- the `lezbo`/`lezzie` call of 50300101100100.
-- ---------------------------------------------------------------------------

create temporary table _new_aliases (
  alias_slug text primary key, alias_name text not null,
  canonical text not null, atype text not null
) on commit drop;

insert into _new_aliases (alias_slug, alias_name, canonical, atype) values
  ('grey-asexual','Grey-asexual','greysexual','synonym'),
  ('endosex','Endosex','dyadic','synonym'),
  ('chest-surgery','Chest Surgery','top-surgery','synonym'),
  ('bilateral-mastectomy','Bilateral Mastectomy','top-surgery','covers'),
  ('forced-feminization','Forced Feminization','feminization','covers'),
  ('smear-test','Smear Test','pap-smear','synonym'),
  ('cervical-screening-tests','Cervical Screening Tests','pap-smear','synonym'),
  ('crabs','Crabs','pubic-lice','synonym'),
  ('hepatitis-b-virus','Hepatitis B Virus','hepatitis-b','synonym'),
  ('msm','MSM','men-who-have-sex-with-men','abbreviation'),
  ('wlw','WLW','women-who-have-sex-with-women','abbreviation'),
  ('erotic-sexual-denial','Erotic Sexual Denial','orgasm-control','covers');

insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, a.alias_name, a.alias_slug, a.atype, 'approved'
from _new_aliases a
join unified_tags t on t.slug = a.canonical and t.status = 'active'
where not exists (select 1 from tag_aliases x where x.alias_slug = a.alias_slug)
  and not exists (select 1 from unified_tags u where u.slug = a.alias_slug);

-- ---------------------------------------------------------------------------
-- PART F -- four ACTIVE rows with an EMPTY short_description. The page renders
-- its description and the search facet has no lead text at all. Filling an empty
-- field is not the LLM rewrite both auto-apply paths were retired for, and each
-- fill restates what the row's OWN description already says -- no sense is
-- chosen and no body is written or removed.
--
-- human_reviewed is NOT stamped on these: `deprecate_unused_tags()` selects
-- active + not-reviewed + usage 0, and all four carry real usage (ace 130,
-- latex 198, brat 93, top 89), so none is selectable and the flag would change
-- nothing. `prose_reviewed_at` stays null, so they remain counted by
-- tag_hygiene_stats().prose_unreviewed exactly as before.
-- ---------------------------------------------------------------------------

update unified_tags set short_description = 'Short for someone on the asexual spectrum.'
  where slug = 'ace' and status = 'active' and coalesce(btrim(short_description),'') = '';
update unified_tags set short_description = 'A submissive who plays at being mischievous or defiant.'
  where slug = 'brat' and status = 'active' and coalesce(btrim(short_description),'') = '';
update unified_tags set short_description = 'A material fetish for latex clothing — its fit, sheen and feel.'
  where slug = 'latex' and status = 'active' and coalesce(btrim(short_description),'') = '';
update unified_tags set short_description = 'The person giving or directing in a scene — a role, not a level of power.'
  where slug = 'top' and status = 'active' and coalesce(btrim(short_description),'') = '';

-- ---------------------------------------------------------------------------
-- POSTCONDITIONS.
--
-- Soft on preconditions, hard on postconditions. Every guard above REPORTS and
-- EXCLUDES rather than aborting: a concurrent session that legitimately repairs
-- one of these rows between authoring and CI must not turn this file into a
-- `db push` failure on main, which takes every migration queued behind it.
--
-- The checks below therefore assert the REACHED STATE positively and count the
-- CONDITION, not a needle inside it. They are also keyed on the state rather
-- than on this file's own wording, so a better fix written by someone else
-- satisfies them too.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
  v_n   int;
begin
  -- A. the two prose defects are gone, and the fields that were correct survive.
  select count(*) into v_bad from unified_tags
  where (slug = 'binder' and btrim(coalesce(short_description,'')) = 'Family name')
     or (slug = 'men-who-have-sex-with-men' and coalesce(description,'') like 'The term %breakdown of the term%');
  if v_bad <> 0 then
    raise exception 'postcondition A: % live row(s) still publish the junk prose', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
  where slug in ('binder','men-who-have-sex-with-men')
    and (status <> 'active' or not public.tag_has_prose(description, short_description));
  if v_bad <> 0 then
    raise exception 'postcondition A2: % row(s) left unpublishable or inactive', v_bad;
  end if;

  -- B. both misfilings moved, and moved in ALL THREE representations -- the text,
  -- the id, and the primary junction row. Asserting only category_id would pass
  -- while the page a reader gets still showed the old category.
  select count(*) into v_bad
  from unified_tags t
  join tag_categories c on c.id = t.category_id
  where t.slug = 'pap-smear' and (c.slug <> 'sexual-health' or t.category <> 'Sexual Health');
  if v_bad <> 0 then
    raise exception 'postcondition B: pap-smear did not move to Sexual Health';
  end if;

  select count(*) into v_bad
  from unified_tags t
  join tag_categories c on c.id = t.category_id
  where t.slug = 'jizz' and (c.slug <> 'physical-reproductive' or t.category <> 'Body & Reproductive Health');
  if v_bad <> 0 then
    raise exception 'postcondition B2: jizz did not move to Body & Reproductive Health';
  end if;

  select count(*) into v_bad
  from unified_tags t
  where t.slug in ('pap-smear','jizz')
    and not exists (
      select 1 from tag_category_assignments a
      where a.tag_id = t.id and a.is_primary and a.category_id = t.category_id
    );
  if v_bad <> 0 then
    raise exception 'postcondition B3: % row(s) have a primary junction disagreeing with category_id', v_bad;
  end if;

  -- C. TERF resolves to a live row, and no self-alias was minted.
  select count(*) into v_bad from unified_tags
  where slug = 'terf' and (status <> 'active' or seo_indexable or not human_reviewed);
  if v_bad <> 0 then
    raise exception 'postcondition C: terf is not active-and-unpublished-and-reviewed';
  end if;

  select count(*) into v_bad from tag_aliases a
  join unified_tags t on t.id = a.canonical_tag_id
  where a.alias_slug = 'terf' or (a.canonical_tag_id = t.id and a.alias_slug = t.slug);
  if v_bad <> 0 then
    raise exception 'postcondition C2: % alias row(s) shadow a live tag slug', v_bad;
  end if;

  -- D. all eleven creations exist, unpublished, with all three category
  -- representations agreeing. Counting the REACHED state positively: a count of
  -- rows in a BAD state returns zero for a slug that went missing entirely.
  select count(*) into v_n
  from unified_tags t
  join tag_categories c on c.id = t.category_id
  where t.slug in ('traffic-light-system','play-collar','pulling-out',
                   'gender-recognition-certificate','gillick-competence','gender-modality',
                   'person-with-a-trans-history','non-op','endosexism','mvpfaff',
                   'antiretroviral','tng')
    and t.status = 'active'
    and t.seo_indexable = false
    and t.human_reviewed = true
    and t.category = c.name
    and public.tag_has_prose(t.description, t.short_description)
    and exists (
      select 1 from tag_category_assignments a
      where a.tag_id = t.id and a.is_primary and a.category_id = t.category_id
    );
  if v_n <> 12 then
    raise exception 'postcondition D: expected 12 fully-wired new rows, found %', v_n;
  end if;

  -- E. all twelve aliases exist, approved, pointing at an ACTIVE canonical.
  select count(*) into v_n
  from tag_aliases a
  join unified_tags t on t.id = a.canonical_tag_id
  where a.alias_slug in ('grey-asexual','endosex','chest-surgery','bilateral-mastectomy',
                         'forced-feminization','smear-test','cervical-screening-tests','crabs',
                         'hepatitis-b-virus','msm','wlw','erotic-sexual-denial')
    and a.review_status = 'approved'
    and t.status = 'active';
  if v_n <> 12 then
    raise exception 'postcondition E: expected 12 approved aliases on active rows, found %', v_n;
  end if;

  -- E2. the two REFUSALS hold. A later pass reaching for either breaks this file.
  select count(*) into v_bad from tag_aliases
  where alias_slug in ('pulling-out','warts');
  if v_bad <> 0 then
    raise exception 'postcondition E2: % refused alias(es) were created anyway', v_bad;
  end if;

  -- F. the four summary fills landed and no body was touched anywhere.
  select count(*) into v_bad from unified_tags
  where slug in ('ace','brat','latex','top')
    and coalesce(btrim(short_description),'') = '';
  if v_bad <> 0 then
    raise exception 'postcondition F: % row(s) still have an empty summary', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
  where slug in ('ace','brat','latex','top','binder','men-who-have-sex-with-men')
    and status <> 'active';
  if v_bad <> 0 then
    raise exception 'postcondition F2: % touched row(s) left non-active', v_bad;
  end if;

  -- G. none of the refused classes was created. Keyed on the classes the header
  -- refuses, so a later sweep that "helpfully" imports the paraphilia taxonomy
  -- fails here rather than shipping.
  select count(*) into v_bad from unified_tags
  where slug in ('pedophilia','nepiophilia','hebephilia','biastophilia','raptophilia',
                 'erotophonophilia','homicidophilia','lust-murder','comstock-act',
                 'hyde-amendment','ultra-chair','gyno-chair','scrotum-stretcher')
    and status = 'active';
  if v_bad <> 0 then
    raise exception 'postcondition G: % refused term(s) exist as active rows', v_bad;
  end if;
end
$verify$;

commit;
