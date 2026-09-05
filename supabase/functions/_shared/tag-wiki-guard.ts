// Guards for adopting a Wikidata identity onto a glossary tag.
//
// WHY THIS EXISTS. `tag-enrichment-sweep` resolved a tag's Wikidata id by asking
// en.wikipedia.org for the summary of the RAW TAG NAME and adopting whatever
// `wikibase_item` came back. The REST summary endpoint follows redirects, and only a
// disambiguation *page* was skipped — so every ambiguous glossary term silently
// adopted the identity of whatever article owns its base title. Measured 2026-08-29:
// 1,535 of 4,772 linked tags pointed at an entity of a class a glossary term can never
// be. `golden-shower` → Cassia fistula (a plant), `passing` → Q4 death, `bear` →
// "Bear" the family name, `anal` → "Analyst" the journal, `amateur` → Indianapolis.
//
// Two independent gates, and BOTH must pass:
//
//   1. titleAgrees — the article Wikipedia actually served must be the thing we asked
//      for. `Golden shower` → `Cassia fistula` fails here. Near matches pass, because a
//      correct resolution routinely lands on a morphological variant (`Puppy play` →
//      `Pup play`, `Analingus` → `Anilingus`, `Bisexual` → `Bisexuality`).
//
//   2. classIsPlausible — the entity's P31 must not be a class a glossary term can
//      never be. This gate is what catches the residue the title gate cannot: the
//      article `Pep` really is titled "Pep", it is simply a male given name; `Bear`
//      really is titled "Bear", it is a family name. Name agreement is exactly what the
//      namesake bug PRODUCES, so it can never be the only evidence.
//
// A tag with no defensible link is left unlinked. A wrong identifier is not inert —
// `tag_medical_codes`, the `broader` edges in `tag_relations` and the "Elsewhere" rail
// are all regenerated from it weekly, so a plausible-but-wrong QID rebuilds wrong data
// forever while a null one rebuilds nothing.

import { extractSupportsQueerSense } from './tag-style.ts'

/** Lowercase, strip diacritics and every non-alphanumeric character. */
export function normalizeForCompare(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m || !n) return Math.max(m, n)
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let cur = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[n]
}

/**
 * Does the article Wikipedia served correspond to the term we asked about?
 *
 * Deliberately tolerant of morphology (0.75 similarity, or one being a prefix of the
 * other at 5+ characters) because a correct resolution frequently normalises the term;
 * deliberately intolerant of anything further, because that is a redirect to a
 * different subject.
 */
export function titleAgrees(tagName: string, resolvedTitle: string | null | undefined): boolean {
  const a = normalizeForCompare(tagName)
  const b = normalizeForCompare(resolvedTitle)
  if (!a || !b) return false
  if (a === b) return true
  // A shared prefix only means the same term when the two are of comparable length.
  // Without the ratio bound, `Brats` matches `Bratsberg Line` and `Stone Top` matches
  // `Stone Top Bay` — both real rows from the audit.
  const short = Math.min(a.length, b.length), long = Math.max(a.length, b.length)
  if (short >= 5 && short / long >= 0.6 && (a.startsWith(b) || b.startsWith(a))) return true
  return 1 - levenshtein(a, b) / long >= 0.75
}

/**
 * P31 classes a glossary term can never be. Derived from the 2026-08-29 audit, where
 * every one of these was measured on real rows — journals and scholarly articles (304),
 * given/family names (235), media works (486), taxa (137), settlements and other places
 * (102), humans (91), organisations (76), software/databases/ships/awards (39),
 * disambiguation pages and Wikimedia project pages (26).
 */
const IMPLAUSIBLE_CLASS_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['journal', /(scientific journal|academic journal|scholarly article|scientific article|master's thesis|doctoral thesis|dissertation|preprint|conference paper)/i],
  ['name', /(given name|family name|unisex given name|male given name|female given name|surname)/i],
  ['taxon', /^(taxon|monotypic taxon|clade|fossil taxon|species|variety|cultivar|breed|strain)$/i],
  ['person', /^(human|human biblical figure|fictional human|pseudonym)$/i],
  ['place', /(municipality|human settlement|\bcity\b|\btown\b|\bvillage\b|commune|county|province|state of|island|mountain|neighborhood|hamlet|administrative territorial entity|sovereign state|railway line|railway station|metro station|constellation|\bbay\b|valley)/i],
  ['media', /\b(film|films|album|albums|song|songs|single|television series|television program|tv series|video game|videogame|novel|manga|anime|musical group|musical duo|rock band|band|comic strip|opera|periodical|magazine|newspaper|podcast|episode|literary work|written work|soundtrack|discography|film character)\b/i],
  ['org', /(political party|business enterprise|\bcompany\b|enterprise|nonprofit|non-profit|organization|organisation|university|record label|\bbrand\b|airline|airport)/i],
  ['artifact', /(\bwebsite\b|online database|\bdatabase\b|software|web service|mobile app|computer program|medal|\baward\b|\bship\b)/i],
  ['disambiguation', /(disambiguation|Wikimedia|Wikipedia language edition)/i],
]

/**
 * Classify an entity by the English labels of its P31 (instance-of) statements.
 * Returns null when nothing implausible matched, i.e. the entity is concept-shaped.
 */
export function implausibleClassOf(p31Labels: readonly string[]): string | null {
  for (const [name, re] of IMPLAUSIBLE_CLASS_PATTERNS) {
    if (p31Labels.some((l) => re.test(l))) return name
  }
  return null
}

export interface WikiIdentity {
  /** Title of the article Wikipedia actually served (post-redirect). */
  title: string | null
  /**
   * P31 labels of the linked Wikidata entity, English.
   *
   * `null` means the class COULD NOT BE DETERMINED — there was no QID to ask about, or
   * the wbgetentities call failed. It is REFUSED, because adopting on a null class rests
   * on title agreement alone, and name agreement is exactly what the namesake bug
   * produces. `[]` is a different answer and is allowed through: it means the entity was
   * read successfully and genuinely carries no non-deprecated P31 statement.
   *
   * Until 2026-09-04 this was `readonly string[]` and the fetcher collapsed every failure
   * into `[]`. `implausibleClassOf([])` returns null, so the class gate was SKIPPED and a
   * Wikidata outage silently degraded this module to gate 1 alone — the single-signal
   * condition the header calls unsafe. The fetcher's own doc comment already claimed the
   * behaviour that is now actually implemented.
   */
  p31Labels: readonly string[] | null
  /**
   * Set when the tag lives in a category whose members carry a queer/kink-
   * specific sense (`isSenseCategory` in tag-style.ts). For such a tag pass
   * the article's extract too: title agreement + a plausible class are
   * exactly what the WRONG-SENSE failure produces — the article "Vacuum
   * pump" really is titled Vacuum pump and a device is a plausible class,
   * but on a Fetishes tag it is the wrong subject — so the extract must
   * additionally corroborate the queer/community sense.
   */
  senseCategory?: boolean
  extract?: string | null
}

export interface AdoptionVerdict {
  adopt: boolean
  /** Machine-readable reason, logged so a refusal is visible rather than silent. */
  reason:
    | 'ok'
    | 'title-mismatch'
    | 'implausible-class'
    | 'class-unknown'
    | 'no-title'
    | 'generic-sense'
  detail?: string
}

/**
 * All gates. A refusal is a decision, not an error — the caller leaves the tag
 * unlinked rather than writing a guess.
 */
export function mayAdoptWikiIdentity(tagName: string, id: WikiIdentity): AdoptionVerdict {
  if (!id.title) return { adopt: false, reason: 'no-title' }
  if (!titleAgrees(tagName, id.title)) {
    return { adopt: false, reason: 'title-mismatch', detail: id.title }
  }
  // Absence of evidence is not evidence of plausibility. A null class means we could not
  // read one, so the only surviving signal is the title — and the title agreeing is what
  // the namesake failure looks like, not what a correct resolution looks like.
  if (id.p31Labels === null) return { adopt: false, reason: 'class-unknown' }
  const bad = implausibleClassOf(id.p31Labels)
  if (bad) return { adopt: false, reason: 'implausible-class', detail: bad }
  if (id.senseCategory && !extractSupportsQueerSense(id.extract)) {
    return { adopt: false, reason: 'generic-sense', detail: id.title ?? undefined }
  }
  return { adopt: true, reason: 'ok' }
}
