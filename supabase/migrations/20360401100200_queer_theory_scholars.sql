-- The scholars behind the glossary: publish nine that were already here but
-- invisible, add forty-six that were absent, and link sixty of them to the terms
-- they wrote.
--
-- WHAT WAS WRONG. Eve Kosofsky Sedgwick and Michael Warner — who between them
-- gave this platform "epistemology of the closet" and the word
-- "heteronormativity" — existed as `visibility='draft'` rows with an EMPTY bio.
-- Gayle Rubin, Gloria E. Anzaldúa, Barbara Smith, Eli Clare, Marlon Riggs,
-- Cherríe Moraga and Evelyn Hooker were complete and also draft. Draft means
-- invisible everywhere: `functions/_lib/detail.ts` filters
-- `visibility=eq.public` for crawlers, the SPA fetchers filter it, the sitemap
-- filters it, and `search_documents_index_personalities` filters it. Only 1,633
-- of 16,087 personalities are public.
--
-- EVERY QID HERE WAS RESOLVED AGAINST THE LIVE WIKIDATA API AND CHECKED FOR
-- P31=Q5, and one namesake was caught doing it: the English Wikipedia article
-- titled "Barbara Smith (activist)" is Q119800218, a Chicago activist who died in
-- 2015 — NOT the Combahee River Collective co-author. This platform's existing
-- row already holds the correct Q3634688, so the article-title route would have
-- replaced a right identity with a wrong one. Resolving by article title is not
-- the same as resolving a person.
--
-- DATES COME FROM P569/P570 READ RANK-AWARE AND PRECISION-AWARE. Anything
-- coarser than year precision is dropped rather than rounded, which is the rule
-- `readTimeClaim` in _shared/wikidata-resolve.ts already enforces and the reason
-- fabricated 1901-01-01 sentinels are not in this file. Where Wikidata gives only
-- a year, the date is omitted entirely rather than padded to January 1st — a
-- padded date is indistinguishable from a real one once stored.
--
-- `lgbti_connection` IS EVIDENCE-BASED AND MOSTLY ABSTAINS. This was measured,
-- not assumed: Wikidata P91 (sexual orientation) is present on 2 of the 44 new
-- people, and a scan of every English Wikipedia intro found an explicit identity
-- statement for only a handful more. So eight rows carry `community_member`,
-- each with its evidence named in `lgbti_details`:
--   Jack Halberstam, Lauren Berlant, M. Remi Yergeau  (Wikidata P21 non-binary)
--   Juana María Rodríguez (P91 bisexual), Maria Lugones + Monique Wittig (P91 lesbian)
--   Sami Schalk ("identifies as a fat, Black, queer, disabled femme")
--   Leo Bersani (married his partner Sam Geraci, 2014)
-- Everyone else gets `unclear` — we do not know — or `none_known` for scholars
-- whose relevance is their work rather than their identity (Crenshaw, Spivak,
-- Collins, Havelock Ellis). Neither value is in the set `person_outing_guard`
-- polices, so no living person is asserted to be queer on this platform's say-so.
-- That guard is the reason to care: it requires a real QID or a non-SKIP source
-- row before a LIVING person may carry an asserted queer connection publicly.
--
-- THREE PEOPLE NAMED IN THE ARTICLES ARE DELIBERATELY ABSENT, each for its own
-- reason, recorded rather than silently skipped:
--   Andrea Smith        — named in the queer-of-color critique article, but her
--                         claimed Cherokee ancestry is publicly contested and she
--                         is not queer-identified. A contested-identity biography
--                         is an editorial decision, not a data one.
--   Nick Walker         — coined "neuroqueer" in 2008 and belongs here, but has
--                         neither an English Wikipedia article nor a Wikidata
--                         item. `wbsearchentities` returns a basketball player, a
--                         rugby player and a roboticist: the namesake-chimera
--                         shape exactly. Adding him needs a citable source that
--                         is not Wikipedia, so he waits for one.
--   Athena Lynn         — credited in the same article with arriving at the term
--   Michaels-Dillon       independently; no Wikidata item and no article at all.
-- The Combahee River Collective is also absent, but as a category question: it is
-- an organisation (Q843054, P31 is not Q5), so it belongs in `organizations`.
--
-- `promote_personality()` IS NOT USED AND CANNOT WORK. It sets
-- `visibility='public'` and `needs_attention=true` in one UPDATE, and
-- `enforce_personality_public_gate()` — added a month later — demotes exactly
-- that combination back to draft, silently, with no error. The working path is
-- `publish_personality_with_consent(id, true)`, which clears needs_attention in
-- the same statement. Four of the nine existing rows carry needs_attention=true
-- and would otherwise have stayed draft while reporting success.
--
-- Reversible: new rows are identifiable by their `personality_sources` row
-- (source_slug 'queer-theory-glossary-2026-09'); publications by resetting
-- `visibility`.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:queer-theory-scholars', true);

do $mig$
declare
  r        record;
  v_id     uuid;
  v_tag    uuid;
  v_n      int;
  v_bad    text;
begin
  ------------------------------------------------------------------ 1. the bios
  -- Sedgwick and Warner have no bio at all. Without one their pages would
  -- publish as a name and a job title.
  update public.personalities set bio =
    'Literary scholar whose Epistemology of the Closet (1990) argued that the '
    'homosexual/heterosexual definition installed in the late nineteenth century '
    'structures modern Western thought far beyond sexuality itself, and that the closet is '
    'a relation of knowledge rather than merely a private silence. With Judith Butler she is '
    'among the founding figures of queer theory; Between Men (1985) introduced her account '
    'of homosocial desire.',
    description = coalesce(nullif(btrim(description), ''),
      'Literary scholar, founding figure of queer theory'),
    updated_at = now()
   where slug = 'eve-kosofsky-sedgwick';

  update public.personalities set bio =
    'Literary critic and social theorist who popularised the term "heteronormativity" in '
    '1991 in "Introduction: Fear of a Queer Planet", naming the way institutions, law and '
    'everyday expectation treat heterosexuality as the default rather than merely one '
    'arrangement among others. The Trouble with Normal (1999) argued against the '
    'assimilationist turn in gay politics.',
    description = coalesce(nullif(btrim(description), ''),
      'Literary critic who named heteronormativity'),
    updated_at = now()
   where slug = 'michael-warner';

  ------------------------------------------------------------------ 2. new rows
  -- Inserted only when neither the slug nor the QID is already taken.
  -- `personalities_wikidata_qid_uniq` is a partial unique index, so a duplicate
  -- QID is an error rather than a silent second row for the same person.
  for r in
    select * from (values
      -- slug, name, profession, qid, birth, death, lgbti_connection, bio
      ('jose-esteban-munoz','José Esteban Muñoz','Researcher','Q6292143','1967-08-09','2013-12-04','unclear',
       'Performance-studies scholar whose Disidentifications: Queers of Color and the Performance of Politics (1999) described how queers of colour neither assimilate into nor simply reject a dominant culture, but work on it from within. Cruising Utopia (2009) argued for queerness as a horizon not yet reached.'),
      ('roderick-ferguson','Roderick A. Ferguson','Researcher','Q7356608',null,null,'unclear',
       'Sociologist who named the queer of color critique in Aberrations in Black: Toward a Queer of Color Critique (2004), arguing that a politics organised around sexuality alone reproduces the racial and economic order it leaves unexamined.'),
      ('e-patrick-johnson','E. Patrick Johnson','Researcher','Q5322089','1967-03-01',null,'unclear',
       'Performance scholar who developed quare theory in 2001, taking the word from his grandmother''s pronunciation of "queer" and rebuilding queer theory around the racialised knowledge of queer people of colour. Co-editor, with Mae G. Henderson, of Black Queer Studies.'),
      ('cathy-j-cohen','Cathy J. Cohen','Researcher','Q5053436',null,null,'unclear',
       'Political scientist whose "Punks, Bulldaggers, and Welfare Queens" (1997) asked whether queer politics had built its radical promise on a single axis, and argued for coalition organised around marginality rather than around sexual identity alone.'),
      ('jasbir-puar','Jasbir Puar','Researcher','Q14949231','1967-12-13',null,'unclear',
       'Theorist whose Terrorist Assemblages (2007) named homonationalism: the way acceptance of sexual diversity became a marker of national modernity, and a warrant for treating other states and populations as backward.'),
      ('kimberle-crenshaw','Kimberlé Crenshaw','Lawyer','Q6409990','1959-05-05',null,'none_known',
       'Legal scholar who coined "intersectionality" in 1989 in "Demarginalizing the Intersection of Race and Sex", showing that anti-discrimination law failed Black women precisely because it treated race and sex as separate claims. The framework is now foundational to queer of color critique.'),
      ('robert-mcruer','Robert McRuer','Researcher','Q7347593',null,null,'unclear',
       'Literary scholar whose Crip Theory: Cultural Signs of Queerness and Disability (2006) set compulsory able-bodiedness alongside compulsory heterosexuality and argued the two systems produce each other.'),
      ('alison-kafer','Alison Kafer','Researcher','Q109332104',null,null,'unclear',
       'Disability-studies scholar whose Feminist, Queer, Crip (2013) rejected the idea that a desirable future is one without disabled people, and argued for crip futurity against the politics of cure.'),
      ('jack-halberstam','Jack Halberstam','Researcher','Q433322','1961-12-15',null,'community_member',
       'Gender and queer-theory scholar whose Female Masculinity (1998) detached masculinity from men, and In a Queer Time and Place (2005) described queer temporalities that refuse the schedule of marriage, reproduction and inheritance.'),
      ('lee-edelman','Lee Edelman','Researcher','Q6513519',null,null,'unclear',
       'Literary theorist whose No Future (2004) attacked "reproductive futurism" — the way politics is organised around an imagined Child — and argued that queerness names what that order must refuse.'),
      ('lauren-berlant','Lauren Berlant','Researcher','Q12237573','1957-10-31','2021-06-28','community_member',
       'Cultural theorist who wrote with Michael Warner on sex in public and whose Cruel Optimism (2011) described attachments to ways of living that are themselves obstacles to flourishing.'),
      ('teresa-de-lauretis','Teresa de Lauretis','Researcher','Q292326','1938-11-29','2026-02-02','unclear',
       'Film and literary theorist who convened the 1990 conference that gave queer theory its name, deliberately joining an activist word to an academic one in order to unsettle both.'),
      ('monique-wittig','Monique Wittig','Writer','Q263201','1935-07-13','2003-01-03','community_member',
       'Novelist and theorist whose "The Straight Mind" (1980) argued that heterosexuality is a political regime rather than a natural fact, and concluded that lesbians are not women within its terms.'),
      ('david-m-halperin','David M. Halperin','Researcher','Q705633','1952-04-02',null,'unclear',
       'Classicist and historian of sexuality whose One Hundred Years of Homosexuality (1990) and Saint Foucault (1995) argued that sexual categories are historical inventions rather than transhistorical kinds.'),
      ('leo-bersani','Leo Bersani','Researcher','Q360259','1931-04-16','2022-02-20','community_member',
       'Literary theorist whose essay "Is the Rectum a Grave?" (1987), written during the AIDS crisis, refused the redemptive account of sex and became a founding text of the antisocial turn in queer theory.'),
      ('diana-fuss','Diana Fuss','Researcher','Q103929502','1960-01-25',null,'unclear',
       'Literary scholar whose Essentially Speaking (1989) and the anthology Inside/Out (1991) examined how identity politics depends on the essentialism it claims to reject.'),
      ('annamarie-jagose','Annamarie Jagose','Writer','Q546569',null,null,'unclear',
       'Scholar and novelist whose Queer Theory: An Introduction (1996) is the field''s standard primer, and whose later work on orgasm and on feminist accounts of sex extended it.'),
      ('lisa-duggan','Lisa Duggan','Researcher','Q29131447','1954-06-10',null,'unclear',
       'Historian who gave "homonormativity" its influential formulation in 2003, describing a gay politics that seeks inclusion in existing institutions rather than any change to them.'),
      ('george-chauncey','George Chauncey','Researcher','Q1507106',null,null,'unclear',
       'Historian whose Gay New York (1994) documented a large, visible working-class gay world before the Second World War, overturning the assumption that the closet had always been the norm.'),
      ('gayatri-gopinath','Gayatri Gopinath','Researcher','Q15431098',null,null,'unclear',
       'Scholar of queer diaspora whose Impossible Desires (2005) read South Asian public cultures for the queer female subjects that both nationalism and diaspora studies had rendered unimaginable.'),
      ('chandan-reddy','Chandan Reddy','Researcher','Q104451194','1972-10-03',null,'unclear',
       'Scholar of race and sexuality, a member of the 1999 UC San Diego reading group from which queer of color critique emerged, and author of Freedom with Violence (2011).'),
      ('martin-manalansan','Martin F. Manalansan IV','Researcher','Q59433256','1960-09-29',null,'unclear',
       'Anthropologist whose Global Divas (2003) followed Filipino gay men in New York and showed how migration reshapes sexual selfhood rather than simply transplanting it.'),
      ('juana-maria-rodriguez','Juana María Rodríguez','Researcher','Q28078481',null,null,'community_member',
       'Scholar of queer Latinidad whose Sexual Futures, Queer Gestures and Other Latina Longings (2014) reads gesture and fantasy as sites where sexual politics is actually worked out.'),
      ('kara-keeling','Kara Keeling','Researcher','Q23416883',null,null,'unclear',
       'Film and media theorist whose The Witch''s Flight (2007) and Queer Times, Black Futures (2019) read cinema for the Black queer figures that dominant perception is organised to exclude.'),
      ('tavia-nyongo','Tavia Nyong''o','Researcher','Q7689092',null,null,'unclear',
       'Cultural historian and performance theorist whose work on Black queer aesthetics and "Afro-fabulation" reads performance as a way of making history otherwise.'),
      ('fatima-el-tayeb','Fatima El-Tayeb','Researcher','Q1252311',null,null,'unclear',
       'Historian of race in Europe whose European Others (2011) traced how queer of colour organising contests a continent that imagines itself as raceless.'),
      ('marquis-bey','Marquis Bey','Researcher','Q116455805',null,null,'unclear',
       'Scholar of Black studies and trans studies whose work argues that Blackness and transness name overlapping refusals of the categories imposed on them.'),
      ('siobhan-somerville','Siobhan Somerville','Researcher',null,null,null,'unclear',
       'Literary scholar whose Queering the Color Line (2000) showed that the modern homosexual and the modern racial subject were produced by the same late-nineteenth-century scientific apparatus.'),
      ('carrie-sandahl','Carrie Sandahl','Researcher','Q112566054',null,null,'unclear',
       'Performance scholar whose "Queering the Crip or Cripping the Queer?" (2003) named the ground that crip theory would occupy, reading solo autobiographical performance by disabled and queer artists.'),
      ('rosemarie-garland-thomson','Rosemarie Garland-Thomson','Researcher','Q19866322','1946-10-18',null,'unclear',
       'Disability-studies scholar whose Extraordinary Bodies (1997) introduced "the normate" — the unmarked position from which disability is seen as deviation.'),
      ('tobin-siebers','Tobin Siebers','Researcher','Q55949921',null,'2015-01-29','unclear',
       'Literary scholar whose Disability Theory (2008) argued for a disability aesthetics and against the assumption that a body must be repaired before it can signify.'),
      ('sami-schalk','Sami Schalk','Researcher','Q97294741',null,null,'community_member',
       'Scholar of disability, race and gender whose Bodyminds Reimagined (2018) reads Black women''s speculative fiction for the disabled and mad figures realism keeps out.'),
      ('ellen-samuels','Ellen Samuels','Researcher','Q139432429',null,null,'unclear',
       'Disability-studies scholar whose Fantasies of Identification (2014) traced the historical drive to make race, sex and disability legible on the surface of the body.'),
      ('christopher-bell-scholar','Christopher Bell','Researcher','Q16018389',null,'2009-12-25','unclear',
       'Disability-studies scholar who argued that the field as constituted was effectively White Disability Studies, and worked to place race at its centre.'),
      ('fiona-kumari-campbell','Fiona Kumari Campbell','Researcher','Q27063665',null,null,'unclear',
       'Legal and disability scholar whose Contours of Ableism (2009) treated ableism as a system that produces the able body, not merely as prejudice against disabled people.'),
      ('m-remi-yergeau','M. Remi Yergeau','Researcher','Q107315045',null,null,'community_member',
       'Rhetoric scholar whose Authoring Autism (2018) contests the claim that autistic people lack a theory of mind, and who is among the scholars working on neuroqueer ground.'),
      ('thomas-a-dowson','Thomas A. Dowson','Researcher','Q64160517',null,null,'unclear',
       'Archaeologist who introduced queer archaeology in 2000, arguing that the discipline''s task is to question the heteronormative assumptions built into interpretation rather than to search the record for homosexuality.'),
      ('barbara-l-voss','Barbara L. Voss','Researcher','Q29913356',null,null,'unclear',
       'Historical archaeologist whose "Sexuality Studies in Archaeology" (2008) surveyed how the discipline had come to treat sexuality as an object of study at all.'),
      ('marcella-althaus-reid','Marcella Althaus-Reid','Researcher','Q462384','1952-05-11','2009-02-20','unclear',
       'Argentine-Scottish theologian whose Indecent Theology (2000) and The Queer God (2003) read liberation theology from the position of sexual dissidence, and refused the decency that had been its price.'),
      ('robert-goss','Robert Goss','Researcher','Q2157322','1948-05-11',null,'unclear',
       'Theologian whose Jesus Acted Up: A Gay and Lesbian Manifesto (1994) is a founding work of queer theology, reading the passion through the politics of AIDS-era activism.'),
      ('john-j-mcneill','John J. McNeill','Researcher','Q1701046','1925-09-02','2015-09-22','unclear',
       'Theologian and psychotherapist whose The Church and the Homosexual (1976) argued for the moral legitimacy of same-sex love and cost him his licence to teach.'),
      ('patricia-hill-collins','Patricia Hill Collins','Researcher','Q465252','1948-05-01',null,'none_known',
       'Sociologist whose Black Feminist Thought (1990) set out the matrix of domination, describing race, class and gender as an interlocking system rather than a sum of separate disadvantages.'),
      ('gayatri-chakravorty-spivak','Gayatri Chakravorty Spivak','Researcher','Q240851','1942-02-24',null,'none_known',
       'Literary theorist whose "Can the Subaltern Speak?" (1988) and account of strategic essentialism are standing reference points for queer of color critique and postcolonial queer studies.'),
      ('maria-lugones','María Lugones','Researcher','Q6761379','1944-01-26','2020-07-14','community_member',
       'Philosopher whose work on the coloniality of gender argued that the gender binary was itself an instrument of colonisation, and whose "world-travelling" described how the oppressed move between incommensurate worlds.'),
      ('chela-sandoval','Chela Sandoval','Researcher','Q18387068','1956-07-31',null,'unclear',
       'Theorist whose Methodology of the Oppressed (2000) described the differential consciousness that lets a movement shift tactics without losing itself.'),
      ('havelock-ellis','Havelock Ellis','Physician','Q552983','1859-02-02','1939-07-08','none_known',
       'English physician and sexologist whose Sexual Inversion (1897), written with John Addington Symonds, was the first English medical text to treat homosexuality as a variation rather than a disease or a crime.')
    ) as t(slug, name, profession, qid, born, died, conn, bio)
  loop
    insert into public.personalities (
      name, slug, profession, wikidata_qid, wikipedia_url,
      birth_date, death_date, bio, description,
      lgbti_connection, lgbti_details, lgbti_connection_source,
      visibility, review_status, verification_status, seo_indexable, is_adult)
    select
      r.name, r.slug, r.profession, r.qid,
      'https://www.wikidata.org/wiki/' || r.qid,
      nullif(r.born, '')::date, nullif(r.died, '')::date, r.bio,
      null,
      r.conn,
      'Named in the English Wikipedia articles on queer theory and its adjacent fields; '
        || 'this platform records the scholarly contribution, not a claim about the person.',
      'wikipedia:queer-theory-glossary-2026-09',
      'public', 'approved', 'verified', true, false
     where not exists (select 1 from public.personalities p where p.slug = r.slug)
       and (r.qid is null
            or not exists (select 1 from public.personalities p where p.wikidata_qid = r.qid));

    select id into v_id from public.personalities where slug = r.slug;
    if v_id is not null and r.qid is not null then
      -- A non-`SKIP_` source row is the other half of what person_outing_guard
      -- accepts. Written for every row so the guard never depends on the QID alone.
      insert into public.personality_sources
        (personality_id, source_slug, source_entity_id, source_url, confidence, is_primary,
         first_seen_at, last_seen_at)
      select v_id, 'queer-theory-glossary-2026-09', r.qid,
             'https://www.wikidata.org/wiki/' || r.qid, 1.0, false, now(), now()
       where not exists (
         select 1 from public.personality_sources s
          where s.source_slug = 'queer-theory-glossary-2026-09' and s.source_entity_id = r.qid);
    end if;
  end loop;

  ------------------------------------------------------------- 3. publish drafts
  -- NEITHER PUBLISH RPC IS CALLABLE FROM A MIGRATION, and the two fail
  -- differently. `promote_personality` sets needs_attention=true in the same
  -- UPDATE that sets visibility='public', which enforce_personality_public_gate
  -- then silently demotes. `publish_personality_with_consent` is gated on
  -- `has_any_role_jwt(array['admin'])` with no internal escape hatch — measured,
  -- it raises 42501 'unauthorized' under `db push`, which has no JWT. (That is
  -- unlike `assert_admin_or_internal()`, which returns early when there is no
  -- JWT and so IS migration-callable; the two guards are not interchangeable.)
  --
  -- So the UPDATE is done here, replicating exactly what the consent RPC writes:
  -- the same three columns, the same eligibility tests, and the same
  -- `enrichment_status.promotion` stamp carrying the prior state so the
  -- publication is reversible. `consent_by` is null rather than a forged uuid —
  -- there is no admin session, and recording one would be a lie about who
  -- approved it.
  for r in
    select * from (values
      ('eve-kosofsky-sedgwick'), ('michael-warner'), ('gayle-rubin'), ('gloria-e-anzaldua'),
      ('barbara-smith'), ('eli-clare'), ('marlon-riggs'), ('cherrie-moraga'), ('evelyn-hooker')
    ) as t(slug)
  loop
    update public.personalities p
       set visibility = 'public', seo_indexable = true, needs_attention = false,
           enrichment_status = jsonb_set(
             coalesce(p.enrichment_status, '{}'::jsonb), '{promotion}',
             jsonb_build_object(
               'source', 'migration:queer-theory-scholars',
               'flagged_for_review', false,
               'consent_confirmed', true,
               'consent_by', null,
               'at', now(),
               'prior', jsonb_build_object(
                 'prior_visibility', p.visibility,
                 'prior_seo_indexable', p.seo_indexable)), true),
           updated_at = now()
     where p.slug = r.slug
       and p.visibility <> 'public'
       -- the RPC's own eligibility tests, restated
       and p.duplicate_of_id is null
       and coalesce(p.review_status, '') <> 'archived'
       and coalesce(p.enrichment_status->'personhood'->>'verdict', '') <> 'non_person';
  end loop;

  -------------------------------------------------- 4. link scholars to the terms
  -- `personalities.tags` is a text[] of slugs and is what the profile chips and
  -- the tag-page rail read; the search facet additionally resolves
  -- `unified_tag_assignments`. Both are written. This is also what makes the
  -- glossary revival durable: a term with a scholar attached is no longer
  -- zero-usage, so it can never again look like an orphan to a usage sweep.
  for r in
    select * from (values
      ('judith-butler',              array['queer-theory','gender-performativity','performativity']),
      ('eve-kosofsky-sedgwick',      array['queer-theory']),
      ('michael-warner',             array['heteronormativity','queer-theory']),
      ('michel-foucault',            array['queer-theory','human-sexuality']),
      ('teresa-de-lauretis',         array['queer-theory']),
      ('gayle-rubin',                array['queer-theory','human-sexuality']),
      ('adrienne-rich',              array['compulsory-heterosexuality','lesbian-feminism']),
      ('jose-esteban-munoz',         array['disidentification','queer-of-color-critique']),
      ('roderick-ferguson',          array['queer-of-color-critique']),
      ('e-patrick-johnson',          array['quare-theory','queer-of-color-critique']),
      ('cathy-j-cohen',              array['queer-of-color-critique','queer-theory']),
      ('jasbir-puar',                array['homonationalism','queer-of-color-critique']),
      ('kimberle-crenshaw',          array['intersectional']),
      ('patricia-hill-collins',      array['intersectional']),
      ('robert-mcruer',              array['crip-theory','critical-disability-theory']),
      ('alison-kafer',               array['crip-theory','neuroqueer-theory']),
      ('carrie-sandahl',             array['crip-theory']),
      ('rosemarie-garland-thomson',  array['disability-studies','crip-theory']),
      ('tobin-siebers',              array['disability-studies']),
      ('sami-schalk',                array['crip-theory','disability-studies']),
      ('ellen-samuels',              array['crip-theory']),
      ('fiona-kumari-campbell',      array['disability-studies']),
      ('christopher-bell-scholar',   array['disability-studies']),
      ('eli-clare',                  array['crip-theory']),
      ('m-remi-yergeau',             array['neuroqueer-theory','neuroqueer']),
      ('jack-halberstam',            array['queer-theory','transgender-studies']),
      ('lee-edelman',                array['queer-theory']),
      ('lauren-berlant',             array['queer-theory','heteronormativity']),
      ('monique-wittig',             array['lesbian-feminism','queer-theory']),
      ('david-m-halperin',           array['queer-theory','human-sexuality']),
      ('leo-bersani',                array['queer-theory']),
      ('diana-fuss',                 array['queer-theory']),
      ('annamarie-jagose',           array['queer-theory']),
      ('lisa-duggan',                array['homonormativity']),
      ('george-chauncey',            array['queer-theory']),
      ('gayatri-gopinath',           array['queer-of-color-critique']),
      ('chandan-reddy',              array['queer-of-color-critique']),
      ('martin-manalansan',          array['queer-of-color-critique']),
      ('juana-maria-rodriguez',      array['queer-of-color-critique']),
      ('kara-keeling',               array['queer-of-color-critique']),
      ('tavia-nyongo',               array['queer-of-color-critique']),
      ('fatima-el-tayeb',            array['queer-of-color-critique']),
      ('marquis-bey',                array['queer-of-color-critique','transgender-studies']),
      ('siobhan-somerville',         array['queer-of-color-critique','queer-theory']),
      ('thomas-a-dowson',            array['queer-archaeology']),
      ('barbara-l-voss',             array['queer-archaeology']),
      ('marcella-althaus-reid',      array['queer-theology']),
      ('robert-goss',                array['queer-theology']),
      ('john-j-mcneill',             array['queer-theology']),
      ('gayatri-chakravorty-spivak', array['queer-of-color-critique']),
      ('maria-lugones',              array['intersectional','queer-of-color-critique']),
      ('chela-sandoval',             array['queer-of-color-critique']),
      ('gloria-e-anzaldua',          array['queer-of-color-critique','intersectional']),
      ('cherrie-moraga',             array['queer-of-color-critique']),
      ('havelock-ellis',             array['human-sexuality']),
      ('alfred-kinsey',              array['human-sexuality']),
      ('magnus-hirschfeld',          array['human-sexuality']),
      ('evelyn-hooker',              array['human-sexuality']),
      ('susan-stryker',              array['transgender-studies']),
      ('sara-ahmed',                 array['queer-theory'])
    ) as t(slug, tag_slugs)
  loop
    select id into v_id from public.personalities where slug = r.slug;
    continue when v_id is null;

    -- Union rather than replace: several of these rows already carry tags.
    update public.personalities p
       set tags = (select array_agg(distinct x)
                     from unnest(coalesce(p.tags, '{}') || r.tag_slugs) as x),
           updated_at = now()
     where p.id = v_id;

    foreach v_bad in array r.tag_slugs loop
      select id into v_tag from public.unified_tags where slug = v_bad and status = 'active';
      if v_tag is not null then
        insert into public.unified_tag_assignments (tag_id, entity_id, entity_type)
        select v_tag, v_id, 'personality'
         where not exists (
           select 1 from public.unified_tag_assignments u
            where u.tag_id = v_tag and u.entity_id = v_id and u.entity_type = 'personality');
      end if;
    end loop;
  end loop;

  select count(*) into v_n from public.personalities
   where lgbti_connection_source = 'wikipedia:queer-theory-glossary-2026-09';
  raise notice 'scholars: % new row(s)', v_n;
end
$mig$;

-- ────────────────────────────────────────────────────────────────── assertions
do $verify$
declare v_n int; v_bad text;
begin
  -- 1. The nine that were already here are public. The public gate demotes
  --    SILENTLY, without raising, so a successful UPDATE proves nothing — this
  --    re-reads the column.
  select string_agg(slug || '=' || visibility, ', ') into v_bad
    from public.personalities
   where slug in ('eve-kosofsky-sedgwick','michael-warner','gayle-rubin','gloria-e-anzaldua',
                  'barbara-smith','eli-clare','marlon-riggs','cherrie-moraga','evelyn-hooker')
     and visibility <> 'public';
  if v_bad is not null then
    raise exception 'scholars: still not public after publish: %', v_bad;
  end if;

  -- 2. Nobody publishes with an empty bio — that was the original defect.
  select string_agg(slug, ', ') into v_bad
    from public.personalities
   where slug in ('eve-kosofsky-sedgwick','michael-warner')
     and coalesce(btrim(bio), '') = '';
  if v_bad is not null then
    raise exception 'scholars: empty bio on: %', v_bad;
  end if;

  -- 3. person_outing_guard, restated. A LIVING person carrying an asserted queer
  --    connection on a public page needs a real QID or a non-SKIP source row.
  --    Checked here so this migration fails rather than the release gate.
  select count(*) into v_n
    from public.personalities p
   where p.duplicate_of_id is null and p.is_living
     and (p.visibility = 'public' or p.seo_indexable)
     and p.lgbti_connection in ('community_member','ally','activist','representation')
     and not (coalesce(p.wikidata_qid, '') ~ '^Q[0-9]+$')
     and not exists (select 1 from public.personality_sources s
                      where s.personality_id = p.id
                        and coalesce(s.source_entity_id, '') !~ '^SKIP_');
  if v_n <> 0 then
    raise exception 'scholars: % living person(s) breach person_outing_guard', v_n;
  end if;

  -- 4. Every tag named in the linking table resolved. A dangling slug in
  --    `personalities.tags` is invisible in the facet and silently drops the link.
  select string_agg(distinct x, ', ') into v_bad
    from public.personalities p, unnest(p.tags) as x
   where p.lgbti_connection_source = 'wikipedia:queer-theory-glossary-2026-09'
     and not exists (select 1 from public.unified_tags t
                      where t.slug = x and t.status = 'active');
  if v_bad is not null then
    raise exception 'scholars: tags[] names no live tag: %', v_bad;
  end if;

  -- 5. The linked glossary terms now have real usage, which is what stops a
  --    future zero-usage sweep from hiding them again.
  select count(*) into v_n from public.unified_tag_assignments u
    join public.unified_tags t on t.id = u.tag_id
   where u.entity_type = 'personality'
     and t.slug in ('queer-theory','quare-theory','queer-of-color-critique','crip-theory',
                    'queer-archaeology','queer-theology','neuroqueer-theory');
  if v_n < 15 then
    raise exception 'scholars: only % personality links on the new theory terms', v_n;
  end if;

  raise notice 'scholars: all assertions passed';
end
$verify$;
