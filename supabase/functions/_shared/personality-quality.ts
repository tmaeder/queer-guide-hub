// Single source of truth for the personality quality rubric (max 100).
// Mirrors the rubric historically inlined in pipeline-quality-score.

export interface QualityInput {
  name?: unknown
  image_url?: unknown
  description?: unknown
  lgbti_connection?: unknown
  birth_date?: unknown
  profession?: unknown
  nationality?: unknown
  wikidata_qid?: unknown
  fields?: unknown
}

function nonEmptyStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

export function personalityQualityScore(r: QualityInput): number {
  let s = 0
  if (nonEmptyStr(r.name)) s += 5
  if (nonEmptyStr(r.image_url)) s += 15
  const desc = nonEmptyStr(r.description)
  if (desc) s += 10
  if (desc && desc.length > 80) s += 10
  const lc = nonEmptyStr(r.lgbti_connection)
  if (lc && lc !== 'unclear' && lc !== 'none_known') s += 20
  if (nonEmptyStr(r.birth_date)) s += 10
  if (nonEmptyStr(r.profession)) s += 10
  if (nonEmptyStr(r.nationality)) s += 10
  if (nonEmptyStr(r.wikidata_qid)) s += 15
  if (Array.isArray(r.fields) && r.fields.length > 0) s += 5
  return Math.min(100, s)
}
