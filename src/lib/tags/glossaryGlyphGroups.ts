import type { TransitIconName } from '@/components/transit/transitIconPaths';

/** Exact glossary slugs grouped by the meaning their outline represents.
 * Keep ambiguous terms on the taxonomy fallback. Term-specific overrides take precedence.
 */
export const GLOSSARY_GLYPH_GROUPS: readonly (readonly [TransitIconName, readonly string[]])[] = [
  ['accessibility', [
    'ableism', 'accessibility', 'accessibility-features', 'accessibility-in-lgbtqia-spaces',
    'accessible-parking', 'accessible-seating', 'accessible-space', 'disability',
    'disability-accommodations', 'disability-advocate', 'disability-and-lgbtqia-youth',
    'disability-employment', 'disability-pride', 'disability-rights',
    'inclusive-healthcare-for-lgbtqia-individuals-with-disabilities',
    'inclusive-legal-protections-for-lgbtqia-individuals-with-disabilities',
    'inclusive-sexuality-education-for-lgbtqia-individuals-with-disabilities',
    'lgbtqia-individuals-as-disability-advocates', 'paralympics',
    'rights-of-persons-with-disabilities', 'wheelchair-accessible',
  ]],
  ['aftercare', [
    'nudist-meditation', 'nudist-wellness-retreat', 'nudist-yoga-retreat', 'qigong', 'taiji',
    'yoga', 'yoga-classes',
  ]],
  ['alerts', [
    'overdose', 'overdose-prevention', 'toxidrome', 'withdrawal', 'withdrawal-management',
  ]],
  ['apparel', [
    'casting', 'clothing-optional', 'gender-expression', 'gender-nonconformity',
  ]],
  ['award', [
    'awards', 'drag-pageant', 'glaad-media-awards', 'tens-across-the-board',
  ]],
  ['awareness-ribbon', [
    'acquired-immunodeficiency-syndrome-aids', 'aids', 'aids-awareness', 'aids-crisis',
    'aids-death-and-dying', 'aids-education', 'hiv', 'hiv-aids', 'hiv-aids-crisis',
    'hiv-aids-prevention', 'hiv-and-sti-risk', 'hiv-prevention', 'hiv-prevention-treatment',
    'hiv-sexual-health-services', 'hiv-transmission', 'hiv-treatment',
    'human-immunodeficiency-virus-hiv', 'positive',
  ]],
  ['baby', [
    'adoption', 'adoption-family', 'adoptive-family', 'adoptive-parent', 'adoptive-sibling',
    'childbirth', 'conception', 'fertility', 'fertility-awareness-method', 'fertility-counseling',
    'fertility-preservation', 'lgbtq-adoption-families', 'pregnancy', 'reproduction',
    'right-to-adoption', 'sugar-babies',
  ]],
  ['ball', [
    'baseball', 'basketball', 'football', 'football-player', 'golf', 'rugby', 'rugby-player',
    'tennis',
  ]],
  ['ballot-box', [
    'women-s-suffrage',
  ]],
  ['bike', [
    'bike-related', 'biking', 'cycling', 'nudist-cycling-tour',
  ]],
  ['boat', [
    'cruise', 'nudist-cruise', 'rowing', 'rowing-club', 'sailing',
  ]],
  ['body-health', [
    'body-image', 'eating-disorders', 'uterus-womb',
  ]],
  ['bodysuit', [
    'catsuits',
  ]],
  ['bolt', [
    'e-stim-machine', 'electro',
  ]],
  ['briefcase', [
    'architect', 'child-labor', 'employment-non-discrimination', 'gender-equity-in-the-workplace',
    'inclusive-employment-practices', 'lgbtq-workplace-rights', 'migrant-workers-rights',
    'right-to-work', 'workplace-discrimination', 'workplace-equality',
  ]],
  ['building', [
    'arnsberg', 'auckland', 'bangkok', 'beijing', 'berlin', 'bielefeld', 'braunschweig', 'brisbane',
    'buenos-aires', 'casablanca', 'castro-district', 'chueca-neighbourhood', 'columbus-ohio',
    'copenhagen', 'cranbrook', 'cuauhtemoc', 'denver', 'east-berlin', 'freiburg-im-breisgau',
    'gay-village', 'gayborhood', 'guatemala-city', 'harrisburg', 'indianapolis', 'kazan', 'kolkata',
    'kreuzberg', 'launceston', 'leutkirch', 'lgbtq-friendly-neighborhood', 'lima',
    'linz-an-der-donau', 'long-island-city', 'madrid', 'manhattan', 'merignac', 'mexico-city',
    'mill-valley', 'mitte', 'munich', 'neheim-husten', 'neukolln', 'newcastle-upon-tyne', 'oakland',
    'oldenburg', 'paris', 'pembroke', 'pittsburgh', 'port-louis', 'prague', 'pune', 'raleigh',
    'reykjavik', 'richmond-va', 'rosario', 'sacramento', 'salt-lake-city', 'salvador',
    'san-antonio', 'san-francisco', 'san-jose', 'san-juan', 'santiago', 'schoneberg', 'skopje',
    'south-bend', 'spandau', 'stuttgart', 'taipei', 'tbilisi', 'toledo', 'toronto',
    'usti-nad-labem', 'vienna', 'wellington', 'zurich',
  ]],
  ['cafe', [
    'breakfast', 'breakfast-option', 'brunch', 'brunch-option', 'brunch-spot', 'cafe', 'cafe-bar',
    'coffee', 'coffee-roasters', 'cyber-cafe', 'espresso', 'german-cafe', 'japanese-cafe',
    'kolkata-cafe', 'lgbtq-cafe', 'queer-cafe', 'tea-house',
  ]],
  ['cake', [
    'birthday',
  ]],
  ['candle', [
    'candle-wax-play', 'massage-candle', 'wax-play',
  ]],
  ['care', [
    'abstinence-based-recovery', 'acceptance', 'addiction', 'anxiety',
    'chemsex-and-community-well-being', 'community-support', 'depression', 'gender-affirming-care',
    'grief', 'inclusive-lgbtqia-and-disability-allyship', 'lgbtq-acceptance',
    'lgbtq-support-groups', 'lgbtqia-allyship', 'mutual-aid', 'nurses', 'peer-support',
    'peer-support-groups', 'peer-support-in-chemsex-recovery', 'post-use-recovery-plan',
    'pride-volunteer', 'queer-resilience', 'recovery', 'recovery-position', 'recovery-support',
    'resilience', 'resilience-factors', 'resilience-training', 'self-acceptance', 'self-esteem',
    'self-esteem-building', 'self-love', 'sober', 'substance-use-disorder', 'suicidal-ideation',
    'suicide', 'support-group',
  ]],
  ['chat', [
    'bdsm-negotiation', 'chosen-name', 'condom-negotiation',
    'consent-aftercare-boundaries-intentions-negotiation-and-safety-cabins',
    'consent-and-non-verbal-communication', 'counseling', 'counseling-services', 'deadnaming',
    'dirty-text-messaging', 'disclosure', 'discourse', 'donor-identity-disclosure', 'ey-em',
    'gender-neutral-pronouns', 'gender-pronouns', 'he-him', 'intersex-terminology',
    'kink-negotiation-checklist', 'lgbt-terminology', 'marriage-counseling', 'misgendering',
    'mixed-pronouns', 'negotiation', 'non-binary-pronouns', 'nonverbal-communication',
    'performativity-of-language', 'pronouns', 'psychotherapy', 'racial-slurs',
    'safer-sex-negotiation', 'sexual-negotiation', 'she-her', 'she-they', 'they-them',
    'trans-inclusive-language',
  ]],
  ['clamps', [
    'clamps-and-clips', 'clover-clamp', 'nipple-clamps',
  ]],
  ['code', [
    'computer-scientist',
  ]],
  ['collar', [
    'collar-and-lead-leash', 'day-collar', 'posture-collar',
  ]],
  ['community', [
    'awareness-team', 'ballroom-families', 'biological-parenthood', 'birth-parents', 'black-queer',
    'buddy-system', 'chosen-family', 'community-focused', 'community-group', 'community-space',
    'community-watch-groups', 'families', 'family', 'family-friendly', 'feminist-parenting',
    'foster-parent', 'foster-sibling', 'gay-friendly', 'gender-conscious-parenting',
    'gender-diversity', 'gender-inclusive', 'gender-neutral-parenting', 'gender-norms-in-parenting',
    'grandparent', 'great-grandchild', 'great-grandparent', 'great-niece', 'group', 'half-sibling',
    'lgbtq-clubs-co-parents', 'lgbtq-community', 'lgbtq-community-engagement',
    'lgbtq-community-involvement', 'lgbtq-friendly', 'lgbtq-friendly-not-verified',
    'lgbtq-inclusive', 'lgbtq-organization', 'lgbtq-parenting', 'lgbtq-social', 'meetup',
    'mixed-crowd', 'other-parents', 'parenthood', 'queer-community', 'queer-friendly', 'queer-poc',
    'same-sex-parenting', 'sex-addicts-anonymous', 'sibling-bonding', 'social', 'social-gathering',
    'social-group', 'socialization', 'sociologist', 'step-parent', 'trans-community',
    'trans-parenting',
  ]],
  ['consent', [
    'consent-nonconsent',
  ]],
  ['dance-steps', [
    'ballroom-performer', 'ballroom-scene', 'competitive-dance', 'dance', 'dancing-queen',
    'lgbtq-dance', 'line-dancing', 'nudist-dance-workshop',
  ]],
  ['dice', [
    'doppelkopf',
  ]],
  ['disco', [
    'club-culture', 'dance-club', 'dance-floor', 'disco', 'nightclub', 'nudist-dance-party', 'rave',
  ]],
  ['documents', [
    'anti-bullying-policies', 'assigned-sex', 'author', 'diversity-inclusion-policies',
    'drug-policy-reform', 'food-writer', 'genre-essays', 'inclusive-hiring-policies', 'publisher',
    'school-inclusion-policies', 'screenwriting', 'trans-inclusive-policies', 'writing-erotica',
    'zine-culture', 'zines',
  ]],
  ['door', [
    'locker-room',
  ]],
  ['drop', [
    'blood-donation', 'menorrhagia-heavy-periods', 'menstrual-cup', 'menstrual-cycle',
    'menstruation',
  ]],
  ['education', [
    'abstinence-only-education', 'academic-institution', 'asexual-studies', 'cocktail-workshop',
    'college', 'comprehensive-sex-education', 'conference',
    'consent-and-bystander-intervention-training-for-security-staff', 'consent-and-sex-education',
    'consent-centered-workshops-or-presentations', 'consent-education',
    'consent-training-for-party-volunteers', 'consent-workshops', 'disability-etiquette',
    'disability-studies', 'education-and-the-lgbt-community', 'gender-awareness-training',
    'gender-based-research-gaps', 'gender-diversity-training', 'gender-education',
    'gender-responsive-research', 'gender-sensitive-education', 'gender-sensitive-research',
    'gender-studies', 'health-education', 'human-rights-education', 'inclusive-education',
    'inclusive-lgbtqia-and-disability-research', 'intersex-education', 'kink-workshops',
    'lgbtq-education', 'lgbtq-studies', 'lgbtqia-healthcare-training', 'lgbtqia-history-education',
    'overdose-prevention-education', 'pleasure-based-education', 'pleasure-inclusive-education',
    'puberty-education', 'queer-pedagogy', 'queer-studies', 'queer-teachers', 'raver-etiquette',
    'respect-training', 'right-to-education', 'safe-space-training', 'sex-education',
    'sexual-health-education', 'student', 'teacher', 'training', 'transgender-studies',
    'university', 'women-s-studies', 'workshop',
  ]],
  ['events', [
    'christmas', 'fair', 'festival', 'halloween', 'lgbtq-festival',
    'lgbtqia-cultural-festivals-and-events', 'nudist-festival', 'nudist-wellness-festival',
    'parades', 'queer-film-festivals', 'whole-festival',
  ]],
  ['eye', [
    'eyeball-queen', 'genderqueer-visibility', 'lesbian-visibility', 'lgbtq-visibility',
    'lgbtqia-political-representation', 'lgbtqia-visibility-campaigns', 'non-binary-visibility',
    'queer-visibility', 'visibility',
  ]],
  ['eye-off', [
    'confidentiality', 'doxxing', 'privacy-invasion', 'privacy-protection',
  ]],
  ['film', [
    'actor-actress', 'classic-films', 'feminist-film', 'film', 'film-critic', 'film-editor',
    'filmmaker', 'gay-cinema', 'independent-cinema', 'italian-cinema', 'kink-documentaries',
    'lgbtq-cinema', 'new-queer-cinema', 'nudist-documentary', 'queer-cinema', 'queer-filmmakers',
  ]],
  ['flag', [
    'agender-pride-flag', 'aromantic-pride-flag', 'asexual-pride-flag', 'bear-brotherhood-flag',
    'bear-flag', 'bear-flag-gay-culture', 'bisexual-pride-flag', 'demisexual-pride-flag',
    'gay-flag-of-south-africa', 'gay-men-pride-flag', 'genderfluid-pride-flag',
    'genderqueer-pride-flag', 'global-pride-events', 'intersex-pride', 'intersex-pride-flag',
    'leather-pride-flag', 'lesbian-pride-flag', 'nonbinary-pride-flag', 'pansexual-flag',
    'pansexual-pride-flag', 'pennant', 'pride-events', 'pride-festival', 'pride-flag',
    'pride-month', 'pride-parade', 'progress-pride-flag',
  ]],
  ['flame', [
    'fire-masochist', 'fire-play',
  ]],
  ['flogger', [
    'breast-whipping', 'bull-whip', 'fire-flogging', 'flogger', 'single-tail-whips', 'whip',
    'whip-catcher', 'whip-wielder', 'whipping', 'whipping-kit', 'whipping-post', 'whips-and-crops',
  ]],
  ['gallery', [
    'art', 'lgbtq-museum', 'museum', 'nudist-art-exhibition',
  ]],
  ['gear-gag', [
    'ball-gag', 'gag-play', 'gag-slut', 'ring-gag',
  ]],
  ['gear-harness', [
    'hip-harness',
  ]],
  ['gear-pup', [
    'pet-play', 'puppy-play',
  ]],
  ['globe', [
    'asia', 'australia', 'canada', 'colombia', 'germany', 'iceland', 'india', 'israel', 'italy',
    'japan', 'malta', 'mexico', 'netherlands', 'new-zealand', 'peru', 'poland', 'russia',
    'south-africa', 'south-america', 'spain', 'turkey', 'united-states',
  ]],
  ['gym', [
    'gym',
  ]],
  ['handcuffs', [
    'bondage', 'bondage-and-discipline', 'bondage-restraints', 'cuffs', 'hair-bondage', 'handcuffs',
    'mental-bondage', 'restraint-devices', 'restraint-furniture', 'water-bondage',
  ]],
  ['hanger', [
    'cheerleading-uniforms', 'clothing', 'costumes-dressing-up', 'fashion-costume', 'fur-clothing',
    'gender-neutral-clothing', 'latex-clothing', 'leather-clothing', 'maid-uniforms',
    'military-uniforms', 'neoprene-clothing', 'pleather-clothing', 'polyurethane-clothing',
    'posture-clothing', 'rubber-clothing', 'shiny-clothing', 'spandex-clothing',
    'tearing-off-clothing', 'uniform', 'uniform-fetish',
  ]],
  ['health', [
    'bottom-surgery', 'breast-augmentation', 'breast-reduction', 'chest-masculinization-surgery',
    'circumcision', 'coercive-surgeries', 'cosmetic-surgery', 'facial-feminization-surgery',
    'female-genital-surgery', 'gender-affirmation-surgery',
    'gender-affirming-medical-interventions', 'gender-affirming-surgery',
    'gender-confirmation-surgery', 'gender-incongruence-of-childhood', 'gender-nullification',
    'gonadectomy', 'hysterectomy', 'intersex-healthcare', 'intersex-medical-interventions',
    'labiaplasty', 'metoidioplasty', 'orchiectomy', 'phalloplasty', 'plastic-surgery',
    'vaginoplasty',
  ]],
  ['help', [
    'self-help',
  ]],
  ['helpline', [
    'contraceptive-counseling', 'crisis-intervention', 'gender-affirming-counseling',
    'healthcare-access', 'intersex-peer-counseling', 'risk-reduction-counseling',
    'safer-use-outreach', 'sexual-health-counseling', 'sti-counseling', 'suicide-prevention',
    'test-result-counseling', 'transgender-healthcare-access',
  ]],
  ['history', [
    'asexual-history', 'bisexual-history', 'black-queer-history', 'gay-history',
    'historical-a-priori', 'historical-discontinuities',
    'history-of-christianity-and-homosexuality', 'history-of-gay-men-in-the-united-states',
    'history-of-lesbianism', 'legacy', 'lesbian-history', 'lgbt-history-of-germany',
    'lgbt-rights-in-the-20th-century', 'lgbtq-history', 'lgbtq-history-month', 'queer-history',
    'queer-history-appreciation', 'representation-in-queer-history', 'timeline-of-lgbt-history',
    'timeline-of-lgbt-history-20th-century', 'timeline-of-lgbt-history-21st-century',
    'trans-history',
  ]],
  ['home-base', [
    'apartments', 'bothies', 'community-center', 'extended-family', 'gender-inclusive-housing',
    'housing-equality', 'housing-for-queer-youth', 'inclusive-housing-options',
    'lgbtq-community-centers', 'nudist-community-center', 'queer-community-centers',
    'right-to-family', 'right-to-housing',
  ]],
  ['hours', [
    'half-life', 'round-the-clock',
  ]],
  ['idea', [
    'borderlands-theory', 'crip-theory', 'critical-disability-theory', 'gender-performance-theory',
    'gender-theory', 'neuroqueer-theory', 'psychological-theory', 'quare-theory',
    'social-construction-theory', 'theory',
  ]],
  ['identity', [
    'cisgender', 'gender-identity', 'non-binary', 'queer-identity', 'racial-identity',
    'sexual-orientation',
  ]],
  ['image', [
    'erotic-photography', 'genre-art-photography', 'kink-photography', 'nude-photography',
    'nudist-photography-exhibition', 'nudist-travel-photography', 'photographer', 'photography',
  ]],
  ['jewelry', [
    'boston-marriage', 'forced-marriage', 'freedom-rings', 'key-jewellery', 'symbolic-jewelry',
  ]],
  ['kegel', [
    'kegel-balls',
  ]],
  ['key', [
    'chastity-key-holding',
  ]],
  ['landmark', [
    'aids-memorials', 'cathedral', 'cultural-heritage-protection', 'landmark', 'lgbtq-landmark',
    'monuments', 'stolperstein',
  ]],
  ['layers', [
    'bigender', 'chains', 'chaps', 'jute', 'kink-outfits', 'lace', 'latex-fetish', 'leather-fetish',
    'leather-gloves-fetish', 'mat-bamboo', 'mat-ceramic', 'mat-cotton', 'mat-denim', 'mat-glass',
    'mat-gold', 'mat-lace', 'mat-latex', 'mat-leather', 'mat-mesh', 'mat-metal', 'mat-modal',
    'mat-nylon', 'mat-rubber', 'mat-satin', 'mat-silicone', 'mat-silver', 'mat-spandex',
    'mat-stainless-steel', 'mat-vegan-leather', 'mat-wood', 'mat-wool', 'rubber', 'rubber-fetish',
    'silk',
  ]],
  ['leaf', [
    'cannabis', 'medical-cannabis-program', 'tobacco',
  ]],
  ['library', [
    'audiobook', 'children-s-books', 'erotic-art-books', 'erotic-literature', 'feminist-literature',
    'feminist-theology', 'gay-literature', 'genre-biography', 'genre-comics', 'genre-erotica',
    'genre-fiction', 'genre-history', 'genre-horror', 'genre-kids', 'genre-memoir',
    'genre-mystery-thriller', 'genre-romance', 'genre-scifi-fantasy', 'genre-ya', 'graphic-novels',
    'lesbian-art-literature-etc', 'lgbtq-literature', 'lgbtq-literature-festivals', 'library',
    'literature', 'novels', 'queer-anti-racist-literature', 'queer-literature',
    'queer-theory-books', 'reading', 'trans-literature', 'young-adult-books',
  ]],
  ['link', [
    'abroromantic', 'alloromantic', 'apresromantic', 'aromantic', 'autoromantic', 'benignoromantic',
    'biromantic', 'boo', 'coalition-building', 'demiromantic', 'domestic-partnership',
    'fear-of-commitment', 'feminist-solidarity', 'fictoromantic', 'finromantic', 'frayromantic',
    'grayromantic', 'gyneromantic', 'heteroromantic', 'homoromantic', 'international-solidarity',
    'lesbian-couple', 'life-partner', 'lithromantic', 'long-distance-relationship', 'megasexual',
    'minromantic', 'monogamous', 'monogamy', 'monoromantic', 'nebularomantic', 'ninromantic',
    'noetiromantic', 'omniromantic', 'panromantic', 'polyromantic', 'queer-anti-racist-coalitions',
    'recipromantic', 'romantic', 'romantic-attraction', 'romantic-orientation',
    'romantically-fluid', 'sapioromantic', 'solidarity', 'soulmate',
  ]],
  ['lock', [
    'arbitrary-detention', 'detention', 'freedom-from-arbitrary-detention', 'immigration-detention',
    'lgbtq-censorship-challenges', 'political-repression', 'prison',
    'transgender-rights-in-prisons',
  ]],
  ['luggage', [
    'tourists',
  ]],
  ['makeup-compact', [
    'makeup', 'makeup-beauty',
  ]],
  ['march', [
    'activist', 'asexual-activism', 'harvey-milk-assassination-protests', 'lgbt-activism',
    'lgbtq-activist', 'open-source-activist', 'performativity-and-resistance',
    'resistance-as-a-form-of-knowledge',
  ]],
  ['measuring-tape', [
    'fit-unisex', 'size-2xl', 'size-3xl', 'size-4xl', 'size-5xl', 'size-l', 'size-m',
    'size-one-size', 'size-s', 'size-xl', 'size-xs', 'size-xxs',
  ]],
  ['megaphone', [
    'advocacy', 'advocacy-campaign', 'advocacy-groups', 'advocacy-protection',
    'disability-advocacy', 'freedom-of-expression', 'freedom-of-opinion-and-expression',
    'freedom-of-speech', 'gender-equality-advocacy', 'health-advocacy',
    'international-lgbtq-rights-advocacy', 'lgbt-advocacy', 'lgbtq-advocacy',
    'mental-health-advocacy', 'public-awareness-campaigns', 'trans-advocacy', 'two-spirit-advocacy',
  ]],
  ['mic', [
    'rapper', 'singer-songwriter', 'voice-actor',
  ]],
  ['microbe', [
    'bacterial-infections', 'bacterial-vaginosis', 'candidiasis', 'chlamydia',
    'congenital-syphilis', 'early-syphilis', 'genital-herpes', 'gonorrhea', 'hepatitis',
    'hepatitis-a', 'hepatitis-a-b', 'hepatitis-b', 'hepatitis-c', 'herpes', 'hpv',
    'human-papillomavirus-hpv', 'late-syphilis', 'mpox', 'mycoplasma-genitalium',
    'opportunistic-infections', 'oral-candidiasis-thrush', 'primary-syphilis',
    'reproductive-infections', 'secondary-syphilis', 'sexually-transmitted-hepatitis',
    'sexually-transmitted-infection', 'sti', 'syphilis', 'tertiary-syphilis', 'trichomoniasis',
    'urinary-tract-infection', 'vaginal-infections', 'yeast-infection',
  ]],
  ['money', [
    'fundraiser',
  ]],
  ['moon', [
    'astrology',
  ]],
  ['musical-note', [
    'band', 'blues-music', 'bts', 'composer', 'concert', 'concert-hall', 'country-music', 'dj',
    'drag-music', 'electronic-music', 'hip-hop', 'jazz-music', 'k-pop', 'lgbt-music', 'live-music',
    'live-music-venue', 'local-bands', 'music', 'music-club', 'music-venue', 'musical', 'musician',
    'nudist-music-festival', 'opera', 'pop-music', 'queer-hip-hop', 'queer-music',
    'queer-music-festivals', 'queercore', 'rock-music', 'spanish-music',
  ]],
  ['news', [
    'breaking-news', 'feminist-journalism', 'international-news', 'journalist', 'news',
    'news-censorship', 'news-discrimination', 'news-education', 'news-pride', 'news-religion',
    'news-sports', 'queer-journalists',
  ]],
  ['nightlife', [
    'alcohol', 'bar-service', 'blackout-alcohol-induced-amnesia', 'cocktails', 'cool-drinks',
    'craft-beer', 'crossfading-mixing-alcohol-cannabis', 'gin', 'happy-hour', 'happy-hour-prices',
    'local-drinks', 'low-risk-drinking-guidelines', 'social-drinking', 'vodka', 'wine',
  ]],
  ['outdoor', [
    'camping', 'community-garden', 'garden', 'hiking', 'mountain', 'nude-hiking', 'nudist-camp',
    'nudist-hiking-group', 'nudist-hiking-trail', 'outdoor', 'outdoor-activities', 'outdoor-pool',
    'outdoor-recreation', 'outdoor-seating', 'outdoor-space', 'park', 'tents',
  ]],
  ['paddle', [
    'bare-bottom-spanking', 'bare-handed-spanking', 'belt-spanking', 'breast-spanking', 'cane',
    'caning', 'clit-spanking', 'erotic-spanking', 'hairbrush-spanking', 'inner-thigh-spanking',
    'maintenance-spanking', 'otk-spanking', 'over-the-knee-otk-spanking', 'paddling',
    'pussy-spanking', 'self-spanking', 'spanking-horse', 'spanking-paddle',
  ]],
  ['palette', [
    'color-beige', 'color-black', 'color-blue', 'color-brown', 'color-clear', 'color-cream',
    'color-green', 'color-grey', 'color-multicolor', 'color-navy', 'color-orange', 'color-pink',
    'color-purple', 'color-rainbow', 'color-red', 'color-rose-gold', 'color-white', 'color-yellow',
    'fashion-designer', 'illustrator', 'nudist-life-drawing', 'painter', 'tattoos',
  ]],
  ['parking', [
    'parking',
  ]],
  ['pet', [
    'dog-friendly',
  ]],
  ['phone', [
    'grindr',
  ]],
  ['pill', [
    'acyclovir', 'alprazolam', 'amphetamine', 'anafranil', 'anti-androgen-therapy',
    'anti-hormone-therapy', 'antibiotic-resistance', 'antibiotic-treatment',
    'antiretroviral-therapy', 'antiretroviral-therapy-art', 'antiviral-treatment', 'azithromycin',
    'benzodiazepines', 'bictegravir', 'birth-control-pill', 'bromazepam', 'buprenorphine',
    'candyflipping-lsd-mdma', 'cathinones', 'ceftriaxone', 'clomiphene-citrate', 'darunavir',
    'descovy', 'diazepam', 'dolutegravir', 'doxy-pep', 'doxycycline', 'efavirenz',
    'emtricitabine-tenofovir-disoproxil-fumarate', 'estrace-estradiol', 'estradiol',
    'estradiol-various-formulations', 'estriol', 'estrogen-replacement-therapy', 'estrogen-therapy',
    'estrogen-vaginal-cream', 'famciclovir', 'feminizing-hormone-therapy', 'fentanyl',
    'hormonal-birth-control', 'hormone-therapy', 'hormone-therapy-consent',
    'hormone-therapy-monitoring', 'hormone-therapy-side-effects', 'ketamine', 'ketamine-bladder',
    'long-acting-cabotegravir', 'lorazepam', 'mdma', 'medication', 'medication-assisted-treatment',
    'medication-assisted-treatment-mat', 'methadone', 'methamphetamine', 'methcathinone',
    'methylphenidate', 'metronidazole', 'morning-after-pill', 'morphine', 'naloxone',
    'neuroleptics', 'opioids', 'partial-agonist', 'pep', 'pep-post-exposure-prophylaxis',
    'pregabalin', 'prep', 'prep-adherence', 'prep-resistant-hiv', 'progesterone',
    'progestin-only-pill', 'puberty-blockers', 'speedballing-opioid-stimulant', 'stimulants',
    'sustained-release', 'tadalafil', 'testosterone', 'testosterone-cypionate',
    'testosterone-enanthate', 'testosterone-replacement-therapy', 'testosterone-therapy',
    'tilidine', 'tinidazole', 'tramadol', 'transdermal-testosterone', 'trip-killer', 'truvada',
    'valacyclovir', 'vyleesi',
  ]],
  ['plane', [
    'airport',
  ]],
  ['platform-heel', [
    'high-heels-fetish',
  ]],
  ['profile', [
    'age-regressor', 'anal-master', 'anguisette', 'ass-master', 'ballbuster', 'battle-sub',
    'big-brother', 'big-sister', 'big-spoon', 'blood-player', 'bondage-switch', 'bondage-top',
    'bottom', 'brat', 'brat-breaker', 'brat-enabler', 'brat-handler', 'brat-tamer', 'brat-wrangler',
    'bratty-sub', 'captor', 'castrator', 'chastity-queen', 'cock-socket', 'coming-out',
    'cuddle-top', 'devourer', 'disciplinarian', 'doctor', 'dollmaker', 'dom-me-tamer', 'dominant',
    'dominant-masochist', 'dominant-sadist', 'emotional-support-human-esh', 'energy-player',
    'feedee', 'feeder', 'female-dominance', 'female-submission', 'feminizer', 'fire-bottom',
    'fire-top', 'fistee', 'fister', 'fisting-top', 'food-player', 'foot-top', 'gainer',
    'gentle-dom-me', 'gooner', 'grappler', 'housewife', 'hypno-bottom', 'impact-bottom',
    'impact-partner', 'impact-top', 'inflatee', 'jester', 'kinkster', 'little-princess',
    'masochist', 'meat', 'mummification-top', 'needle-bottom', 'needle-switch', 'needle-top',
    'object', 'owner', 'parent', 'piggy', 'pillow-prince', 'piss-drinker', 'player', 'pleasure-dom',
    'primal-partner', 'princess-domme', 'puppeteer', 'rigger', 'roleplayer', 'sadist',
    'sadistic-dom-me', 'scene-partner', 'sensation-bottom', 'sensation-top', 'sensual-dominant',
    'sensualist', 'service-dom-me', 'service-submissive', 'sexual-identity-development',
    'sharps-bottom', 'sharps-top', 'sissifier', 'sissy', 'slave', 'slut-trainer', 'strap-on-domme',
    'sub', 'submissive', 'submissive-masochist', 'submissive-sadist', 'supplicant', 'tamer',
    'taskmaster', 'tickle-toy', 'top', 'unruly-submissive',
  ]],
  ['quote', [
    'genre-poetry', 'poet', 'queer-poetry',
  ]],
  ['rainbow', [
    'lgbt', 'lgbti', 'lgbtiq', 'lgbtq', 'lgbtq-identity', 'lgbtq-lgbtqia-identity', 'lgbtq-people',
    'lgbtqqia', 'rainbow-crossing', 'rainbow-plaque',
  ]],
  ['restaurant', [
    'american-cuisine', 'appetizers', 'asian-cuisine', 'bakery', 'bar-food', 'bistro',
    'brazilian-food', 'californian-cuisine', 'californian-restaurant', 'casual-dining',
    'chinese-food', 'chinese-restaurant', 'comfort-food', 'desert-dining', 'dining-and-drinking',
    'dinner-option', 'dinner-spot', 'fast-food', 'fine-dining', 'food', 'food-and-drink',
    'food-service', 'food-shop', 'french-cuisine', 'french-food', 'gb-restaurant',
    'georgian-cuisine', 'german-cuisine', 'greek-cuisine', 'hungarian-cuisine', 'indian-cuisine',
    'indonesian-cuisine', 'international-cuisine', 'italian-food', 'japanese-cuisine',
    'korean-food', 'lunch', 'lunch-option', 'mediterranean-cuisine', 'mexican-cuisine',
    'moroccan-cuisine', 'neighborhood-restaurant', 'nigerian-cuisine', 'parisian-restaurant',
    'peruvian-cuisine', 'pizza', 'pub-food', 'restaurant', 'restaurants-dining', 'spanish-cuisine',
    'swiss-cuisine', 'taiwanese-cuisine', 'tapas', 'thai-cuisine', 'theme-restaurant',
    'turkish-cuisine', 'upstairs-restaurant', 'vegan-and-vegetarian-restaurant', 'vegan-food',
  ]],
  ['restroom', [
    'accessible-restrooms', 'restrooms', 'single-stall-bathrooms',
  ]],
  ['rope-play', [
    'hemp-rope', 'peer-rope', 'rope-brat', 'rope-coven', 'rope-family', 'rope-jam', 'rope-social',
  ]],
  ['route', [
    'city-tour', 'gender-transition', 'lgbtq-tour', 'safari-tours', 'tour',
  ]],
  ['sapphic', [
    'women-who-have-sex-with-women',
  ]],
  ['sauna', [
    'gay-sauna', 'korean-spa', 'lgbtq-spa', 'male-sauna', 'male-spa', 'nudist-hot-springs',
    'nudist-sauna', 'nudist-spa', 'sauna-facilities', 'spa', 'spa-facilities', 'spa-services',
    'steam-room',
  ]],
  ['scales', [
    'anti-discrimination-law', 'anti-feminism', 'asexual-rights', 'bathroom-access-rights',
    'bisexual-rights', 'black-feminism', 'children-s-rights', 'civil-and-political-rights',
    'civil-rights-activist', 'climate-justice-queer-resilience', 'consent-sexual-rights',
    'criminalization', 'criminalization-of-homosexuality', 'cultural-rights', 'decriminalization',
    'decriminalization-of-homosexuality', 'disability-justice-in-queer-activism',
    'economic-social-and-cultural-rights', 'elderly-rights', 'equality', 'feminism',
    'feminist-theory', 'gender-equality', 'gender-justice', 'gender-responsive-justice-system',
    'group-and-collective-rights', 'healing-justice', 'human-rights', 'inalienable-rights',
    'indigenous-rights', 'indivisibility-of-rights', 'inter-american-court-of-human-rights',
    'international-covenant-on-civil-and-political-rights',
    'international-covenant-on-economic-social-and-cultural-rights', 'international-criminal-court',
    'intersectional-feminism', 'intersex-rights', 'jurist', 'justice', 'language-rights', 'legal',
    'legal-aid', 'legal-process', 'legalization-vs-decriminalization', 'lesbian-feminism',
    'lesbian-rights', 'lgbtq-couples-criminalization', 'lgbtqia-cultural-rights',
    'lgbtqia-elders-rights', 'lgbtqia-rights', 'lgbtqia-youth-rights', 'military-service-equality',
    'minority-rights', 'nudist-equality', 'opposition-to-feminism', 'political-rights',
    'prisoners-rights', 'privacy-rights', 'pronoun-rights', 'queer-migrant-rights',
    'racial-justice', 'reproductive-justice', 'reproductive-rights', 'restorative-justice',
    'right-to-marriage-equality', 'right-to-marry-and-to-found-a-family', 'rights',
    'sex-positive-feminism', 'sex-worker-rights', 'sexual-and-reproductive-health-and-rights',
    'sexual-rights', 'sexuality-decriminalization', 'social-equality', 'social-justice',
    'social-rights', 'socialism-and-lgbt-rights', 'strategic-litigation',
    'universal-declaration-of-human-rights', 'women-s-rights',
  ]],
  ['screen', [
    'gaming', 'queer-representation-in-video-games',
  ]],
  ['seat', [
    'sitting-69', 'sitting-blowjob', 'sitting-bull', 'sitting-cannonball', 'sitting-rimjob',
  ]],
  ['shield', [
    'asylum', 'asylum-for-lgbtq-refugees', 'asylum-process', 'asylum-refugees', 'asylum-rights',
    'coping-strategies', 'equal-protection-clause', 'law-enforcement', 'legal-protection',
    'lgbtqia-refugee-rights', 'maternity-protection', 'protective-factors', 'queer-asylum-seekers',
    'refugee', 'refugee-protection', 'refugee-reunification', 'refugee-rights', 'refugee-status',
    'refugee-status-determination-rsd', 'right-to-asylum', 'temporary-protection',
    'whistleblower-protection',
  ]],
  ['shield-alert', [
    'anti-asexual-discrimination', 'anti-gay-discrimination', 'anti-lesbian-discrimination',
    'anti-queer-discrimination', 'anti-transgender-discrimination', 'anti-violence',
    'bdsm-consent-violation', 'biphobia', 'colorism', 'consent-violation', 'domestic-violence',
    'hate-crimes', 'he-she', 'homophobia', 'intimate-partner-abuse', 'intimate-partner-violence',
    'lesbophobia', 'minority-stress', 'online-abuse-reporting', 'queerphobia',
    'race-based-discrimination', 'racism', 'serophobia', 'sexual-assault', 'sexual-harassment',
    'sexual-violence-prevention', 'slut', 'transgender-discrimination', 'transmisogynoir',
    'transphobia',
  ]],
  ['shield-check', [
    'disinfection', 'dual-protection', 'event-safety', 'overdose-prevention-kit', 'rave-safety',
    'safe-space', 'safe-space-guidelines', 'sterilization', 'sti-std-prevention',
    'transgender-safe-space', 'travel-safety',
  ]],
  ['shoe', [
    'ballet-boots-shoes', 'boot', 'boot-blacking', 'boot-licking', 'boot-worship', 'shoes',
  ]],
  ['shop', [
    'adult-store', 'barber-shop', 'book-store', 'bookshop', 'flea-markets', 'gift-shop',
    'independent-bookstore', 'lgbtq-bookstore', 'liquor-store', 'local-shop', 'market',
    'market-place', 'pastry-shops', 'retail', 'retail-shopping', 'sex-shop', 'shop',
    'souvenir-store', 'specialty-shop', 'store',
  ]],
  ['skirt', [
    'kilts', 'skirts',
  ]],
  ['smile', [
    'humor',
  ]],
  ['snow', [
    'figure-skating', 'skiing',
  ]],
  ['sock', [
    'knee-high-socks',
  ]],
  ['stage', [
    'cabaret', 'drag-performance', 'lgbt-theatre', 'lgbtq-theater', 'old-theatre', 'performance',
    'performance-art', 'performing-arts', 'pride-performance', 'theatre', 'theatre-festival',
  ]],
  ['sunglasses', [
    'glasses-fetish',
  ]],
  ['swap', [
    'bottom-leaning-switch', 'dom-leaning-switch', 'electro-switch', 'emotional-sadomasochist',
    'foot-switch', 'sensual-switch', 'service-switch', 'sub-leaning-switch', 'top-leaning-switch',
  ]],
  ['swimwear', [
    'nudist-swimwear', 'swimsuit-fetish',
  ]],
  ['syringe', [
    'clean-works-sterile-injecting-equipment', 'contraceptive-injection', 'hpv-vaccination',
    'needle-exchange-program', 'safe-consumption-site-supervised-injection-facility',
    'safer-injecting', 'safer-injection-practices', 'silicone-injection', 'vaccination', 'vaccine',
  ]],
  ['tag', [
    'black-triangle-badge',
  ]],
  ['test-tube', [
    'anal-cancer-screening', 'anonymous-testing', 'biological-determinism',
    'biology-and-sexual-orientation', 'biology-based-categorization', 'breast-cancer-screening',
    'cancer-screening', 'cervical-cancer-screening', 'diagnostic-testing', 'drug-checking',
    'false-negative', 'false-positive', 'fentanyl-test-strips', 'gram-stain', 'hiv-testing',
    'human-immunodeficiency-virus-hiv-testing', 'infectious-disease-testing', 'lgbtq-biology',
    'medical-testing', 'neuroscience', 'neuroscience-and-sexual-orientation', 'pill-test-kit',
    'point-of-care-testing', 'prevention-testing', 'prostate-specific-antigen-psa-test',
    'reagent-testing', 'resistance-testing', 'science', 'serological-test',
    'sex-as-a-biological-variable', 'sexual-health-screening',
    'sexually-transmitted-infection-sti-testing', 'swab', 'testicular-cancer-screening',
    'urethral-swab',
  ]],
  ['ticket', [
    'folsom-europe', 'folsom-europe-2026', 'kink-events', 'ropetober',
  ]],
  ['toy-chastity', [
    'chastity', 'chastity-belt', 'chastity-cage', 'male-chastity-device',
  ]],
  ['toy-cockring', [
    'cock-ring',
  ]],
  ['toy-dildo', [
    'double-ended-dildo', 'dragon-dildo', 'electric-dildo', 'glass-dildo', 'squirting-dildo',
    'stainless-steel-dildo',
  ]],
  ['toy-lube', [
    'anal-lube', 'lube-warmer',
  ]],
  ['toy-plug', [
    'butt-plugs-in-public', 'remote-controlled-butt-plug', 'vibrating-butt-plug',
  ]],
  ['toy-pump', [
    'penis-pump', 'vacuum-pump',
  ]],
  ['toy-vibrator', [
    'anal-vibrator', 'clitoral-vibrator', 'finger-vibrator', 'g-spot-vibrator', 'rabbit-vibrator',
    'remote-controlled-vibrator', 'thrusting-vibrator', 'vibrator', 'vibrator-warmer',
  ]],
  ['train', [
    'train-station',
  ]],
  ['underwear', [
    'binder', 'binding', 'edible-underwear', 'lingerie-fetish', 'packing', 'sissy-panties',
    'the-no-panties-rule', 'tucking', 'vintage-lingerie',
  ]],
  ['unlink', [
    'breakup', 'divorce', 'divorce-mediation', 'divorced', 'ghosting', 'infidelity', 'separation',
    'separation-management', 'widow', 'widow-er',
  ]],
  ['unlock', [
    'escape-artist',
  ]],
  ['video', [
    'animation', 'live-streaming', 'tv', 'tv-moderator', 'tv-presenter',
  ]],
  ['walk', [
    'running-club', 'track-and-field', 'track-and-field-athlete', 'walking-tour',
  ]],
  ['waves', [
    'beach-resort', 'canary-islands', 'caribbean', 'clothing-optional-beaches', 'coastal',
    'croatian-coast', 'diving', 'east-coast', 'faunetflux', 'florida-keys', 'gender-fluid',
    'greek-islands', 'indonesia', 'island', 'key-west', 'lagos-island', 'lake', 'lake-resort',
    'lake-tahoe', 'mediterranean-coast', 'nude-swimming', 'nudist-swimming-pool', 'ponds', 'pool',
    'pool-hall', 'pool-tables', 'spanish-coast', 'surfing', 'swimming', 'swimming-pool',
    'victoria-island',
  ]],
  ['wifi', [
    'internet-access',
  ]],
  ['wig', [
    'drag-wig', 'lace-front-wig',
  ]],
];
