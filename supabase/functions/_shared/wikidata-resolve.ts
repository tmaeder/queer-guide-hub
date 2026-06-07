// Precision-first, recall-improved Wikidata resolver for personalities.
//
// Replaces name-only `wbsearchentities&limit=1` lookups. The earlier version of
// this module fixed precision (it produced 614 polluted rows — adult performers
// tagged with athlete descriptions) but did so by HARD-REQUIRING a profession and
// using occupation overlap as the only positive signal, which made it reject ~88%
// of the genuine-icon cohort (most of whom have no profession seeded). This
// version keeps the precision guards (P31=Q5 human, occupation-conflict veto) but
// adds recall:
//   - multilingual candidate search (English + the subject's national language),
//   - birth-year (P569) / death-year (P570) disambiguation as primary signals,
//   - nationality (P27) as a soft corroborator,
//   - profession is now optional, not mandatory.
// Living people get a strictly higher bar (must have a hard corroborator beyond
// the name) because mis-identifying a living LGBTQ+ person is a real-world harm.

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)';

export interface WikidataResolution {
  qid: string;
  label?: string;
  description?: string;
  entity: Record<string, unknown>;
  occupations: string[]; // lowercased English labels
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface PersonSeed {
  name: string;
  profession?: string | null;
  birthDate?: string | null; // YYYY-MM-DD or partial
  deathDate?: string | null;
  nationality?: string | null;
  isLiving?: boolean | null;
}

// Keywords that link a local free-text `profession` to Wikidata occupation (P106)
// labels. Lowercase. Kept small and high-precision; expand when false-negatives
// surface.
const PROFESSION_KEYWORDS: Record<string, string[]> = {
  'adult performer': ['porn', 'adult', 'erotic', 'escort', 'pornographic'],
  'pornographic actor': ['porn', 'adult', 'erotic'],
  'actor': ['actor', 'actress', 'film', 'television'],
  'singer': ['singer', 'vocalist', 'musician'],
  'musician': ['musician', 'composer', 'instrumentalist', 'singer'],
  'writer': ['writer', 'author', 'novelist', 'poet', 'playwright', 'journalist'],
  'politician': ['politician', 'statesman', 'stateswoman', 'minister', 'senator', 'representative'],
  'activist': ['activist', 'campaigner', 'rights'],
  'artist': ['artist', 'painter', 'sculptor', 'photographer'],
  'scientist': ['scientist', 'researcher', 'mathematician', 'physicist', 'biologist', 'chemist'],
  'director': ['director', 'filmmaker'],
  'producer': ['producer'],
  'athlete': ['athlete', 'player', 'sportsperson', 'footballer', 'basketball', 'tennis', 'swimmer', 'runner', 'boxer'],
  'drag queen': ['drag', 'performer'],
  'drag performer': ['drag', 'performer'],
  'model': ['model'],
  'fashion designer': ['designer', 'fashion'],
  'chef': ['chef', 'cook', 'restaurateur'],
};

export function keywordsFor(profession: string | null | undefined): string[] {
  if (!profession || !profession.trim()) return [];
  const p = profession.trim().toLowerCase();
  if (PROFESSION_KEYWORDS[p]) return PROFESSION_KEYWORDS[p];
  const kws = new Set<string>();
  for (const token of p.split(/[\s,/]+/).filter(Boolean)) {
    const set = PROFESSION_KEYWORDS[token];
    if (set) set.forEach(k => kws.add(k));
  }
  if (kws.size === 0) kws.add(p);
  return [...kws];
}

// Normalize a person name for comparison: strip accents, punctuation, lowercase,
// collapse whitespace. "Marsha P. Johnson" -> "marsha p johnson".
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.\-_'’"]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Best-effort nationality (free text / demonym) -> Wikidata search languages.
// Always includes English. Keeps the map small; unknowns just get English.
const NATIONALITY_LANG: Record<string, string> = {
  german: 'de', austrian: 'de', swiss: 'de',
  french: 'fr', belgian: 'fr',
  spanish: 'es', mexican: 'es', argentine: 'es', argentinian: 'es', chilean: 'es', colombian: 'es', peruvian: 'es',
  italian: 'it', portuguese: 'pt', brazilian: 'pt',
  dutch: 'nl', polish: 'pl', russian: 'ru', ukrainian: 'uk',
  swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi',
  japanese: 'ja', chinese: 'zh', korean: 'ko', thai: 'th', vietnamese: 'vi',
  turkish: 'tr', greek: 'el', czech: 'cs', hungarian: 'hu', romanian: 'ro',
  arab: 'ar', arabic: 'ar', egyptian: 'ar', israeli: 'he',
};

export function langsForNationality(nationality: string | null | undefined): string[] {
  const langs = ['en'];
  if (nationality) {
    const key = nationality.trim().toLowerCase();
    const lang = NATIONALITY_LANG[key] ?? NATIONALITY_LANG[key.split(/\s+/)[0]];
    if (lang && lang !== 'en') langs.push(lang);
  }
  return langs;
}

// Loose nationality match between a local demonym/string and a Wikidata country
// label. Soft signal only — never a veto.
const DEMONYM_COUNTRY: Record<string, string> = {
  american: 'united states', british: 'united kingdom', english: 'united kingdom',
  scottish: 'united kingdom', welsh: 'united kingdom', irish: 'ireland',
  german: 'germany', french: 'france', spanish: 'spain', italian: 'italy',
  dutch: 'netherlands', swiss: 'switzerland', austrian: 'austria',
  canadian: 'canada', australian: 'australia', mexican: 'mexico',
  brazilian: 'brazil', argentine: 'argentina', argentinian: 'argentina',
  japanese: 'japan', chinese: 'china', korean: 'korea', indian: 'india',
  russian: 'russia', polish: 'poland', swedish: 'sweden', norwegian: 'norway',
  danish: 'denmark', finnish: 'finland', portuguese: 'portugal', greek: 'greece',
};

export function nationalityMatches(local: string, countryLabel: string): boolean {
  const l = local.trim().toLowerCase();
  const c = countryLabel.trim().toLowerCase();
  if (!l || !c) return false;
  if (c.includes(l) || l.includes(c)) return true;
  const mapped = DEMONYM_COUNTRY[l] ?? DEMONYM_COUNTRY[l.split(/\s+/)[0]];
  return !!mapped && c.includes(mapped);
}

export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = String(date).match(/^\+?(-?\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

// ---- Pure scoring core (unit-tested, no network) ----

export interface CandidateEvidence {
  isHuman: boolean;
  label: string;
  aliases: string[];
  birthYear: number | null;
  deathYear: number | null;
  occupations: string[]; // lowercased
  nationalities: string[]; // lowercased country labels
}

export interface SeedNorm {
  name: string;
  professionKeywords: string[];
  birthYear: number | null;
  deathYear: number | null;
  nationality: string | null;
  isLiving: boolean;
}

export interface CandidateScore {
  score: number;
  contradicted: boolean;
  reasons: string[];
  hardCorroborated: boolean; // a non-name signal matched
  nameExact: boolean;
}

export function scoreCandidate(seed: SeedNorm, ev: CandidateEvidence): CandidateScore {
  const reasons: string[] = [];
  if (!ev.isHuman) return { score: 0, contradicted: true, reasons: ['not-human'], hardCorroborated: false, nameExact: false };

  let score = 0;
  let contradicted = false;
  let hard = false;

  const target = normalizeName(seed.name);
  const names = [ev.label, ...ev.aliases].filter(Boolean).map(normalizeName);
  let nameExact = false;
  if (names.includes(target)) {
    score += 0.4; nameExact = true; reasons.push('name-exact');
  } else if (names.some(n => n && (n.includes(target) || target.includes(n)))) {
    score += 0.12; reasons.push('name-partial');
  } else {
    reasons.push('name-mismatch');
  }

  let birthMatched = false;
  if (seed.birthYear && ev.birthYear) {
    if (Math.abs(seed.birthYear - ev.birthYear) <= 1) {
      score += 0.5; birthMatched = true; hard = true; reasons.push('birthyear-match');
    } else {
      contradicted = true; reasons.push('birthyear-conflict');
    }
  }

  if (seed.deathYear && ev.deathYear) {
    if (Math.abs(seed.deathYear - ev.deathYear) <= 1) {
      score += 0.25; hard = true; reasons.push('deathyear-match');
    } else {
      contradicted = true; reasons.push('deathyear-conflict');
    }
  }

  if (seed.professionKeywords.length && ev.occupations.length) {
    const overlap = seed.professionKeywords.some(kw => ev.occupations.some(o => o.includes(kw)));
    if (overlap) {
      score += 0.2; reasons.push('occupation-match');
    } else if (!birthMatched) {
      // occupation disagreement only vetoes when nothing else corroborates.
      contradicted = true; reasons.push('occupation-conflict');
    } else {
      reasons.push('occupation-divergent-ignored');
    }
  }

  if (seed.nationality && ev.nationalities.length) {
    if (ev.nationalities.some(c => nationalityMatches(seed.nationality!, c))) {
      score += 0.15; hard = true; reasons.push('nationality-match');
    }
  }

  return { score, contradicted, reasons, hardCorroborated: hard, nameExact };
}

// Decide acceptance given all scored candidates. Pure for testability.
export function pickBest(
  seed: SeedNorm,
  scored: Array<CandidateScore & { qid: string }>,
  humanCount: number,
): (CandidateScore & { qid: string; confidence: 'high' | 'medium' | 'low' }) | null {
  const viable = scored
    .filter(s => !s.contradicted && s.score > 0 && (s.reasons.includes('name-exact') || s.reasons.includes('name-partial')))
    .sort((a, b) => b.score - a.score);
  if (!viable.length) return null;

  const best = viable[0];
  const margin = viable.length > 1 ? best.score - viable[1].score : best.score;

  let accept = best.score >= 0.5 && (viable.length === 1 || margin >= 0.25);

  if (seed.isLiving) {
    // Living: never on name alone. Require a real corroborating signal.
    accept = accept && best.hardCorroborated;
  } else {
    // Dead historical figure with a clean unique name is a defensible match.
    const soleExact = humanCount === 1 && best.nameExact;
    if (soleExact && best.score >= 0.4) accept = true;
  }

  if (!accept) return null;

  const confidence: 'high' | 'medium' | 'low' =
    best.reasons.includes('birthyear-match') || best.score >= 0.85 ? 'high'
    : best.score >= 0.65 ? 'medium'
    : 'low';

  return { ...best, confidence };
}

// ---- Network layer ----

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function wdSearch(name: string, language: string, limit = 10): Promise<Array<{ id: string; label?: string; description?: string }>> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${language}&uselang=${language}&type=item&format=json&limit=${limit}`;
  const data = await fetchJson(url);
  return ((data?.search as Array<Record<string, unknown>>) ?? []).map(r => ({
    id: String(r.id),
    label: r.label as string | undefined,
    description: r.description as string | undefined,
  }));
}

async function wdSearchMulti(name: string, languages: string[], limit = 10): Promise<Array<{ id: string; label?: string; description?: string }>> {
  const seen = new Set<string>();
  const out: Array<{ id: string; label?: string; description?: string }> = [];
  for (const lang of languages) {
    for (const c of await wdSearch(name, lang, limit)) {
      if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  }
  return out;
}

async function wdEntity(qid: string): Promise<Record<string, unknown> | null> {
  const data = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  return (data?.entities as Record<string, unknown>)?.[qid] as Record<string, unknown> ?? null;
}

function claimQids(entity: Record<string, unknown>, prop: string): string[] {
  const claims = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined;
  if (!claims?.length) return [];
  const ids: string[] = [];
  for (const c of claims) {
    const v = (c.mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> | undefined;
    const id = (v?.value as Record<string, unknown>)?.id as string | undefined;
    if (id) ids.push(id);
  }
  return ids;
}

const labelCache = new Map<string, string | null>();
async function entityLabel(qid: string): Promise<string | null> {
  if (labelCache.has(qid)) return labelCache.get(qid)!;
  const ent = await wdEntity(qid);
  const labels = ent?.labels as Record<string, { value: string }> | undefined;
  const label = labels?.en?.value ?? Object.values(labels ?? {})[0]?.value ?? null;
  labelCache.set(qid, label);
  return label;
}

function isHuman(entity: Record<string, unknown>): boolean {
  return claimQids(entity, 'P31').includes('Q5');
}

async function labelsFor(ids: string[]): Promise<string[]> {
  const labels = await Promise.all(ids.slice(0, 8).map(entityLabel));
  return labels.filter((l): l is string => !!l).map(l => l.toLowerCase());
}

function aliasesOf(entity: Record<string, unknown>): string[] {
  const al = entity.aliases as Record<string, Array<{ value: string }>> | undefined;
  if (!al) return [];
  const out: string[] = [];
  for (const arr of Object.values(al)) for (const a of arr) if (a?.value) out.push(a.value);
  return out;
}

function allLabels(entity: Record<string, unknown>): string[] {
  const labels = entity.labels as Record<string, { value: string }> | undefined;
  return labels ? Object.values(labels).map(l => l.value).filter(Boolean) : [];
}

async function buildEvidence(entity: Record<string, unknown>): Promise<CandidateEvidence> {
  const human = isHuman(entity);
  const occupations = human ? await labelsFor(claimQids(entity, 'P106')) : [];
  const nationalities = human ? await labelsFor(claimQids(entity, 'P27')) : [];
  return {
    isHuman: human,
    label: (entity.labels as Record<string, { value: string }>)?.en?.value ?? allLabels(entity)[0] ?? '',
    aliases: [...aliasesOf(entity), ...allLabels(entity)],
    birthYear: yearOf(readClaim(entity, 'P569')),
    deathYear: yearOf(readClaim(entity, 'P570')),
    occupations,
    nationalities,
  };
}

/**
 * Resolve a Wikidata QID for a personality using all available seed evidence.
 * Precision-first: refuses on contradiction, ambiguity, or (for living people)
 * the absence of a hard corroborating signal. Returns null rather than guess.
 */
export async function resolvePersonality(seed: PersonSeed): Promise<WikidataResolution | null> {
  if (!seed.name || !seed.name.trim()) return null;

  const norm: SeedNorm = {
    name: seed.name,
    professionKeywords: keywordsFor(seed.profession),
    birthYear: yearOf(seed.birthDate),
    deathYear: yearOf(seed.deathDate),
    nationality: seed.nationality ? seed.nationality.trim().toLowerCase() : null,
    isLiving: seed.isLiving !== false, // default to the cautious (living) bar
  };

  const candidates = await wdSearchMulti(seed.name, langsForNationality(seed.nationality), 10);
  if (!candidates.length) return null;

  const entities = new Map<string, Record<string, unknown>>();
  const scored: Array<CandidateScore & { qid: string }> = [];
  let humanCount = 0;
  for (const c of candidates) {
    const entity = await wdEntity(c.id);
    if (!entity) continue;
    const ev = await buildEvidence(entity);
    if (ev.isHuman) humanCount++;
    entities.set(c.id, entity);
    scored.push({ qid: c.id, ...scoreCandidate(norm, ev) });
  }

  const best = pickBest(norm, scored, humanCount);
  if (!best) return null;

  const entity = entities.get(best.qid)!;
  return {
    qid: best.qid,
    label: (entity.labels as Record<string, { value: string }>)?.en?.value,
    description: readEntityDescription(entity) ?? undefined,
    entity,
    occupations: await labelsFor(claimQids(entity, 'P106')),
    score: best.score,
    confidence: best.confidence,
    reasons: best.reasons,
  };
}

/**
 * Back-compat wrapper. Existing callers pass name + profession only.
 */
export async function resolveByNameAndProfession(
  name: string,
  profession: string | null | undefined,
): Promise<WikidataResolution | null> {
  return resolvePersonality({ name, profession, isLiving: false });
}

// Helpers exported for callers that read entity fields after resolution.
export function readClaim(entity: Record<string, unknown>, prop: string): string | null {
  const c = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined;
  if (!c?.length) return null;
  const m = (c[0].mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> | undefined;
  if (!m) return null;
  const v = m.value;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) {
    const vv = v as Record<string, unknown>;
    return (vv.id as string) ?? (vv.time as string) ?? (vv.text as string) ?? null;
  }
  return null;
}

export async function readEntityLabel(qid: string): Promise<string | null> {
  return entityLabel(qid);
}

export function readEntityDescription(entity: Record<string, unknown>): string | null {
  const desc = (entity.descriptions as Record<string, { value: string }>)?.en?.value;
  return desc ?? null;
}
