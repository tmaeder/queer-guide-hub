# Duplicate-`wikidata_id` in `unified_tags` — per-group decisions

Measured 2026-09-04 with the **postgres** role (Management API), so non-active rows are visible.
89 QID groups / 188 active tags / 87 with an indexable member — reproduces the brief exactly
(QID digest `63b8c704ae5a8431b9421d601dee77a1`). 213 total members: 188 active, 17 deprecated, 8 merged.

**`disposition` is hand-authored per group from the Wikidata label + the rows' own prose. Nothing here is rule-derived.**


## MERGE — genuine duplicates (27 groups, 28 losing slugs)

### `Q1035954` — Wikidata says **"heterosexuality"**
> romantic and/or sexual attraction or behavior between people of different genders

- `heterosexual` u=15 [I-] concept / Orientation **← WINNER**
- `straight` u=2 [I-] concept / Orientation ← merge away
- _heterosexuality (deprecated)_

**Reason:** "straight" is the colloquial synonym.

### `Q11424` — Wikidata says **"film"**
> visual art work that simulates experiences and communicates ideas, stories, or emotions through moving images, generally synchronized with sound since the 1930s

- `film` u=2683 [I-] concept / Media & Entertainment **← WINNER**
- `movies` u=14 [I-] concept / Media & Entertainment ← merge away
- `cinema` u=13 [I-] concept / Media & Entertainment ← merge away
- _films (merged)_

**Reason:** QID label is "film"; movies/cinema are the same concept.

### `Q11707` — Wikidata says **"restaurant"**
> single establishment which prepares and serves food, located in building

- `restaurant` u=525 [I-] descriptor / Venue Types **← WINNER**
- `eateries` u=2 [I-] descriptor / Venue Types ← merge away
- _restaurant-venue (merged)_
- _restaurants (merged)_

**Reason:** QID label "restaurant"; "eateries" is a plural synonym.

### `Q1190983` — Wikidata says **"Japanese bondage"**
> Japanese style of bondage

- `shibari` u=3 [IA] concept / Practices & Play **← WINNER**
- `japanese-bondage` u=0 [IA] concept / Practices & Play ← merge away
- _kinbaku (deprecated)_

**Reason:** QID label "Japanese bondage"; shibari is the reader-facing name.

### `Q1404482` — Wikidata says **"female dominance"**
> BDSM erotic practice

- `female-dominance` u=0 [IA] concept / Dynamics & Roles **← WINNER**
- `femdom` u=0 [-A] concept / Dynamics & Roles ← merge away

**Reason:** QID label matches; femdom is the community abbreviation.

### `Q17625913` — Wikidata says **"LGBTQ rights"**
> civil rights of LGBTQ people

- `lgbtqia-rights` u=3143 [I-] concept / Laws & Legal Rights **← WINNER**
- `queer-rights` u=8 [I-] concept / Laws & Legal Rights ← merge away
- _lesbian-rights (deprecated)_
- _lgbt-rights (deprecated)_

**Reason:** Same concept; matches the RIGHT_TOPICS umbrella already used.

### `Q17897` — Wikidata says **"LGBTQ history"**
> history of LGBTQ people and cultures

- `queer-history` u=19 [I-] concept / History & Rights **← WINNER**
- `lgbt-history` u=2 [I-] concept / Movements & Milestones ← merge away

**Reason:** Acronym variant of one concept.

### `Q20746702` — Wikidata says **"stepbrother"**
> male stepsibling

- `step-brother` u=0 [-A] concept / Fetishes ← merge away
- `stepbrother` u=0 [IA] concept / Fetishes **← WINNER**

**Reason:** Hyphenation variant; QID label "stepbrother".

### `Q210749` — Wikidata says **"anilingus"**
> erotic stimulation via contact between mouth and anus

- `rimming` u=1 [IA] concept / Practices & Play **← WINNER**
- `analingus` u=0 [IA] concept / Fetishes ← merge away

**Reason:** QID label "anilingus"; rimming is the reader-facing name.

### `Q2599391` — Wikidata says **"muscle worship"**
> form of body worship

- `muscle-worship` u=0 [IA] concept / Fetishes **← WINNER**
- `sthenolagnia` u=0 [IA] concept / Practices & Play ← merge away

**Reason:** QID label matches; sthenolagnia is the clinical synonym.

### `Q2823834` — Wikidata says **"medroxyprogesterone acetate"**
> injectible form of birth control

- `medroxyprogesterone-acetate` u=0 [I-] concept / Sexual Health **← WINNER**
- `provera` u=0 [I-] descriptor / Events & Parties ← merge away

**Reason:** Brand (Provera) vs generic. NOTE: provera is misfiled under Events & Parties.

### `Q2880760` — Wikidata says **"heteroflexibility"**
> a form of a sexual orientation or situational sexual behavior characterized by minimal homosexual activity in an otherwise primarily heterosexual orientation

- `heteroflexibility` u=1 [I-] concept / Orientation **← WINNER**
- `heteroflexible` u=0 [I-] concept / Orientation ← merge away

**Reason:** Noun/adjective of one term.

### `Q30022` — Wikidata says **"café"**
> establishment that serves coffee and tea

- `cafe` u=334 [I-] descriptor / Venue Types **← WINNER**
- `coffee-shop` u=272 [I-] descriptor / Venue Types ← merge away
- _caf (merged)_

**Reason:** QID label "cafe"; coffee-shop is the same venue type.

### `Q337084` — Wikidata says **"drag queen"**
> drag artist who dresses and acts with exaggerated femininity for performance purposes

- `drag-queen` u=101 [I-] concept / Drag & Performance **← WINNER**
- `dragqueen` u=0 [I-] concept / Expression & Style ← merge away

**Reason:** Spacing variant.

### `Q392963` — Wikidata says **"ageplay"**
> form of roleplaying in which an individual acts or treats another as if they were a different age

- `age-play` u=2 [IA] concept / Practices & Play **← WINNER**
- `ageplay` u=1 [IA] concept / Fetishes ← merge away

**Reason:** Hyphenation variant.

### `Q422244` — Wikidata says **"fluoxetine"**
> selective serotonin reuptake inhibitor invented by Eli Lilly and Company in 1972

- `fluoxetine` u=0 [I-] concept / Substances & Recovery **← WINNER**
- `prozac` u=0 [I-] concept / Substances & Recovery ← merge away

**Reason:** Brand (Prozac) vs generic; QID is the compound.

### `Q424965` — Wikidata says **"dapoxetine"**
> chemical compound

- `dapoxetine` u=0 [I-] concept / Substances & Recovery **← WINNER**
- `priligy` u=0 [I-] concept / Substances & Recovery ← merge away

**Reason:** Brand (Priligy) vs generic.

### `Q505371` — Wikidata says **"agender"**
> absence of a gender identity

- `agender` u=1 [I-] concept / Gender **← WINNER**
- `genderless` u=1 [I-] concept / Orientation ← merge away

**Reason:** QID label "agender"; genderless is the synonym. Cross-category (Gender vs Orientation) - winner is the correctly-filed row.

### `Q51389` — Wikidata says **"LGBTQ+ culture"**
> common culture shared by lesbian, gay, bisexual, transgender and queer people

- `lgbtq-culture` u=55 [I-] descriptor / Events & Parties **← WINNER**
- `lgbt-culture` u=3 [I-] concept / Culture & Community ← merge away

**Reason:** Acronym variant.

### `Q51393` — Wikidata says **"LGBTQ community"**
> group of people that aren't cisgender and/or heterosexual

- `lgbtq-community` u=57 [I-] concept / Culture & Community **← WINNER**
- `lgbt-community` u=19 [I-] concept / Culture & Community ← merge away

**Reason:** Acronym variant, same category.

### `Q555097` — Wikidata says **"accessibility"**
> design approach that enables people to perceive, understand, and use digital or physical products

- `accessibility` u=1764 [I-] descriptor / Venue Features & Policies **← WINNER**
- `accessible` u=3 [I-] descriptor / Venue Features & Policies ← merge away

**Reason:** QID label "accessibility"; "accessible" is the adjective form.

### `Q622425` — Wikidata says **"nightclub"**
> entertainment venue which usually operates late into the night

- `nightclub` u=108 [I-] descriptor / Venue Types **← WINNER**
- `night-club` u=44 [I-] descriptor / Venue Types ← merge away

**Reason:** Hyphenation variant.

### `Q661717` — Wikidata says **"gay-friendly"**
> said of someone or something that promotes a respectful environment for LGBTI people

- `lgbtq-friendly` u=2832 [I-] descriptor / Venue Features & Policies **← WINNER**
- `lgbt-friendly` u=1415 [I-] descriptor / Venue Features & Policies ← merge away

**Reason:** Same descriptor, same category; "lgbt-" is the older spelling.

### `Q69488` — Wikidata says **"MDMA"**
> empathogen and stimulant

- `mdma` u=2 [I-] concept / Substances & Recovery **← WINNER**
- `ecstasy` u=0 [I-] concept / Substances & Recovery ← merge away

**Reason:** Street name / compound name for one substance.

### `Q8401` — Wikidata says **"fellatio"**
> oral sex by sucking on the penis

- `blowjob` u=0 [IA] concept / Practices & Play **← WINNER**
- `cocksucking` u=0 [IA] concept / Fetishes ← merge away
- _blow-jobs (deprecated)_

**Reason:** QID label "fellatio"; both members name the same act.

### `Q93929090` — Wikidata says **"prostate massager"**
- `prostate-massager` u=1 [-A] concept / Fetishes **← WINNER**
- `prostate-stimulator` u=0 [IA] concept / Practices & Play ← merge away

**Reason:** QID label "prostate massager"; stimulator is the same product.

### `Q93955709` — Wikidata says **"demigirl"**
> gender identity where a person identifies as only partly female

- `demigirl` u=0 [I-] concept / Gender **← WINNER**
- `demiwoman` u=0 [I-] concept / Gender ← merge away
- _demifemme (merged)_

**Reason:** QID label "demigirl"; demiwoman is the same identity.


## WRONG QID — not duplicates; retract the mis-linked slug (24 groups, 32 slugs)

### `Q10048327` — Wikidata says **"mutual masturbation"**
> sex act in which two or more people simultaneously stimulate their own genitalia or each other's

- `group-masturbation` u=0 [-A] concept / Fetishes **← RETRACT QID**
- `mutual-masturbation` u=0 [-A] concept / Practices & Play

**Reason:** group vs mutual masturbation are distinct.

### `Q1052281` — Wikidata says **"trans woman"**
> woman assigned male at birth

- `femminiello` u=0 [I-] concept / Gender **← RETRACT QID**
- `trans-woman` u=0 [I-] concept / Gender

**Reason:** HARM. Q1052281 is "trans woman". Femminiello is a specific Neapolitan cultural identity, not a synonym; merging erases it.

### `Q1063174` — Wikidata says **"nyotaimori"**
> serving sushi or sashimi on naked bodies

- `nantaimori` u=0 [-A] concept / Fetishes **← RETRACT QID**
- `nyotaimori` u=0 [IA] concept / Fetishes

**Reason:** nyotaimori (female body) vs nantaimori (male body) are distinct practices.

### `Q124822805` — Wikidata says **"iamvanosexuality"**
- `accipiosexual` u=0 [I-] concept / Orientation **← RETRACT QID**
- `iamvanosexual` u=0 [I-] concept / Orientation

**Reason:** Distinct micro-labels; the QID is iamvanosexuality.

### `Q127443415` — Wikidata says **"feeding"**
> fetishism of gaining weight.

- `feedee` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**
- `feedism` u=0 [-A] concept / Practices & Play

**Reason:** Role (feedee) vs practice (feedism) are distinct entries.

### `Q127630273` — Wikidata says **"pillow princess"**
- `pillow-princess` u=1 [I-] concept / Relationship Structures
- `pillow-prince` u=0 [-A] concept / Dynamics & Roles **← RETRACT QID**

**Reason:** Gendered counterpart, not a synonym.

### `Q1419997` — Wikidata says **"event producer"**
> person specializing in planning and execution of parties, events, exhibitions, meetings, conventions, weddings and other things

- `organizer` u=1 [I-] descriptor / Events & Parties
- `event-organizer` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**

**Reason:** "organizer" is an events descriptor; "event-organizer" is filed Dynamics & Roles/adult. Different senses.

### `Q178885` — Wikidata says **"deity"**
> natural or supernatural god or goddess, divine being

- `deity` u=0 [IA] concept / Dynamics & Roles
- `god` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**
- `goddess` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**

**Reason:** Q178885 is "deity". god/goddess are gendered honorifics; merging deletes one.

### `Q182832` — Wikidata says **"concert"**
> live performance of music

- `live-music` u=57 [I-] descriptor / Events & Parties
- `live-music-venue` u=2 [I-] descriptor / Venue Types **← RETRACT QID**

**Reason:** Q182832 is "concert" (an event). live-music-venue is a VENUE type.

### `Q190845` — Wikidata says **"BDSM"**
> erotic practices involving domination and sadomasochism

- `bdsm` u=123 [IA] concept / Dynamics & Roles
- `rough-sex` u=0 [IA] concept / Fetishes **← RETRACT QID**

**Reason:** Q190845 is BDSM (a subculture). rough-sex is not BDSM.

### `Q191808` — Wikidata says **"nun"**
> female member of a monastic order

- `nun` u=0 [IA] concept / Dynamics & Roles
- `sister` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**

**Reason:** Q191808 is "nun". "sister" is a distinct role/term in this corpus.

### `Q19810527` — Wikidata says **"sexual fluidity"**
> changes in sexuality or sexual identity

- `abrosexual` u=27 [I-] concept / Orientation **← RETRACT QID**
- `sexually-fluid` u=0 [I-] concept / Orientation
- _sexual-fluidity (deprecated)_

**Reason:** Q is "sexual fluidity"; abrosexual is its own label.

### `Q20011275` — Wikidata says **"sapiosexuality"**
> sexual attraction based primarily on intellect

- `noetisexual` u=0 [I-] concept / Orientation **← RETRACT QID**
- `sapiosexual` u=0 [I-] concept / Orientation
- _sapiosexuality (deprecated)_

**Reason:** Distinct label from sapiosexual.

### `Q2192288` — Wikidata says **"vulva"**
> external genital organs of the female mammal

- `cunt` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**
- `vulva` u=0 [I-] concept / Body & Reproductive Health
- _female-genitalia (deprecated)_
- _female-reproductive-organs (deprecated)_

**Reason:** Q2192288 is the anatomical "vulva". "cunt" is filed Dynamics & Roles / adult. Merging puts a reclaimed slur on an anatomy page or vice versa.

### `Q2211650` — Wikidata says **"sadomasochism"**
> term covering phenomena of giving or receiving of pleasure from acts involving the receipt (M) or infliction (S) of pain or humiliation

- `algolagnia` u=0 [IA] concept / Practices & Play **← RETRACT QID**
- `algophilia` u=0 [-A] concept / Fetishes **← RETRACT QID**
- `sadomasochism` u=0 [IA] concept / Dynamics & Roles

**Reason:** Q is "sadomasochism"; algolagnia/algophilia are distinct clinical terms.

### `Q2911974` — Wikidata says **"recreation room"**
> room used for a variety of purposes, such as parties, games and other everyday or casual use

- `play-room` u=0 [--] descriptor / Venue Types **← RETRACT QID**
- `rumpus-room` u=0 [I-] descriptor / Venue Types

**Reason:** Q2911974 is a domestic "recreation room". A play-room here is a sex-club space.

### `Q327018` — Wikidata says **"interrogation"**
> interviewing employed by law enforcement officers, military personnel, and intelligence agencies with the goal of eliciting useful information

- `questioning` u=1 [I-] concept / Umbrella Terms & Labels **← RETRACT QID**
- `interrogation` u=0 [IA] concept / Fetishes

**Reason:** HARM. Q327018 is law-enforcement INTERROGATION. "questioning" is the LGBTQ+ identity - a namesake collision, the exact 2026-08-29 class. Merging would publish the questioning identity as a kink fetish.

### `Q37226` — Wikidata says **"teacher"**
> person who helps others to acquire knowledge, competences or values

- `teacher` u=5 [IA] concept / Fetishes **← RETRACT QID**
- `educator` u=1 [I-] descriptor / Identity

**Reason:** Q37226 is the profession "teacher". "teacher" here is filed Fetishes/adult. Merging would carry is_adult onto "educator" - the recorded category-junction trap.

### `Q6581072` — Wikidata says **"female"**
> to be used in "sex or gender" (P21) to indicate that the human subject is a female or "semantic gender" (P10339) to indicate that a word refers to a female person

- `woman` u=2 [I-] concept / Orientation **← RETRACT QID**
- `female` u=1 [I-] concept / Orientation
- `lady` u=1 [IA] concept / Dynamics & Roles **← RETRACT QID**
- `girl` u=0 [I-] concept / Orientation **← RETRACT QID**

**Reason:** Q6581072 is the P21 value "female". "lady" is a kink honorific (Dynamics & Roles/adult), not a synonym for woman.

### `Q6581097` — Wikidata says **"male"**
> to be used in "sex or gender" (P21) to indicate that the human subject is a male or "semantic gender" (P10339) to indicate that a word refers to a male person

- `man` u=10 [I-] concept / Orientation **← RETRACT QID**
- `male` u=4 [I-] concept / Orientation
- `boy` u=0 [I-] concept / Orientation **← RETRACT QID**
- `masc` u=0 [I-] concept / Orientation **← RETRACT QID**

**Reason:** Q6581097 is the P21 sex-or-gender VALUE "male", not a glossary concept. boy/masc are distinct terms in this corpus.

### `Q7560` — Wikidata says **"mother"**
> female parent

- `mother` u=2 [I-] concept / Slang & Language
- `mommy` u=0 [IA] concept / Kink Community & Scenes **← RETRACT QID**

**Reason:** Q7560 is the kinship "mother". "mommy" is a kink honorific.

### `Q833304` — Wikidata says **"creampie"**
> ejaculation in and subsequent leakage of semen from anus or vagina

- `anal-creampie` u=0 [IA] concept / Fetishes **← RETRACT QID**
- `creampie` u=0 [-A] concept / Fetishes

**Reason:** anal vs vaginal - distinct entries.

### `Q8402` — Wikidata says **"cunnilingus"**
> oral sex on the vulva by a sexual partner

- `cunnilinguist` u=0 [-A] concept / Dynamics & Roles **← RETRACT QID**
- `eating-pussy` u=0 [IA] concept / Fetishes

**Reason:** Role (a person) vs the act. Not synonyms.

### `Q96188028` — Wikidata says **"panromantic"**
> romantic attraction towards person(s) of any, every, and all genders (panromanticism)

- `omniromantic` u=0 [I-] concept / Orientation **← RETRACT QID**
- `panromantic` u=0 [I-] concept / Orientation

**Reason:** omniromantic and panromantic are deliberately distinct labels.


## QID BELONGS TO NEITHER — retract both (2 groups, 4 slugs)

### `Q27303706` — Wikidata says **"anthropomorphic cat"**
> cat with human-like traits

- `catboy` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**
- `catgirl` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**

**Reason:** Q27303706 is "anthropomorphic cat". catboy and catgirl are gendered and distinct, and NEITHER is that QID. Both retract.

### `Q76903164` — Wikidata says **"submission"**
> act of putting forward an item for consideration for approval, consideration, marking etc.

- `offering` u=0 [IA] concept / Fetishes **← RETRACT QID**
- `submission` u=0 [IA] concept / Dynamics & Roles **← RETRACT QID**

**Reason:** Q76903164 is bureaucratic "submission" (putting an item forward for approval). Neither BDSM member belongs on it. Both retract.


## GENERIC-SENSE TWIN — one word, two real senses. No write. (4 groups)

### `Q11426` — Wikidata says **"metal"**
> element, compound, or alloy that is a good conductor of both electricity and heat

- `mat-metal` u=1377 [--] attribute / (unfiled)
- `metal` u=0 [I-] descriptor / Vibe & Crowd

**Reason:** VERIFIED FROM PROSE: mat-metal is the element ("lustrous, conducts electricity"); metal is a metal-RESTRAINTS fetish ("chains, cuffs, collars"). NOT the music genre - an earlier reading of mine said so and was wrong.

### `Q231250` — Wikidata says **"lace"**
> openwork fabric, patterned with open holes in the work, made by machine or by hand

- `mat-lace` u=1168 [I-] attribute / (unfiled)
- `lace` u=0 [I-] attribute / (unfiled)

**Reason:** VERIFIED FROM PROSE: mat-lace is the openwork textile; lace is a textile fetish in lingerie. Two real senses.

### `Q330262` — Wikidata says **"spandex"**
> elastic synthetic fiber

- `mat-spandex` u=3237 [I-] attribute / (unfiled)
- `spandex` u=1 [I-] attribute / (unfiled)

**Reason:** VERIFIED FROM PROSE: mat-spandex is the polyether-polyurea fiber; spandex is a fabric fetish ("second-skin sensation"). Two real senses.

### `Q658022` — Wikidata says **"queer theory"**
> a field of post-structuralist critical theory

- `queerness` u=55 [I-] concept / Umbrella Terms & Labels
- `genre-queer-theory` u=0 [I-] attribute / (unfiled)
- _queer-theory (deprecated)_

**Reason:** VERIFIED FROM PROSE: genre-queer-theory is the post-structuralist field; queerness is the umbrella identity term. Distinct concepts, not a duplicate. Left untouched rather than retracted - see notes.


## CROSS-VOCABULARY — real vocabulary boundary. No write. (2 groups)

### `Q309` — Wikidata says **"history"**
> past events and their documentation, studied through historiography, archaeology, and related disciplines

- `genre-history` u=753 [I-] attribute / (unfiled)
- `history` u=692 [I-] concept / Movements & Milestones

**Reason:** genre-history (genre vocabulary, attribute) vs history (topical concept).

### `Q349` — Wikidata says **"sport"**
> form of event or activity involving competition; series of activities that provides challenges for an individual or team/s of participants

- `news-sports` u=2500 [I-] descriptor / Sports & Recreation
- `sport` u=43 [--] descriptor / Sports & Recreation
- _sports (merged)_

**Reason:** news-sports is the news-taxonomy tag; sport is the general topical tag.


## NEEDS YOUR CALL — I will not pre-empt direction (30 groups)

### `Q1053501` — Wikidata says **"gender-affirming surgery"**
> surgical procedures to alter sexual characteristics to match identified gender

- `gender-affirming-surgery` u=27 [I-] concept / Gender
- `gender-affirmation` u=9 [I-] concept / Gender
- _gender-affirmation-surgery (deprecated)_
- _gender-confirmation-surgery (deprecated)_
- _gender-reassignment-surgery (deprecated)_

**Reason:** gender-affirming-surgery vs gender-affirmation: the latter is broader than surgery.

### `Q11460` — Wikidata says **"clothing"**
> covering worn on the body

- `clothing` u=6 [I-] concept / Expression & Style
- `apparel` u=3 [IA] concept / Gear

**Reason:** clothing vs apparel. apparel is filed Gear/ADULT - merging risks flipping is_adult onto clothing.

### `Q11639` — Wikidata says **"dance"**
> rhythmic movement of the body

- `dancing` u=71 [I-] concept / Expression & Style
- `dance` u=69 [I-] descriptor / Events & Parties

**Reason:** dance (Events descriptor) vs dancing (Expression concept) - activity vs event.

### `Q132071673` — Wikidata says **"triple penetration"**
> sex position in which a person is penetrated vaginally, anally and orally at the same time

- `air-tight` u=0 [-A] concept / Fetishes
- `triple-penetration` u=0 [-A] concept / Positions

**Reason:** air-tight vs triple-penetration: related, arguably not identical.

### `Q132241` — Wikidata says **"festival"**
> organized set of events or activities focused on a theme (cultural, religious or other) that recurs regularly (e.g. once a year) and lasts anywhere from several hours to weeks

- `festival` u=482 [I-] descriptor / Events & Parties
- `celebration` u=48 [I-] descriptor / Events & Parties
- _occ-festival (merged)_

**Reason:** festival vs celebration: celebration is broader.

### `Q1328245` — Wikidata says **"diaper fetishism"**
> sexual fetish in which a person feels a desire to wear or use diapers

- `adult-baby` u=0 [IA] concept / Dynamics & Roles
- `diaper-fetish` u=0 [-A] concept / Practices & Play
- `diaper-lover` u=0 [IA] concept / Fetishes
- `infantilism` u=0 [IA] concept / Fetishes

**Reason:** FOUR members (adult-baby, diaper-fetish, diaper-lover, infantilism) on "diaper fetishism". Role vs practice vs identity - needs itemising.

### `Q13411011` — Wikidata says **"sex-positive movement"**
> ideology which promotes and embraces open sexuality

- `sex-positive` u=52 [--] concept / Slang & Language
- `sex-positive-movement` u=0 [I-] concept / Politics & Activism

**Reason:** sex-positive (descriptor) vs sex-positive-movement (the ideology).

### `Q1639034` — Wikidata says **"strap-on dildo"**
> device used for sexual penetration or other sexual activity

- `strap-on` u=1 [-A] concept / Fetishes
- `dildo-harness` u=0 [IA] concept / Gear

**Reason:** strap-on vs dildo-harness: the toy vs the harness are arguably distinct products.

### `Q1651685` — Wikidata says **"shoe fetishism"**
> sexual interest or obsession with footwear

- `retifism` u=0 [IA] concept / Fetishes
- `shoe-fetish` u=0 [--] concept / Slang & Language

**Reason:** retifism (Fetishes) vs shoe-fetish (Slang & Language). Clinical vs colloquial, cross-category.

### `Q17888` — Wikidata says **"sexual orientation"**
> enduring pattern of sexual attraction

- `sexuality` u=189 [I-] concept / Orientation
- `sexual-orientation` u=86 [I-] concept / Orientation

**Reason:** sexuality vs sexual-orientation: overlapping but not identical.

### `Q1803422` — Wikidata says **"erotic sexual denial"**
> sexual practice or sex play in which a person is kept in a heightened state of sexual arousal for an extended length of time without orgasm

- `orgasm-denial` u=1 [IA] concept / Practices & Play
- `tease-and-denial` u=0 [-A] concept / Fetishes

**Reason:** orgasm-denial vs tease-and-denial: overlapping practices.

### `Q18116794` — Wikidata says **"genderfluid"**
> gender identity which doesn't conform to fixed gender roles or varies over time

- `gender-fluid` u=14 [I-] concept / Gender
- `genderflux` u=0 [I-] concept / Gender
- _gender-fluidity (deprecated)_
- _genderfluid (deprecated)_

**Reason:** gender-fluid vs genderflux: genderflux is fluctuating INTENSITY, arguably distinct.

### `Q2449503` — Wikidata says **"trans man"**
> man who was assigned female at birth

- `trans-man` u=39 [I-] concept / Gender
- `transmasculine` u=22 [I-] concept / Gender

**Reason:** trans-man vs transmasculine: transmasculine is broader (includes non-binary people). Likely wrong-qid, not merge.

### `Q2651749` — Wikidata says **"breast fetishism"**
> sexual interest focused on female breasts

- `breast-fetish` u=0 [--] concept / Slang & Language
- `breast-fetishism` u=0 [IA] concept / Fetishes

**Reason:** breast-fetish (Slang) vs breast-fetishism (Fetishes). Cross-category direction call.

### `Q2736` — Wikidata says **"association football"**
> sport that is practiced between two teams of eleven players

- `football` u=162 [--] descriptor / Sports & Recreation
- `soccer` u=59 [I-] descriptor / Sports & Recreation

**Reason:** football vs soccer: same sport, but "football" is ambiguous by region.

### `Q2739889` — Wikidata says **"sensual play"**
> activities meant to impart physical sensations

- `sensation-play` u=0 [IA] concept / Dynamics & Roles
- `sensual-play` u=0 [IA] concept / Fetishes

**Reason:** sensation-play vs sensual-play: overlapping but distinguished by many practitioners.

### `Q316` — Wikidata says **"love"**
> strong, positive emotion based on affection

- `love` u=130 [I-] concept / Dating & Connection
- `affection` u=1 [I-] concept / Culture & Community

**Reason:** love vs affection: distinct emotions, cross-category.

### `Q330284` — Wikidata says **"marketplace"**
> space in which a market operates

- `market` u=10 [I-] place / Destinations
- `marketplace` u=2 [I-] place / Destinations

**Reason:** market vs marketplace, both place/Destinations.

### `Q376032` — Wikidata says **"tribadism"**
> lesbian sexual practice in which the vulva is rubbed against a partner’s body for sexual stimulation

- `scissoring` u=2 [IA] concept / Positions
- `tribbing` u=2 [-A] concept / Practices & Play
- _tribadism (deprecated)_

**Reason:** scissoring vs tribbing, QID label "tribadism". Three names, cross-category.

### `Q43` — Wikidata says **"Turkey"**
> country in West Asia and Southeast Europe

- `turkey` u=56 [I-] place / Destinations
- `turkiye` u=5 [I-] place / Destinations

**Reason:** turkey vs turkiye. Exonym/endonym - a naming-politics call, not a data call.

### `Q43200` — Wikidata says **"bisexuality"**
> sexual and/or romantic attraction to people of more than one gender

- `bisexual` u=1592 [I-] concept / Orientation
- `bisexuality` u=40 [I-] concept / Orientation

**Reason:** bisexual (u=1592) vs bisexuality (u=40). QID label is "bisexuality"; the reader-facing tag is "bisexual". Direction is an editorial call.

### `Q43405` — Wikidata says **"exhibitionism"**
> act of exposing in a public or semi-public context one's suggestive body parts

- `exhibitionism` u=0 [IA] concept / Fetishes
- `flashing` u=0 [IA] concept / Fetishes

**Reason:** exhibitionism vs flashing: flashing is one act within exhibitionism.

### `Q459409` — Wikidata says **"hate crime"**
> crime, motivated by prejudice and usually violent

- `hate-crimes` u=453 [I-] concept / Violence & Hate
- `hate-crime` u=162 [I-] concept / Violence & Hate

**Reason:** hate-crimes (u=453) vs hate-crime (u=162). Repo has a plural auto-merge convention favouring singular; usage favours plural.

### `Q463859` — Wikidata says **"foot fetishism"**
> pronounced sexual attraction to feet

- `foot-fetish` u=0 [IA] concept / Practices & Play
- `foot-worship` u=0 [-A] concept / Fetishes

**Reason:** foot-fetish (Practices & Play) vs foot-worship (Fetishes). Called out in the brief as same shape as anorgasmia.

### `Q48270` — Wikidata says **"non-binary"**
> gender identity that exists outside of the gender binary

- `non-binary` u=638 [I-] concept / Gender
- `gender-non-conforming` u=7 [I-] concept / Orientation
- `enby` u=5 [I-] concept / Gender
- _gnc (deprecated)_
- _nonbinary (merged)_

**Reason:** MIXED: enby is a genuine synonym of non-binary, but gender-non-conforming is a DISTINCT concept (GNC is expression, NB is identity). Needs splitting into a merge + a wrong-qid.

### `Q53140604` — Wikidata says **"HIV/AIDS activism"**
> social movement advocating for a societal response to HIV/AIDS

- `hiv-aids-awareness` u=2 [I-] concept / Sexual Health
- `hiv-aids-activism` u=1 [I-] concept / Sexual Health

**Reason:** hiv-aids-awareness vs hiv-aids-activism: QID is activism; awareness is arguably distinct.

### `Q64214281` — Wikidata says **"Pride Month"**
> June commemorative month

- `pride-month` u=260 [I-] descriptor / Events & Parties
- `lgbtq-pride` u=16 [I-] descriptor / Events & Parties

**Reason:** pride-month (a specific month) vs lgbtq-pride (the broader concept).

### `Q64606208` — Wikidata says **"polygender"**
> condition of people with multiple gender identities

- `multigender` u=0 [I-] concept / Orientation
- `polygender` u=0 [I-] concept / Orientation

**Reason:** multigender vs polygender: often distinguished.

### `Q646522` — Wikidata says **"prostate massage"**
> massage of the prostate gland via the rectum or perineum

- `prostate-massage` u=0 [IA] concept / Fetishes
- `prostate-milking` u=0 [-A] concept / Fetishes

**Reason:** prostate-massage (medical/sexual) vs prostate-milking (the community term).

### `Q6636` — Wikidata says **"homosexuality"**
> romantic or sexual attraction or behavior between members of the same sex

- `homosexuality` u=57 [I-] concept / Orientation
- `homosexual` u=2 [I-] concept / Orientation

**Reason:** homosexual vs homosexuality - same shape as bisexual.
