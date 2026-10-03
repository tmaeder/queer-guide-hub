-- Round 20 of the glossary prose audit: the generic sense on the rows a reader
-- actually meets, plus five more wrong-entity identifiers.
--
-- Rounds 2-19 worked `short_description` on eleven orderings. Every one of them
-- selected rows by the SHAPE of the defect. This round selects by REACH instead,
-- and that is why it finds a different set: `useHomeGlossaryPool`
-- (src/hooks/useTagPreviews.ts) requires `seo_indexable = true`, `is_adult =
-- false` and a NON-NULL `short_description`, orders by `quality_score` and takes
-- 24 -- so the glossary band on the homepage draws only from rows that HAVE a
-- summary, which is exactly the column this series repairs. Seven of those 24
-- carry the generic encyclopedia sense while the row's own `description`
-- establishes the queer/kink/platform one.
--
-- MEASURED, NOT ASSUMED. Round 19 (#3871) claimed a search harm it had not
-- measured, and #3924 corrected it. So, re-derived live for this round:
--   * `search_documents_index_tags` contains `short_description` ZERO times
--     (`pg_get_functiondef`), selects `t.description`, and filters
--     `publication_role = 'article'`. This column reaches NO search surface.
--   * `short_description` IS preferred over `description` on three reader
--     surfaces -- TagIndexCard.tsx:81, TagDefinitionCard.tsx:34, and
--     FromTheGlossary.tsx:11, which scores a preview 2 for having one against 1
--     for a description, i.e. it UP-RANKS these rows.
--   * `xxy` was checked against that pool and is NOT in it: the pool's tail is
--     tie-saturated at `quality_score` 83 and it does not make the 24. No claim
--     is made here that the homepage publishes it.
--
-- GROUP A -- THE IDENTIFIER IS A DIFFERENT KIND OF THING (5 rows).
-- Each QID was resolved live against Special:EntityData rather than inferred,
-- and in every case the stored summary is that entity's own English description
-- verbatim, which is how it got written:
--   bbc, auntie   Q9531        = British Broadcasting Corporation, "British
--                                public service broadcaster". TWO rows, one
--                                entity, neither of them the broadcaster:
--                                "Auntie" is the BBC's nickname, which is what
--                                matched the gay-slang row.
--   softcore      Q114742393   = "Softcore", a music track with vocals by The
--                                Neighbourhood (P31 Q55850593).
--   cuckhold      Q31527479    = "Cuckholds Point", a SUMMIT (P31 Q207326) at
--                                -15.98/-5.70 in Saint Helena, Ascension and
--                                Tristan da Cunha. A NEW SHAPE: the row's own
--                                MISSPELLED slug is what found the entity -- no
--                                name check can refuse a label that contains the
--                                tag's own name.
--   single        Q134556      = "single", a type of music release, on a
--                                Relationship Structures row whose own
--                                description reads "Not in a romantic
--                                relationship". INDEXABLE and human_reviewed.
-- Identifiers are NULLED, never repointed: `tag_medical_codes_sync` and
-- `tag_wikidata_hierarchy` rebuild from them weekly, so a plausible-but-wrong
-- QID regenerates wrong data forever while a null one regenerates nothing.
-- Checked before nulling: 0 medical codes and 0 relations on all five.
--
-- GROUP B -- THE IDENTIFIER IS RIGHT AND THE PROSE IS NOT (7 rows).
-- Q195 really is chocolate, Q11426 really is metal, Q11460 really is clothing.
-- This is the `methadone`/`jockstrap` rule: a correct identifier does not make
-- the prose derived from it correct. All seven QIDs are KEPT and the migration
-- asserts BOTH directions, because a sweep that cleared all twelve would
-- satisfy "the five are null" just as well.
--
-- Prose is REPLACED, never retracted -- every row is active and rendering, so
-- nulling would leave a live page thinner instead of correct (the `darkroom`
-- rule). Each new summary RESTATES THE ROW'S OWN `description` and adds no
-- fact. `description` is never written by this series; the migration snapshots
-- it and asserts 0 collateral changes rather than promising it.
--
-- Bodies: all twelve are the wrong subject outright (the broadcaster; comedy the
-- genre; cocoa-bean processing; metals conducting electricity; levels of
-- education; the music release) so they are NULLED, not rewritten -- no body is
-- authored here. Safe because `enforce_tag_thin_page_gate` reads
-- `tag_has_prose(description, short_description)` only, which the verify block
-- CALLS rather than restating (its OR is not the stricter "both present" form).
--
-- REFUSED, with the reason, so a later pass cannot quietly reverse it:
--   food (572 uses)  "Substance consumed for nutritional support" is a CORRECT
--                    definition of food, and the row is filed Venue Types where
--                    the site genuinely has a second reading (food is what a
--                    venue serves) -- the `ice-cream`/`tapas` disposition, not
--                    the `rooftop` one. Its own description ("Food and dining
--                    related content") is also too thin to derive from.
--   bicurious        "Person attracted to experiencing bisexuality" is awkward
--                    and THIN, not wrong. Under-reaching is the correct error.
-- Both are asserted untouched below.
--
-- NAMED OPEN, not fixed here:
--   * `humor` carries Q40831, which is "comedy", a genre of art works -- not
--     humour, and not this row's sense. It is NOT nulled: CLAUDE.md records that
--     auto-clearing the CONCEPT class was measured to destroy ~70% correct
--     links, and comedy is at least in the same semantic field, unlike a summit
--     or a music release. Stated as an identifier question for a human.
--   * Category: `chocolate` is filed Venue Types, `metal` Vibe & Crowd, `humor`
--     Events & Parties, `softcore` Positions. Writing `category_id` moves the
--     page's junction row, which is a separate lever and a separate decision.
--   * The homepage pool has NO tiebreaker after `quality_score`, so its tail of
--     83s is nondeterministic -- two runs minutes apart returned different 24s.
--     Recorded rather than changed.
--   * The utility-row seam this round did not take (cock-socket, which publishes
--     a PERSON as a sex toy; alprostadil/caverject/apomorphine/stendra, where
--     the shared summary erases drug class and route; cross-dressing/
--     transvestism/transvestite, where all three say "the opposite sex" while
--     the live, indexable sibling `cross-dresser` already says "a different
--     gender"; and the says-nothing group cock/hot-wax/pinching/
--     playing-the-field/swab/cock-and-ball-ring/feather-tickler/
--     suction-cup-dildo/domestic-discipline-dd). All non-indexable `utility`
--     rows; evidence gathered, deliberately left to its own round.
--   * `bangers` is UNREPAIRABLE under this series' rule, not overlooked: its
--     `description` AND `long_description` are both NULL, so the row carries no
--     evidence of its own sense and guessing one is how this class arose.
--
-- The actor declaration is LOAD-BEARING: 8 of the 12 rows are `human_reviewed`
-- and `bbc` is also `is_sensitive` (so `tag_prose_apply()` would refuse it
-- whatever the caller claims). Verified live with a REAL value change, because a
-- self-assignment changes no column and fires no trigger, which reads exactly
-- like a permissive one: undeclared returns `human_reviewed tag
-- 8b5a93ba-50ff-45ca-b16f-9248b189eb80 cannot be modified by system:trigger`,
-- declared is allowed.

begin;

select set_config('app.actor', 'migration:99991791015924_tag_prose_generic_sense_reachable', true);

-- Snapshot every column this file promises NOT to touch, so "0 collateral" is a
-- measurement rather than a promise.
create temporary table _r20_before on commit drop as
select slug, description, wikidata_id, short_description, (long_description is not null) as had_body
from public.unified_tags
where slug in (
  'bbc','auntie','softcore','cuckhold','single',
  'humor','chocolate','wrestling','photography','metal','clothing','news-education',
  'food','bicurious','tucking','bipoc','homonationalism','milf','spironolactone','gender-marker'
);

-- ---------------------------------------------------------------------------
-- GROUP A: the identifier names a different kind of thing. QID nulled, summary
-- restated from the row's own description, wrong-subject body removed.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set short_description = g.new_sd,
       long_description  = null,
       wikidata_id       = null
  from (values
    ('bbc',      'British public service broadcaster',
                 'Acronym for "big black cock" — a fetish centered on Black men, often framed in interracial terms.'),
    ('auntie',   'British public service broadcaster',
                 'An older, often effeminate and gossipy gay man.'),
    ('softcore', 'Term with multiple meanings',
                 'Erotic content that stops short of explicit sex — nudity or suggestion rather than acts.'),
    ('cuckhold', 'Consensual relationship dynamic',
                 'Arousal from watching one''s wife or partner have sex with another man, often framed as erotic humiliation.'),
    ('single',   'Music release with one song',
                 'Not in a romantic relationship.')
  ) as g(slug, old_sd, new_sd)
 where t.slug = g.slug
   and t.status = 'active'
   and btrim(t.short_description) = g.old_sd;

-- ---------------------------------------------------------------------------
-- GROUP B: the identifier is correct and KEPT; only the prose is wrong. Each
-- row's own description establishes the sense its summary denied.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set short_description = g.new_sd,
       long_description  = null
  from (values
    ('humor',          'Literary and dramatic works intended to be humorous',
                       'Laughter, wit and playfulness in sex and kink.'),
    ('chocolate',      'Food made from roasted cocoa beans',
                       'Chocolate used in sensual play — body paint, fondue, feeding.'),
    ('wrestling',      'Combat sport involving grappling techniques',
                       'Grappling as foreplay, dominance contest or erotic sport.'),
    ('photography',    'Art and practice of creating images by recording light',
                       'Erotic photography — making or posing for intimate images.'),
    ('metal',          'Material that conducts electricity and heat',
                       'A material fetish for metal restraints, jewelry and collars.'),
    ('clothing',       'Items worn on the human body',
                       'Clothing found erotic, or materials fetishized in their own right.'),
    ('news-education', 'Transmission of knowledge and skills',
                       'Education policy and LGBTQ+ youth.')
  ) as g(slug, old_sd, new_sd)
 where t.slug = g.slug
   and t.status = 'active'
   and btrim(t.short_description) = g.old_sd;

do $verify$
declare
  v_bad int;
  v_txt text;
begin
  -- P1 (positive, states the purpose): every one of the twelve carries a usable
  -- summary that is NOT the text this round exists to remove. Keyed on the
  -- DEFECT being gone rather than on this file's own wording, so a rival repair
  -- by a concurrent session satisfies it instead of aborting `db push` for the
  -- whole repo.
  select count(*) into v_bad
    from public.unified_tags t
   where t.slug in ('bbc','auntie','softcore','cuckhold','single',
                    'humor','chocolate','wrestling','photography','metal','clothing','news-education')
     and t.status = 'active'
     and public.tag_has_prose(t.description, t.short_description)
     and btrim(t.short_description) not in (
       'British public service broadcaster','Term with multiple meanings',
       'Consensual relationship dynamic','Music release with one song',
       'Literary and dramatic works intended to be humorous','Food made from roasted cocoa beans',
       'Combat sport involving grappling techniques','Art and practice of creating images by recording light',
       'Material that conducts electricity and heat','Items worn on the human body',
       'Transmission of knowledge and skills');
  if v_bad <> 12 then
    raise exception 'round 20 P1: expected 12 rows with a usable non-defect summary, found %', v_bad;
  end if;

  -- P2: the five wrong identifiers are cleared.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('bbc','auntie','softcore','cuckhold','single') and wikidata_id is not null;
  if v_bad <> 0 then
    raise exception 'round 20 P2: % of the 5 wrong-entity rows still carry a wikidata_id', v_bad;
  end if;

  -- P3 (the mirror of P2): the seven CORRECT identifiers survive. A sweep that
  -- cleared all twelve would pass P2 and must fail here.
  select count(*) into v_bad
    from public.unified_tags t
    join (values ('humor','Q40831'),('chocolate','Q195'),('wrestling','Q42486'),
                 ('photography','Q11633'),('metal','Q11426'),('clothing','Q11460'),
                 ('news-education','Q8434')) as k(slug, qid)
      on k.slug = t.slug
   where t.wikidata_id = k.qid;
  if v_bad <> 7 then
    raise exception 'round 20 P3: expected 7 kept identifiers, found %', v_bad;
  end if;

  -- P4: nothing else on these rows moved. `description` is the evidence this
  -- round rests on and is never written here.
  select count(*) into v_bad
    from _r20_before b
    join public.unified_tags t on t.slug = b.slug
   where t.description is distinct from b.description;
  if v_bad <> 0 then
    raise exception 'round 20 P4: % rows had description changed as collateral', v_bad;
  end if;

  -- P5: the two REFUSALS are untouched, corpus-wide by slug, so a later sweep
  -- reaching for them breaks this file's own check.
  select string_agg(b.slug, ', ') into v_txt
    from _r20_before b
    join public.unified_tags t on t.slug = b.slug
   where b.slug in ('food','bicurious')
     and (t.short_description is distinct from b.short_description
          or (t.long_description is not null) is distinct from b.had_body);
  if v_txt is not null then
    raise exception 'round 20 P5: refused rows were modified: %', v_txt;
  end if;

  -- P6: the controls keep their correct prose AND their bodies. Twelve body
  -- nulls are exactly the shape that could take a good body with them, so the
  -- assertion runs on rows OUTSIDE the round.
  select string_agg(b.slug, ', ') into v_txt
    from _r20_before b
    join public.unified_tags t on t.slug = b.slug
   where b.slug in ('tucking','bipoc','homonationalism','milf','spironolactone','gender-marker')
     and (t.short_description is distinct from b.short_description
          or t.long_description is null);
  if v_txt is not null then
    raise exception 'round 20 P6: control rows damaged: %', v_txt;
  end if;

  -- P7: every wrong-subject body in the round is gone.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('bbc','auntie','softcore','cuckhold','single',
                  'humor','chocolate','wrestling','photography','metal','clothing','news-education')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception 'round 20 P7: % wrong-subject bodies still published', v_bad;
  end if;
end $verify$;

commit;
