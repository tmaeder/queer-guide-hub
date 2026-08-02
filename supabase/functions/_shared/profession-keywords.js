// Profession → English-occupation-keyword vocabulary.
//
// Plain JS on purpose: this is imported BOTH by Deno edge functions
// (_shared/wikidata-resolve.ts) and by the Node repair script
// (scripts/data-quality/verify-personality-wikidata.mjs). A duplicated copy is
// exactly how the two would drift, and a drifted copy here does not fail loudly
// — it silently reclassifies real historical figures as namesake conflicts.
//
// VALUES ARE ALWAYS ENGLISH. They are matched against Wikidata P106 occupation
// labels fetched with `languages=en`. KEYS may be any language, because
// `personalities.profession` is free text and roughly a third of this corpus is
// German ("Schriftsteller/in", "Politiker/in").

/** @type {Record<string, string[]>} */
export const PROFESSION_KEYWORDS = {
  'adult performer': ['porn', 'adult', 'erotic', 'escort', 'pornographic'],
  'pornographic actor': ['porn', 'adult', 'erotic'],
  'actor': ['actor', 'actress', 'film', 'television'],
  'singer': ['singer', 'vocalist', 'musician'],
  'musician': ['musician', 'composer', 'instrumentalist', 'singer'],
  'writer': ['writer', 'author', 'novelist', 'poet', 'playwright', 'journalist'],
  'politician': ['politician', 'statesman', 'stateswoman', 'minister', 'senator', 'representative'],
  'activist': ['activist', 'campaigner'],
  'artist': ['artist', 'painter', 'sculptor', 'photographer'],
  'scientist': ['scientist', 'researcher', 'mathematician', 'physicist', 'biologist', 'chemist'],
  'director': ['director', 'filmmaker'],
  'producer': ['producer'],
  'athlete': ['athlete', 'player', 'sportsperson', 'footballer', 'basketball', 'tennis', 'swimmer', 'runner', 'boxer'],
  'drag queen': ['drag', 'performer'],
  'drag king': ['drag', 'performer'],
  'dragqueen': ['drag', 'performer'],
  'model': ['model'],
  'fashion designer': ['designer', 'fashion'],
  'chef': ['chef', 'cook', 'restaurateur'],
  'dj': ['dj', 'disc jockey', 'musician', 'producer'],
  'comedian': ['comedian', 'humorist'],
  'journalist': ['journalist', 'reporter', 'columnist'],
  'researcher': ['researcher', 'scientist', 'academic'],
  'entertainer': ['entertainer', 'performer'],
  'rapper': ['rapper', 'musician', 'singer'],
  'youtuber': ['youtuber', 'streamer', 'content creator'],
  'military': ['military', 'officer', 'soldier'],
  'lawyer': ['lawyer', 'jurist', 'attorney', 'barrister'],
  'photographer': ['photographer'],
  'composer': ['composer', 'musician'],
  'singer-songwriter': ['singer', 'songwriter', 'musician'],
  'tv presenter': ['presenter', 'host', 'television'],
  'wrestler': ['wrestler', 'athlete'],

  // --- German (and German-suffixed) forms present in this corpus. -------------
  // keywordsFor() strips "/in", ":in" and trailing "in" before lookup, so only
  // the masculine stem needs a key.
  'schriftsteller': ['writer', 'author', 'novelist', 'poet', 'playwright'],
  'autor': ['writer', 'author', 'novelist', 'essayist'],
  'dichter': ['poet', 'writer', 'author'],
  'lyriker': ['poet', 'writer', 'lyricist'],
  'dramatiker': ['playwright', 'dramatist', 'writer'],
  'politiker': ['politician', 'statesman', 'minister', 'senator', 'representative'],
  'aktivist': ['activist', 'campaigner'],
  'lgbt-aktivist': ['activist', 'campaigner'],
  'schauspieler': ['actor', 'actress', 'film', 'television'],
  'darsteller': ['actor', 'actress', 'performer'],
  'saenger': ['singer', 'vocalist', 'musician'],
  'sanger': ['singer', 'vocalist', 'musician'],
  'opernsaenger': ['singer', 'opera', 'vocalist'],
  'opernsanger': ['singer', 'opera', 'vocalist'],
  'musiker': ['musician', 'composer', 'instrumentalist'],
  'komponist': ['composer', 'musician'],
  'dirigent': ['conductor', 'musician'],
  'texter': ['lyricist', 'songwriter', 'writer'],
  'maler': ['painter', 'artist'],
  'kuenstler': ['artist', 'painter', 'sculptor'],
  'kunstler': ['artist', 'painter', 'sculptor'],
  'bildhauer': ['sculptor', 'artist'],
  'fotograf': ['photographer'],
  'regisseur': ['director', 'filmmaker'],
  'filmemacher': ['filmmaker', 'director'],
  'produzent': ['producer'],
  'moderator': ['presenter', 'host', 'television'],
  'komiker': ['comedian', 'humorist'],
  'sportler': ['athlete', 'player', 'sportsperson'],
  'fussballspieler': ['footballer', 'player', 'athlete'],
  'basketballspieler': ['basketball', 'player', 'athlete'],
  'sprinter': ['sprinter', 'athlete', 'runner'],
  'reiter': ['equestrian', 'rider', 'athlete'],
  'mma-kaempfer': ['fighter', 'martial art', 'athlete'],
  'mma-kampfer': ['fighter', 'martial art', 'athlete'],
  'taenzer': ['dancer', 'choreographer'],
  'tanzer': ['dancer', 'choreographer'],
  'choreograf': ['choreographer', 'dancer'],
  'modedesigner': ['designer', 'fashion'],
  'designer': ['designer'],
  'architekt': ['architect'],
  'historiker': ['historian'],
  'wissenschaftler': ['scientist', 'researcher', 'academic'],
  'arzt': ['physician', 'doctor', 'surgeon'],
  'aerztin': ['physician', 'doctor', 'surgeon'],
  'richter': ['judge', 'jurist'],
  'diplomat': ['diplomat', 'ambassador'],
  'unternehmer': ['entrepreneur', 'businessperson'],
  'soldat': ['soldier', 'military', 'officer'],
  'lehrer': ['teacher', 'educator'],
  'koch': ['chef', 'cook', 'restaurateur'],
  'koechin': ['chef', 'cook', 'restaurateur'],
  'sprecher': ['voice actor', 'announcer', 'spokesperson'],
  'creator': ['content creator', 'youtuber', 'streamer'],
};

/**
 * Expand a token into the spelling variants the corpus actually uses:
 * "Schriftsteller/in", "Schriftsteller:in", "Schriftstellerin" and
 * "Lyriker:in" all need to reach the masculine stem.
 * @param {string} token
 * @returns {string[]}
 */
export function stripGenderSuffix(token) {
  const forms = new Set([token]);
  const base = token.replace(/[/:]in$/, '');
  forms.add(base);
  if (base.endsWith('in')) forms.add(base.slice(0, -2));
  for (const f of [...forms]) {
    const folded = f
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    if (folded !== f) forms.add(folded);
    const stripped = f
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
    if (stripped !== f) forms.add(stripped);
  }
  return [...forms].filter(Boolean);
}

/**
 * Map a free-text profession onto English occupation keywords.
 *
 * When nothing maps it returns `[profession]` — a WEAK fallback that can never
 * match an English P106 label. Callers that act destructively on a zero score
 * MUST check hasProfessionMapping() first and treat "no mapping" as
 * unverifiable rather than as a namesake conflict.
 * @param {string} profession
 * @returns {string[]}
 */
export function keywordsFor(profession) {
  const p = profession.trim().toLowerCase();
  if (PROFESSION_KEYWORDS[p]) return PROFESSION_KEYWORDS[p];

  // The corpus separates multi-value professions with ";" and "," as well as
  // "/" — "Journalist/in; Schriftsteller/in", "Tänzer/in, Choreograf/in".
  const kws = new Set();
  for (const raw of p.split(/[\s,;/]+/).filter(Boolean)) {
    for (const form of stripGenderSuffix(raw)) {
      const set = PROFESSION_KEYWORDS[form];
      if (set) set.forEach((k) => kws.add(k));
    }
  }
  if (kws.size === 0) {
    for (const form of stripGenderSuffix(p)) {
      const set = PROFESSION_KEYWORDS[form];
      if (set) set.forEach((k) => kws.add(k));
    }
  }
  if (kws.size === 0) kws.add(p);
  return [...kws];
}

/**
 * True when `profession` maps to a real English keyword set rather than the
 * raw-string fallback.
 * @param {string | null | undefined} profession
 * @returns {boolean}
 */
export function hasProfessionMapping(profession) {
  if (!profession || !profession.trim()) return false;
  const kws = keywordsFor(profession);
  return !(kws.length === 1 && kws[0] === profession.trim().toLowerCase());
}

/**
 * Fraction of `keywords` that appear in any of `occupations`.
 * @param {string[]} occupations lowercased English P106 labels
 * @param {string[]} keywords
 * @returns {number} 0..1
 */
export function scoreOccupationMatch(occupations, keywords) {
  if (!occupations.length || !keywords.length) return 0;
  let hits = 0;
  for (const kw of keywords) {
    if (occupations.some((o) => o.includes(kw))) hits++;
  }
  return hits / keywords.length;
}
