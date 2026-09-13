// Queer-theory glossary + scholars: the reviewable source of record.
//
// WHAT THIS FILE IS. Every definition and every bio below was hand-written from
// the eleven English Wikipedia articles named in SOURCES, in the house voice of
// `supabase/functions/_shared/tag-style.ts` (TAG_STYLE_SYSTEM). No generator
// wrote any of it. That matters here specifically: the 2026-08-29 prose pass was
// measured at ~19% precision on this same table and had to be restored
// byte-exact from `tag_change_log`, so glossary prose does not go through a
// model on this codebase.
//
// WHAT THE COMPARISON ACTUALLY FOUND. Not "terms are missing" — most of this
// vocabulary already existed, with prose, and was hidden. Two one-shot sweeps
// (`data-quality audit 2026-06-05`, n=3346; `deprecate_unused_tags` 2026-07-24,
// n=547) deprecated tags for having zero ENTITY assignments. That rule is right
// for scrape residue and wrong for a glossary: no venue is ever tagged
// "homonationalism". `search_documents_index_tags` filters `deprecated_at is
// null`, so all of them are out of search and their pages soft-404.
//
// EVERY QID HERE WAS RESOLVED FROM THE LIVE APIS, NOT FROM MEMORY, and four
// came back wrong or unusable. Recorded per row in `qidNote`. The general rule
// this repo already pays for: prefer NULL to a guess, because
// `tag_medical_codes_sync` and `tag_wikidata_hierarchy` rebuild from this
// identifier weekly, so a plausible-but-wrong QID regenerates wrong data
// forever while a null one regenerates nothing.

export const SOURCES = {
  'queer-theory': 'https://en.wikipedia.org/wiki/Queer_theory',
  heteronormativity: 'https://en.wikipedia.org/wiki/Heteronormativity',
  'human-sexuality': 'https://en.wikipedia.org/wiki/Human_sexuality',
  queer: 'https://en.wikipedia.org/wiki/Queer',
  'disability-studies': 'https://en.wikipedia.org/wiki/Disability_studies',
  intersectionality: 'https://en.wikipedia.org/wiki/Intersectionality',
  'queer-of-color-critique': 'https://en.wikipedia.org/wiki/Queer_of_color_critique',
  'queer-archaeology': 'https://en.wikipedia.org/wiki/Queer_archaeology',
  'queer-theology': 'https://en.wikipedia.org/wiki/Queer_theology',
  'quare-theory': 'https://en.wikipedia.org/wiki/Quare_theory',
  'neuroqueer-theory': 'https://en.wikipedia.org/wiki/Neuroqueer_theory',
}

export const CATEGORY = {
  slug: 'theory-scholarship',
  name: 'Theory & Scholarship',
  parentSlug: 'history-rights',
  description:
    'Academic frameworks that analyse gender, sexuality and power — queer theory and the '
    + 'fields that grew from, alongside and against it.',
  // Deliberately NOT added to SENSE_CATEGORY_KEYS in tag-style.ts. A sense
  // category means "the generic English sense is evidence of the WRONG
  // subject". For theory terms the scholarly sense IS the subject, so the
  // generic-sense gate would refuse correct grounding — the opposite of
  // Fetishes/Gear/Positions.
  isSenseCategory: false,
}

// ---------------------------------------------------------------------------
// IDENTITY REPAIRS — live wrong-entity links found while resolving QIDs.
// ---------------------------------------------------------------------------
export const IDENTITY_REPAIRS = [
  {
    slug: 'queerness',
    clearWikidata: 'Q658022',
    reason:
      'Q658022 is "queer theory". Queerness is not queer theory, and this row\'s own '
      + 'description is about queerness. Live on an indexable page with usage_count 55. '
      + 'Cleared rather than repointed: Wikidata has Q51415 for "queer" but no item for '
      + '"queerness" as such, and a near-miss is the failure this rule exists to stop.',
  },
  {
    slug: 'queerness',
    dropAliasSlug: 'queer-theory',
    reason:
      'Same root cause as the QID. `tag_aliases` carries alias_name "Queer-Theory", '
      + 'alias_type=multilingual, review_status=auto — a sitelink artefact harvested off the '
      + 'wrong entity, not a curated routing decision. It has no `search_synonyms` row, so no '
      + 'FK has to be cleared first. It must go regardless of the QID: `tag_reject_alias_shadow` '
      + 'RAISEs when a tag becomes active while another tag holds its slug as an alias, so '
      + 'reviving `queer-theory` is impossible while this row exists.',
  },
  {
    slug: 'disidentification',
    clearWikidata: 'Q5252408',
    reason:
      'Q5252408 is "deidentification", a psychological process (enwiki: Deidentification '
      + '(psychology)). Muñoz\'s disidentification is a queer-of-colour performance concept and '
      + 'has no Wikipedia article — the title "Disidentification" redirects to De-identification, '
      + 'a data-privacy topic. Nothing correct to point at, so NULL and no wikipedia_url.',
  },
]

// `genre-queer-theory` is an `entity_kind='attribute'` marketplace-facet clone of
// `queer-theory`: same QID, same name, near-identical prose, usage 0, already
// deindexed. Two active rows named "Queer Theory" would also push
// `duplicate_active_name` past its 14-row ratchet in check-tag-hygiene.mjs.
export const MERGES = [
  { loserSlug: 'genre-queer-theory', winnerSlug: 'queer-theory' },
]

// ---------------------------------------------------------------------------
// REVIVE — rows that already carry prose and were hidden on usage, not on merit.
// `descriptionRewrite` is set only where the existing description is too thin to
// publish; `tag_has_prose` reads description/short_description and ignores
// long_description, and `indexable_without_description = 0` is a hard ratchet.
// ---------------------------------------------------------------------------
export const REVIVE = [
  {
    slug: 'queer-theory',
    name: 'Queer Theory',
    wikidata: 'Q658022',
    source: 'queer-theory',
    blockedBy: ['queerness alias', 'genre-queer-theory merge'],
  },
  { slug: 'homonormativity', name: 'Homonormativity', wikidata: 'Q5770369', source: 'heteronormativity' },
  { slug: 'homonationalism', name: 'Homonationalism', wikidata: 'Q22809895', source: 'queer' },
  {
    slug: 'performativity',
    name: 'Performativity',
    wikidata: 'Q3627138',
    source: 'queer-theory',
    qidNote:
      'Q3627138 is Austin\'s speech-act performativity — "a linguistic quality, when a sentence '
      + 'is also an action". That is the correct parent concept for this row, which is named '
      + '"Performativity" and not "Gender performativity". Verified, kept.',
    descriptionRewrite:
      'The idea that saying something can be doing something — that certain utterances perform '
      + 'the act they name rather than describe it. J. L. Austin set it out for speech acts; '
      + 'Judith Butler carried it into gender, arguing that gender is produced by repeated acts '
      + 'rather than expressed by a prior identity. Distinct from performance: performativity is '
      + 'not a role someone chooses to play.',
  },
  {
    slug: 'gender-performativity',
    name: 'Gender Performativity',
    wikidata: 'Q3656582',
    source: 'queer-theory',
    qidNote:
      'Q3656582 is "gender performativity — term used by feminist philosopher Judith Butler", '
      + 'enwiki "Gender performativity". Checked because the plain Wikipedia title lookup '
      + 'redirects elsewhere; the item itself is correct. Kept.',
  },
  {
    slug: 'cisnormativity',
    name: 'Cisnormativity',
    wikidata: 'Q123689471',
    fillWikidata: true,
    source: 'heteronormativity',
    qidNote:
      'Row currently holds NULL. Q123689471 ("assumption that everyone is or ought to be '
      + 'cisgender") now exists with an enwiki article; label agrees exactly. Filled.',
  },
  {
    slug: 'disidentification',
    name: 'Disidentification',
    wikidata: null,
    source: 'queer-of-color-critique',
    qidNote: 'See IDENTITY_REPAIRS — the stored Q5252408 is a psychology concept. Cleared to NULL.',
  },
  {
    slug: 'lesbian-feminism',
    name: 'Lesbian Feminism',
    wikidata: 'Q18299',
    source: 'queer-theory',
    descriptionRewrite:
      'A feminist current, strongest from the 1970s, that treated lesbianism as a political '
      + 'position and not only a sexuality, and read heterosexuality as an institution that '
      + 'organises women\'s subordination. Adrienne Rich\'s "Compulsory Heterosexuality and '
      + 'Lesbian Existence" (1980) is its best-known statement. Queer theory later broke with '
      + 'parts of it, particularly its treatment of gender as fixed.',
  },
  { slug: 'queer-ecology', name: 'Queer Ecology', wikidata: 'Q60749582', source: 'queer' },
  { slug: 'queer-pedagogy', name: 'Queer Pedagogy', wikidata: 'Q7271162', source: 'queer' },
  {
    slug: 'social-construction-of-gender',
    name: 'Social Construction of Gender',
    wikidata: 'Q7551016',
    source: 'queer-theory',
    renameTo: 'Social Construction of Gender', // stored as "Social Construction Of Gender"
  },
]

// DELIBERATELY NOT REVIVED. `queer-people-of-color` is deprecated AND its slug is
// held as an `approved`, human-reviewed `synonym` alias of the active tag `qpoc`,
// which carries a proper description and a live `search_synonyms` row. That is a
// deliberate routing decision, not a sweep artefact. Reviving it would RAISE on
// `tag_reject_alias_shadow` and would also undo a curator's merge. `qpoc` is
// enriched instead — see ENRICH.
export const NOT_REVIVED = [
  {
    slug: 'queer-people-of-color',
    reason: 'correctly merged into `qpoc` by an approved synonym alias; enrich qpoc instead',
  },
]

// ---------------------------------------------------------------------------
// COHORT_REVIVE — the wider theory backlog, narrowed then hand-read.
//
// scripts/data-quality/classify-theory-cohort.mjs took the 367 deprecated rows
// that carry >=200 chars of prose, a QID and no human decision, and kept the 22
// whose Wikidata class is a theory / field of study / academic discipline /
// ideology. Every one of those 22 was then read by hand; decisions and reasons
// are in out/theory-cohort-review.json. 6 accepted here, 3 were already in
// REVIVE above, 13 rejected.
//
// TWO OF THE REJECTIONS ARE THE POINT OF THE HAND-READ. `performative-allyship`
// and `transmedicalism` both matched the class filter cleanly and both carry
// PROSE THAT IS BROKEN — the first has words missing mid-sentence, the second
// stops dead at "...gender dysphoria is". A class-based rule cannot see that,
// and publishing either would have put visibly damaged text on a live page.
// ---------------------------------------------------------------------------
export const COHORT_REVIVE = [
  { slug: 'asexual-studies', name: 'Asexual Studies', wikidata: 'Q110512905', category: 'theory-scholarship' },
  { slug: 'ecofeminism', name: 'Ecofeminism', wikidata: 'Q294949', category: 'theory-scholarship' },
  {
    slug: 'gender-theory',
    name: 'Gender Theory',
    wikidata: null,
    clearWikidata: 'Q1662673',
    category: 'theory-scholarship',
    qidNote:
      'Q1662673 is "gender studies", a different subject, and it fails titleAgrees(): normalised '
      + '"gendertheory" vs "genderstudies" shares a 6-char prefix (ratio 0.46, needs >=0.6) and '
      + 'scores 0.54 on levenshtein (needs >=0.75). Revived with NULL rather than a near-miss.',
  },
  { slug: 'homophile', name: 'Homophile', wikidata: 'Q5891541', category: 'history-rights' },
  { slug: 'queer-musicology', name: 'Queer Musicology', wikidata: 'Q110257133', category: 'theory-scholarship' },
  { slug: 'sex-positivity', name: 'Sex Positivity', wikidata: 'Q77033868', category: 'sex-kink' },
]

// ---------------------------------------------------------------------------
// CREATE — genuinely absent from the corpus in any status.
// ---------------------------------------------------------------------------
export const CREATE = [
  {
    slug: 'quare-theory',
    name: 'Quare Theory',
    wikidata: 'Q130755470',
    source: 'quare-theory',
    shortDescription: 'Queer theory rebuilt around the knowledge of queer people of colour.',
    description:
      'A counter-theory to queer theory centred on the racialised bodies, experiences and '
      + 'knowledge of queer people of colour. E. Patrick Johnson set it out in 2001 in "\'Quare\' '
      + 'Studies, or (Almost) Everything I Know About Queer Studies I Learned from My '
      + 'Grandmother", taking the word from his grandmother\'s pronunciation of "queer". It '
      + 'draws on performance studies and oral history, and treats race and class as '
      + 'inseparable from sexuality rather than as additions to it.',
    longDescription:
      'Quare theory reads the gap between queer theory\'s abstractions and the material lives of '
      + 'Black and other queer people of colour as the point, not an oversight. Johnson developed '
      + 'it alongside Mae G. Henderson in the anthology Black Queer Studies, and later with Ramón '
      + 'Rivera-Servera. Its method is grounded in performance — what people do, say and remember '
      + '— rather than in textual analysis alone, which is why oral history sits at its centre.',
    relations: [{ type: 'broader', target: 'queer-theory' }],
    aliases: [{ name: 'Quare Studies', type: 'synonym' }],
  },
  {
    slug: 'queer-of-color-critique',
    name: 'Queer of Color Critique',
    wikidata: 'Q16269351',
    source: 'queer-of-color-critique',
    shortDescription: 'Reads race, sexuality, gender and capitalism as one analysis.',
    description:
      'An analytical framework that centres race, gender, sexuality and class together, and '
      + 'reads mainstream gay rights politics through its entanglement with capitalism and '
      + 'liberalism. It emerged from a doctoral reading group at UC San Diego in 1999 and was '
      + 'named by Roderick A. Ferguson in Aberrations in Black: Toward a Queer of Color Critique '
      + '(2004), building on José Esteban Muñoz\'s Disidentifications (1999).',
    longDescription:
      'The critique holds that a politics organised around sexuality alone will reproduce the '
      + 'racial and economic order it does not examine — so it treats women-of-colour feminism, '
      + 'not liberal gay rights, as its inheritance. Its recurring objects are homonormativity, '
      + 'homonationalism, settler colonialism and diaspora. Scholars associated with it include '
      + 'Chandan Reddy, Gayatri Gopinath, Martin Manalansan, Juana María Rodríguez, Kara Keeling, '
      + 'Tavia Nyong\'o, Fatima El-Tayeb and Marquis Bey.',
    relations: [
      { type: 'broader', target: 'queer-theory' },
      { type: 'related', target: 'intersectional' },
    ],
  },
  {
    slug: 'queer-archaeology',
    name: 'Queer Archaeology',
    wikidata: 'Q108584195',
    source: 'queer-archaeology',
    shortDescription: 'Uses queer theory to read the past without assuming its norms.',
    description:
      'An approach to archaeology that uses queer theory to challenge normative — especially '
      + 'heteronormative — readings of the past. Thomas A. Dowson introduced it in 2000 in "Why '
      + 'Queer Archaeology? An Introduction". It does not set out to find homosexuality in the '
      + 'archaeological record; it questions the binary assumptions about sex, gender and kinship '
      + 'that interpretation smuggles in.',
    longDescription:
      'Chelsea Blackmore\'s "How to Queer the Past Without Sex" (2011) states the method plainly: '
      + 'the target is the interpretive frame, not a hunt for evidence of same-sex behaviour. '
      + 'Barbara L. Voss surveyed the wider field in "Sexuality Studies in Archaeology" (2008). '
      + 'It sits alongside feminist and gender archaeology and has been criticised for a '
      + 'Eurocentric frame of reference.',
    relations: [{ type: 'broader', target: 'queer-theory' }],
  },
  {
    slug: 'queer-theology',
    name: 'Queer Theology',
    wikidata: 'Q1563086',
    source: 'queer-theology',
    shortDescription: 'Theology done from queer lives and readings of sacred texts.',
    description:
      'A theological method developed out of queer theory that reads gender variance and '
      + 'non-heterosexual desire within faith traditions and sacred texts. It covers both theology '
      + 'written by and for LGBTQ+ people and a wider challenge to fixed norms of gender and '
      + 'sexuality in doctrine. Robert Goss\'s Jesus Acted Up (1994) and Marcella Althaus-Reid\'s '
      + 'Indecent Theology (2000) and The Queer God (2003) are among its founding works.',
    longDescription:
      'Earlier ground was laid by John J. McNeill\'s The Church and the Homosexual (1976) and '
      + 'J. Michael Clark\'s Theologizing Gay (1991). It draws on liberation theology\'s method — '
      + 'read from the position of the excluded — and on Foucault, Rubin, Sedgwick and Butler for '
      + 'its account of sexuality. Recurring themes are the imago Dei, affirming ministry, and '
      + 'sexual and gender justice.',
    relations: [{ type: 'broader', target: 'queer-theory' }],
  },
  {
    slug: 'neuroqueer-theory',
    name: 'Neuroqueer Theory',
    wikidata: 'Q135472429',
    source: 'neuroqueer-theory',
    shortDescription: 'Where neurodiversity and queer theory meet.',
    description:
      'A framework at the intersection of neurodiversity and queer theory. It examines how '
      + 'normalcy is constructed across gender, sexual orientation and disability at once, and '
      + 'refuses the pathologisation of neurodivergent people. Nick Walker coined "neuroqueer" in '
      + '2008; Athena Lynn Michaels-Dillon arrived at the term independently, and Remi Yergeau was '
      + 'working on related ground.',
    longDescription:
      'Its central move is to treat neuronormativity and heteronormativity as the same kind of '
      + 'demand — that there is one correct way to have a mind, a body and a desire. It takes the '
      + 'social model of disability as its starting point and reads neurodivergence as difference '
      + 'rather than deficit. Alison Kafer\'s work on crip futurity is a frequent reference point.',
    relations: [
      { type: 'broader', target: 'queer-theory' },
      { type: 'related', target: 'neuroqueer' },
    ],
  },
  {
    slug: 'crip-theory',
    name: 'Crip Theory',
    wikidata: null,
    qidNote:
      'REFUSED. "Crip theory" redirects to "Crip (disability term)" = Q65065690, "slang term '
      + 'referring to disabled people" — the reclaimed word, not the theory. It also fails '
      + 'titleAgrees() in tag-wiki-guard.ts: normalised "criptheory" vs "crip" gives a 4-char '
      + 'shorter side (the prefix arm needs >=5) and a levenshtein ratio of 0.4 (needs >=0.75). '
      + 'The guard is right, so this row carries no QID.',
    source: 'disability-studies',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Disability_studies#Critical_disability_theory',
    shortDescription: 'Reads disability and queerness as bound to the same norms.',
    description:
      'A framework that brings queer theory and disability studies together, reading compulsory '
      + 'able-bodiedness and compulsory heterosexuality as the same system of demands. Carrie '
      + 'Sandahl named the ground in 2003 with "Queering the Crip or Cripping the Queer?"; Robert '
      + 'McRuer developed it in Crip Theory: Cultural Signs of Queerness and Disability (2006). '
      + '"Crip" is a reclaimed slur, used deliberately, in the same way "queer" is.',
    longDescription:
      'Alison Kafer, Eli Clare, Ellen Samuels, Sami Schalk and Rosemarie Garland-Thomson have '
      + 'extended it, often against the assumption that disability is a problem awaiting a cure. '
      + 'It shares queer theory\'s suspicion of the normal and disability studies\' social model, '
      + 'and it insists that race, class and gender are not separable from either.',
    relations: [
      { type: 'broader', target: 'critical-disability-theory' },
      { type: 'related', target: 'queer-theory' },
    ],
    aliases: [{ name: 'Cripping', type: 'synonym' }],
  },
  {
    slug: 'critical-disability-theory',
    name: 'Critical Disability Theory',
    wikidata: null,
    qidNote:
      'No standalone Wikipedia article or Wikidata item — it is a section of Disability studies. '
      + 'wikipedia_url points at that section anchor; QID left NULL rather than borrowing '
      + 'Q627208 (disability studies), which is the parent field and a different subject.',
    source: 'disability-studies',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Disability_studies#Critical_disability_theory',
    shortDescription: 'Disability as a political and cultural construction, not a diagnosis.',
    description:
      'The meeting point of disability studies and critical theory: it analyses how disability is '
      + 'constructed socially, politically and culturally rather than treating it as a medical '
      + 'fact about an individual. It sets the social model of disability against the medical '
      + 'model and takes ableism as a structure to be described, not a personal attitude.',
    relations: [{ type: 'broader', target: 'disability-studies' }],
  },
  {
    slug: 'disability-studies',
    name: 'Disability Studies',
    wikidata: 'Q627208',
    source: 'disability-studies',
    shortDescription: 'The academic field that studies disability as a social position.',
    description:
      'An academic field that studies disability as a social, cultural and political position '
      + 'rather than only a medical condition. Its founding distinction is between the medical '
      + 'model, which locates the problem in the body, and the social model, which locates it in '
      + 'a world built for some bodies and not others. Crip theory and critical disability theory '
      + 'grew out of it.',
  },
  {
    slug: 'compulsory-heterosexuality',
    name: 'Compulsory Heterosexuality',
    wikidata: 'Q11794989',
    source: 'heteronormativity',
    shortDescription: 'Heterosexuality as an institution women are pressed into.',
    description:
      'The argument that heterosexuality is not a natural inclination but an institution '
      + 'maintained by social pressure, and that it works to keep women available to men. '
      + 'Adrienne Rich set it out in "Compulsory Heterosexuality and Lesbian Existence" (1980), '
      + 'alongside her idea of a lesbian continuum. It is a direct ancestor of heteronormativity.',
    relations: [{ type: 'related', target: 'heteronormativity' }],
    aliases: [{ name: 'Comphet', type: 'synonym' }],
  },
  {
    slug: 'human-sexuality',
    name: 'Human Sexuality',
    wikidata: 'Q154136',
    source: 'human-sexuality',
    shortDescription: 'How people experience and express themselves sexually.',
    description:
      'The ways people experience and express themselves sexually — biological, psychological, '
      + 'physical, erotic, emotional, social and spiritual at once. It has no single settled '
      + 'definition, because what counts as sexual has varied sharply across periods and '
      + 'cultures. Alfred Kinsey, William Masters and Virginia Johnson, Havelock Ellis, Magnus '
      + 'Hirschfeld and Evelyn Hooker shaped its modern study.',
  },
  {
    slug: 'transgender-studies',
    name: 'Transgender Studies',
    wikidata: 'Q17014367',
    source: 'queer',
    shortDescription: 'The academic field centred on trans lives and knowledge.',
    description:
      'An academic field that studies transgender people, histories and knowledge on their own '
      + 'terms rather than as a subtopic of sexuality. It grew alongside queer theory in the '
      + '1990s and has often argued with it, particularly where queer theory treated gender as '
      + 'primarily figurative. Susan Stryker is among its founding editors and historians.',
    relations: [{ type: 'related', target: 'queer-theory' }],
  },
]

// ---------------------------------------------------------------------------
// ENRICH — active rows that are correct but thin, misfiled, or unlinked.
// ---------------------------------------------------------------------------
export const ENRICH = [
  {
    slug: 'queer',
    fillWikidata: 'Q51415',
    qidNote:
      'Q51415 "queer — umbrella term for sexual and gender minorities". Exact label agreement, '
      + 'plausible class. The single most-used tag on the site (usage_count 12,386) and it '
      + 'carried a 42-character description and no Wikidata link at all.',
    descriptionRewrite:
      'An umbrella term for sexual and gender minorities who are not heterosexual or not '
      + 'cisgender, and a deliberate refusal of fixed categories. It entered English in the 16th '
      + 'century meaning strange or odd, was used as a slur for sexual deviance from the 1890s, '
      + 'and was reclaimed from the 1980s during the AIDS crisis — Queer Nation formed in March '
      + '1990. Some people still hear it as the slur it was; others use it precisely because it '
      + 'refuses to settle.',
    keepCategory: true, // Orientation is correct for the identity term
  },
  {
    slug: 'intersectional',
    refile: true,
    fillWikidata: null, // already Q1516555, correct
    descriptionRewrite:
      'An analytical framework for how overlapping identities — race, gender, sexuality, class, '
      + 'caste, disability, age and more — produce distinct combinations of discrimination and '
      + 'privilege that cannot be understood one axis at a time. Kimberlé Crenshaw coined the '
      + 'term in 1989 in "Demarginalizing the Intersection of Race and Sex", building on Black '
      + 'feminist work including the Combahee River Collective\'s account of simultaneity (1977) '
      + 'and Patricia Hill Collins\'s matrix of domination.',
    aliases: [{ name: 'Intersectionality', type: 'synonym' }],
    note:
      'The noun `intersectionality` was merged into this adjective row by '
      + 'migration:20261011090000 (alias-shadow-repair). The merge is legitimate — same concept, '
      + 'same QID Q1516555 — so it is left standing rather than unpicked; what was missing is '
      + 'that the canonical academic form was not reachable as a synonym.',
  },
  {
    slug: 'queer-studies',
    renameTo: 'Queer Studies',
    refile: true,
    note:
      'Stored name is "Queer-Studies" — a scraped hyphenated string, not authored vocabulary. '
      + 'QID Q98929208 is correct and kept. Filed under "Community Life & Support"; it is a field '
      + 'of study.',
  },
  {
    slug: 'qpoc',
    refile: false, // Umbrella Terms & Labels is right for an identity term
    note:
      'Receives the `queer-people-of-color` traffic via its approved synonym alias. Left in '
      + 'Umbrella Terms & Labels: it names a position people occupy, not a theory.',
  },
  {
    slug: 'heteronormativity',
    refile: true,
    descriptionRewrite:
      'The establishment of heterosexuality as the normal or default human sexuality, together '
      + 'with the assumption of a gender binary and of opposite-sex partnership as the fitting '
      + 'form of sexual and marital life. Michael Warner popularised the term in 1991 in '
      + '"Introduction: Fear of a Queer Planet". It names a structure built into institutions, '
      + 'law and everyday expectation, not individual prejudice — that is heterosexism.',
  },
  { slug: 'neuroqueer', refile: true },
]

export const REFILE = [
  'queer-theory', 'quare-theory', 'queer-of-color-critique', 'queer-archaeology',
  'queer-theology', 'crip-theory', 'critical-disability-theory', 'disability-studies',
  'neuroqueer-theory', 'performativity', 'gender-performativity', 'homonormativity',
  'homonationalism', 'cisnormativity', 'heteronormativity', 'disidentification',
  'social-construction-of-gender', 'queer-ecology', 'queer-pedagogy', 'intersectional',
  'compulsory-heterosexuality', 'human-sexuality', 'transgender-studies', 'queer-studies',
  'lesbian-feminism', 'neuroqueer',
]
