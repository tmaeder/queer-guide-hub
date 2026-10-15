import { providerKey } from './source-identity.ts'
export { providerKey } from './source-identity.ts'
import { isDataGap } from './gap-fill.ts'
import { sourceWeight } from './venue-consensus.ts'

export type DataRecord = Record<string, unknown>
export interface CombinationSource {
  source: string
  data: DataRecord
  observedAt?: string
  stagingId?: string
}
export interface CombinationDecision {
  path: string
  action: 'preserve' | 'fill' | 'review'
  value: unknown
  confidence: number
  sources: string[]
  conflicts: string[]
  evidence?: string[]
}
// Only descriptive fields. Identity, moderation, safety, ownership and arbitrary
// metadata never enter the automated combiner.
export const COMBINATION_PATHS = [
  'description', 'bio', 'excerpt', 'images', 'image_url', 'website', 'website_url',
  'phone', 'email', 'hours', 'contacts.website', 'contacts.phone', 'contacts.email',
  'location.address', 'location.postal_code', 'metadata.website', 'metadata.phone', 'metadata.email',
]
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])

function get(data: DataRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) =>
    value && typeof value === 'object' && !forbidden.has(key)
      ? (value as DataRecord)[key] : undefined, data)
}
export function setCombinedPath(data: DataRecord, path: string, value: unknown): void {
  const keys = path.split('.')
  if (keys.some((key) => forbidden.has(key))) return
  let current = data
  for (const key of keys.slice(0, -1)) {
    current[key] = current[key] && typeof current[key] === 'object' && !Array.isArray(current[key])
      ? { ...current[key] as DataRecord } : {}
    current = current[key] as DataRecord
  }
  current[keys[keys.length - 1]] = value
}
function fingerprint(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.trim())
  if (Array.isArray(value)) return JSON.stringify(value.map(fingerprint).sort())
  if (value && typeof value === 'object') return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify(value)
}
function valid(path: string, value: unknown): boolean {
  if (isDataGap(value)) return false
  if (path === 'images') return Array.isArray(value) && value.every((v) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v))
  if (path === 'hours' || path.startsWith('hours.')) return typeof value === 'string' || (typeof value === 'object' && value !== null)
  if (typeof value !== 'string') return false
  if (/website|image_url|social_links\./.test(path)) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname } catch { return false }
  }
  if (/email$/.test(path)) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  return true
}
function coordinates(data: DataRecord): unknown {
  const lat = get(data, 'location.lat'), lng = get(data, 'location.lng')
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : undefined
}

/** Combine only dedup-confirmed records. One vote per provider, latest observation
 * per field; disagreement or insufficient trust requires review. Existing values
 * win. Confidence is evidence for a decision, not a measured probability.
 */
export function combineDataSources(existing: DataRecord, sources: CombinationSource[], threshold = 0.85) {
  const decisions: CombinationDecision[] = []
  const patch: DataRecord = {}
  const paths = new Set(COMBINATION_PATHS)
  for (const source of sources) {
    for (const root of ['social_links', 'description_i18n', 'hours']) {
      const value = source.data[root]
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of Object.keys(value)) if (!forbidden.has(key) && !key.includes('.')) paths.add(`${root}.${key}`)
      }
    }
  }
  // A partial existing coordinate pair is deliberately left intact.
  if (isDataGap(get(existing, 'location.lat')) && isDataGap(get(existing, 'location.lng'))) paths.add('@coordinates')
  for (const path of paths) {
    const prior = get(existing, path)
    if (!isDataGap(prior)) {
      decisions.push({ path, action: 'preserve', value: prior, confidence: 1, sources: ['existing'], conflicts: [] })
      continue
    }
    const ambiguous = new Set<string>()
    const byProvider = new Map<string, { value: unknown; time: number; id?: string }>()
    for (const source of sources) {
      const value = path === '@coordinates' ? coordinates(source.data) : get(source.data, path)
      if (path === '@coordinates' ? value === undefined : !valid(path, value)) continue
      const provider = providerKey(source.source)
      const time = Date.parse(source.observedAt || '') || 0
      const previous = byProvider.get(provider)
      // Equal-time contradictions from one provider do not manufacture a vote.
      if (previous && previous.time === time && fingerprint(previous.value) !== fingerprint(value)) {
        byProvider.set(provider, { value: undefined, time })
        ambiguous.add(provider)
      } else if (!previous || time > previous.time) {
        byProvider.set(provider, { value, time, id: source.stagingId })
        ambiguous.delete(provider)
      }
    }
    const groups = new Map<string, { value: unknown; providers: string[]; confidence: number }>()
    for (const [provider, candidate] of byProvider) {
      if (candidate.value === undefined) continue
      const key = fingerprint(candidate.value)
      const group = groups.get(key) || { value: candidate.value, providers: [], confidence: 0 }
      group.providers.push(provider)
      group.confidence = 1 - (1 - group.confidence) * (1 - sourceWeight(provider))
      groups.set(key, group)
    }
    const ranked = [...groups.values()].sort((a, b) => b.confidence - a.confidence || fingerprint(a.value).localeCompare(fingerprint(b.value)))
    if (!ranked.length) {
      if (ambiguous.size) decisions.push({ path, action: 'review', value: null, confidence: 0, sources: [], conflicts: [...ambiguous] })
      continue
    }
    const winner = ranked[0]
    const conflicts = [...ranked.slice(1).flatMap((group) => group.providers), ...ambiguous]
    const review = conflicts.length > 0 || winner.confidence < threshold
    decisions.push({ path, action: review ? 'review' : 'fill', value: winner.value,
      confidence: winner.confidence, sources: winner.providers, conflicts,
      evidence: [...winner.providers, ...conflicts].flatMap((provider) => byProvider.get(provider)?.id ? [byProvider.get(provider)!.id!] : []) })
    if (!review) {
      if (path === '@coordinates') {
        setCombinedPath(patch, 'location.lat', (winner.value as number[])[0])
        setCombinedPath(patch, 'location.lng', (winner.value as number[])[1])
      } else setCombinedPath(patch, path, winner.value)
    }
  }
  return { patch, decisions, needsReview: decisions.some((decision) => decision.action === 'review') }
}
