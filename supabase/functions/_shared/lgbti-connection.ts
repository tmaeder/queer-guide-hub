// Controlled vocabulary for personalities.lgbti_connection (audit C-2/H-5,
// docs/audits/2026-06-05-trust-safety-audit.md). Mirrors the DB CHECK constraint
// personalities_lgbti_connection_vocab. NULL/empty means "no claim" (allowed).
//
// This field must NEVER hold an uncontrolled free-text identity label. On a
// safety platform an assigned, unconsented identity string is a direct harm, so
// off-vocab values are coerced to the non-asserting 'unclear' at ingest and the
// raw text is preserved out-of-band for human review.

export const LGBTI_CONNECTION_VOCAB = [
  'community_member',
  'ally',
  'activist',
  'representation',
  'none_known',
  'unclear',
] as const

export type LgbtiConnection = (typeof LGBTI_CONNECTION_VOCAB)[number]

const VOCAB_SET = new Set<string>(LGBTI_CONNECTION_VOCAB)

/** True when `v` is exactly one of the controlled vocab values. */
export function isLgbtiConnectionVocab(v: unknown): v is LgbtiConnection {
  return typeof v === 'string' && VOCAB_SET.has(v)
}

export interface CoercedConnection {
  /** Controlled value to store, or null for "no claim". */
  value: LgbtiConnection | null
  /** The raw off-vocab string we replaced, if any — keep for the review trail. */
  rawOffVocab: string | null
}

/**
 * Coerce an arbitrary incoming value to the controlled vocab.
 *  - empty / null            → { value: null }            ("no claim")
 *  - exact vocab match       → { value: <as-is> }
 *  - anything else           → { value: 'unclear', rawOffVocab: <trimmed raw> }
 */
export function coerceLgbtiConnection(raw: unknown): CoercedConnection {
  const s = raw == null ? '' : String(raw).trim()
  if (!s) return { value: null, rawOffVocab: null }
  if (VOCAB_SET.has(s)) return { value: s as LgbtiConnection, rawOffVocab: null }
  return { value: 'unclear', rawOffVocab: s }
}

// ---- Wikidata-sourced derivation ----
//
// Derive a SOURCED lgbti_connection from a personality's Wikidata claims, used to
// upgrade the non-committal "unclear" placeholder for anchored people. The QID is
// the provenance the outing guard (migration 20260607000000) requires before a
// living person may carry an identity claim. Precision-first: we only assert
// 'community_member' on a clear LGBTQ+ orientation (P91) or gender-identity (P21)
// value; everything else (heterosexual, cisgender, absent, unrecognised) → null.

// P91 sexual orientation — LGBTQ+ values (excludes heterosexuality Q1035954).
const LGBTQ_ORIENTATION = new Set<string>([
  'Q6636',     // homosexuality
  'Q592',      // gay
  'Q6649',     // lesbianism / lesbian
  'Q43200',    // bisexuality
  'Q271534',   // pansexuality
  'Q724351',   // asexuality
  'Q339014',   // non-heterosexuality
  'Q4528476',  // homoromanticism
  'Q66109523', // queer (as orientation)
])

// P21 sex or gender — trans / non-binary / intersex values (excludes cis male
// Q6581097 and cis female Q6581072).
const LGBTQ_GENDER = new Set<string>([
  'Q1052281',  // trans woman
  'Q2449503',  // trans man
  'Q189125',   // transgender
  'Q48270',    // non-binary
  'Q12964198', // genderqueer
  'Q18116794', // genderfluid
  'Q3277905',  // agender
  'Q1097630',  // intersex
  'Q207959',   // third gender / hijra
  'Q301702',   // two-spirit
  'Q93954933', // demiboy
  'Q93955709', // demigirl
])

export interface LgbtiDerivation {
  connection: 'community_member' | null
  evidence: string[] // matched claims (e.g. "P91:Q6636"), for the provenance trail
}

/** Map Wikidata P91 + P21 claim QIDs to a controlled connection. */
export function deriveLgbtiConnection(
  orientationQids: string[],
  genderQids: string[],
): LgbtiDerivation {
  const evidence: string[] = []
  for (const q of orientationQids) if (LGBTQ_ORIENTATION.has(q)) evidence.push(`P91:${q}`)
  for (const q of genderQids) if (LGBTQ_GENDER.has(q)) evidence.push(`P21:${q}`)
  return { connection: evidence.length ? 'community_member' : null, evidence }
}

/**
 * Only upgrade the non-committal placeholders — never clobber a curated/committed
 * value (community_member/ally/activist/representation already set by a human).
 */
export function shouldUpgradeConnection(current: string | null | undefined): boolean {
  return current == null || current === 'unclear' || current === 'none_known'
}

// ---- Wikipedia-category derivation (higher coverage than Wikidata P91/P21) ----
//
// Wikipedia categories are editorially maintained and, for living people, the
// identity ones (WP:BLPCAT) require the subject to have publicly self-identified —
// a stronger sourcing bar than Wikidata. We prefer the public-role 'activist' over
// the private-identity 'community_member' (it is both more informative and the
// less sensitive claim), and we skip ally / opponent / critic categories.

const CAT_ACTIVIST = /(lgbtq?\+?|gay|lesbian|transgender|trans|queer|bisexual|intersex)\b[^,]{0,24}\bactiv/i
const CAT_IDENTITY = /\b(lgbtq?\+?|gay|lesbian|sapphic|bisexual|pansexual|transgender|transsexual|trans\s+(?:man|woman|men|women)|non[-\s]?binary|genderqueer|genderfluid|agender|intersex|queer|two[-\s]spirit)\b/i
// "icon"/"icons" excluded: a "gay icon" is celebrated BY the community, not
// necessarily a member. ally/opponent/critic/straight/cis are not the person.
const CAT_NEGATE = /\b(anti|opponents?|critics?|allies|ally|heterosexual|cisgender|straight|icons?)\b/i

export interface CategoryDerivation {
  connection: 'activist' | 'community_member' | null
  evidence: string[]
}

/** Derive a connection from a person's Wikipedia category titles. */
export function deriveConnectionFromCategories(categories: string[]): CategoryDerivation {
  const evidence: string[] = []
  let activist = false
  let member = false
  for (const c of categories) {
    const name = c.replace(/^Category:/, '')
    if (CAT_NEGATE.test(name)) continue
    if (CAT_ACTIVIST.test(name)) { activist = true; evidence.push(`cat:${name}`); continue }
    if (CAT_IDENTITY.test(name)) { member = true; evidence.push(`cat:${name}`) }
  }
  const connection = activist ? 'activist' : member ? 'community_member' : null
  return { connection, evidence: evidence.slice(0, 6) }
}

/**
 * Combine Wikipedia-category and Wikidata P91/P21 signals into one connection.
 * Precedence: public-role 'activist' (categories) > identity 'community_member'
 * (either source) > null.
 */
export function combineConnection(
  cat: CategoryDerivation,
  wd: LgbtiDerivation,
): { connection: 'activist' | 'community_member' | null; evidence: string[] } {
  if (cat.connection === 'activist') return { connection: 'activist', evidence: cat.evidence }
  if (cat.connection === 'community_member' || wd.connection === 'community_member') {
    return { connection: 'community_member', evidence: [...cat.evidence, ...wd.evidence].slice(0, 8) }
  }
  return { connection: null, evidence: [] }
}
