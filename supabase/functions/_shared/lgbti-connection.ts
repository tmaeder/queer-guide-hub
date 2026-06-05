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
