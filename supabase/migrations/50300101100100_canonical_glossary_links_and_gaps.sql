-- The other two thirds of the eight-glossary comparison (see 50300101100000
-- for the sources and the method): 73 candidate headwords matched NOTHING —
-- no tag, no alias, under any spelling.
--
-- READING THEM ONE BY ONE IS WHAT MADE THIS SMALL. Most are not gaps at all:
-- they are spellings, abbreviations and older names for concepts the glossary
-- already carries, and the right fix is a link, not a row. Minting a second row
-- for a concept that already has one is exactly what `tag_reject_alias_shadow`
-- exists to prevent, and what `lesbophobia` taught in 20360101101600.
--
-- 19 ALIASES onto tags that are already live:
--
--   trans-man                 <- Transgender Man, Transman
--   trans-woman               <- Transgender Woman, Transwoman
--   gender-transition         <- Transitioning
--   cross-dressing            <- Crossdressing            (spelling)
--   hormone-therapy           <- HRT, Hormone Replacement Therapy
--   gender-affirming-surgery  <- Sex Reassignment Surgery (historical),
--                                Gender Reassignment      (the UK Equality
--                                Act's protected-characteristic wording)
--   gender-affirming-care     <- Gender Affirming
--   assigned-sex              <- Sex Assigned At Birth, AFAB, AMAB
--   intersexuality            <- Hermaphroditism          (historical)
--   lgbtq                     <- LGBTQIA
--   bareback                  <- Bare-backing             (spelling)
--   latinx                    <- Latine                   (the Spanish-language
--                                gender-neutral form; latinx is the English
--                                coinage, and both are in the references)
--
-- `assigned-sex` and `intersexuality` are revived by 50300101100000, and
-- `latinx` is revived here — it belongs to the same culled cohort (2026-06-05
-- orphan audit, 377-character body) and was simply spelled `latine` in the
-- reference that carries it, so the earlier file's candidate list never matched
-- it. It revives on exactly the same terms as the other 48: unpublished, body
-- unchanged.
--
-- AFAB and AMAB take `alias_type='covers'`, not `synonym`. They are not other
-- names for "assigned sex" — they are its two values, which is the narrower-term
-- -routed-to-its-covering-tag relationship that 20261012090100 created that type
-- for (`Crack Cocaine` -> Cocaine). `tag_relations` cannot hold them because
-- neither narrower side has a row.
--
-- `lezbo` and `lezzie` are DELIBERATELY NOT ALIASED. An approved alias is an
-- auto-tagging rule as well as a displayed synonym (20261012090000), and
-- pointing two derogatory diminutives at `lesbian` would tag anything
-- containing them as the identity itself. The routing gain is small and the
-- failure mode is not; recorded rather than done quietly.
--
-- FOUR TERMS ARE GENUINELY ABSENT AND ARE CREATED. The bar is deliberately
-- higher than "some reference lists it": each is a load-bearing concept with no
-- existing row and no parent to alias onto, and three of the four are carried by
-- more than one of the eight references. Everything else in the 73 is either
-- scene slang the glossary can live without, a term already covered by a live
-- row, or something needing its own editorial decision — see the residue note
-- at the end.
--
--   internalized-oppression   (SLCC, UConn)   no row, no parent
--   institutional-oppression  (SLCC, UConn)   no row, no parent
--   gender-cues               (SLCC, UConn)   no row, no parent
--   dyadic                    (UH Hilo)       the counterpart to `intersex`,
--                                             and the glossary carried one half
--                                             of that pair and not the other
--
-- They are created UNPUBLISHED, per house convention for new terms
-- (20360101101300, 20360101101700, 50100101100100): the prose is authored here
-- and nobody else has read it.
--
-- ALL THREE CATEGORY REPRESENTATIONS ARE SET BY HAND on the new rows. Neither
-- category trigger fires on INSERT — `trg_sync_tag_category` is BEFORE UPDATE
-- and `trg_sync_tag_category_after` is AFTER UPDATE OF category_id — so an
-- INSERT that sets `category_id` derives no `category` TEXT and mints no
-- `tag_category_assignments` row, leaving the page uncategorised while the
-- search facet shows a category. 50100101100100 recorded this and measured 194
-- active tags already in that state; those are still not repaired here.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:canonical-glossary-links', true);

do $mig$
declare
  rec     record;
  v_bad   int;
  v_n     int := 0;
  v_tag   uuid;
begin
  ------------------------------------------------------- 1. revive `latinx`
  update public.unified_tags set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    seo_indexable       = false,
    human_reviewed      = false,
    verification_status = 'unverified',
    category_id         = (select id from public.tag_categories where slug = 'identity')
  where slug = 'latinx'
    and status = 'deprecated'
    and coalesce(long_description, '') <> '';

  if not found then
    raise notice 'latinx: not deprecated-with-body — already revived or changed, left alone';
  end if;

  ------------------------------------------------------------- 2. new terms
  create temp table _new (slug text primary key, name text, cat text, sens boolean,
                          sd text, d text, ld text) on commit drop;

  insert into _new values
   ('internalized-oppression', 'Internalized Oppression', 'mental-health', true,
    'Believing, about yourself, what a hostile society says about people like you.',
    'The process by which a person from a marginalised group takes in the beliefs a hostile society holds about that group and applies them to themselves. It is not a character flaw and not a private failure of confidence: it is the predictable result of absorbing the same messages as everyone else, while being the person those messages are about.',
    'Internalized oppression is what happens when someone belonging to a marginalised group absorbs the wider culture''s beliefs about that group and turns them inward. A gay man who feels contempt for men he reads as effeminate, a bisexual person who half-believes their own attraction is a phase, a trans person convinced they will never be seen as real — each is repeating something the culture said first.

It matters here because it is doing work that looks like something else. It shows up as shame, as distance from other queer people, as policing how visible one is or how visible anyone else is, and as the insistence that one is "not like the others". Those read as personal preferences from the inside. They are also how a hostile consensus keeps operating after the people enforcing it have left the room.

The related idea is that it is not a synonym for low self-esteem and is not repaired by being told to feel better. It was learned in a setting that taught it to everyone, so unlearning it is usually social rather than solitary: other queer people, communities where the assumptions do not hold, and a fair amount of noticing which thoughts one did not arrive at independently.'),

   ('institutional-oppression', 'Institutional Oppression', 'violence-hate', true,
    'Disadvantage built into how an institution normally runs, needing no one inside it to be hostile.',
    'Disadvantage produced by the ordinary operation of an institution — its rules, forms, defaults, budgets and habits — rather than by the hostility of any individual inside it. It is the reason a policy written with nobody in mind can still land unevenly, and the reason removing a prejudiced person often changes very little.',
    'Institutional oppression is disadvantage that is built into how an organisation normally works. It needs no villain. A hospital intake form with two sex options, a housing policy that recognises only married couples, a school dress code written in two columns, an asylum process that asks someone to prove an identity by performing it — each can be administered politely, by people with no animus at all, and still produce a worse outcome for queer and trans people every time it runs.

The distinction from individual prejudice is the useful part. Prejudice is a person; this is a procedure. That is why it survives staff turnover, why diversity training rarely moves it on its own, and why the remedy is usually boring and structural: change the form, change the eligibility rule, change who is in the room when the default is set.

It is also why the absence of complaints is weak evidence. People who expect an institution to handle them badly often route around it instead of contesting it, so the process looks uncontested precisely where it is working least well.'),

   ('gender-cues', 'Gender Cues', 'expression-presentation', false,
    'The signals — voice, dress, build, name, movement — people read to sort someone into a gender.',
    'The signals other people read when they assign a gender to someone: voice, clothing, hair, build, name, gait, mannerism, the pronouns others use. They are culturally specific and learned rather than natural, which is why the same haircut reads differently in different places and decades.',
    'Gender cues are the signals people use to sort each other into genders, usually in under a second and without deciding to. Voice pitch and cadence, clothing, hair, jewellery, build, posture, gait, name, and the pronouns other people use are all doing this work.

Two things about them matter. First, they are learned and local: what reads as masculine or feminine varies by culture, class and decade, so a cue is a convention rather than a fact about a body. Second, they are read in combination and inconsistently — one cue can override several others depending on who is looking, which is why being read correctly can change between one room and the next with nothing about the person having changed.

The term is most used in trans and gender-non-conforming contexts, where cues are something people may consciously adjust, and where the gap between how someone is read and who they are has practical consequences. It is worth separating from gender identity, which is a person''s own sense of themselves, and from gender expression, which is what a person does; cues are specifically the part other people are interpreting.'),

   ('dyadic', 'Dyadic', 'intersex-bodies', false,
    'Not intersex — a body whose sex characteristics fit the expected male or female pattern.',
    'A person whose sex characteristics — chromosomes, gonads, hormones, anatomy — all fit what is expected of one of the two standard categories. Dyadic is to intersex what cisgender is to transgender: a name for the unmarked case, so that intersex stops being the only condition anyone has to name.',
    'Dyadic describes a person whose sex characteristics fall within what is expected for male or for female — chromosomes, gonads, hormone levels and anatomy all pointing the same way. It is the counterpart to intersex.

The reason the word exists is the same reason cisgender exists. Without it, intersex is a marked category and everyone else is simply "normal", which quietly frames intersex bodies as departures from a default rather than as one of the ways bodies come. Having a name for the unmarked case makes the comparison symmetrical and makes it possible to say plainly who a policy, a study or a changing room was designed around.

It is a statement about bodies and not about gender identity, so it is not interchangeable with cisgender: a person can be dyadic and trans, or intersex and cis. "Endosex" is used for the same idea, more often in European and activist contexts.');

  -- SOFT on preconditions, HARD on postconditions (20360401100100's rule). A slug
  -- that already exists is work someone else did, not a reason to abort the push
  -- and block every migration queued behind it; the verify block below is what
  -- refuses to let this file finish in a state it did not reach.
  select count(*) into v_bad from _new n
   where exists (select 1 from public.unified_tags u where u.slug = n.slug);
  if v_bad > 0 then
    raise notice 'glossary gaps: % of 4 slug(s) already exist — skipped', v_bad;
  end if;

  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'glossary gaps: % new row(s) name a category that does not exist', v_bad;
  end if;

  for rec in
    select n.* from _new n
     where not exists (select 1 from public.unified_tags u where u.slug = n.slug)
     order by n.slug
  loop
    insert into public.unified_tags
      (name, slug, category_id, category, entity_kind,
       status, seo_indexable, human_reviewed, verification_status,
       is_sensitive, short_description, description, long_description)
    select rec.name, rec.slug, c.id, c.name, 'concept',
           'active', false, false, 'unverified',
           rec.sens, rec.sd, rec.d, rec.ld
      from public.tag_categories c where c.slug = rec.cat
    returning id into v_tag;

    -- No trigger does either of these on INSERT (see header).
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select v_tag, c.id, true from public.tag_categories c where c.slug = rec.cat;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    values (v_tag, 'editorial:general-knowledge',
            'Created unpublished. Absent from the glossary under any spelling, with no live row to alias onto, while carried by the canonical LGBTQ+ terminology references compared in 50300101100000.',
            false);
    v_n := v_n + 1;
  end loop;

  raise notice 'glossary gaps: created % new term(s)', v_n;

  ------------------------------------------------------------- 3. aliases
  create temp table _alias (target text, nm text, sl text, ty text) on commit drop;
  insert into _alias values
    ('trans-man',                'Transgender Man',             'transgender-man',             'synonym'),
    ('trans-man',                'Transman',                    'transman',                    'spelling_variant'),
    ('trans-woman',              'Transgender Woman',           'transgender-woman',           'synonym'),
    ('trans-woman',              'Transwoman',                  'transwoman',                  'spelling_variant'),
    ('gender-transition',        'Transitioning',               'transitioning',               'synonym'),
    ('cross-dressing',           'Crossdressing',               'crossdressing',               'spelling_variant'),
    ('hormone-therapy',          'HRT',                         'hrt',                         'abbreviation'),
    ('hormone-therapy',          'Hormone Replacement Therapy', 'hormone-replacement-therapy', 'synonym'),
    ('gender-affirming-surgery', 'Sex Reassignment Surgery',    'sex-reassignment-surgery',    'historical'),
    ('gender-affirming-surgery', 'Gender Reassignment',         'gender-reassignment',         'synonym'),
    ('gender-affirming-care',    'Gender Affirming',            'gender-affirming',            'synonym'),
    ('assigned-sex',             'Sex Assigned At Birth',       'sex-assigned-at-birth',       'synonym'),
    ('assigned-sex',             'AFAB',                        'afab',                        'covers'),
    ('assigned-sex',             'AMAB',                        'amab',                        'covers'),
    ('intersexuality',           'Hermaphroditism',             'hermaphroditism',             'historical'),
    ('lgbtq',                    'LGBTQIA',                     'lgbtqia',                     'synonym'),
    ('bareback',                 'Bare-backing',                'bare-backing',                'spelling_variant'),
    ('latinx',                   'Latine',                      'latine',                      'multilingual');

  -- Every target must be ACTIVE: a merged or deprecated target would make the
  -- alias route to a page that does not render. Enforced by FILTERING rather
  -- than by aborting — an inactive target is skipped here and then reported by
  -- the verify block, which is where this file is allowed to fail.
  insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
  select u.id, al.nm, al.sl, al.ty, 'approved'
    from _alias al join public.unified_tags u on u.slug = al.target
   where u.status = 'active'
  on conflict (alias_slug) do nothing;
end $mig$;

-- Postconditions.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug in ('internalized-oppression','institutional-oppression','gender-cues','dyadic','latinx')
     and (status <> 'active' or seo_indexable or human_reviewed or category_id is null);
  if v_bad > 0 then
    raise exception 'verify: % row(s) landed published, uncategorised or inactive', v_bad;
  end if;

  -- All THREE category representations on the new rows, not just the lever.
  select count(*) into v_bad from public.unified_tags t
   where t.slug in ('internalized-oppression','institutional-oppression','gender-cues','dyadic')
     and (coalesce(t.category, '') = ''
          or not exists (select 1 from public.tag_category_assignments a
                          where a.tag_id = t.id and a.is_primary
                            and a.category_id = t.category_id));
  if v_bad > 0 then
    raise exception 'verify: % new row(s) disagree across category_id, category text and the junction', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('internalized-oppression','institutional-oppression','gender-cues','dyadic')
     and (coalesce(description, '') = '' or coalesce(long_description, '') = '');
  if v_bad > 0 then
    raise exception 'verify: % new row(s) are live with no prose', v_bad;
  end if;

  -- Every alias must exist and point at an ACTIVE tag.
  select count(*) into v_bad
    from unnest(array['transgender-man','transman','transgender-woman','transwoman','transitioning',
                      'crossdressing','hrt','hormone-replacement-therapy','sex-reassignment-surgery',
                      'gender-reassignment','gender-affirming','sex-assigned-at-birth','afab','amab',
                      'hermaphroditism','lgbtqia','bare-backing','latine']) s
   where not exists (select 1 from public.tag_aliases a
                       join public.unified_tags u on u.id = a.canonical_tag_id
                      where a.alias_slug = s and u.status = 'active');
  if v_bad > 0 then
    raise exception 'verify: % alias(es) missing or pointing at an inactive tag', v_bad;
  end if;

  -- The two deliberately withheld must NOT have been added.
  select count(*) into v_bad from public.tag_aliases where alias_slug in ('lezbo','lezzie');
  if v_bad > 0 then
    raise exception 'verify: a withheld derogatory diminutive was aliased after all';
  end if;
end $verify$;
