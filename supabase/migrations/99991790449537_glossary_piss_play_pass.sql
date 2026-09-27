-- Glossary pass: piss play / watersports, compared against nine external guides.
--
-- SOURCES (9 requested, 9 read; two needed r.jina.ai to reach the article body —
-- allure.com and pulse-clinic.com, whose direct fetch returned navigation only
-- and would have been recorded as unread): allure.com, burnettfoundation.org.nz
-- (NZ HIV org), go3fun.co, badkity.com, gays.com, pulse-clinic.com (sexual
-- health clinic), fetish.com, kinkacademy.com, zippermagazine.com. Licence
-- stance is the Kinktionary's: the TERM LIST was used as a signal for what is
-- absent; no wording was copied or translated.
--
-- TWO SOURCE CAVEATS SHAPED THE WHOLE PASS AND ARE WHY THE CORROBORATION
-- COUNTS BELOW ARE NOT THE RAW ONES.
--   (a) badkity.com is a femdom session-provider page, not a guide. Its unique
--       vocabulary (mixed wrestling, oil wrestling, session booking) is
--       business vocabulary, so a count of 1 there is weaker than a count of 1
--       anywhere else.
--   (b) pulse-clinic.com and zippermagazine.com are NOT independent voices —
--       they share `service receptacles`, `piggy play`, `human toilets` and
--       `piss desperation` verbatim-adjacent, so one is derivative of the
--       other. Every term whose count of 2 is those two sources counts as ONE
--       voice: piggy play, human toilet, wet and messy sex, floor drain.
--   Without (b) a `piggy play` row would have looked twice-corroborated. It is
--   not created.
--
-- TWO FACTS ARE CONTESTED ACROSS THE NINE AND MUST NOT BE PUBLISHED AS SETTLED
-- FROM THEM. Six sources say urine is not sterile and two say it is "sterile if
-- the person is healthy"; pulse-clinic says urine is "generally low-risk" for
-- STI transmission while zippermagazine says chlamydia and gonorrhoea are
-- transmissible through it. This is a harm-reduction-adjacent glossary, so the
-- prose below is written from the clinical position rather than by counting
-- pages: urine from a healthy person is LOW IN BACTERIA RATHER THAN STERILE
-- (the dissenting two are repeating the retired line), urine is NOT a route for
-- HIV, and the STI sentence states the defensible fact — chlamydia and
-- gonorrhoea are DIAGNOSED FROM a urine sample, which is why untreated urethral
-- infection is the thing worth asking about — and never asserts urine as a
-- transmission route, which no source establishes.
--
-- THE CORPUS SPLIT THE WORK, NOT THE SOURCES. `unified_tags.publication_role`
-- is a two-lane system: 6,660 active `utility` rows of which ZERO are
-- seo_indexable, against 1,639 `article` rows of which 1,203 are. Utility is
-- the filing lane, article is the glossary lane. So the reader-facing defects
-- are in the article lane, and `watersports` (15 uses) and `piss-play` (12)
-- being utility is the intended split rather than the inversion it first looks
-- like. Utility rows are NOT invisible, though: `fetchTagPreviews` filters
-- `status = active` and nothing else, so they reach the inline definition card,
-- which is why the two NULL/run-on fields on them are fixed here too.
--
-- Field precedence was read rather than recalled. Crawler `article` in
-- functions/_lib/detail.ts is long_description -> description ->
-- short_description; crawler `summary` and the SPA's useMeta are both
-- description -> short_description -> long_description (they agree);
-- TagDefinitionCard is short_description || description; TagDetail renders
-- `description` as the lead paragraph and `long_description` as the body
-- beneath it. So a NULL long_description on an indexable row is a page that
-- renders two lines and stops.
--
-- WHAT THIS FILE DOES NOT DO, each with its reason, so a later pass does not
-- read a deferral as an oversight:
--   * `urophilia` prose is NOT rewritten. Its body is Greek etymology and it is
--     ACCURATE; the house disposition for encyclopedic-but-correct prose is to
--     leave it (`naturist`). Under-reaching is the correct error.
--   * `piss-drinker` is NOT touched. Its body carries "carries health risks if
--     not practiced safely", one of the eight rows round thirteen
--     (77000101100000) protects by postcondition after measuring that no regex
--     separates contentless exhortation from real safety content.
--   * `toilet` is NOT repaired. It names TWO senses at once — Q7857 and
--     thirteen plumbing aliases (Klo, WC, Toilette, inodoro) against an
--     is_adult + is_sensitive + Dynamics & Roles filing and a description
--     reading "Bathroom fixture role". The kink role is already held by
--     `human-toilet` and `toilet-slave`, so choosing a sense here is the guess
--     this whole class came from (`host`, `unicorn`, `queen`).
--   * `scat` is NOT merged into `scat-play`, and its NULL body is NOT filled.
--     Both are active and indexable and they are one concept, but scat appears
--     in the nine sources only as a boundary distinction (0 of 9 name it), and
--     `scat-play` already carries the good body — so filling `scat` would mean
--     writing a second body for a concept that already has one. Its two
--     ADIPOSE-TISSUE aliases are deleted below, which needs no judgement.
--   * `piss-pig` and `urophagia` are NOT created. Neither appears in the master
--     term list of the nine at all — piss pig is a real community term and the
--     corroboration rule is what stopped it being minted on my own recall, and
--     urophagia survives only as `Urofagia`/`Urophagie`, two `auto` (therefore
--     inert) aliases on `urophilia`.
--
-- Guarded by src/lib/__tests__/glossaryPissPlayPass.test.ts.

select set_config('app.actor', 'migration:99991790449537_glossary_piss_play_pass', true);

-- The actor declaration is LOAD-BEARING on this tranche, not attribution:
-- golden-shower, piss-slut, toilet-slave and omorashi are human_reviewed, and
-- log_unified_tag_change() RAISEs "cannot be modified by system:trigger" for an
-- undeclared writer. Verified live with a REAL value change, since a
-- self-assignment changes no column, fires no trigger, and reads exactly like a
-- permissive one. watersports, piss-play and human-toilet are the opposite case
-- (human_reviewed = false), which is why this file states which rows are which.

-- Snapshot every prose column on every row in scope, so the postconditions can
-- PROVE the scope claim rather than assert it.
create temporary table _piss_before on commit drop as
select slug, description, short_description, long_description
from unified_tags
where slug in ('golden-shower','piss-slut','toilet-slave','human-toilet','watersports',
               'piss-play','urophilia','piss-drinker','urine-play','scat','scat-play',
               'toilet','omorashi');

-- ── 1. NULL FILL on the flagship ─────────────────────────────────────────────
-- `golden shower` is the one term all nine sources name and five of the nine
-- put in their own URL. The row is article, seo_indexable and in
-- search_documents, its description and short_description are both correct and
-- well written, and its long_description is NULL — so the page renders two
-- lines and stops. Filling a NULL is not the LLM rewrite both auto-apply paths
-- were retired for.
update unified_tags set long_description =
  'A golden shower is urine directed onto a partner: chest, back, face, or into the mouth. The practical questions are where it lands and where you do it. A shower, a bath, or a tiled floor with a drain reduces clean-up to rinsing; a bed needs a waterproof layer under the sheet, and puppy pads or a tarp do the same job cheaply. Risk tracks the tissue involved — intact skin is the low end, the mouth is higher, and the eyes are the one place worth agreeing on in advance, since urine stings and a splash wants rinsing with water rather than rubbing. Urine from a healthy person is low in bacteria rather than sterile, and it is not a route for HIV. What is worth asking about instead is untreated urethral infection, since chlamydia and gonorrhoea are diagnosed from a urine sample, and hepatitis B vaccination covers the other exposure that matters. An hour of drinking water beforehand dilutes everything, smell included; dark urine means the person is dehydrated.'
where slug = 'golden-shower' and status = 'active'
  and long_description is null;

-- ── 2. SAYS-NOTHING on indexable article rows ────────────────────────────────
-- Round eleven's class. `piss-slut` is article, seo_indexable and in search
-- with 40 chars of summary that name no subject and a body that never mentions
-- urine at all — a reader looking the term up learns nothing from either. The
-- row's own `description` ("Person who loves watersports") establishes the
-- sense, and `watersports`'s own description establishes that watersports here
-- means urine play, so no sense is guessed. The reclamation point is the
-- queer-glossary content a general guide does not carry.
update unified_tags set
  short_description = 'Someone enthusiastically into being pissed on — a claimed word, not one to hand out.',
  long_description  = 'Piss slut is a self-claimed label for someone who wants to be pissed on, or to drink it, and is direct about wanting it. Like the other reclaimed slut words it is worn rather than thrown: used about someone who has not claimed it, it is simply an insult. The practical half is the same as any piss play — where the stream lands sets the risk, intact skin at the low end and the eyes at the high one, and urine from a healthy person is low in bacteria without being sterile.'
where slug = 'piss-slut' and status = 'active'
  and short_description = 'Term associated with sexual preferences.';

-- `toilet-slave` is article, seo_indexable and in search, and its body states
-- that the specifics "can vary widely depending on the individuals involved",
-- i.e. it declines to say what the term means. The risk half is written to
-- agree with `scat-play`, which already carries those facts — one corpus, one
-- set of facts, rather than a second independent account of hepatitis A.
update unified_tags set long_description =
  'Toilet slave is the receiving role in human-toilet play: the submissive takes urine, and under some arrangements faeces, directly rather than into a bowl. What separates it from ordinary piss play is the framing — service and degradation rather than sensation — so what gets negotiated is usually the exact scope rather than any question of technique. The infection picture follows that scope. Urine is low-risk. Faeces is the highest-risk substance in common play, since hepatitis A, shigella and E. coli all travel the faecal-oral route and circulate in outbreaks among men who have sex with men, and hepatitis A vaccination is the precaution that matters there.'
where slug = 'toilet-slave' and status = 'active'
  and long_description like '%specifics can vary widely%';

-- `human-toilet` is utility, so it is not indexable — but it reaches the inline
-- definition card, and its body ends by shipping the model's own uncertainty as
-- a definition ("Information on this topic is limited"), the `horny-net-geek-hng`
-- shape. Its `description` is good and is left alone.
update unified_tags set long_description =
  'Human toilet describes the arrangement rather than any single act: one person is, by agreement, the receptacle for another. It sits at the far end of service and degradation play, which is why what gets settled beforehand is the exact scope — urine only, or not — rather than anything technical. Risk follows that line. Urine is low-risk; faeces carries hepatitis A, shigella and E. coli by the faecal-oral route, and hepatitis A vaccination is the precaution for that half.'
where slug = 'human-toilet' and status = 'active'
  and long_description like '%Information on this topic is limited%';

-- ── 3. The two utility rows the corpus actually uses ─────────────────────────
-- `watersports` carries 15 assignments and is the only row in the family with
-- BOTH short_description and long_description NULL. A NULL fill on the summary.
update unified_tags set short_description = 'Umbrella term for sexual play involving urine.'
where slug = 'watersports' and status = 'active'
  and short_description is null;

-- `piss-play` (12 assignments) carries a 452-character description that is ONE
-- sentence — the field the detail page leads with and the field the crawler's
-- meta description is built from. Replaced with something readable that names
-- the three words a reader will meet. Its body carries the consent padding
-- round thirteen measured and refused to sweep, and is left standing.
update unified_tags set description =
  'Sexual play involving urine: being pissed on, pissing on someone, drinking it, or watching. Watersports and piss play are the community names for it; urophilia is the clinical one.'
where slug = 'piss-play' and status = 'active'
  and length(description) > 400;

-- ── 4. MERGE the redundant fourth spelling ───────────────────────────────────
-- `watersports`, `piss-play`, `urine-play` and `urophilia` are four live rows
-- for one concept (`urolagnia` is already merged into `urophilia`). Three of
-- the four survive for a reason: watersports and piss-play are the utility
-- filing rows carrying all 27 assignments in the family, and `golden-shower` is
-- a NARROWER practice, not a spelling. `urine-play` is the one with no
-- independent currency — 0 of 9 sources use it — and its body ships the model's
-- own uncertainty ("Information on this topic may be limited, and it's vital to
-- consult reputable sources"). So it is merged rather than rewritten, which
-- also mints an alias from its name so the spelling keeps routing.
--
-- Direction: `urophilia` wins. It holds the correct identifier (Q457251,
-- resolved), 12 aliases including the community vocabulary this family is
-- searched by (Natursekt, Pissing, Lluvia dorada, douche dorée) and the
-- approved `urolagnia` synonym, and 2 relations. `urine-play` holds none of
-- those. Measured safe: both are `Fetishes` with the SAME category_id, so
-- merge_tag_concept DELETEs the loser's junction row instead of repointing it,
-- which is the 23505 (two is_primary rows) trap 20361124161700 recorded; and
-- both have ZERO assignments, so no content link is moved. Reversible via
-- unmerge_tag_concept(audit_id).
do $merge$
declare
  v_keep uuid;
  v_drop uuid;
begin
  select id into v_keep from unified_tags where slug = 'urophilia'  and status = 'active';
  select id into v_drop from unified_tags where slug = 'urine-play' and status = 'active';
  -- Soft on preconditions: a row a concurrent session already merged, renamed
  -- or deprecated simply drops out of scope rather than aborting db push for
  -- the whole repo (20810101100100).
  if v_keep is not null and v_drop is not null then
    perform merge_tag_concept(v_keep, v_drop,
      'migration:99991790449537_glossary_piss_play_pass', 'glossary-piss-play-pass');
  end if;
end
$merge$;

-- ── 5. Alias residue from a disowned identifier ──────────────────────────────
-- `scat` once carried Q30015788, SUBCUTANEOUS ADIPOSE TISSUE, which the
-- 2026-08-29 wrong-entity repair nulled. It did not remove the aliases that
-- identifier produced, so a faeces tag still answers to `grasa subcutánea` and
-- `tejido adiposo subcutáneo` — the `queerness` rule (20360401100300) one
-- artifact class further on: nulling an identifier does not remove what it
-- generated. Both are `auto`, so inert for display, auto-tagging and the search
-- bridge since 20261012090000, which is why this is residue rather than live
-- harm. Deleted on the same basis as `safer-injecting`'s seven SLAM aliases.
delete from tag_aliases a
using unified_tags t
where a.canonical_tag_id = t.id
  and t.slug = 'scat'
  and a.alias_slug in ('grasa-subcutnea','tejido-adiposo-subcutneo');

-- ── 6. The one genuine gap ───────────────────────────────────────────────────
-- `shy bladder` / `pee shy` is named by THREE independent sources (go3fun,
-- gays.com, fetish.com — none of them the derivative pair) and is absent from
-- the corpus under every spelling. It earns a row rather than an alias because
-- it is the commonest reason a first piss scene goes nowhere and because it is
-- a real condition with a clinical name, so a reader can act on it; it is the
-- only creation in this pass.
--
-- THE LANE IS DERIVED FROM EDITORIAL READINESS, NOT CHOSEN — and the dry run is
-- what established that; reading the insert could not. `zz_enforce_tag_publication_role`
-- DEMOTES `article` to `utility` unless the row has a non-empty description AND
-- `prose_reviewed_at` AND a `category_id` AND a satisfied source requirement AND
-- a non-pending ontology decision AND a non-pending localisation decision. Three
-- of those default to pending/NULL on any INSERT (`ontology_review_status`,
-- `localisation_review_status`, `prose_reviewed_at`), so **a newly created tag
-- structurally CANNOT be an article page**, which is the correctness-first gate
-- working as designed rather than an obstacle. The row therefore lands
-- `publication_role = 'utility'`, `seo_indexable = false`,
-- `seo_deindex_reason = 'publication_role:utility'` and a review note reading
-- "correctness-first: incomplete article retained as utility vocabulary", and
-- postcondition 8 asserts that REACHED state rather than the one asked for.
--
-- `'article'` is still passed rather than omitted, for two measured reasons:
-- the column is NOT NULL with NO default, and omitting it makes
-- `zy_validate_tag_entity_target` fail first with "An entity redirect requires a
-- reviewed type, ID, and path" (it runs before the zz_ trigger that would have
-- derived the value); and because `default_tag_publication_role` returns
-- 'article' here, passing it matches the derived default, so the trigger writes
-- the honest correctness-first note instead of a `publication_role_review_note`
-- claiming a human reviewed an exception.
--
-- A utility row is NOT invisible, which is what makes the creation worth making:
-- measured, `publication_role` appears in NO frontend or edge reader at all, and
-- the /tags index (TAG_INDEX_COLUMNS in useCentralizedTags) filters
-- `status = active` and nothing else. So the row is listed in the glossary
-- index, reachable at its own URL, and in the inline-definition-card pool. What
-- it is not is crawler-indexable or in site search, since
-- `search_documents_index_tags` does filter on `publication_role` — verified
-- against the live function rather than from a note about it.
--
-- seo_indexable is set EXPLICITLY because its default is TRUE — the
-- publish-on-arrival trap 20360101101300 recorded on a revive.
-- human_reviewed = true is the documented escape hatch from
-- deprecate_unused_tags(), which selects exactly
-- `active AND human_reviewed = false AND usage_count = 0`.
--
-- All THREE category representations are written by hand, because neither
-- trg_sync_tag_category nor trg_sync_tag_category_after fires on INSERT — the
-- 194-row finding of 50100101100100. Asserting `category_id is not null` alone
-- would pass on exactly the broken shape.
insert into unified_tags (
  name, slug, description, short_description, long_description,
  category_id, category, status, publication_role, seo_indexable,
  human_reviewed, is_adult, is_sensitive, usage_count
)
select
  'Shy Bladder', 'shy-bladder',
  'Not being able to piss when someone is watching or waiting — the commonest reason a first piss scene goes nowhere.',
  'Difficulty urinating when observed; clinically paruresis.',
  'Shy bladder is the involuntary blocking that happens when someone is watched or waited for. The clinical name is paruresis, and it sits on the spectrum of social anxiety rather than being a fault of the urinary tract, which is why pressure reliably makes it worse. The practical answers are all about removing the audience rather than trying harder: a genuinely full bladder, running water, a partner in the next room or facing away, and no expectation that it has to work this time. Arousal itself also works against it, since an erection narrows the urethra, so the order of events often matters more than anything else.',
  c.id, c.name, 'active', 'article', false,
  true, false, false, 0
from tag_categories c
where c.slug = 'physical-reproductive'
  and not exists (select 1 from unified_tags t where t.slug = 'shy-bladder')
  and not exists (select 1 from tag_aliases a where a.alias_slug = 'shy-bladder');

insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
from unified_tags t
join tag_categories c on c.slug = 'physical-reproductive'
where t.slug = 'shy-bladder'
  and not exists (
    select 1 from tag_category_assignments x where x.tag_id = t.id and x.is_primary
  );

-- ── 7. Aliases: the English names for concepts the corpus already holds ──────
-- `wetting` and `desperation` are named by four of the nine and the concept is
-- already `omorashi` — so they are aliases, not rows, which is the
-- takatekote/`box-tie` rule. `paruresis` and `pee shy` route onto the row
-- created above. All are `approved` rather than `auto`, since display,
-- auto-tagging and the search bridge have all been approved-only since
-- 20261012090000 — an `auto` alias routes nothing. Typed `synonym` rather than
-- `multilingual`: these are the names the practice uses in English.
--
-- alias_slug is globally UNIQUE and tag_aliases has NO BEFORE trigger deriving
-- it, so each is supplied and guarded. tag_reject_alias_shadow() would refuse
-- any of these whose text is an existing tag NAME; measured, none is.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.nm, v.sl, 'synonym', 'approved'
from (values
  ('omorashi',    'Wetting',             'wetting'),
  ('omorashi',    'Desperation Play',    'desperation-play'),
  ('omorashi',    'Bladder Desperation', 'bladder-desperation'),
  ('shy-bladder', 'Paruresis',           'paruresis'),
  ('shy-bladder', 'Pee Shy',             'pee-shy'),
  ('shy-bladder', 'Pee Shyness',         'pee-shyness')
) as v(on_slug, nm, sl)
join unified_tags t on t.slug = v.on_slug and t.status = 'active'
where not exists (select 1 from tag_aliases a where a.alias_slug = v.sl)
  and not exists (select 1 from unified_tags x where lower(x.name) = lower(v.nm));

do $verify$
declare
  v_scope     int;
  v_nothing   int;
  v_uncertain int;
  v_thin      int;
  v_empty     int;
  v_runon     int;
  v_merged    int;
  v_adipose   int;
  v_new       int;
  v_cats      int;
  v_aliases   int;
  v_refusals  int;
  v_collat    int;
begin
  -- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. An exact-match premise is
  -- not protection: a concurrent session that legitimately merges or deprecates
  -- one of these between authoring and merge turns the abort into a db push
  -- failure on main that blocks EVERY migration queued behind it
  -- (20360401100100). So the guard REPORTS a floor and every check below
  -- asserts the state reached.
  select count(*) into v_scope from unified_tags
   where status = 'active'
     and slug in ('golden-shower','piss-slut','toilet-slave','human-toilet',
                  'watersports','piss-play','urophilia','piss-drinker');
  if v_scope < 7 then
    raise exception 'piss pass: only % of 8 repaired rows are still active - refusing to report success on a corpus that moved out from under the file', v_scope;
  end if;

  -- 1. No repaired row still says nothing. Keyed on the WRONG text, so a
  --    better fix written by a concurrent session also satisfies it.
  select count(*) into v_nothing from unified_tags
   where status = 'active'
     and (
       (slug = 'piss-slut'    and short_description = 'Term associated with sexual preferences.')
    or (slug = 'toilet-slave' and long_description like '%specifics can vary widely%')
     );
  if v_nothing <> 0 then
    raise exception 'piss pass: % row(s) still publish prose that names no subject', v_nothing;
  end if;

  -- 2. No row ships the model's own uncertainty as a definition.
  select count(*) into v_uncertain from unified_tags
   where status = 'active'
     and slug in ('human-toilet','golden-shower','piss-slut','toilet-slave','watersports','piss-play')
     and (long_description like '%Information on this topic is limited%'
       or long_description like '%Information on this topic may be limited%');
  if v_uncertain <> 0 then
    raise exception 'piss pass: % row(s) still publish the model uncertainty tail', v_uncertain;
  end if;

  -- 3. The two NULL fills landed, stated positively. "The defect is gone" is
  --    satisfied by a row that went missing from the corpus entirely.
  select count(*) into v_empty from unified_tags
   where status = 'active'
     and ((slug = 'golden-shower' and coalesce(btrim(long_description),'')  <> '')
       or (slug = 'watersports'   and coalesce(btrim(short_description),'') <> ''));
  if v_empty <> 2 then
    raise exception 'piss pass: expected 2 filled rows (golden-shower body, watersports summary), found %', v_empty;
  end if;

  -- 4. The run-on is gone AND the replacement is readable rather than merely
  --    shorter: it must name the three words a reader meets.
  select count(*) into v_runon from unified_tags
   where slug = 'piss-play' and status = 'active'
     and length(description) < 300
     and description like '%Watersports%' and description like '%urophilia%';
  if v_runon <> 1 then
    raise exception 'piss pass: piss-play description is not the readable replacement';
  end if;

  -- 5. Nothing became unpublishable. CALL the real predicate rather than
  --    restating its OR, which is a different check (round eleven).
  select count(*) into v_thin from unified_tags
   where status = 'active'
     and slug in ('golden-shower','piss-slut','toilet-slave','human-toilet',
                  'watersports','piss-play','urophilia','shy-bladder')
     and not tag_has_prose(description, short_description);
  if v_thin <> 0 then
    raise exception 'piss pass: % row(s) fail tag_has_prose', v_thin;
  end if;

  -- 6. The merge reached its END STATE, and the target is ACTIVE — a merge whose
  --    target is deprecated or itself merged is a redirect to a page that does
  --    not render (50400101100100).
  select count(*) into v_merged
    from unified_tags d join unified_tags k on k.id = d.merged_into_id
   where d.slug = 'urine-play' and d.status = 'merged'
     and k.slug = 'urophilia'  and k.status = 'active';
  if v_merged <> 1 then
    raise exception 'piss pass: urine-play is not merged into an active urophilia';
  end if;

  -- 7. The adipose-tissue aliases are gone from `scat`.
  select count(*) into v_adipose
    from tag_aliases a join unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'scat' and a.alias_slug in ('grasa-subcutnea','tejido-adiposo-subcutneo');
  if v_adipose <> 0 then
    raise exception 'piss pass: % adipose-tissue alias(es) still sit on scat', v_adipose;
  end if;

  -- 8. The creation exists AND is unpublished AND carries all THREE category
  --    representations. Asserting category_id alone passes on the 194-row
  --    broken shape this file exists not to add to.
  --
  --    `publication_role = 'utility'` is the REACHED state, not the requested
  --    one: the readiness gate demotes a new row because three of its six
  --    conditions default to pending/NULL. Asserting 'article' here is what the
  --    first draft did and it failed on correct code — the gate is right and the
  --    assertion was wrong. Both the demotion and the deindex reason are pinned,
  --    so a future change that quietly promotes new rows straight to article
  --    breaks this check rather than publishing machine prose to crawlers.
  select count(*) into v_new from unified_tags
   where slug = 'shy-bladder' and status = 'active'
     and publication_role = 'utility'
     and seo_indexable = false
     and seo_deindex_reason = 'publication_role:utility'
     and human_reviewed = true
     and coalesce(btrim(category),'') <> '' and category_id is not null;
  if v_new <> 1 then
    raise exception 'piss pass: shy-bladder is missing, published, or has no category text';
  end if;

  select count(*) into v_cats
    from unified_tags t join tag_category_assignments a on a.tag_id = t.id
   where t.slug = 'shy-bladder' and a.is_primary;
  if v_cats <> 1 then
    raise exception 'piss pass: shy-bladder has % primary category junction rows, expected 1', v_cats;
  end if;

  -- 9. Every alias routes and is APPROVED — an `auto` alias routes nothing.
  select count(*) into v_aliases
    from tag_aliases a join unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug in ('wetting','desperation-play','bladder-desperation',
                          'paruresis','pee-shy','pee-shyness')
     and a.review_status = 'approved' and t.status = 'active';
  if v_aliases <> 6 then
    raise exception 'piss pass: % of 6 aliases are approved and on an active row', v_aliases;
  end if;

  -- 10. THE REFUSALS, MADE ENFORCEABLE RATHER THAN MERELY WRITTEN DOWN. A later
  --     pass reaching for the easy sweep breaks this file's own check.
  --     piss-drinker keeps round thirteen's protected safety sentence;
  --     urophilia keeps the accurate etymology body this pass declined to
  --     rewrite; toilet keeps both senses, undecided; scat-play keeps the body
  --     that is the reason `scat` was not filled.
  select count(*) into v_refusals from unified_tags
   where status = 'active'
     and ((slug = 'piss-drinker' and long_description like '%health risks if not practiced safely%')
       or (slug = 'urophilia'    and long_description like '%lagneia%')
       or (slug = 'toilet'       and long_description like '%sanitary hardware%')
       or (slug = 'scat-play'    and long_description like '%faecal-oral route%'));
  if v_refusals <> 4 then
    raise exception 'piss pass: only % of 4 deliberately-untouched rows still carry what this file refused to change', v_refusals;
  end if;

  -- 11. PROVE the scope rather than asserting it. Only the columns this file
  --     names may have moved; every other prose column on every row in scope
  --     must be byte-identical to the snapshot taken before the writes.
  select count(*) into v_collat
    from _piss_before b join unified_tags t on t.slug = b.slug
   where (t.description       is distinct from b.description
            and b.slug not in ('piss-play'))
      or (t.short_description is distinct from b.short_description
            and b.slug not in ('piss-slut','watersports'))
      or (t.long_description  is distinct from b.long_description
            and b.slug not in ('golden-shower','piss-slut','toilet-slave','human-toilet'));
  if v_collat <> 0 then
    raise exception 'piss pass: % row(s) had a prose column move that this file does not write', v_collat;
  end if;

  raise notice 'piss pass OK: scope %, filled 2, merged 1, adipose aliases 0, created 1, aliases 6, refusals 4, collateral 0',
    v_scope;
end
$verify$;
