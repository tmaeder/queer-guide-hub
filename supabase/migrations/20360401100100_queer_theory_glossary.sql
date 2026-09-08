-- The queer-theory glossary: repair four wrong identities, revive 17 hidden
-- entries, create 11 absent ones, and file them all under Theory & Scholarship.
--
-- WHAT THE COMPARISON AGAINST WIKIPEDIA ACTUALLY FOUND. Not "terms are missing".
-- Most of this vocabulary already existed, already had prose, and was hidden.
-- Two one-shot sweeps deprecated tags for having zero ENTITY assignments —
-- `data-quality audit 2026-06-05` (n=3346) and `deprecate_unused_tags`
-- 2026-07-24 (n=547). That rule is right for scrape residue and wrong for a
-- glossary: no venue is ever tagged "homonationalism", and /tags is a glossary,
-- not a facet index. `search_documents_index_tags` filters `deprecated_at is
-- null`, so all of them were out of search and their pages soft-404'd.
--
-- THE REVIVAL IS DURABLE BECAUSE OF `human_reviewed`, NOT BECAUSE THE SWEEP IS
-- GONE. `deprecate_unused_tags()` still exists and still hides
-- `status='active' AND human_reviewed=false AND usage_count=0`. It is on no cron
-- and in no admin_automations row, so it only runs when invoked — but every row
-- revived here sets `human_reviewed = true`, which is its documented escape
-- hatch. Without that flag this migration is a no-op with extra steps.
--
-- FOUR WRONG WIKIDATA IDENTITIES, ALL FOUND BY RESOLVING EVERY QID AGAINST THE
-- LIVE API RATHER THAN TRUSTING THE STORED VALUE:
--
--   queerness         held Q658022 "queer theory". Queerness is not queer theory.
--                     LIVE, INDEXABLE, usage_count 55.
--   disidentification held Q5252408 "deidentification", a psychological process
--                     (enwiki: Deidentification (psychology)). Muñoz's concept is
--                     a queer-of-colour performance term.
--   gender-theory     held Q1662673 "gender studies", a different subject.
--   crip-theory       has no adoptable QID at all — see its row below.
--
-- All four are cleared to NULL rather than repointed. That is the house rule and
-- it has a mechanism behind it: `tag_medical_codes_sync` and
-- `tag_wikidata_hierarchy` rebuild from this identifier weekly, so a
-- plausible-but-wrong QID regenerates wrong data forever while a null one
-- regenerates nothing.
--
-- `queer-theory` COULD NOT SIMPLY BE REVIVED. Three things blocked it and all
-- three are the same root cause — at some point "queer theory" was folded into
-- "queerness":
--   1. `tag_aliases` holds alias_slug 'queer-theory' pointing at `queerness`
--      (alias_name "Queer-Theory", type multilingual, review_status auto — a
--      sitelink artefact harvested off the wrong entity). `tag_reject_alias_shadow`
--      RAISEs when a tag becomes active while another tag holds its slug as an
--      alias, so the revive was impossible until this row was deleted.
--   2. `queerness` held its QID.
--   3. `genre-queer-theory`, an `entity_kind='attribute'` marketplace-facet clone,
--      is active with the same name and the same QID. Two active rows named
--      "Queer Theory" would push `duplicate_active_name` past its 14-row ratchet
--      in scripts/check-tag-hygiene.mjs, which reads PROD and so would fail CI
--      for every open PR, not just this one.
--
-- THE MERGE'S AUTO-ALIAS HAD TO BE DELETED, AND THAT IS NOT OPTIONAL.
-- `merge_tag_concept` unconditionally inserts the loser's NAME as an alias of the
-- winner. Here both rows are named "Queer Theory", so it creates an alias whose
-- alias_name equals its own canonical's name — and `alias_equals_name` is a
-- ZERO-invariant in the tag-hygiene gate. The alias is worthless anyway: its slug
-- is `genre-queer-theory`, a namespaced facet string nobody searches for.
--
-- `queer-people-of-color` IS DELIBERATELY NOT REVIVED. Its slug is held as an
-- `approved` synonym alias of the active tag `qpoc`, which carries a proper
-- description and a live `search_synonyms` row. That is a curator's routing
-- decision, not a sweep artefact — reviving it would both RAISE on the shadow
-- trigger and undo a human's merge.
--
-- THE WIDER BACKLOG WAS NARROWED AND THEN READ, NOT SWEPT. 367 deprecated rows
-- carry >=200 chars of prose, a QID, and no human decision.
-- scripts/data-quality/classify-theory-cohort.mjs kept the 22 whose Wikidata
-- class is a theory / field of study / discipline / ideology; all 22 were then
-- read by hand and 6 accepted. Decisions and reasons:
-- scripts/data-quality/out/theory-cohort-review.json. Two rejections are the
-- point of the exercise — `performative-allyship` and `transmedicalism` matched
-- the class filter cleanly and both carry PROSE THAT IS BROKEN (words missing
-- mid-sentence; a description that stops dead at "gender dysphoria is"). No
-- class-based rule can see that. ~2,085 prose-bearing deprecated rows remain
-- untouched and are a real backlog; a rule-based verdict over all of them is the
-- failure this codebase has already paid for twice.
--
-- THE EARLIER 35-ROW REVIVAL'S HEURISTIC WAS TOO COARSE FOR THIS COHORT.
-- 20261205143900 excluded any row an `admin:*` actor had touched. On these rows
-- the `admin:*` actors are `admin:tag-category-resync`, `admin:roundtrip-test`
-- and `admin:lgbtqa-prevention-2-20260829` — mechanical jobs wearing an `admin:`
-- prefix. Treating those as human decisions hides ~330 rows nobody ever ruled on.
--
-- Reversible: the merge through `unmerge_tag_concept(audit_id)`; every column
-- write through `tag_change_log`, which the audit trigger fills because this
-- migration declares a non-`system:` actor.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:queer-theory-glossary', true);

-- ─────────────────────────────────────────────────────────── pre-flight refusals
-- Re-measured here rather than trusted from authoring time: the corpus moves
-- under concurrent sessions, and every one of these is a premise this migration
-- would otherwise silently build on.
do $pre$
declare v_n int; v_bad text;
begin
  select count(*) into v_n from public.tag_categories where slug = 'theory-scholarship';
  if v_n <> 1 then
    raise exception 'glossary: 20360401100000 must run first (theory-scholarship missing)';
  end if;

  -- The three rows the identity repairs target must still hold what we measured.
  select string_agg(slug || '=' || coalesce(wikidata_id, 'NULL'), ', ') into v_bad
    from public.unified_tags
   where (slug = 'queerness' and wikidata_id is distinct from 'Q658022')
      or (slug = 'disidentification' and wikidata_id is distinct from 'Q5252408')
      or (slug = 'gender-theory' and wikidata_id is distinct from 'Q1662673');
  if v_bad is not null then
    raise exception 'glossary: wikidata identity moved since authoring: %', v_bad;
  end if;

  -- If someone already cleared one of these, `enforce_tag_wikidata_identity`
  -- refuses re-adoption of an id recorded in tag_wikidata_repair_audit for that
  -- SAME tag. queer-theory must be able to keep Q658022.
  if exists (select 1 from public.tag_wikidata_repair_audit a
               join public.unified_tags t on t.id = a.tag_id
              where t.slug = 'queer-theory' and a.disposition = 'cleared'
                and a.previous_wikidata_id = 'Q658022') then
    raise exception 'glossary: Q658022 was retracted from queer-theory; resolve that audit row first';
  end if;
end
$pre$;

-- ────────────────────────────────────────────────────── 1. identity repairs
do $repair$
declare v_queerness uuid; v_alias uuid; v_syn int;
begin
  select id into strict v_queerness from public.unified_tags where slug = 'queerness';

  select id into v_alias from public.tag_aliases
   where lower(alias_slug) = 'queer-theory' and canonical_tag_id = v_queerness;

  if v_alias is not null then
    -- search_synonyms.tag_alias_id is ON DELETE SET NULL, so the row would
    -- survive as a dangling synonym. Measured 0 here, but deleted explicitly
    -- rather than assumed — the hint on tag_reject_alias_shadow says to clear it
    -- FIRST, and that ordering is the whole point.
    delete from public.search_synonyms where tag_alias_id = v_alias;
    get diagnostics v_syn = row_count;
    delete from public.tag_aliases where id = v_alias;
    raise notice 'glossary: dropped queerness alias "queer-theory" (% synonym row(s))', v_syn;
  end if;

  update public.unified_tags
     set wikidata_id = null, wikipedia_url = null, updated_at = now()
   where id = v_queerness;

  update public.unified_tags
     set wikidata_id = null, wikipedia_url = null, updated_at = now()
   where slug = 'disidentification';

  update public.unified_tags
     set wikidata_id = null, wikipedia_url = null, updated_at = now()
   where slug = 'gender-theory';
end
$repair$;

-- ────────────────────────────────────────────── 2. revive, rewrite, create, file
do $mig$
declare
  r          record;
  a          text;
  v_cat      uuid;
  v_hist     uuid;
  v_sexkink  uuid;
  v_tag      uuid;
  v_rel      uuid;
  v_audit    uuid;
  v_n        int;
begin
  select id into strict v_cat     from public.tag_categories where slug = 'theory-scholarship';
  select id into strict v_hist    from public.tag_categories where slug = 'history-rights';
  select id into strict v_sexkink from public.tag_categories where slug = 'sex-kink';

  ------------------------------------------------------------------ 2a. revive
  -- status, deprecated_at, deprecation_reason and human_reviewed move TOGETHER.
  -- The search indexer keys on `deprecated_at`, the detail page on `status`, and
  -- `human_reviewed` is what stops deprecate_unused_tags re-hiding the row. A row
  -- with status='active' but deprecated_at set is live-but-unsearchable, which is
  -- the exact shape migration 20261008110000 had to repair.
  for r in
    select * from (values
      ('queer-theory'), ('homonormativity'), ('homonationalism'), ('performativity'),
      ('gender-performativity'), ('cisnormativity'), ('disidentification'),
      ('lesbian-feminism'), ('queer-ecology'), ('queer-pedagogy'),
      ('social-construction-of-gender'),
      -- accepted from the hand-read cohort
      ('asexual-studies'), ('ecofeminism'), ('gender-theory'), ('homophile'),
      ('queer-musicology'), ('sex-positivity')
    ) as t(slug)
  loop
    update public.unified_tags
       set status             = 'active',
           human_reviewed     = true,
           verification_status = 'reviewed',
           merged_into_id     = null,
           deprecated_at      = null,
           deprecation_reason = null,
           last_verified_at   = now(),
           updated_at         = now()
     where slug = r.slug;
  end loop;

  -- cisnormativity had no QID; Q123689471 now exists with an exact label match.
  update public.unified_tags
     set wikidata_id = 'Q123689471',
         wikipedia_url = 'https://en.wikipedia.org/wiki/Cisnormativity',
         updated_at = now()
   where slug = 'cisnormativity' and wikidata_id is null;

  -- Three revived rows carry a description too thin to publish. `tag_has_prose`
  -- reads description/short_description and IGNORES long_description, and
  -- `indexable_without_description` is a hard zero in the CI gate — so a 87-char
  -- stub would be deindexed at birth by enforce_tag_thin_page_gate.
  update public.unified_tags set description =
    'The idea that saying something can be doing something — that certain utterances perform '
    'the act they name rather than describe it. J. L. Austin set it out for speech acts; Judith '
    'Butler carried it into gender, arguing that gender is produced by repeated acts rather than '
    'expressed by a prior identity. Distinct from performance: performativity is not a role '
    'someone chooses to play.', updated_at = now()
   where slug = 'performativity';

  update public.unified_tags set description =
    'A feminist current, strongest from the 1970s, that treated lesbianism as a political '
    'position and not only a sexuality, and read heterosexuality as an institution organising '
    'women''s subordination. Adrienne Rich''s "Compulsory Heterosexuality and Lesbian Existence" '
    '(1980) is its best-known statement. Queer theory later broke with parts of it, particularly '
    'its treatment of gender as fixed.', updated_at = now()
   where slug = 'lesbian-feminism';

  -- Stored as "Social Construction Of Gender" — title-cased "Of" is an import
  -- artefact. normalize_tag_slug on the new name yields the same slug, so the
  -- URL does not move.
  update public.unified_tags set name = 'Social Construction of Gender', updated_at = now()
   where slug = 'social-construction-of-gender';

  -- "Queer-Studies" is a scraped hyphenated string, not authored vocabulary.
  update public.unified_tags set name = 'Queer Studies', updated_at = now()
   where slug = 'queer-studies';

  ------------------------------------------------------- 2b. absorb the facet clone
  -- Reversible through unmerge_tag_concept(v_audit). Ordered after the revive so
  -- the canonical is live when it absorbs.
  select id into v_tag from public.unified_tags where slug = 'genre-queer-theory' and status = 'active';
  if v_tag is not null then
    select id into strict v_rel from public.unified_tags where slug = 'queer-theory';
    v_audit := public.merge_tag_concept(v_rel, v_tag, 'migration:queer-theory-glossary', 'facet-clone');

    -- merge_tag_concept inserts the loser's NAME as an alias of the winner,
    -- unconditionally. Both rows are named "Queer Theory", so that alias breaches
    -- the `alias_equals_name` zero-invariant. See the header.
    delete from public.tag_aliases
     where canonical_tag_id = v_rel and lower(alias_name) = 'queer theory';
  end if;

  ------------------------------------------------------------------ 2c. create
  for r in
    select * from (values
      ('quare-theory', 'Quare Theory', 'Q130755470',
       'https://en.wikipedia.org/wiki/Quare_theory',
       'Queer theory rebuilt around the knowledge of queer people of colour.',
       'A counter-theory to queer theory centred on the racialised bodies, experiences and '
       'knowledge of queer people of colour. E. Patrick Johnson set it out in 2001 in "''Quare'' '
       'Studies, or (Almost) Everything I Know About Queer Studies I Learned from My '
       'Grandmother", taking the word from his grandmother''s pronunciation of "queer". It draws '
       'on performance studies and oral history, and treats race and class as inseparable from '
       'sexuality rather than as additions to it.',
       'Quare theory reads the gap between queer theory''s abstractions and the material lives of '
       'Black and other queer people of colour as the point, not an oversight. Johnson developed '
       'it alongside Mae G. Henderson in the anthology Black Queer Studies, and later with Ramón '
       'Rivera-Servera. Its method is grounded in performance — what people do, say and remember '
       '— rather than in textual analysis alone, which is why oral history sits at its centre.'),

      ('queer-of-color-critique', 'Queer of Color Critique', 'Q16269351',
       'https://en.wikipedia.org/wiki/Queer_of_color_critique',
       'Reads race, sexuality, gender and capitalism as one analysis.',
       'An analytical framework that centres race, gender, sexuality and class together, and '
       'reads mainstream gay rights politics through its entanglement with capitalism and '
       'liberalism. It emerged from a doctoral reading group at UC San Diego in 1999 and was '
       'named by Roderick A. Ferguson in Aberrations in Black: Toward a Queer of Color Critique '
       '(2004), building on José Esteban Muñoz''s Disidentifications (1999).',
       'The critique holds that a politics organised around sexuality alone will reproduce the '
       'racial and economic order it does not examine — so it takes women-of-colour feminism, not '
       'liberal gay rights, as its inheritance. Its recurring objects are homonormativity, '
       'homonationalism, settler colonialism and diaspora. Scholars associated with it include '
       'Chandan Reddy, Gayatri Gopinath, Martin Manalansan, Juana María Rodríguez, Kara Keeling, '
       'Tavia Nyong''o, Fatima El-Tayeb and Marquis Bey.'),

      ('queer-archaeology', 'Queer Archaeology', 'Q108584195',
       'https://en.wikipedia.org/wiki/Queer_archaeology',
       'Uses queer theory to read the past without assuming its norms.',
       'An approach to archaeology that uses queer theory to challenge normative — especially '
       'heteronormative — readings of the past. Thomas A. Dowson introduced it in 2000 in "Why '
       'Queer Archaeology? An Introduction". It does not set out to find homosexuality in the '
       'archaeological record; it questions the binary assumptions about sex, gender and kinship '
       'that interpretation smuggles in.',
       'Chelsea Blackmore''s "How to Queer the Past Without Sex" (2011) states the method plainly: '
       'the target is the interpretive frame, not a hunt for evidence of same-sex behaviour. '
       'Barbara L. Voss surveyed the wider field in "Sexuality Studies in Archaeology" (2008). It '
       'sits alongside feminist and gender archaeology and has been criticised for a Eurocentric '
       'frame of reference.'),

      ('queer-theology', 'Queer Theology', 'Q1563086',
       'https://en.wikipedia.org/wiki/Queer_theology',
       'Theology done from queer lives and readings of sacred texts.',
       'A theological method developed out of queer theory that reads gender variance and '
       'non-heterosexual desire within faith traditions and sacred texts. It covers both theology '
       'written by and for LGBTQ+ people and a wider challenge to fixed norms of gender and '
       'sexuality in doctrine. Robert Goss''s Jesus Acted Up (1994) and Marcella Althaus-Reid''s '
       'Indecent Theology (2000) and The Queer God (2003) are among its founding works.',
       'Earlier ground was laid by John J. McNeill''s The Church and the Homosexual (1976) and '
       'J. Michael Clark''s Theologizing Gay (1991). It draws on liberation theology''s method — '
       'read from the position of the excluded — and on Foucault, Rubin, Sedgwick and Butler for '
       'its account of sexuality. Recurring themes are the imago Dei, affirming ministry, and '
       'sexual and gender justice.'),

      ('neuroqueer-theory', 'Neuroqueer Theory', 'Q135472429',
       'https://en.wikipedia.org/wiki/Neuroqueer_theory',
       'Where neurodiversity and queer theory meet.',
       'A framework at the intersection of neurodiversity and queer theory. It examines how '
       'normalcy is constructed across gender, sexual orientation and disability at once, and '
       'refuses the pathologisation of neurodivergent people. Nick Walker coined "neuroqueer" in '
       '2008; Athena Lynn Michaels-Dillon arrived at the term independently, and Remi Yergeau was '
       'working on related ground.',
       'Its central move is to treat neuronormativity and heteronormativity as the same kind of '
       'demand — that there is one correct way to have a mind, a body and a desire. It takes the '
       'social model of disability as its starting point and reads neurodivergence as difference '
       'rather than deficit. Alison Kafer''s work on crip futurity is a frequent reference point.'),

      -- No adoptable QID. "Crip theory" redirects to "Crip (disability term)" =
      -- Q65065690, the reclaimed slur, not the theory — and it fails
      -- titleAgrees() in tag-wiki-guard.ts twice over: normalised "criptheory" vs
      -- "crip" leaves a 4-char shorter side (the prefix arm needs >=5) and scores
      -- 0.4 on levenshtein (needs >=0.75). The guard is right.
      ('crip-theory', 'Crip Theory', null,
       'https://en.wikipedia.org/wiki/Disability_studies#Critical_disability_theory',
       'Reads disability and queerness as bound to the same norms.',
       'A framework that brings queer theory and disability studies together, reading compulsory '
       'able-bodiedness and compulsory heterosexuality as the same system of demands. Carrie '
       'Sandahl named the ground in 2003 with "Queering the Crip or Cripping the Queer?"; Robert '
       'McRuer developed it in Crip Theory: Cultural Signs of Queerness and Disability (2006). '
       '"Crip" is a reclaimed slur, used deliberately, in the same way "queer" is.',
       'Alison Kafer, Eli Clare, Ellen Samuels, Sami Schalk and Rosemarie Garland-Thomson have '
       'extended it, often against the assumption that disability is a problem awaiting a cure. '
       'It shares queer theory''s suspicion of the normal and disability studies'' social model, '
       'and it insists that race, class and gender are not separable from either.'),

      -- A section of Disability studies, not a standalone article. Q627208 is the
      -- PARENT field and would be a different subject, so the QID stays null.
      ('critical-disability-theory', 'Critical Disability Theory', null,
       'https://en.wikipedia.org/wiki/Disability_studies#Critical_disability_theory',
       'Disability as a political and cultural construction, not a diagnosis.',
       'The meeting point of disability studies and critical theory: it analyses how disability is '
       'constructed socially, politically and culturally rather than treating it as a medical fact '
       'about an individual. It sets the social model of disability against the medical model and '
       'takes ableism as a structure to be described, not a personal attitude.',
       null),

      ('disability-studies', 'Disability Studies', 'Q627208',
       'https://en.wikipedia.org/wiki/Disability_studies',
       'The academic field that studies disability as a social position.',
       'An academic field that studies disability as a social, cultural and political position '
       'rather than only a medical condition. Its founding distinction is between the medical '
       'model, which locates the problem in the body, and the social model, which locates it in a '
       'world built for some bodies and not others. Crip theory and critical disability theory '
       'grew out of it.',
       null),

      ('compulsory-heterosexuality', 'Compulsory Heterosexuality', 'Q11794989',
       'https://en.wikipedia.org/wiki/Compulsory_heterosexuality',
       'Heterosexuality as an institution women are pressed into.',
       'The argument that heterosexuality is not a natural inclination but an institution '
       'maintained by social pressure, and that it works to keep women available to men. Adrienne '
       'Rich set it out in "Compulsory Heterosexuality and Lesbian Existence" (1980), alongside '
       'her idea of a lesbian continuum. It is a direct ancestor of heteronormativity.',
       null),

      ('human-sexuality', 'Human Sexuality', 'Q154136',
       'https://en.wikipedia.org/wiki/Human_sexuality',
       'How people experience and express themselves sexually.',
       'The ways people experience and express themselves sexually — biological, psychological, '
       'physical, erotic, emotional, social and spiritual at once. It has no single settled '
       'definition, because what counts as sexual has varied sharply across periods and cultures. '
       'Alfred Kinsey, William Masters and Virginia Johnson, Havelock Ellis, Magnus Hirschfeld and '
       'Evelyn Hooker shaped its modern study.',
       null),

      ('transgender-studies', 'Transgender Studies', 'Q17014367',
       'https://en.wikipedia.org/wiki/Transgender_studies',
       'The academic field centred on trans lives and knowledge.',
       'An academic field that studies transgender people, histories and knowledge on their own '
       'terms rather than as a subtopic of sexuality. It grew alongside queer theory in the 1990s '
       'and has often argued with it, particularly where queer theory treated gender as primarily '
       'figurative. Susan Stryker is among its founding editors and historians.',
       null)
    ) as t(slug, name, qid, url, short_d, descr, long_d)
  loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description, long_description,
      wikidata_id, wikipedia_url, is_sensitive, verification_status, human_reviewed,
      seo_indexable, category_id, category, last_verified_at)
    values (
      r.name, r.slug, 'concept', 'active', r.descr, r.short_d, r.long_d,
      r.qid, r.url, false, 'reviewed', true,
      true, v_cat, (select name from public.tag_categories where id = v_cat), now())
    on conflict (slug) do update
       set name = excluded.name, description = excluded.description,
           short_description = excluded.short_description,
           long_description = excluded.long_description,
           wikipedia_url = excluded.wikipedia_url,
           -- Fill an absent identifier, never overwrite one. A concurrent
           -- session created `compulsory-heterosexuality` with wikidata_id NULL
           -- while this branch was open (#3551); coalesce adopts the verified
           -- QID for it without touching an id somebody else resolved.
           wikidata_id = coalesce(public.unified_tags.wikidata_id, excluded.wikidata_id),
           status = 'active', verification_status = 'reviewed', human_reviewed = true,
           seo_indexable = true, merged_into_id = null, deprecated_at = null,
           deprecation_reason = null, category_id = excluded.category_id,
           category = excluded.category, last_verified_at = now(), updated_at = now();
  end loop;

  ------------------------------------------------------------------ 2d. refile
  -- All three surfaces, because each has a different reader: the DETAIL PAGE
  -- renders the junction via fetchTagWithCategories, the SEARCH FACET renders the
  -- `category` TEXT mirror, and `category_id` is what the hygiene metrics read.
  -- Neither category trigger fires on INSERT and both are guarded on
  -- `category_id IS DISTINCT FROM`, so nothing propagates on its own.
  for r in
    select * from (values
      ('queer-theory','t'), ('quare-theory','t'), ('queer-of-color-critique','t'),
      ('queer-archaeology','t'), ('queer-theology','t'), ('crip-theory','t'),
      ('critical-disability-theory','t'), ('disability-studies','t'),
      ('neuroqueer-theory','t'), ('performativity','t'), ('gender-performativity','t'),
      ('homonormativity','t'), ('homonationalism','t'), ('cisnormativity','t'),
      ('heteronormativity','t'), ('disidentification','t'),
      ('social-construction-of-gender','t'), ('queer-ecology','t'), ('queer-pedagogy','t'),
      ('intersectional','t'), ('compulsory-heterosexuality','t'), ('human-sexuality','t'),
      ('transgender-studies','t'), ('queer-studies','t'), ('lesbian-feminism','t'),
      ('neuroqueer','t'), ('asexual-studies','t'), ('ecofeminism','t'),
      ('gender-theory','t'), ('queer-musicology','t'),
      -- not theory: a movement term and a sexual-culture term
      ('homophile','h'), ('sex-positivity','k')
    ) as t(slug, target)
  loop
    v_rel := case r.target when 't' then v_cat when 'h' then v_hist else v_sexkink end;
    select id into v_tag from public.unified_tags where slug = r.slug and status = 'active';
    continue when v_tag is null;

    update public.unified_tags
       set category_id = v_rel,
           category    = (select name from public.tag_categories where id = v_rel),
           updated_at  = now()
     where id = v_tag;

    -- One junction row per statement: two in one statement re-enters
    -- unified_tags_recompute_is_adult and raises 27000.
    update public.tag_category_assignments set is_primary = false
     where tag_id = v_tag and category_id <> v_rel and is_primary;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag, v_rel, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  ------------------------------------------------------------ 2e. enrich in place
  -- `queer` is the most-used tag on the site (usage_count 12,386) and carried a
  -- 42-character description and no Wikidata link at all. Q51415 label-matches
  -- exactly. It KEEPS its Orientation filing: it names an identity, not a theory.
  update public.unified_tags
     set wikidata_id   = 'Q51415',
         wikipedia_url = 'https://en.wikipedia.org/wiki/Queer',
         description   =
           'An umbrella term for sexual and gender minorities who are not heterosexual or not '
           'cisgender, and a deliberate refusal of fixed categories. It entered English in the '
           '16th century meaning strange or odd, was used as a slur for sexual deviance from the '
           '1890s, and was reclaimed from the 1980s during the AIDS crisis — Queer Nation formed '
           'in March 1990. Some people still hear it as the slur it was; others use it precisely '
           'because it refuses to settle.',
         human_reviewed = true,
         last_verified_at = now(), updated_at = now()
   where slug = 'queer' and wikidata_id is null;

  update public.unified_tags
     set description =
           'The establishment of heterosexuality as the normal or default human sexuality, '
           'together with the assumption of a gender binary and of opposite-sex partnership as '
           'the fitting form of sexual and marital life. Michael Warner popularised the term in '
           '1991 in "Introduction: Fear of a Queer Planet". It names a structure built into '
           'institutions, law and everyday expectation, not individual prejudice — that is '
           'heterosexism.',
         human_reviewed = true, last_verified_at = now(), updated_at = now()
   where slug = 'heteronormativity';

  -- The noun `intersectionality` was merged into this adjective row by
  -- 20261011090000. The merge is legitimate — same concept, same QID — so it is
  -- left standing; what was missing is that the canonical academic form was not
  -- reachable and the definition named nobody.
  update public.unified_tags
     set description =
           'An analytical framework for how overlapping identities — race, gender, sexuality, '
           'class, caste, disability, age and more — produce distinct combinations of '
           'discrimination and privilege that cannot be understood one axis at a time. Kimberlé '
           'Crenshaw coined the term in 1989 in "Demarginalizing the Intersection of Race and '
           'Sex", building on Black feminist work including the Combahee River Collective''s '
           'account of simultaneity (1977) and Patricia Hill Collins''s matrix of domination.',
         human_reviewed = true, last_verified_at = now(), updated_at = now()
   where slug = 'intersectional';

  ---------------------------------------------------------------- 2f. relations
  -- `broader` is stored child -> parent. Written 'approved' because
  -- get_tag_ontology shows broader on ('auto','approved') and related on
  -- 'approved' ONLY — an unreviewed edge is invisible.
  for r in
    select * from (values
      ('quare-theory',               'queer-theory',               'broader'),
      ('queer-of-color-critique',    'queer-theory',               'broader'),
      ('queer-archaeology',          'queer-theory',               'broader'),
      ('queer-theology',             'queer-theory',               'broader'),
      ('neuroqueer-theory',          'queer-theory',               'broader'),
      ('queer-pedagogy',             'queer-theory',               'broader'),
      ('queer-ecology',              'queer-theory',               'broader'),
      ('queer-musicology',           'queer-theory',               'broader'),
      ('gender-performativity',      'performativity',             'broader'),
      ('crip-theory',                'critical-disability-theory', 'broader'),
      ('critical-disability-theory', 'disability-studies',         'broader'),
      ('homonormativity',            'heteronormativity',          'related'),
      ('compulsory-heterosexuality', 'heteronormativity',          'related'),
      ('cisnormativity',             'heteronormativity',          'related'),
      ('queer-of-color-critique',    'intersectional',             'related'),
      ('quare-theory',               'queer-of-color-critique',    'related'),
      ('disidentification',          'queer-of-color-critique',    'related'),
      ('crip-theory',                'queer-theory',               'related'),
      ('neuroqueer-theory',          'neuroqueer',                 'related'),
      ('transgender-studies',        'queer-theory',               'related'),
      ('lesbian-feminism',           'compulsory-heterosexuality', 'related')
    ) as t(child, parent, kind)
  loop
    select id into v_tag from public.unified_tags where slug = r.child  and status = 'active';
    select id into v_rel from public.unified_tags where slug = r.parent and status = 'active';
    if v_tag is not null and v_rel is not null and v_tag <> v_rel then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag, v_rel, r.kind, 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  ------------------------------------------------------------------ 2g. aliases
  -- Each skipped if its slug is held by a live tag: tag_reject_alias_shadow
  -- RAISEs on the OTHER side of that collision, which would abort this whole
  -- transaction rather than skip one row.
  for r in
    select * from (values
      ('quare-theory',               'Quare Studies'),
      ('compulsory-heterosexuality', 'Comphet'),
      ('crip-theory',                'Cripping'),
      ('queer-of-color-critique',    'QOC Critique'),
      ('intersectional',             'Intersectionality')
    ) as t(slug, alias)
  loop
    select id into v_tag from public.unified_tags where slug = r.slug and status = 'active';
    continue when v_tag is null;
    a := public.normalize_tag_slug(r.alias);
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag, r.alias, a, 'synonym', 'approved'
     where not exists (select 1 from public.unified_tags u
                        where lower(u.slug) = a and u.status = 'active' and u.id <> v_tag)
       -- alias_equals_name is a zero-invariant.
       and lower(r.alias) <> (select lower(name) from public.unified_tags where id = v_tag)
    on conflict (alias_slug) do nothing;
  end loop;

  ------------------------------------------------------------------ 2h. sources
  -- Provenance for reviewers, not a rendered citation.
  -- `tag_sources_public_requires_citation` has no public academic/book branch —
  -- publishing a scholarly citation would need a new CHECK branch mirroring
  -- 20261013110300 plus repointing tagSourceVocabulary.test.ts. Out of scope; the
  -- reader-facing link is `wikipedia_url` on the row.
  for r in
    select * from (values
      ('quare-theory',               'https://en.wikipedia.org/wiki/Quare_theory'),
      ('queer-of-color-critique',    'https://en.wikipedia.org/wiki/Queer_of_color_critique'),
      ('queer-archaeology',          'https://en.wikipedia.org/wiki/Queer_archaeology'),
      ('queer-theology',             'https://en.wikipedia.org/wiki/Queer_theology'),
      ('neuroqueer-theory',          'https://en.wikipedia.org/wiki/Neuroqueer_theory'),
      ('crip-theory',                'https://en.wikipedia.org/wiki/Disability_studies'),
      ('critical-disability-theory', 'https://en.wikipedia.org/wiki/Disability_studies'),
      ('disability-studies',         'https://en.wikipedia.org/wiki/Disability_studies'),
      ('compulsory-heterosexuality', 'https://en.wikipedia.org/wiki/Compulsory_heterosexuality'),
      ('human-sexuality',            'https://en.wikipedia.org/wiki/Human_sexuality'),
      ('transgender-studies',        'https://en.wikipedia.org/wiki/Transgender_studies'),
      ('queer-theory',               'https://en.wikipedia.org/wiki/Queer_theory'),
      ('heteronormativity',          'https://en.wikipedia.org/wiki/Heteronormativity'),
      ('intersectional',             'https://en.wikipedia.org/wiki/Intersectionality'),
      ('queer',                      'https://en.wikipedia.org/wiki/Queer')
    ) as t(slug, url)
  loop
    select id into v_tag from public.unified_tags where slug = r.slug and status = 'active';
    continue when v_tag is null;
    insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, is_public, fetched_at)
    select v_tag, 'wikipedia', r.url,
           'Definition hand-written from this article for the 2026-09 queer-theory glossary pass.',
           false, now()
     where not exists (select 1 from public.tag_sources s
                        where s.tag_id = v_tag and s.source_url = r.url);
  end loop;

  select count(*) into v_n from public.unified_tags
   where slug in ('queer-theory','quare-theory','queer-of-color-critique') and status = 'active';
  raise notice 'glossary: % of 3 headline terms live', v_n;
end
$mig$;

-- ────────────────────────────────────────────────────────────────── assertions
-- Each is separate because each can fail independently.
do $verify$
declare v_n int; v_bad text;
begin
  -- 1. Everything intended to be live is live, reviewed, filed and has prose.
  select string_agg(slug, ', ') into v_bad
    from public.unified_tags
   where slug in (
     'queer-theory','homonormativity','homonationalism','performativity','gender-performativity',
     'cisnormativity','disidentification','lesbian-feminism','queer-ecology','queer-pedagogy',
     'social-construction-of-gender','asexual-studies','ecofeminism','gender-theory','homophile',
     'queer-musicology','sex-positivity','quare-theory','queer-of-color-critique',
     'queer-archaeology','queer-theology','neuroqueer-theory','crip-theory',
     'critical-disability-theory','disability-studies','compulsory-heterosexuality',
     'human-sexuality','transgender-studies')
     and not (status = 'active' and deprecated_at is null and merged_into_id is null
              and human_reviewed and category_id is not null
              and public.tag_has_prose(description, short_description));
  if v_bad is not null then
    raise exception 'glossary: not live/reviewed/filed/prose-bearing: %', v_bad;
  end if;

  -- 2. A primary junction row exists — this, not category_id, is what /tags/:slug reads.
  select string_agg(t.slug, ', ') into v_bad
    from public.unified_tags t
   where t.slug in ('queer-theory','quare-theory','queer-of-color-critique','queer-archaeology',
                    'queer-theology','neuroqueer-theory','crip-theory','critical-disability-theory',
                    'disability-studies','compulsory-heterosexuality','human-sexuality',
                    'transgender-studies','homophile','sex-positivity')
     and not exists (select 1 from public.tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary);
  if v_bad is not null then
    raise exception 'glossary: no primary junction row for: %', v_bad;
  end if;

  -- 3. The text mirror agrees with category_id. It stays NULL on INSERT because
  --    the sync trigger only fires when category_id CHANGES, and it is the one
  --    the search facet reads — so a tag can be filed on its page and
  --    uncategorised in search.
  select string_agg(t.slug || ' (text=' || coalesce(t.category, 'NULL') || ')', ', ') into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where t.slug in ('queer-theory','quare-theory','queer-of-color-critique','crip-theory',
                    'homophile','sex-positivity','intersectional','heteronormativity')
     and t.category is distinct from c.name;
  if v_bad is not null then
    raise exception 'glossary: category text mirror disagrees with category_id: %', v_bad;
  end if;

  -- 4. The four wrong identities are gone and queer-theory kept its right one.
  select count(*) into v_n from public.unified_tags
   where (slug in ('queerness','disidentification','gender-theory') and wikidata_id is not null)
      or (slug = 'crip-theory' and wikidata_id is not null);
  if v_n <> 0 then
    raise exception 'glossary: % wrong-entity QID(s) still set', v_n;
  end if;
  select count(*) into v_n from public.unified_tags
   where slug = 'queer-theory' and wikidata_id = 'Q658022' and status = 'active';
  if v_n <> 1 then
    raise exception 'glossary: queer-theory does not hold Q658022';
  end if;

  -- 5. No duplicate identifier across active tags FOR THE ROWS THIS MIGRATION
  --    TOUCHES. The identity trigger cannot catch this on a REVIVE — it returns
  --    early when wikidata_id does not move, so a status flip can create exactly
  --    the state it exists to prevent, which is why it is asserted here at all.
  --
  --    SCOPED, NOT CORPUS-WIDE, AND THAT IS A CORRECTION. This was first written
  --    as a corpus-wide zero and it would have failed the deploy: prod already
  --    carries 27 duplicate-QID pairs across active tags (Q316, Q309, Q349,
  --    Q11639, Q43 …), none of them related to this change. Asserting a global
  --    invariant that has never held turns someone else's pre-existing debt into
  --    this migration's failure. What this change is answerable for is that it
  --    does not ADD one — including Q658022, which it resolves from three
  --    holders down to one.
  select string_agg(q.wikidata_id || ' held by ' || q.slugs, ', ') into v_bad from (
    select t.wikidata_id, string_agg(t.slug, '+' order by t.slug) as slugs
      from public.unified_tags t
     where t.status = 'active' and t.wikidata_id is not null
       and t.wikidata_id in (
         select t2.wikidata_id from public.unified_tags t2
          where t2.wikidata_id is not null
            and t2.slug in (
              'queer-theory','homonormativity','homonationalism','performativity',
              'gender-performativity','cisnormativity','disidentification','lesbian-feminism',
              'queer-ecology','queer-pedagogy','social-construction-of-gender','asexual-studies',
              'ecofeminism','gender-theory','homophile','queer-musicology','sex-positivity',
              'quare-theory','queer-of-color-critique','queer-archaeology','queer-theology',
              'neuroqueer-theory','crip-theory','critical-disability-theory','disability-studies',
              'compulsory-heterosexuality','human-sexuality','transgender-studies',
              'queer','queerness','intersectional','queer-studies'))
     group by t.wikidata_id having count(*) > 1) q;
  if v_bad is not null then
    raise exception 'glossary: this change leaves a duplicate QID on active tags: %', v_bad;
  end if;

  -- 6. Corpus-wide zero-invariants from scripts/check-tag-hygiene.mjs. These read
  --    PROD in CI, so breaking one fails every open PR, not just this branch.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_n <> 0 then
    raise exception 'glossary: % indexable row(s) corpus-wide have no description', v_n;
  end if;

  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_n <> 0 then
    raise exception 'glossary: % alias(es) equal their own tag name (merge_tag_concept auto-alias?)', v_n;
  end if;

  -- 7. duplicate_active_name must not have grown past its ratchet.
  select count(*) into v_n from (
    select lower(name) from public.unified_tags where status = 'active'
     group by lower(name) having count(*) > 1) q;
  if v_n > 14 then
    raise exception 'glossary: duplicate_active_name is % (ratchet is 14)', v_n;
  end if;

  raise notice 'glossary: all assertions passed';
end
$verify$;
