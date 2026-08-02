// Disambiguating Wikidata resolver.
// Replaces name-only `wbsearchentities&limit=1` lookups across personality
// enrichment. Reject matches when the candidate's Wikidata occupation does
// not overlap the local profession — this is what produced 614 polluted rows
// (adult performers tagged with athlete/basketball-player descriptions).

// The profession vocabulary lives in ./profession-keywords.js because the Node
// repair script (scripts/data-quality/verify-personality-wikidata.mjs) has to
// apply the exact same matching rules — a second copy would drift silently and
// misclassify real historical figures as namesake conflicts.
import {
  keywordsFor,
  hasProfessionMapping,
  scoreOccupationMatch,
} from './profession-keywords.js';

// Re-exported so existing importers of this module keep working.
export { keywordsFor, hasProfessionMapping };

const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)';

export interface WikidataResolution {
  qid: string;
  label?: string;
  description?: string;
  entity: Record<string, unknown>;
  occupations: string[]; // lowercased English labels
  score: number;
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

// Rank-aware (deprecated statements dropped) — see readClaimIds below.
function claimQids(entity: Record<string, unknown>, prop: string): string[] {
  return readClaimIds(entity, prop);
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

// ---------------------------------------------------------------------------
// Claim readers.
//
// Two failure modes these guard against, both of which have already produced
// wrong data in this project:
//
//  1. RANK. `claims[prop][0]` is array position, not truth. Wikidata marks
//     superseded statements `deprecated` and the current one `preferred`, in no
//     particular order. Reading index 0 is how Cape Town's population came back
//     as 433,688 instead of 3,776,313 (see _shared/wikidata-city.ts applyRankFix).
//  2. PRECISION. A P569 snak carries `precision`: 11=day, 10=month, 9=year,
//     8=decade, 7=century. The time string is always zero-padded to a full date,
//     so a century-precision value serialises as "+1800-00-00T00:00:00Z" and a
//     naive parser silently reports it as 1 January 1800.
// ---------------------------------------------------------------------------

const RANK_ORDER: Record<string, number> = { preferred: 2, normal: 1, deprecated: 0 };

/** Statements for `prop`, best rank first, `deprecated` dropped entirely. */
function rankedStatements(
  entity: Record<string, unknown>,
  prop: string,
): Array<Record<string, unknown>> {
  const claims = (entity.claims as Record<string, unknown>)?.[prop] as Array<Record<string, unknown>> | undefined;
  if (!claims?.length) return [];
  return claims
    .filter(c => (c.rank as string) !== 'deprecated')
    .sort((a, b) => (RANK_ORDER[b.rank as string] ?? 1) - (RANK_ORDER[a.rank as string] ?? 1));
}

function snakValue(statement: Record<string, unknown>): Record<string, unknown> | null {
  // `somevalue`/`novalue` snaks carry no datavalue — they mean "known to be
  // unknown", which is NOT the same as absent. Returning null is correct.
  return (statement.mainsnak as Record<string, unknown>)?.datavalue as Record<string, unknown> ?? null;
}

// Helpers exported for callers that need to read entity fields after resolution.
export function readClaim(entity: Record<string, unknown>, prop: string): string | null {
  for (const st of rankedStatements(entity, prop)) {
    const m = snakValue(st);
    if (!m) continue;
    const v = m.value;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null) {
      const vv = v as Record<string, unknown>;
      const out = (vv.id as string) ?? (vv.time as string) ?? (vv.text as string) ?? null;
      if (out) return out;
    }
  }
  return null;
}

export interface WikidataTime {
  /** ISO `YYYY-MM-DD`, always a real calendar date. */
  date: string;
  /** Wikidata precision: 11=day, 10=month, 9=year, 8=decade, 7=century. */
  precision: number;
  /** True only at precision 11 — month and day are real, not padding. */
  exact: boolean;
}

/**
 * Read a time-valued claim (P569 birth, P570 death) rank-aware and
 * precision-aware.
 *
 * `minPrecision` defaults to 9 (year). Anything coarser is refused outright
 * rather than rounded, because a decade-precision snak rendered as a date is a
 * fabricated fact. Below day precision the missing components are filled with
 * "01" and `exact` is false, so callers can choose to store a year only.
 *
 * BCE times (leading "-") are refused: the column is a Postgres `date` and no
 * subject in this corpus predates the common era.
 */
export function readTimeClaim(
  entity: Record<string, unknown>,
  prop: string,
  minPrecision = 9,
): WikidataTime | null {
  for (const st of rankedStatements(entity, prop)) {
    const m = snakValue(st);
    if (!m) continue;
    const v = m.value as Record<string, unknown> | undefined;
    const time = v?.time as string | undefined;
    if (!time) continue;

    const precision = typeof v?.precision === 'number' ? v.precision as number : 0;
    if (precision < minPrecision) continue;

    const match = time.match(/^\+(\d{4,})-(\d{2})-(\d{2})/);
    if (!match) continue; // BCE ("-0500-…") and malformed values fall out here.

    const year = match[1].padStart(4, '0');
    if (year === '0000') continue;
    const month = precision >= 10 && match[2] !== '00' ? match[2] : '01';
    const day = precision >= 11 && match[3] !== '00' ? match[3] : '01';

    return { date: `${year}-${month}-${day}`, precision, exact: precision >= 11 };
  }
  return null;
}

/** Every value of a rank-aware entity-id claim (e.g. P106 occupations). */
export function readClaimIds(entity: Record<string, unknown>, prop: string): string[] {
  const ids: string[] = [];
  for (const st of rankedStatements(entity, prop)) {
    const m = snakValue(st);
    const id = (m?.value as Record<string, unknown>)?.id as string | undefined;
    if (id) ids.push(id);
  }
  return ids;
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
