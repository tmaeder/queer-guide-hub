export const WIKIDATA_QID_RE = /^Q\d+$/

export type WikidataStatus = 'resolved' | 'not_found' | 'not_applicable' | 'needs_review'

export interface NormalizedAffiliation {
  affiliation_type: 'political_party'
  name: string
}

export interface NormalizedLegacyFields {
  fields: string[]
  affiliations: NormalizedAffiliation[]
  rejected: unknown[]
}

export interface PersonalityContractResult {
  errors: string[]
  warnings: string[]
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

/** Accept a bare QID or a Wikidata entity URL, never workflow sentinels. */
export function normalizeWikidata(value: unknown): {
  wikidata_qid: string | null
  wikidata_status: WikidataStatus
} {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return { wikidata_qid: null, wikidata_status: 'needs_review' }
  if (/^SKIP_/i.test(raw)) return { wikidata_qid: null, wikidata_status: 'not_found' }
  const match = raw.match(/(?:^|\/)(Q\d+)(?:$|[?#])/i) ?? raw.match(/^(Q\d+)$/i)
  if (!match) return { wikidata_qid: null, wikidata_status: 'needs_review' }
  return { wikidata_qid: match[1].toUpperCase(), wikidata_status: 'resolved' }
}

/**
 * `fields` is a legacy display array. Keep strings, extract known structured
 * party payloads, and preserve every other value for quarantine/audit.
 */
export function normalizeLegacyPersonalityFields(value: unknown): NormalizedLegacyFields {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;]/)
      : value == null
        ? []
        : [value]
  const fields = new Set<string>()
  const affiliations = new Map<string, NormalizedAffiliation>()
  const rejected: unknown[] = []

  for (const item of values) {
    if (typeof item === 'string') {
      const normalized = clean(item)
      if (normalized) fields.add(normalized)
      continue
    }
    if (item && typeof item === 'object') {
      const parties = (item as { parties?: unknown }).parties
      if (Array.isArray(parties)) {
        for (const party of parties) {
          if (typeof party !== 'string') continue
          const name = clean(party)
          if (name) affiliations.set(name.toLowerCase(), { affiliation_type: 'political_party', name })
        }
        continue
      }
    }
    rejected.push(item)
  }

  return { fields: [...fields], affiliations: [...affiliations.values()], rejected }
}

export function isKnownPlaceholderPersonalityImage(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false
  const url = value.trim()
  return /\/(?:default|users\/default)\/.*male\.jpg(?:[?#]|$)/i.test(url)
    || /(?:drag.?race|season).*(?:poster|promotional[_ -]?photo)/i.test(url)
}

export function validatePersonalityContract(data: Record<string, unknown>): PersonalityContractResult {
  const errors: string[] = []
  const warnings: string[] = []
  const name = typeof data.name === 'string' ? clean(data.name) : ''
  if (name.length < 2) errors.push('E_MISSING_NAME')
  if (name.length > 200) warnings.push('W_NAME_UNUSUALLY_LONG')

  const qid = typeof data.wikidata_qid === 'string' ? data.wikidata_qid.trim() : ''
  if (qid && !WIKIDATA_QID_RE.test(qid)) errors.push('E_INVALID_WIKIDATA_QID')

  const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
  const death = typeof data.death_date === 'string' ? data.death_date : ''
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) errors.push('E_INVALID_BIRTH_DATE')
  if (death && !/^\d{4}-\d{2}-\d{2}$/.test(death)) errors.push('E_INVALID_DEATH_DATE')
  if (birth && death && birth > death) errors.push('E_BIRTH_AFTER_DEATH')
  if (data.is_living === true && death) errors.push('E_LIVING_WITH_DEATH_DATE')

  const description = typeof data.description === 'string' ? clean(data.description) : ''
  const bio = typeof data.bio === 'string' ? clean(data.bio) : ''
  if (!description && !bio) warnings.push('W_NO_DESCRIPTION')
  if (description && description.length < 120) warnings.push('W_SUMMARY_TOO_SHORT')
  if (description.length > 240) warnings.push('W_SUMMARY_TOO_LONG')
  if (description && bio && description === bio) errors.push('E_SUMMARY_EQUALS_BIO')

  const legacy = normalizeLegacyPersonalityFields(data.fields)
  if (legacy.rejected.length > 0 || legacy.affiliations.length > 0) {
    errors.push('E_FIELDS_NOT_STRING_ARRAY')
  }
  if (isKnownPlaceholderPersonalityImage(data.image_url)) errors.push('E_PLACEHOLDER_IMAGE')
  const profession = typeof data.profession === 'string' ? clean(data.profession) : ''
  if (!profession) warnings.push('W_NO_PROFESSION')
  if (profession && /[,;|/]/.test(profession)) errors.push('E_PROFESSION_NOT_PRIMARY')
  if (data.roles != null && (!Array.isArray(data.roles)
      || data.roles.some((role) => typeof role !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(role)))) {
    errors.push('E_INVALID_ROLE_SLUG')
  }
  if (data.is_adult === true && Array.isArray(data.tags) && data.tags.length > 0) {
    errors.push('E_ADULT_TAGS_NOT_SEPARATED')
  }
  if (!data.nationality) warnings.push('W_NO_NATIONALITY')
  if (!data.image_url) warnings.push('W_NO_IMAGE')
  if (!qid) warnings.push('W_NO_WIKIDATA_QID')

  return { errors, warnings }
}
