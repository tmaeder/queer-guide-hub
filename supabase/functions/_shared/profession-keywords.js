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
  'actor': ['actor', 'actress', 'film', 'television', 'performer'],
  'singer': ['singer', 'vocalist', 'musician', 'opera'],
  'musician': ['musician', 'composer', 'instrumentalist', 'singer'],
  'writer': ['writer', 'author', 'novelist', 'poet', 'playwright', 'journalist', 'essayist', 'lyricist', 'dramatist', 'screenwriter'],
  'politician': ['politician', 'statesman', 'stateswoman', 'minister', 'senator', 'representative'],
  'activist': ['activist', 'campaigner'],
  'artist': ['artist', 'painter', 'sculptor', 'photographer', 'illustrator'],
  'scientist': ['scientist', 'researcher', 'mathematician', 'physicist', 'biologist', 'chemist'],
  'director': ['director', 'filmmaker'],
  'producer': ['producer'],
  'athlete': ['athlete', 'player', 'sportsperson', 'footballer', 'basketball', 'tennis', 'swimmer', 'runner', 'boxer', 'equestrian', 'wrestler', 'cyclist', 'sprinter', 'fighter', 'rower', 'gymnast', 'skater'],
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
  'military': ['military', 'officer', 'soldier', 'sailor', 'naval'],
  'lawyer': ['lawyer', 'jurist', 'attorney', 'barrister', 'judge'],
  'photographer': ['photographer'],
  'composer': ['composer', 'musician', 'conductor'],
  'dancer': ['dancer', 'choreographer', 'ballet'],
  'historian': ['historian', 'history'],
  'physician': ['physician', 'doctor', 'surgeon', 'medic'],
  'architect': ['architect'],
  'designer': ['designer'],
  'diplomat': ['diplomat', 'ambassador'],
  'entrepreneur': ['entrepreneur', 'businessperson'],
  'teacher': ['teacher', 'educator', 'professor'],
  'singer-songwriter': ['singer', 'songwriter', 'musician'],
  'tv presenter': ['presenter', 'host', 'television'],
  // NOTE: no standalone 'wrestler' key — it is an alias onto 'athlete' below.
  // A key that also appears in PROFESSION_ALIASES silently wins over the alias
  // (lookup() checks this table first), which is how it would drift narrower.
};

// German (and German-suffixed) forms present in this corpus, expressed as
// ALIASES onto the English keys above rather than as duplicate keyword lists.
//
// They were duplicated lists at first and immediately drifted: 'sportler'
// carried only ['athlete','player','sportsperson'] while the English 'athlete'
// also lists boxer/swimmer/runner/tennis, so Irma Testa ("Italian boxer") and
// Hans Peter Minderhoud ("equestrian") — both plainly the right person — were
// scored as namesake conflicts. Aliasing makes that class of drift impossible:
// there is exactly one keyword list per concept.
//
// keywordsFor() strips "/in", ":in" and trailing "in" before lookup, so only the
// masculine stem needs an entry.
/** @type {Record<string, string>} */
export const PROFESSION_ALIASES = {
  schriftsteller: 'writer',
  autor: 'writer',
  dichter: 'writer',
  lyriker: 'writer',
  dramatiker: 'writer',
  politiker: 'politician',
  aktivist: 'activist',
  'lgbt-aktivist': 'activist',
  schauspieler: 'actor',
  darsteller: 'actor',
  saenger: 'singer',
  sanger: 'singer',
  opernsaenger: 'singer',
  opernsanger: 'singer',
  musiker: 'musician',
  komponist: 'composer',
  dirigent: 'musician',
  texter: 'writer',
  maler: 'artist',
  kuenstler: 'artist',
  kunstler: 'artist',
  bildhauer: 'artist',
  fotograf: 'photographer',
  regisseur: 'director',
  filmemacher: 'director',
  produzent: 'producer',
  moderator: 'tv presenter',
  komiker: 'comedian',
  sportler: 'athlete',
  fussballspieler: 'athlete',
  basketballspieler: 'athlete',
  sprinter: 'athlete',
  reiter: 'athlete',
  'mma-kaempfer': 'athlete',
  'mma-kampfer': 'athlete',
  wrestler: 'athlete',
  taenzer: 'dancer',
  tanzer: 'dancer',
  choreograf: 'dancer',
  modedesigner: 'fashion designer',
  historiker: 'historian',
  wissenschaftler: 'scientist',
  arzt: 'physician',
  aerztin: 'physician',
  richter: 'lawyer',
  soldat: 'military',
  koch: 'chef',
  koechin: 'chef',
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
/** Keyword list for one already-normalised token, following an alias if present. */
function lookup(token) {
  return PROFESSION_KEYWORDS[token] ?? PROFESSION_KEYWORDS[PROFESSION_ALIASES[token]] ?? null;
}

export function keywordsFor(profession) {
  const p = profession.trim().toLowerCase();
  const direct = lookup(p);
  if (direct) return direct;

  // The corpus separates multi-value professions with ";" and "," as well as
  // "/" — "Journalist/in; Schriftsteller/in", "Tänzer/in, Choreograf/in".
  const kws = new Set();
  for (const raw of p.split(/[\s,;/]+/).filter(Boolean)) {
    for (const form of stripGenderSuffix(raw)) {
      const set = lookup(form);
      if (set) set.forEach((k) => kws.add(k));
    }
  }
  if (kws.size === 0) {
    for (const form of stripGenderSuffix(p)) {
      const set = lookup(form);
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
