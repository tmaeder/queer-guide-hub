// Single source of truth for the personality quality rubric (max 100).
// Mirrors the rubric historically inlined in pipeline-quality-score.

export interface QualityInput {
  name?: unknown
  image_url?: unknown
  description?: unknown
  bio?: unknown
  lgbti_connection?: unknown
  birth_date?: unknown
  profession?: unknown
  nationality?: unknown
  wikidata_qid?: unknown
  fields?: unknown
  roles?: unknown
  tags?: unknown
  is_adult?: unknown
  profile_url?: unknown
  wikidata_status?: unknown
  source_count?: unknown
  claim_source_count?: unknown
  image_status?: unknown
  has_optimized_image?: unknown
  last_refreshed_at?: unknown
  birth_place?: unknown
  city_id?: unknown
  country_id?: unknown
  death_place?: unknown
  death_city_id?: unknown
  death_country_id?: unknown
}

export interface PersonalityQualityDimensions {
  version: 2
  cohort: 'encyclopedia' | 'adult'
  score: number
  identity: number
  sourcing: number
  content: number
  image: number
  taxonomy: number
  links: number
  freshness: number
  safety: number
  hard_failures: string[]
}

function nonEmptyStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

const bounded = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function personalityQualityDimensions(r: QualityInput): PersonalityQualityDimensions {
  const cohort = r.is_adult === true ? 'adult' : 'encyclopedia'
  const qid = nonEmptyStr(r.wikidata_qid)
  const sourceCount = Number(r.source_count ?? 0)
  const claimSourceCount = Number(r.claim_source_count ?? 0)
  const hasProfile = Boolean(nonEmptyStr(r.profile_url))
  const identity = qid && /^Q\d+$/.test(qid)
    ? 100
    : cohort === 'adult' && hasProfile
      ? 80
      : sourceCount >= 2
        ? 70
        : sourceCount === 1
          ? 50
          : nonEmptyStr(r.name) ? 20 : 0

  const desc = nonEmptyStr(r.description)
  const bio = nonEmptyStr(r.bio)
  const content = bounded(
    (desc ? desc.length >= 120 && desc.length <= 240 ? 50 : 25 : 0)
    + (bio ? bio.length > 120 ? 50 : 25 : 0),
  )
  const lc = nonEmptyStr(r.lgbti_connection)
  const sourcing = bounded((sourceCount > 0 ? 60 : 0) + (claimSourceCount > 0 ? 40 : 0))
  const image = r.image_status === 'unavailable'
    ? 100
    : r.has_optimized_image === true
      ? 100
      : nonEmptyStr(r.image_url)
        ? 50
        : 0
  const taxonomy = bounded(
    (nonEmptyStr(r.profession) ? 45 : 0)
    + (Array.isArray(r.roles) && r.roles.length ? 25 : 0)
    + (Array.isArray(r.tags) && r.tags.length ? 30 : 0),
  )
  const refreshed = nonEmptyStr(r.last_refreshed_at)
  const ageMs = refreshed ? Date.now() - new Date(refreshed).getTime() : Number.POSITIVE_INFINITY
  const freshness = !Number.isFinite(ageMs) ? 20 : ageMs <= 90 * 86400_000 ? 100 : ageMs <= 365 * 86400_000 ? 60 : 20
  const birthPlace = nonEmptyStr(r.birth_place)
  const deathPlace = nonEmptyStr(r.death_place)
  const links = bounded(
    (!birthPlace || nonEmptyStr(r.city_id) || nonEmptyStr(r.country_id) ? 35 : 0)
    + (!deathPlace || nonEmptyStr(r.death_city_id) || nonEmptyStr(r.death_country_id) ? 25 : 0)
    + (sourceCount > 0 ? 40 : 0),
  )
  const hard_failures: string[] = []
  if (qid && !/^Q\d+$/.test(qid)) hard_failures.push('invalid_wikidata_qid')
  if (lc && !['unclear', 'none_known'].includes(lc) && claimSourceCount === 0) {
    hard_failures.push('unsupported_lgbti_claim')
  }
  if (r.image_status === 'rejected') hard_failures.push('rejected_image')
  if (!desc || desc.length < 120 || desc.length > 240) hard_failures.push('summary_out_of_contract')
  const safety = bounded(100 - hard_failures.length * 20)

  const score = cohort === 'adult'
    ? bounded(identity * .25 + sourcing * .25 + content * .15 + image * .15 + taxonomy * .10 + safety * .10)
    : bounded(identity * .20 + sourcing * .20 + content * .20 + image * .15 + taxonomy * .10
      + links * .05 + freshness * .05 + safety * .05)

  return { version: 2, cohort, score, identity, sourcing, content, image, taxonomy, links, freshness, safety, hard_failures }
}

/** Compatibility projection used by legacy writers. */
export function personalityQualityScore(r: QualityInput): number {
  return personalityQualityDimensions(r).score
}
