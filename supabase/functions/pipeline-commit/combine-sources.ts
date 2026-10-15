import type { getServiceClient } from '../_shared/supabase-client.ts'
import { combineDataSources, setCombinedPath, providerKey, type DataRecord } from '../_shared/source-combination.ts'
import { isDataGap } from '../_shared/gap-fill.ts'
import { sourceWeight } from '../_shared/venue-consensus.ts'

const TABLES = new Set(['venues', 'events', 'cities', 'countries', 'personalities', 'marketplace_listings',
  'organizations', 'hotels', 'queer_villages', 'news_articles', 'milestones'])
interface Observation {
  id: string; source_name: string | null; source_type: string | null
  normalized_data: DataRecord | null; created_at: string
}
interface Pending extends Observation {
  enriched_data: DataRecord | null; dedup_match_id: string; updated_at: string
}
export interface CombinationBatch {
  pending: Pending[]
  canonical: Record<string, DataRecord>
  history: Record<string, Observation[]>
}
function comparable(data: DataRecord): DataRecord {
  const contacts = (data.contacts || {}) as DataRecord
  const metadata = (data.metadata || {}) as DataRecord
  const first = (...values: unknown[]) => values.find((value) => !isDataGap(value))
  return { ...data,
    website: first(data.website, data.website_url, data.official_website, contacts.website, metadata.website),
    phone: first(data.phone, data.contact_phone, contacts.phone, metadata.phone),
    email: first(data.email, data.contact_email, contacts.email, metadata.email),
    social_links: first(data.social_links, data.social),
    location: data.location || { lat: data.latitude, lng: data.longitude, address: data.address, postal_code: data.postal_code },
    // One path per concept, regardless of provider schema.
    contacts: {}, metadata: {},
  }
}

export function planSourceCombinations(batch: CombinationBatch, table: string): DataRecord[] {
  const groups = new Map<string, Pending[]>()
  for (const row of batch.pending) {
    const group = groups.get(row.dedup_match_id) || []
    group.push(row)
    groups.set(row.dedup_match_id, group)
  }
  const plans: DataRecord[] = []
  for (const [entityId, members] of groups) {
    const canonical = batch.canonical[entityId]
    if (!canonical || canonical.duplicate_of_id) continue
    const observations = [...members, ...(batch.history[entityId] || [])]
    if (observations.length < 2) continue
    // Vote only on fields this target can actually persist. This avoids
    // spurious review work and repeated plans for unsupported source fields.
    const applicable = (data: DataRecord): DataRecord => {
      const value = comparable(data)
      const result: DataRecord = {}
      for (const key of ['description', 'bio', 'excerpt', 'images', 'image_url', 'hours', 'description_i18n']) {
        if (Object.hasOwn(canonical, key)) result[key] = value[key]
      }
      if (Object.hasOwn(canonical, 'image_url') && isDataGap(result.image_url) && Array.isArray(value.images)) result.image_url = value.images[0]
      if (Object.hasOwn(canonical, 'images') && isDataGap(result.images) && !isDataGap(value.image_url)) result.images = [value.image_url]
      if (['website', 'website_url', 'official_website'].some((key) => Object.hasOwn(canonical, key))) result.website = value.website
      if (['phone', 'contact_phone'].some((key) => Object.hasOwn(canonical, key))) result.phone = value.phone
      if (['email', 'contact_email'].some((key) => Object.hasOwn(canonical, key))) result.email = value.email
      if (['social', 'social_links'].some((key) => Object.hasOwn(canonical, key))) result.social_links = value.social_links
      const location = (value.location || {}) as DataRecord
      const loc: DataRecord = {}
      if (Object.hasOwn(canonical, 'latitude') && Object.hasOwn(canonical, 'longitude')) {
        loc.lat = location.lat; loc.lng = location.lng
      }
      if (Object.hasOwn(canonical, 'address')) loc.address = location.address
      if (Object.hasOwn(canonical, 'postal_code')) loc.postal_code = location.postal_code
      result.location = loc
      return result
    }
    const result = combineDataSources(applicable(canonical), observations.map((row) => ({
      source: row.source_name || row.source_type || 'unknown', stagingId: row.id,
      data: applicable(row.normalized_data || {}), observedAt: row.created_at,
    })))
    if (!result.decisions.some((decision) => decision.action !== 'preserve')) continue
    const primary = [...members].sort((a, b) =>
      sourceWeight(providerKey(b.source_name || b.source_type || 'unknown')) -
      sourceWeight(providerKey(a.source_name || a.source_type || 'unknown')) || a.id.localeCompare(b.id))[0]
    const normalized = { ...(primary.normalized_data || {}) }
    for (const decision of result.decisions) {
      if (decision.action === 'review') continue
      if (decision.path === '@coordinates') {
        const [lat, lng] = decision.value as number[]
        setCombinedPath(normalized, 'location.lat', lat)
        setCombinedPath(normalized, 'location.lng', lng)
      } else {
        setCombinedPath(normalized, decision.path, decision.value)
        if (['website', 'phone', 'email'].includes(decision.path)) {
          setCombinedPath(normalized, `contacts.${decision.path}`, decision.value)
          setCombinedPath(normalized, `metadata.${decision.path}`, decision.value)
        }
      }
    }
    plans.push({ ids: members.map((row) => row.id), primary: primary.id, table,
      expected: Object.fromEntries(members.map((row) => [row.id, { normalized_data: row.normalized_data,
        enriched_data: row.enriched_data, updated_at: row.updated_at }])),
      normalized, decisions: result.decisions, needs_review: result.needsReview })
  }
  return plans
}

/** Two batched RPCs per pass, independent of group count. The database reads
 * indexed recent history and applies each group's CAS in a short transaction.
 * No name matching, source archiving, external AI calls, or cleared review gates.
 */
export async function combineStagingSources(
  supabase: ReturnType<typeof getServiceClient>, table: string, pipelineRunId?: string, limit = 100,
) {
  if (!TABLES.has(table)) return { groups: 0, gated: 0 }
  const rpc = supabase as unknown as {
    rpc(name: string, args: DataRecord): Promise<{ data: unknown; error: { message: string } | null }>
  }
  const loaded = await rpc.rpc('load_source_combination_batch', {
    p_table: table, p_pipeline_run_id: pipelineRunId || null, p_limit: Math.min(Math.max(limit, 1), 500),
  })
  if (loaded.error) throw new Error(`source combination read: ${loaded.error.message}`)
  const plans = planSourceCombinations(loaded.data as CombinationBatch, table)
  if (!plans.length) return { groups: 0, gated: 0 }
  const applied = await rpc.rpc('apply_source_combination_batch', { p_groups: plans })
  if (applied.error) throw new Error(`source combination write: ${applied.error.message}`)
  return applied.data as { groups: number; gated: number; stale: number }
}
