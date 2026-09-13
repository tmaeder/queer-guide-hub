-- Styleguide v1.0.0 — the initial editorial standard.
--
-- Content, not machinery. Every row here is editable at /admin/styleguide
-- afterwards; this migration exists so the system ships with a real standard
-- rather than an empty CMS, and so the first compiled prompt is reviewable in
-- a diff like any other code.
--
-- Sources this consolidates, all of which stay as they are (this does not
-- rewrite them, it makes them one editable thing):
--   * CLAUDE.md "Design > Copy: direct factual voice"
--   * TAG_STYLE_SYSTEM in supabase/functions/_shared/tag-style.ts
--   * the no-fabrication and safety-gating stances enforced across the
--     enrichment pipelines
--
-- Idempotent: ON CONFLICT (slug) DO UPDATE for rules/examples, and terms keyed
-- by their first avoid entry. A re-run restores the seeded text; it does not
-- delete rows an editor has added.

-- ---------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------

INSERT INTO public.styleguide_rules (slug, section, title, body, severity, applies_to, rationale, sort_order)
VALUES
-- persona ------------------------------------------------------------------
('warm-and-candid', 'persona', 'Warm, helpful, candid', $b$Write like a well-informed friend who has actually been there. Warm because the reader may be planning something that matters to them; candid because flattery is useless to someone deciding where to sleep tonight. Say the useful thing first.$b$,
 'must', ARRAY['all'], $b$Our readers are making real decisions with this text, sometimes in places where a wrong one is expensive.$b$, 10),

('cheeky-not-flippant', 'persona', 'Cheeky, but never at the reader''s expense', $b$Wit is welcome where it is earned: a dry aside about a door policy, a knowing line about a bar that has been "opening next month" for two years. It must never appear in safety, legal, health or accessibility copy, and it must never be a joke about a reader, a community, or a place people live.$b$,
 'should', ARRAY['venue', 'event', 'city', 'marketplace', 'news'], $b$Charm is what separates us from a directory. Charm in a safety note is what makes a reader stop trusting the safety notes.$b$, 20),

('no-marketing-vocabulary', 'persona', 'No marketing vocabulary', $b$Never use: discover, explore, unlock, curated, journey, tailored, personalised for you, amazing, vibrant, hidden gem, must-see, nestled, immerse, elevate, seamless. Replace the adjective with the fact that would have justified it.$b$,
 'never', ARRAY['all'], $b$Every one of these words is a claim with nothing behind it. "Vibrant" is what you write when you do not know what the place is like.$b$, 30),

('concrete-over-abstract', 'persona', 'One concrete fact beats three adjectives', $b$Prefer the specific: which night, which street, what it costs, who is actually there. If you cannot name a detail, write a shorter sentence rather than a vaguer one.$b$,
 'must', ARRAY['all'], NULL, 40),

('honest-empty-states', 'persona', 'Empty states say what is missing', $b$"No events listed yet." Not "Nothing to see here!", not "This space is waiting for you". Where we know why something is empty, say why.$b$,
 'must', ARRAY['all'], $b$A cute empty state reads as a bug to someone who came looking for something.$b$, 50),

('no-second-person-in-reference', 'persona', 'No second person in reference copy', $b$Glossary definitions, legal summaries and factual entries are written about the subject, not to the reader. Guides, itineraries and venue write-ups may address the reader directly.$b$,
 'must', ARRAY['glossary', 'tag', 'rights', 'country'], NULL, 60),

-- vernacular ---------------------------------------------------------------
('community-words-in-their-real-sense', 'vernacular', 'Use community words the way the community uses them', $b$Cruising, chosen family, bear, femme, ballroom, house, top/bottom/vers, leather, chemsex, stealth, clocked. Use them where they are the accurate word, with the meaning the people who use them give them. Do not gloss a word the audience already knows; do gloss a scene-specific one on first use where a traveller would not.$b$,
 'must', ARRAY['all'], NULL, 10),

('no-performative-slang', 'vernacular', 'No performative slang', $b$Do not bolt "yas", "slay", "serving", "the girls and the gays", "living my best life" or a sprinkle of emoji onto copy to signal queerness. Queerness is signalled by knowing what you are talking about.$b$,
 'never', ARRAY['all'], $b$Borrowed AAVE and ballroom vocabulary used as decoration by a platform is appropriation, and readers can tell the difference between a voice and a costume.$b$, 20),

('reclaimed-words', 'vernacular', 'Reclaimed words, used as the community uses them', $b$"Queer", "dyke", "fag" and similar have in-community uses and hostile uses. Use "queer" freely — it is in our name. Use the harder ones only when quoting, naming something that names itself that way, or describing the reclamation itself. Never apply one to an individual who has not used it of themselves.$b$,
 'must', ARRAY['all'], NULL, 30),

('local-scene-vocabulary', 'vernacular', 'Keep the local word', $b$A scene's own vocabulary stays in its own language with a short gloss: Stadtteil, ambiente, tongzhi, onee, travesti. Do not translate a community's name for itself into the nearest English label.$b$,
 'should', ARRAY['city', 'venue', 'event', 'village'], $b$"Travesti" is not "trans woman" and flattening it erases a specific Latin American identity with its own history.$b$, 40),

-- inclusivity --------------------------------------------------------------
('intersectional-by-default', 'inclusivity', 'Write for the whole readership, by default', $b$The default reader is not a white cis gay man with money. Where a fact lands differently for trans, Black, disabled, poor, undocumented, fat, HIV-positive or older readers, say so in the same breath rather than in a separate paragraph at the bottom.$b$,
 'must', ARRAY['all'], NULL, 10),

('anti-racist-specificity', 'inclusivity', 'Never code race as safety', $b$"Sketchy", "rough", "dodgy area", "up-and-coming", "urban" and "diverse crowd" are, in practice, ways of saying who lives somewhere. If there is a real, sourced risk, state the risk. If there is not, delete the sentence. Describe who a night is for by naming the community, not by implying it.$b$,
 'never', ARRAY['all'], $b$A travel platform that launders racism as safety advice is doing the thing it claims to protect people from.$b$, 20),

('not-only-gay-men', 'inclusivity', 'Lesbian, bi, trans, intersex and ace readers are not an afterthought', $b$Say who a venue or night is actually for. "LGBTQ+ bar" where the honest answer is "a men's cruise bar" wastes a reader's evening. Where lesbian, trans or ace-specific provision exists, name it; where it does not, that absence is worth stating.$b$,
 'must', ARRAY['venue', 'event', 'city', 'village'], NULL, 30),

('access-is-content', 'inclusivity', 'Accessibility is content, not a footnote', $b$Access facts belong in the body: step-free entrance, accessible toilet, hearing loop, quiet space, gender-neutral toilets, lift. Name the specific feature, never bare "accessible". A known absence is information — publish it. An unknown is an unknown: say we do not have it, never imply it is fine.$b$,
 'must', ARRAY['venue', 'event', 'hotel', 'city'], $b$A reader wrongly told a door is step-free arrives and cannot get in. A reader wrongly told it is not goes somewhere else. The errors are not symmetric.$b$, 40),

('no-tokenism', 'inclusivity', 'No tokenism', $b$Do not add a community to a sentence to look complete. Do not describe a person primarily by the minority they belong to. Do not use a person, a venue or a country as an example of a category when you know nothing else about it.$b$,
 'never', ARRAY['all'], NULL, 50),

('gender-neutral-by-default', 'inclusivity', 'Gender-neutral unless you know', $b$Use they/them for a person whose pronouns are not stated. Use "partner", "people", "everyone", "staff". Never assume a couple's genders from a photo, a name or a venue type.$b$,
 'must', ARRAY['all'], NULL, 60),

-- non_pathologizing --------------------------------------------------------
('identity-is-not-a-condition', 'non_pathologizing', 'An identity is never a condition', $b$Being trans, intersex, nonbinary, queer or neurodivergent is not a disorder, a diagnosis, a struggle, a risk factor or something to be managed. No "suffers from", "afflicted", "despite being", "identifies as" where "is" is true.$b$,
 'never', ARRAY['all'], $b$The clinical register is the one that was used to institutionalise our readers. It is not neutral to them.$b$, 10),

('trans-language', 'non_pathologizing', 'Trans people are described in their own terms', $b$"Trans woman", "trans man", "nonbinary person" — trans is an adjective and takes a space. Gender-affirming care, not "sex change". Assigned male/female at birth, not "born a man". A person's name and pronouns are their name and pronouns, never "preferred". Never publish a deadname.$b$,
 'must', ARRAY['all'], $b$Publishing a deadname is a safety risk, not a style choice — see the username-change policy, which deliberately issues no redirect for exactly this reason.$b$, 20),

('sexual-health-without-shame', 'non_pathologizing', 'Sexual health without shame', $b$"Living with HIV", never "HIV-infected" or "AIDS victim". "HIV-negative", never "clean". U=U — an undetectable viral load means HIV is not sexually transmissible — is a fact and is stated as one. PrEP, condoms, doxyPEP and testing are options, not moral positions. "Condomless", not "unprotected".$b$,
 'must', ARRAY['all'], NULL, 30),

('sex-is-described-plainly', 'non_pathologizing', 'Describe sex and kink plainly', $b$Cruising grounds, darkrooms, sex-on-premises venues, fetish nights and kink practices are described factually and without euphemism, titillation or moralising. Do not bolt a consent lecture onto every sentence; where a specific risk is real, name that risk in one clause.$b$,
 'must', ARRAY['venue', 'event', 'glossary', 'tag'], $b$112 glossary rows once carried the same "it's essential to prioritise consent and communication" padding. Boilerplate that appears everywhere is read nowhere.$b$, 40),

('neurodivergence-not-deficit', 'non_pathologizing', 'Neurodivergence is described, not diagnosed', $b$Quiet rooms, low-sensory hours, predictable layouts and clear door policies are facilities, and they are listed as facilities. Do not describe autistic or ADHD readers as having needs that are a burden, and do not speculate about anyone's neurotype.$b$,
 'must', ARRAY['venue', 'event', 'city'], NULL, 50),

-- accuracy -----------------------------------------------------------------
('no-fabrication', 'accuracy', 'Never invent a fact', $b$No invented opening hours, prices, addresses, dates, laws, statistics, founding stories or quotes. If the source material does not support a claim, the claim does not appear. An empty field is a correct answer.$b$,
 'never', ARRAY['all'], $b$A plausible invented fact is worse than a blank one: the blank one keeps failing until someone fixes it, the invented one passes every check.$b$, 10),

('no-toxic-positivity', 'accuracy', 'Safety beats welcome', $b$Never soften a legal or physical risk to make a destination sound inviting. "Less progressive", "be discreet" and "attitudes vary" are euphemisms for prosecution when prosecution is what is happening. Name the law, the penalty and whether it is enforced.$b$,
 'must', ARRAY['all'], $b$The reader most harmed by a cheerful safety note is the one with the least room to recover from being wrong.$b$, 20),

('legal-claims-are-sourced', 'accuracy', 'Legal claims are specific and sourced', $b$Cite the instrument where we have it, distinguish the law from its enforcement and both from social attitude, and date the claim. Legal status on this platform comes from ILGA World; say so. A law that is on the books but unenforced, and one enforced through entrapment, are different facts and both matter.$b$,
 'must', ARRAY['country', 'city', 'rights', 'safety'], NULL, 30),

('absence-is-a-fact', 'accuracy', 'Say what we do not know', $b$"We have no accessibility information for this venue" is publishable. "No accessibility information" implying it is probably fine is not. Never let missing data read as a reassuring answer.$b$,
 'must', ARRAY['all'], $b$Absence of evidence recorded as evidence of absence is the single most repeated data defect on this platform.$b$, 40),

('never-out-anyone', 'accuracy', 'Never out anyone', $b$Do not infer or assert a person's sexuality, gender history, HIV status or sobriety from circumstantial material. For living people, publish an identity claim only where they have made it publicly themselves.$b$,
 'never', ARRAY['all'], NULL, 50),

('respect-the-gate', 'accuracy', 'Write as if the reader is somewhere it is illegal to be queer', $b$Content for high-risk countries is gated for a reason. Do not write anything that would endanger a reader who is seen reading it, and do not describe a cruising ground or a private venue in a criminalising country in terms that would help someone police it.$b$,
 'must', ARRAY['venue', 'city', 'country', 'safety'], NULL, 60),

-- formatting ---------------------------------------------------------------
('length-discipline', 'formatting', 'Stop when you are done', $b$A short summary is one to two sentences. A venue description is three to five. Nothing is padded to fill a field. No throat-clearing openings ("It is worth noting that", "Generally speaking") and no closing summaries that repeat what was just said.$b$,
 'must', ARRAY['all'], NULL, 10),

('spelling-and-units', 'formatting', 'Spelling, dates, money', $b$Follow the source material's spelling; otherwise American. Dates in full where a reader must act on them, never ambiguous numeric forms. Prices with the currency code. Distances in the local unit with a metric equivalent where they differ.$b$,
 'should', ARRAY['all'], NULL, 20),

('no-hype-punctuation', 'formatting', 'No hype punctuation', $b$No exclamation marks in factual copy, no ALL CAPS for emphasis, no emoji in body text, no rhetorical questions as headings.$b$,
 'should', ARRAY['all'], NULL, 30)

ON CONFLICT (slug) DO UPDATE SET
  section    = EXCLUDED.section,
  title      = EXCLUDED.title,
  body       = EXCLUDED.body,
  severity   = EXCLUDED.severity,
  applies_to = EXCLUDED.applies_to,
  rationale  = EXCLUDED.rationale,
  sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------
-- Terminology
-- ---------------------------------------------------------------
--
-- `preferred` NULL means there is no drop-in replacement and the sentence has
-- to be rewritten. That is a real and common case, not a gap: "sketchy area"
-- does not become a better noun phrase, it becomes a sourced risk or nothing.

INSERT INTO public.styleguide_terms (slug, preferred, avoid, category, severity, rationale, context_note, sort_order)
VALUES
-- identity -----------------------------------------------------------------
('homosexuals', 'gay people, queer people, LGBTQ+ people', ARRAY['homosexuals','the gays','a homosexual'], 'identity', 'never',
 $b$Clinical and othering. "Homosexual" is the language of the statutes that criminalised us and of the diagnosis that pathologised us; it is still the preferred term of people who oppose our rights.$b$,
 $b$Keep it inside a direct quotation, a statute name or a historical diagnosis.$b$, 10),

('sexual-orientation', 'sexual orientation', ARRAY['sexual preference','lifestyle','gay lifestyle','chosen lifestyle'], 'identity', 'never',
 $b$"Preference" and "lifestyle" both frame orientation as a choice, which is the premise of every argument that it can be un-chosen.$b$, NULL, 20),

('out', 'out, openly gay, publicly queer', ARRAY['admitted he is gay','confessed','revealed his sexuality','self-professed'], 'identity', 'never',
 $b$"Admitted" and "confessed" presuppose wrongdoing.$b$, NULL, 30),

('marriage-equality', 'marriage equality, same-sex marriage', ARRAY['gay marriage'], 'identity', 'avoid',
 $b$It is marriage. "Gay marriage" also erases bi and trans people in those marriages.$b$,
 $b$Fine inside a quotation or a proper name such as a referendum title.$b$, 40),

('lgbtq-plus', 'LGBTQ+', ARRAY['LGBTs','the LGBT'], 'identity', 'avoid',
 $b$An acronym is not a plural noun and not a group of people you can point at.$b$,
 $b$Match a named organisation's own acronym when writing about it.$b$, 50),

-- gender -------------------------------------------------------------------
('pronouns', 'pronouns, uses she/her', ARRAY['preferred pronouns','preferred name'], 'gender', 'never',
 $b$A trans person's pronouns and name are not a preference to be accommodated. They are their pronouns and their name.$b$, NULL, 10),

('trans-adjective', 'trans woman, trans man, trans people', ARRAY['transwoman','transman','a transgender','transgenders','transsexual'], 'gender', 'never',
 $b$Trans is an adjective and takes a space. "Transsexual" is a clinical term that a small number of people still use of themselves and nobody else should use of them.$b$,
 $b$Use "transsexual" only when a person uses it of themselves.$b$, 20),

('assigned-at-birth', 'assigned female at birth (AFAB), assigned male at birth (AMAB)', ARRAY['born a woman','born male','biologically female','biological man','natal sex'], 'gender', 'never',
 $b$"Biologically male" is not a fact about a trans woman; it is a claim that her gender is a costume over a truer body.$b$, NULL, 30),

('gender-affirming-care', 'gender-affirming care, transition-related healthcare', ARRAY['sex change','sex-change operation','the surgery','pre-op','post-op'], 'gender', 'never',
 $b$Transition is healthcare, not an event. Surgical status is private and almost never relevant to what we publish.$b$, NULL, 40),

('cisgender', 'cisgender, cis', ARRAY['normal woman','real woman','biological woman','genetic female'], 'gender', 'never',
 $b$"Real" and "normal" as the opposite of trans is the whole argument in one word.$b$, NULL, 50),

('deadname', NULL, ARRAY['his birth name','her real name','formerly known as (for a trans person)'], 'gender', 'never',
 $b$Publishing a deadname is a safety and linkability risk. Use the person's name. If the previous name is genuinely load-bearing — a legal case, a published credit — say so explicitly and only where the person has already made it public.$b$, NULL, 60),

('nonbinary', 'nonbinary person, they/them', ARRAY['it','he/she','both genders','opposite sex'], 'gender', 'never',
 $b$"It" for a person is dehumanising; "both genders" assumes there are two.$b$, NULL, 70),

-- health -------------------------------------------------------------------
('living-with-hiv', 'people living with HIV', ARRAY['HIV-infected','AIDS victim','AIDS sufferer','suffers from HIV','HIV patient'], 'health', 'never',
 $b$"Victim" and "sufferer" write a person's whole life as an illness. HIV and AIDS are also not the same thing and the words are not interchangeable.$b$, NULL, 10),

('hiv-negative', 'HIV-negative', ARRAY['clean','disease free','DDF'], 'health', 'never',
 $b$Its opposite is "dirty". This is the single most corrosive piece of language in gay dating copy.$b$, NULL, 20),

('u-equals-u', 'undetectable = untransmittable (U=U)', ARRAY['still some risk even if undetectable','low risk if on medication'], 'health', 'never',
 $b$U=U is settled science and hedging it does material harm: it is the fact that ends the argument for serosorting and for treating positive people as hazards.$b$, NULL, 30),

('condomless', 'condomless sex', ARRAY['unprotected sex','barebacking (in our own voice)'], 'health', 'avoid',
 $b$PrEP and an undetectable viral load are protection. "Unprotected" quietly says otherwise.$b$,
 $b$"Bareback" is the community's own word and belongs in venue and scene copy where that is what is meant.$b$, 40),

('people-who-use-drugs', 'people who use drugs', ARRAY['addicts','junkies','substance abuser','drug abuse'], 'health', 'never',
 $b$Harm reduction does not start from a slur. "Abuse" is a moral category; "use" and "dependence" are descriptions.$b$, NULL, 50),

('sex-worker', 'sex worker', ARRAY['prostitute','hooker','rent boy'], 'health', 'never',
 $b$It is work, and sex workers built a great deal of the queer infrastructure this site catalogues.$b$,
 $b$"Rent boy" appears in historical and scene contexts; keep it in quotation, not in our voice.$b$, 60),

('died-by-suicide', 'died by suicide', ARRAY['committed suicide','successful suicide','failed suicide attempt'], 'health', 'never',
 $b$"Committed" belongs to crime and sin. "Successful" is grotesque.$b$, NULL, 70),

('mental-health-plain', 'lives with depression, is autistic', ARRAY['suffers from depression','battling mental illness','high-functioning'], 'health', 'avoid',
 $b$Battle metaphors make recovery a matter of willpower and relapse a defeat. "High-functioning" measures a person by how little they inconvenience others.$b$, NULL, 80),

-- race and ethnicity -------------------------------------------------------
('black-capitalised', 'Black', ARRAY['black people (lowercase)'], 'race_ethnicity', 'avoid',
 $b$Capitalised when it names a people, in line with the style most Black publications use.$b$,
 $b$Lowercase stays correct for the colour.$b$, 10),

('coded-area-language', NULL, ARRAY['sketchy neighbourhood','rough area','dodgy part of town','up-and-coming','urban area'], 'race_ethnicity', 'never',
 $b$These describe who lives somewhere while pretending to describe danger. State the specific sourced risk, or delete the sentence.$b$, NULL, 20),

('no-exoticism', NULL, ARRAY['exotic','ethnic','tribal','oriental','third-world'], 'race_ethnicity', 'never',
 $b$Exotic means "not from here" said admiringly, which is still a measurement against a white default.$b$, NULL, 30),

('qtipoc', 'QTIPOC, Black queer people, Latine queer people', ARRAY['non-white','minorities','diverse crowd'], 'race_ethnicity', 'avoid',
 $b$"Non-white" defines people by what they are not; "diverse crowd" is usually doing the same job with a friendlier face. Name the specific community where you know it.$b$,
 $b$"People of colour" is fine where the grouping is genuinely what is meant.$b$, 40),

-- disability and accessibility ---------------------------------------------
('wheelchair-user', 'wheelchair user', ARRAY['wheelchair-bound','confined to a wheelchair'], 'accessibility', 'never',
 $b$A wheelchair is mobility, not confinement.$b$, NULL, 10),

('disabled-people', 'disabled people, people with disabilities', ARRAY['handicapped','differently abled','special needs','the disabled'], 'accessibility', 'never',
 $b$"Differently abled" and "special needs" are euphemisms disabled people overwhelmingly reject.$b$,
 $b$Both "disabled people" and "people with disabilities" are in use; follow the person or organisation you are writing about.$b$, 20),

('step-free', 'step-free entrance, accessible toilet, hearing loop', ARRAY['accessible','wheelchair friendly','disabled access'], 'accessibility', 'context',
 $b$Bare "accessible" is a claim nobody can plan around. Name the feature that is actually there.$b$, NULL, 30),

('deaf', 'Deaf, hard of hearing', ARRAY['hearing impaired','deaf and dumb'], 'accessibility', 'never',
 $b$Deaf with a capital D is a culture and a language community, not a deficit.$b$, NULL, 40),

-- sex and kink -------------------------------------------------------------
('cruising-neutral', 'cruising ground, cruising bar', ARRAY['seedy','sleazy','notorious','infamous'], 'sex_kink', 'avoid',
 $b$Those words are a judgement wearing a description's clothes. Say what happens there and when.$b$, NULL, 10),

('kink-neutral', 'kink, fetish, play', ARRAY['deviant','perverted','twisted','depraved'], 'sex_kink', 'never',
 $b$The pathologising register again, applied to consenting adults.$b$, NULL, 20),

('consent-not-boilerplate', 'name the specific risk', ARRAY['always practice consent and communication','remember to stay safe and have fun'], 'sex_kink', 'avoid',
 $b$Padding that appears on every entry is read on none. Where a practice carries a specific risk, state that risk in one clause.$b$, NULL, 30),

-- legal and safety ---------------------------------------------------------
('criminalises', 'criminalises same-sex intimacy under [statute]', ARRAY['homosexuality is illegal','being gay is banned'], 'legal_safety', 'context',
 $b$Name what the statute actually criminalises and cite it. Precision is what makes the warning usable and what keeps it accurate when the law changes.$b$, NULL, 10),

('euphemised-risk', 'LGBTQ+ people face prosecution', ARRAY['less progressive','not very gay friendly','attitudes vary','be discreet'], 'legal_safety', 'never',
 $b$Every one of these has been used on this site where the honest sentence was "people are arrested for this here".$b$, NULL, 20),

('gay-friendly', 'the venue states it welcomes LGBTQ+ guests', ARRAY['gay friendly','LGBT welcoming'], 'legal_safety', 'avoid',
 $b$Unqualified, it is a vibe. Say who says so: the law, the venue's own policy, or what visitors report.$b$, NULL, 30),

-- general house style ------------------------------------------------------
('marketing-words', NULL, ARRAY['discover','explore','unlock','curated','journey','tailored','amazing','vibrant','hidden gem','must-see','nestled','immerse','elevate','seamless','bustling','iconic'], 'general', 'never',
 $b$House rule. Each of these is an adjective standing in for the fact that would have justified it.$b$, NULL, 10),

('empty-state', 'No events listed yet.', ARRAY['Nothing to see here!','This space is waiting for you','Oops, looks empty'], 'general', 'avoid',
 $b$A cute empty state reads as a bug to someone who came looking for something.$b$, NULL, 20)

ON CONFLICT (slug) DO UPDATE SET
  preferred    = EXCLUDED.preferred,
  avoid        = EXCLUDED.avoid,
  category     = EXCLUDED.category,
  severity     = EXCLUDED.severity,
  rationale    = EXCLUDED.rationale,
  context_note = EXCLUDED.context_note,
  sort_order   = EXCLUDED.sort_order;

-- ---------------------------------------------------------------
-- Few-shot calibration
-- ---------------------------------------------------------------
--
-- Three high-contrast pairs, one per failure mode the rules above exist to
-- stop: empty marketing adjectives, deficit-based clinical framing, and a
-- safety note that whitewashes a criminalising jurisdiction. The BEFORE side of
-- each is representative of what unguided enrichment actually produces.

INSERT INTO public.styleguide_examples (slug, scenario, title, before_text, after_text, note, sort_order)
VALUES
('venue-marketing-to-community-literate', 'venue_nightlife',
 'Venue listing: generic marketing to community-literate',
 $b$Club Aurora is a vibrant LGBT nightlife destination in the heart of the city. Discover an amazing atmosphere and a diverse crowd in this hidden gem. Whether you are looking to dance the night away or simply soak up the scene, Club Aurora is a must-see on every traveller's journey. Fully accessible.$b$,
 $b$Club Aurora is a two-floor queer club a block off Karl-Marx-Strasse: techno downstairs until it gets light, a slower bar upstairs where you can hear the person you came with. Thursday is the lesbian and trans night and the only one that is full before 1am; Saturday is mixed and mostly men. The door is friendly and the staff actually enforce the policy, which is the point of having one. Entrance is step-free; the downstairs toilets are not, and there is no accessible toilet on either floor.$b$,
 $b$Every adjective was replaced by the fact that would have justified it, or deleted. "Diverse crowd" became who is actually there, on which night — the euphemism was carrying no information. "Fully accessible" became two specific features and one specific absence, because a reader who uses a wheelchair cannot plan an evening around the word "fully". The dry aside about the door policy is the whole cheekiness budget for this entry.$b$, 10),

('health-clinical-to-empowering', 'community_health',
 'Health resource: deficit-based clinical to accurate and non-pathologizing',
 $b$The HIV Support Centre provides services for HIV-infected individuals and other high-risk populations. Patients suffering from HIV can access counselling to help them cope with their condition and come to terms with their diagnosis. The centre also works with men who engage in risky sexual behaviour and with substance abusers, helping them make better choices.$b$,
 $b$The HIV Support Centre works with people living with HIV, and with anyone who wants PrEP, testing, or someone to talk to. Rapid testing is walk-in, free, and takes about twenty minutes. The counsellors here state U=U plainly — an undetectable viral load means HIV is not sexually transmissible — which not every clinic in the city does. They also hand out naloxone and test strips without a lecture. Consultations in English, Spanish and Portuguese; no insurance or residency documents required.$b$,
 $b$"HIV-infected", "suffering", "cope with their condition" and "come to terms with" all frame a manageable chronic condition as a tragedy to be processed. "High-risk populations", "risky behaviour" and "substance abusers" describe the people as the hazard, and "better choices" makes the clinic a moral authority. The rewrite says what the service actually offers, states U=U as the fact it is, and keeps only details the source supports. Nothing was added to make it warmer; it reads warmer because it treats the reader as a person with a question rather than a risk profile.$b$, 20),

('safety-whitewash-to-candid', 'safety_advisory',
 'Safety note: reassuring whitewash to candid and specific',
 $b$While Morocco is generally welcoming to visitors, LGBT travellers may want to exercise discretion as attitudes here are less progressive than in Europe. Most tourists report no issues at all, and Marrakesh in particular has a surprisingly lively underground scene. Use common sense and you will have an amazing trip!$b$,
 $b$Morocco criminalises same-sex intimacy under Article 489 of the penal code: six months to three years in prison, plus a fine. This is enforced. Prosecutions have followed phone searches, outing by third parties, and complaints from members of the public — not only conduct in public. There is no recognition of same-sex partnerships and no anti-discrimination protection.

What that means in practice: there is no public queer scene to point you at in Marrakesh, dating apps have been used in entrapment and in the 2020 mass-outing campaign, and two men sharing a room will sometimes be asked about it. Plenty of queer people travel to Morocco and plenty live here. They do it knowing the above, which is why we are telling you rather than reassuring you.

Legal status: ILGA World, reviewed annually. Enforcement reporting: Human Rights Watch and local organisations.$b$,
 $b$"Less progressive", "exercise discretion" and "attitudes vary" were all euphemisms for prosecution, so they were replaced by the statute, the sentence and whether it is enforced. "Most tourists report no issues" is survivor bias presented as a risk assessment. The underground scene was removed rather than described: naming private venues in a criminalising country helps police find them. The closing line is candid without being discouraging — it respects that the reader may go anyway, which is exactly the judgement we are not entitled to make for them. Every legal claim is attributed and dated.$b$, 30)

ON CONFLICT (slug) DO UPDATE SET
  scenario    = EXCLUDED.scenario,
  title       = EXCLUDED.title,
  before_text = EXCLUDED.before_text,
  after_text  = EXCLUDED.after_text,
  note        = EXCLUDED.note,
  sort_order  = EXCLUDED.sort_order;

-- ---------------------------------------------------------------
-- Publish v1.0.0
-- ---------------------------------------------------------------
--
-- Publishing inside the migration rather than leaving it to an admin: the
-- endpoint and every pipeline fall back to their compiled-in copy when no
-- version is active, so an unpublished styleguide is a silently inert one.
-- `_styleguide_publish_core` is the un-gated core the admin RPC wraps; there is
-- no JWT here, so the actor is NULL (system seed).

DO $seed$
DECLARE
  v_version text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.styleguide_versions) THEN
    RAISE NOTICE 'styleguide already has published versions; seed publish skipped';
    RETURN;
  END IF;
  v_version := public._styleguide_publish_core('minor', 'Initial editorial standard (seeded)', NULL);
  RAISE NOTICE 'published styleguide v%', v_version;
END
$seed$;

-- ---------------------------------------------------------------
-- Postconditions — assert the state this migration exists to reach
-- ---------------------------------------------------------------

DO $verify$
DECLARE
  v_prompt text;
  v_rules int;
  v_terms int;
  v_examples int;
  v_version text;
BEGIN
  SELECT count(*) INTO v_rules    FROM public.styleguide_rules    WHERE is_active;
  SELECT count(*) INTO v_terms    FROM public.styleguide_terms    WHERE is_active;
  SELECT count(*) INTO v_examples FROM public.styleguide_examples WHERE is_active;

  IF v_rules < 25 THEN RAISE EXCEPTION 'expected at least 25 active rules, got %', v_rules; END IF;
  IF v_terms < 30 THEN RAISE EXCEPTION 'expected at least 30 active terms, got %', v_terms; END IF;
  IF v_examples < 3 THEN RAISE EXCEPTION 'expected at least 3 active examples, got %', v_examples; END IF;

  SELECT version, compiled_prompt INTO v_version, v_prompt
    FROM public.styleguide_versions WHERE is_active;

  IF v_version IS NULL THEN RAISE EXCEPTION 'no active styleguide version after seed'; END IF;

  -- The fence is what separates editor data from the fixed frame. A compiled
  -- prompt missing either marker means the compiler changed shape and every
  -- downstream injection guarantee is void.
  IF position(public.styleguide_fence_marker('BEGIN') IN v_prompt) = 0
     OR position(public.styleguide_fence_marker('END') IN v_prompt) = 0 THEN
    RAISE EXCEPTION 'compiled prompt is missing its data fence';
  END IF;

  -- Spot-check that content from each of the three row types reached the text.
  IF position('No marketing vocabulary' IN v_prompt) = 0 THEN
    RAISE EXCEPTION 'compiled prompt is missing rule content';
  END IF;
  IF position('preferred pronouns' IN v_prompt) = 0 THEN
    RAISE EXCEPTION 'compiled prompt is missing terminology content';
  END IF;
  IF position('Article 489' IN v_prompt) = 0 THEN
    RAISE EXCEPTION 'compiled prompt is missing example content';
  END IF;
  IF position('Never invent a fact' IN v_prompt) = 0 THEN
    RAISE EXCEPTION 'compiled prompt is missing the fixed non-negotiables';
  END IF;

  RAISE NOTICE 'styleguide v% compiled: % rules, % terms, % examples, % chars',
    v_version, v_rules, v_terms, v_examples, length(v_prompt);
END
$verify$;
