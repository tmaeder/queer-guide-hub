-- Sex & sexual-health glossary pass, part 1 of 3: corrections to ACTIVE rows.
--
-- Compared unified_tags against 34 external glossaries (NSW Health Play Safe A-Z,
-- Planned Parenthood, WebMD, sexetc.org, Advocates for Youth NSES, Men's/Women's
-- Health, Cosmopolitan, MasterClass, Allure, theSkimm, Her Campus, Sexual Health
-- Dorset, sexualdiversity.org, MSU Gender & Sexuality Campus Center, GLAAD, PFLAG
-- SF, Stonewall, Equality Network, UConn Rainbow Center, and three shibari
-- glossaries). 1,973 distinct headwords extracted; 598 formed the working set
-- (present in a topical source, or corroborated by >= 2 sources).
--
-- Two of the 34 could NOT be read and nothing is attributed to them:
-- pridetraining.org.au and clwbnawa.co.uk are JS-rendered and returned no
-- glossary content over curl, over the Internet Archive, or in a real browser.
-- Recorded as unread rather than quietly dropped from the source list.
--
-- This file repairs the rows that are LIVE. The single worst find is not a
-- missing term, it is a published one:
--
--   /tags/lubricant  -- active, seo_indexable, category "Substances & Recovery"
--   description: "A lubricant is a substance that helps to reduce friction
--   between surfaces in mutual contact, which ultimately reduces the heat
--   generated when the surfaces move. It may also have the function of
--   transmitting forces, transporting foreign particles, or heating or cooling
--   the surfaces. The property of reducing friction is known as lubricity."
--
-- That is machine oil. It is the wrong-SENSE class this repo already records for
-- /tags/darkroom (photography) and /tags/trampling (crowd disasters): the entity
-- is plausible, the name agrees, and only a human comparing the row against what
-- the word means HERE can see it. Prose is REPLACED rather than retracted,
-- because the row renders -- the darkroom rule. The correct sexual-lubricant
-- body already existed on the DEPRECATED sibling row `lube`, which is left
-- deprecated: `lube` cannot become an alias of `lubricant` because
-- tag_reject_alias_shadow() refuses an alias whose text is an existing tag NAME,
-- and that row's name is "Lube". Named here rather than half-fixed.
--
-- Two more wrong-subject summaries on live rows, both the namesake shape, both
-- with a CORRECT description sitting directly underneath:
--   praise-kink  -> "Praise Kink is a term from a podcast episode"
--   primal-play  -> "Primal Play is a form of self-expression"
--
-- `androgyny` is filed under Orientation. Androgyny is a presentation, not an
-- orientation -- the pelvic-inflammatory-disease-under-Fetishes class. Moved by
-- writing category_id ALONE and letting both triggers reconcile (20261006110000).
--
-- `erectile-dysfunction` (indexable) summarised itself as "a form of sexual
-- dysfunction in males". ED happens to anyone with a penis, trans women and
-- non-binary people included; that is the femme/man/drag-show GENDERING class,
-- where the concept is right and the prose writes part of the audience out. Only
-- the summary is rewritten -- the description is the evidence and is left alone.
--
-- `lgbti` carries 1,289 assignments, is ACTIVE, and has NO PROSE AT ALL: both
-- description and short_description are NULL. Filling a NULL is not the LLM
-- rewrite both auto-apply paths were retired for.
--
-- 17 further ACTIVE rows have a good description and a NULL short_description.
-- That column is the lead line on /tags/:slug AND is in trg_search_documents_tag's
-- column list, so a NULL there is also empty search-facet text. Each summary here
-- restates the row's OWN description and chooses no sense.
--
-- Deliberately NOT done, named rather than counted:
--   * `pansexual` (u=34) and `pansexuality` (u=9) are both active and are one
--     concept. That is a duplicate-TAG problem for a merge pass, and rewriting
--     one side to make them differ would paper over it.
--   * `transgender`'s summary opens "Refers to people whose..." which is weak but
--     not wrong. Under-reaching is the correct error.
--
-- Guarded by src/lib/__tests__/sexGlossaryPass.test.ts.

begin;

-- log_unified_tag_change() RAISEs when an undeclared system actor modifies a
-- human_reviewed row, and most rows below carry that flag. Verified live: the
-- undeclared UPDATE returns "cannot be modified by system:trigger".
select set_config('app.actor', 'migration:99991789812138_sex_glossary_active_corrections', true);

-- ---------------------------------------------------------------- 1. lubricant
-- Wrong sense: industrial lubricant published on a sexual-health glossary.
update unified_tags set
  description = 'A slick liquid or gel used during sex to cut friction. Water-based lube is condom-safe and washes out easily; silicone lasts longer and is better for water, but degrades silicone toys; oil-based lube destroys latex condoms. Anal sex needs lube every time — the anus produces none of its own.',
  short_description = 'Liquid or gel that reduces friction during sex.',
  category_id = (select id from tag_categories where slug = 'safer-sex')
where slug = 'lubricant'
  and description ilike '%reduce friction between surfaces in mutual contact%';

-- The long_description is the same industrial passage continued. Nulled, not
-- replaced: enforce_tag_thin_page_gate reads tag_has_prose(description,
-- short_description) only, and both of those are written above.
update unified_tags set long_description = null
where slug = 'lubricant'
  and (long_description ilike '%lubricity%' or long_description ilike '%friction between surfaces%');

-- ------------------------------------------------- 2. wrong-subject summaries
update unified_tags set
  short_description = 'Arousal from being praised, admired or told you are doing well.'
where slug = 'praise-kink' and short_description ilike '%podcast episode%';

update unified_tags set
  short_description = 'Kink built on instinct and animal energy — growling, chasing, biting, wrestling.'
where slug = 'primal-play' and short_description ilike '%form of self-expression%';

-- ------------------------------------------------------ 3. androgyny: category
-- Writing category_id alone; the BEFORE trigger derives the text column and the
-- AFTER trigger moves the primary junction row, which is what /tags/:slug renders.
update unified_tags set
  category_id = (select id from tag_categories where slug = 'expression-presentation'),
  short_description = 'A presentation that blends masculine and feminine coding, or sits outside both.'
where slug = 'androgyny' and category = 'Orientation';

-- ------------------------------------------- 4. erectile dysfunction: gendering
update unified_tags set
  short_description = 'Persistent difficulty getting or keeping an erection.'
where slug = 'erectile-dysfunction' and short_description ilike '%in males%';

-- ------------------------------------------------------ 5. lgbti: no prose at all
update unified_tags set
  description = 'An acronym for lesbian, gay, bisexual, trans and intersex. Common in European, UN and human-rights usage, where the explicit I signals that intersex people are included rather than assumed under the T.',
  short_description = 'Lesbian, gay, bisexual, trans and intersex.'
where slug = 'lgbti' and description is null and short_description is null;

-- ------------------------------------------ 6. NULL summaries on active rows
-- Each restates that row's own description. No sense is chosen, no body touched.
update unified_tags t set short_description = v.s
from (values
  ('fetish',         'An object, body part or scenario that is central to someone''s arousal.'),
  ('erotic',         'Having the quality of arousing sexual feeling — in a person, an image, a text or a scene.'),
  ('vanilla',        'Sex without kink, or a person who prefers it that way.'),
  ('domination',     'Taking the controlling role in a consensual power exchange.'),
  ('orgy',           'A gathering where several people have sex together, partners changing throughout.'),
  ('breasts',        'A sexual focus on breasts — looking, touching, or breast-centred play.'),
  ('bussy',          'Queer slang for a man''s anus as a receptive sexual organ.'),
  ('condom',         'A sheath worn over the penis that prevents pregnancy and blocks STI transmission.'),
  ('cum',            'A fetish centred on ejaculate — its look, taste, texture, or playing with it.'),
  ('dry-humping',    'Rubbing the genitals against a partner or object while still clothed.'),
  ('frottage',       'Rubbing bodies together for pleasure, usually clothed or without penetration.'),
  ('golden-shower',  'Urinating on a partner, or being urinated on, as sexual play.'),
  ('missionary',     'One partner on their back, the other face down on top — the most face-to-face position there is.'),
  ('nylon-fetish',   'Arousal centred on nylon garments, especially hosiery.'),
  ('polycule',       'The connected network of people linked by relationships in a polyamorous group.'),
  ('queening',       'Sitting on a partner''s face for oral sex, the seated partner setting the pace.'),
  ('rusty-trombone', 'Anilingus and hand stimulation of the penis at the same time, from behind.')
) as v(slug, s)
where t.slug = v.slug and t.status = 'active' and t.short_description is null;

-- ============================ postconditions ============================
-- Soft on preconditions above (every UPDATE is content-guarded and no-ops if a
-- concurrent session got there first), hard on the state this file exists to
-- reach. Written against the REACHED state, not against this file's own writes,
-- so a better fix by another session also satisfies them.
do $verify$
declare v_bad int;
begin
  -- 1. lubricant is a sexual lubricant, filed under safer sex, with no machine oil left
  select count(*) into v_bad from unified_tags
  where slug = 'lubricant'
    and (description ilike '%lubricity%'
      or description ilike '%friction between surfaces%'
      or coalesce(long_description,'') ilike '%lubricity%'
      or category is distinct from 'Safer Sex Practices');
  if v_bad <> 0 then raise exception 'lubricant still publishes the industrial sense or the wrong category'; end if;

  -- 2. no live row still carries the namesake summaries
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and (short_description ilike '%is a term from a podcast episode%'
      or short_description ilike '%Primal Play is a form of self-expression%');
  if v_bad <> 0 then raise exception 'a namesake summary survives on an active row'; end if;

  -- 3. androgyny is no longer an orientation
  select count(*) into v_bad from unified_tags where slug = 'androgyny' and category = 'Orientation';
  if v_bad <> 0 then raise exception 'androgyny is still filed as an orientation'; end if;

  -- 4. ED no longer restricts itself to "males"
  select count(*) into v_bad from unified_tags
  where slug = 'erectile-dysfunction' and short_description ilike '%in males%';
  if v_bad <> 0 then raise exception 'erectile-dysfunction summary still says "in males"'; end if;

  -- 5. every row this file undertook to give a summary has one (positive form:
  --    counting rows in a BAD state returns 0 for a slug that has gone missing)
  select count(*) into v_bad from unified_tags
  where slug in ('fetish','erotic','vanilla','domination','orgy','breasts','bussy','condom','cum',
                 'dry-humping','frottage','golden-shower','missionary','nylon-fetish','polycule',
                 'queening','rusty-trombone','lgbti','lubricant','praise-kink','primal-play',
                 'androgyny','erectile-dysfunction')
    and coalesce(btrim(short_description),'') <> '';
  if v_bad <> 23 then
    raise exception 'expected 23 repaired rows to carry a summary, found %', v_bad;
  end if;

  -- 6. nothing here made a live row unpublishable
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('lubricant','praise-kink','primal-play','androgyny','erectile-dysfunction','lgbti','fetish','erotic','vanilla')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then raise exception '% repaired active rows fail the thin-page gate', v_bad; end if;
end
$verify$;

commit;
