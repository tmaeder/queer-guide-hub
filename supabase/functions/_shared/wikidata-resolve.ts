// Disambiguating Wikidata resolver.
// Replaces name-only `wbsearchentities&limit=1` lookups across personality
// enrichment. Reject matches when the candidate's Wikidata occupation does
// not overlap the local profession — this is what produced 614 polluted rows
// (adult performers tagged with athlete/basketball-player descriptions).

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)';

export interface WikidataResolution {
  qid: string;
  label?: string;
  description?: string;
  entity: Record<string, unknown>;
  occupations: string[]; // lowercased English labels
  score: number;
}

// Keywords that must overlap between local `profession` and Wikidata
// occupation labels (P106). Keep small and high-precision; expand only
// when false-negatives surface. All entries are lowercase.
const PROFESSION_KEYWORDS: Record<string, string[]> = {
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
  'model': ['model'],
  'fashion designer': ['designer', 'fashion'],
  'chef': ['chef', 'cook', 'restaurateur'],
};

function keywordsFor(profession: string): string[] {
  const p = profession.trim().toLowerCase();
  if (PROFESSION_KEYWORDS[p]) return PROFESSION_KEYWORDS[p];
  // Multi-word professions: union of keyword sets for each token that matches.
  const kws = new Set<string>();
  for (const token of p.split(/[\s,/]+/).filter(Boolean)) {
    const set = PROFESSION_KEYWORDS[token];
    if (set) set.forEach(k => kws.add(k));
  }
  // Fallback: treat the profession itself as a keyword.
  if (kws.size === 0) kws.add(p);
  return [...kws];
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function wdSearch(name: string, limit = 10): Promise<Array<{ id: string; label?: string; description?: string }>> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&format=json&limit=${limit}`;
  const data = await fetchJson(url);
  return ((data?.search as Array<Record<string, unknown>>) ?? []).map(r => ({
    id: String(r.id),
    label: r.label as string | undefined,
    description: r.description as string | undefined,
  }));
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

async function entityLabel(qid: string): Promise<string | null> {
  const ent = await wdEntity(qid);
  if (!ent) return null;
  const labels = ent.labels as Record<string, { value: string }> | undefined;
  return labels?.en?.value ?? Object.values(labels ?? {})[0]?.value ?? null;
}

function isHuman(entity: Record<string, unknown>): boolean {
  return claimQids(entity, 'P31').includes('Q5');
}

async function occupationLabels(entity: Record<string, unknown>): Promise<string[]> {
  const ids = claimQids(entity, 'P106');
  const labels = await Promise.all(ids.slice(0, 8).map(entityLabel));
  return labels.filter((l): l is string => !!l).map(l => l.toLowerCase());
}

function scoreOccupationMatch(occupations: string[], keywords: string[]): number {
  if (!occupations.length || !keywords.length) return 0;
  let hits = 0;
  for (const kw of keywords) {
    if (occupations.some(o => o.includes(kw))) hits++;
  }
  return hits / keywords.length;
}

/**
 * Resolve a Wikidata QID for a personality given name + profession.
 *
 * Returns null when no candidate's occupation overlaps the local profession,
 * or when profession is missing/empty. Never blind-picks by name alone.
 *
 * - Fetches up to 10 candidates via wbsearchentities.
 * - For each, fetches the entity and requires P31=Q5 (human).
 * - Scores by overlap between P106 occupation labels and profession keywords.
 * - Returns best match only if score > 0 and (single candidate OR margin >= 0.3).
 */
export async function resolveByNameAndProfession(
  name: string,
  profession: string | null | undefined,
): Promise<WikidataResolution | null> {
  if (!name || !profession || !profession.trim()) return null;

  const keywords = keywordsFor(profession);
  const candidates = await wdSearch(name, 10);
  if (!candidates.length) return null;

  const scored: WikidataResolution[] = [];
  for (const c of candidates) {
    const entity = await wdEntity(c.id);
    if (!entity) continue;
    if (!isHuman(entity)) continue;
    const occupations = await occupationLabels(entity);
    const score = scoreOccupationMatch(occupations, keywords);
    if (score > 0) {
      scored.push({
        qid: c.id,
        label: c.label,
        description: c.description,
        entity,
        occupations,
        score,
      });
    }
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 1) return scored[0];
  if (scored[0].score - scored[1].score >= 0.3) return scored[0];
  // Ambiguous — multiple humans match the profession. Refuse to write.
  return null;
}

// Helpers exported for callers that need to read entity fields after resolution.
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

// ---------------------------------------------------------------------------
// Personhood lookup (inverse of resolveByNameAndProfession): given a name,
// decide whether the best-matching Wikidata entity is a human (P31=Q5) or a
// non-person (organization / venue / team / work). Used by the personhood
// classifier to authoritatively confirm misfiled non-people.
// ---------------------------------------------------------------------------

export type NonPersonType = 'organization' | 'venue' | 'team' | 'event' | 'work' | 'other';

export interface WikidataPersonhood {
  found: boolean;
  qid?: string;
  label?: string;
  description?: string;
  isHuman: boolean;
  /** Non-person bucket inferred from the entity description (null when human/unknown). */
  nonPersonType: NonPersonType | null;
  /** Confidence the candidate is the right entity (exact label match → high). */
  matchConfidence: number;
}

// Map a Wikidata English description to a coarse non-person bucket.
function nonPersonTypeFromDescription(desc: string): NonPersonType | null {
  const d = desc.toLowerCase();
  if (/\b(team|club|squad|fc\b|sports? side|football|water polo|rugby|softball|volleyball|basketball)\b/.test(d)
      && !/\bplayer|footballer|coach\b/.test(d)) return 'team';
  if (/\b(organization|organisation|ngo|non-?profit|nonprofit|charity|charitable|association|foundation|society|collective|cooperative|network|institute|federation|coalition|alliance|union|ministry|congregation|church|company|corporation|agency|community group)\b/.test(d)) return 'organization';
  if (/\b(band|musical group|music group|duo|trio|quartet|ensemble|orchestra|choir|chorus|chorale)\b/.test(d)) return 'organization';
  if (/\b(restaurant|bar\b|caf[eé]|coffeehouse|pub\b|nightclub|venue|hotel|hostel|sauna|bathhouse|museum|gallery|theatre|theater|shop|store|bookshop|building|landmark|neighborhood|neighbourhood|district|street)\b/.test(d)) return 'venue';
  if (/\b(festival|parade|pride|conference|convention|ceremony|tournament|championship|gala|event)\b/.test(d)) return 'event';
  if (/\b(album|song|single|film|movie|book|novel|magazine|newspaper|website|video game|tv series|television series|painting|sculpture|periodical|comic)\b/.test(d)) return 'work';
  return null;
}

/**
 * Look up `name` on Wikidata and classify the best match as human vs non-person.
 *
 * Strategy: search candidates, prefer an exact (case-insensitive) label match,
 * else the top-ranked result. Fetch that entity and read P31 — P31=Q5 ⇒ human.
 * For non-humans, bucket the type from the entity's English description.
 * Returns found=false when Wikidata has no candidate (an absent entity is NOT
 * evidence of non-personhood — obscure real people are simply not in Wikidata).
 */
export async function classifyWikidataPersonhood(name: string): Promise<WikidataPersonhood> {
  const miss: WikidataPersonhood = { found: false, isHuman: false, nonPersonType: null, matchConfidence: 0 };
  if (!name || !name.trim()) return miss;

  const candidates = await wdSearch(name, 7);
  if (!candidates.length) return miss;

  const target = name.trim().toLowerCase();
  const exact = candidates.find(c => (c.label ?? '').trim().toLowerCase() === target);
  const pick = exact ?? candidates[0];
  const matchConfidence = exact ? 0.95 : 0.6;

  const entity = await wdEntity(pick.id);
  const description = pick.description
    ?? (entity ? readEntityDescription(entity) ?? undefined : undefined);

  if (entity && isHuman(entity)) {
    return { found: true, qid: pick.id, label: pick.label, description,
             isHuman: true, nonPersonType: null, matchConfidence };
  }

  // Non-human (or entity fetch failed). Bucket from description when available.
  const nonPersonType = description ? nonPersonTypeFromDescription(description) : null;
  return {
    found: true, qid: pick.id, label: pick.label, description,
    isHuman: false,
    // Only assert non-person when P31 was actually readable (entity present) or
    // the description clearly names a non-person bucket.
    nonPersonType: entity ? (nonPersonType ?? 'other') : nonPersonType,
    matchConfidence,
  };
}

export function readEntityDescription(entity: Record<string, unknown>): string | null {
  const desc = (entity.descriptions as Record<string, { value: string }>)?.en?.value;
  return desc ?? null;
}
