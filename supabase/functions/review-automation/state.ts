import type { Context, Evidence } from './policy.ts'
import { sourceUrl } from './evidence.ts'

export const STATE_VERSION = 'jev-review-public-state-v2'
// Public record/proposal fields, plus explicit structures needed to assess the
// supplied proposal. Unknown nested metadata is never forwarded by default.
const PUBLIC_FIELDS = new Set([
  'id', 'name', 'title', 'description', 'short_description', 'long_description', 'body', 'content', 'text',
  'website', 'source_url', 'url', 'urls', 'address', 'city_id', 'country_id', 'latitude', 'longitude',
  'start_date', 'end_date', 'venue_name', 'venue_id', 'event_type', 'category', 'entity_type', 'entity_id',
  'field', 'proposed_value', 'current_value', 'citations', 'locale', 'suggestion_type', 'keep_id', 'drop_id',
  'organization_id', 'milestone_id', 'canonical_id', 'candidate_id', 'duplicate_id', 'series_key',
  'data_source', 'external_id', 'status', 'review_status', 'disposition', 'quality_status', 'shell_status',
  'duplicate_of_id', 'closed_at', 'human_reviewed', 'seo_indexable', 'publication_role', 'image_url',
  'image_license', 'image_attribution', 'reason', 'issue_code', 'evidence', 'source_content',
  'normalized_data', 'enriched_data', 'confidence', 'proposed_role_kind', 'milestone_id_1', 'milestone_id_2',
  'value', 'replacement', 'issues', 'quote', 'retrieved_at', 'observed_at', 'kind', 'source',
  'normalized', 'enriched', 'captured', 'source_name', 'city', 'country',
])
const RELATED = new Set(['canonical', 'duplicate', 'organization', 'first', 'second', 'location', 'venue_candidates', 'publisher_sources'])
const META = new Set(['issue_code', 'review_type', 'field', 'entity_type', 'severity', 'reason'])
const URL_FIELDS = new Set(['website', 'source_url', 'url', 'image_url'])

function projector() {
  let nodes = 0
  const visit = (value: unknown, depth = 0, fields = PUBLIC_FIELDS, key?: string): unknown => {
    if (++nodes > 4000 || depth > 10) throw new Error('Review public state exceeds bounds')
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Invalid Review public number')
      return value
    }
    if (typeof value === 'string') {
      if (value.length > 18000) throw new Error('Review public text exceeds bounds')
      if (key && URL_FIELDS.has(key)) {
        try { return sourceUrl(value).href } catch { return undefined }
      }
      if (/^https?:\/\/\S+$/.test(value)) {
        try { return sourceUrl(value).href } catch { throw new Error('Review public value contains an unsupported URL') }
      }
      return value
    }
    if (Array.isArray(value)) {
      if (value.length > 128) throw new Error('Review public array exceeds bounds')
      return value.map(v => visit(v, depth + 1, PUBLIC_FIELDS, key === 'urls' ? 'url' : key)).filter(v => v !== undefined)
    }
    if (!value || typeof value !== 'object') return undefined
    const result: Record<string, unknown> = {}
    for (const [name, child] of Object.entries(value)) {
      if (!fields.has(name)) continue
      const projected = visit(child, depth + 1, PUBLIC_FIELDS, name)
      if (projected !== undefined) result[name] = projected
    }
    return result
  }
  return visit
}

/** The only Review context that may be serialized into a vendor request. */
export function publicReviewState(context: Context, evidence: Evidence[]) {
  const project = projector()
  const proposal = project(context.proposal) as Record<string, unknown> | null
  const record = project(context.record) as Record<string, unknown> | null
  const integrity = context.candidates.length === 1 && context.candidates[0].action === 'reject'
    ? context.candidates[0].payload.integrity_rule : null
  return {
    state_version: STATE_VERSION,
    issue: { queue_type: context.item.queue_type, title: context.item.title, risk: context.item.risk,
      meta: project(context.item.meta, 0, META) as Record<string, unknown> | undefined },
    current_record: record, proposal, related: project(context.related, 0, RELATED),
    // Research can discover URLs/canonical candidates server-side, but its
    // arbitrary metadata/generated conclusions are not independent evidence.
    fetched_sources: evidence.map(page => ({ url: sourceUrl(page.url).href, retrieved_at: page.retrieved_at,
      kind: page.kind ?? 'public_source', text: page.kind === 'proposal_integrity'
        ? JSON.stringify({ rule: integrity, proposal, current_text: (record as Record<string, unknown> | null)?.description,
          scope: 'Proposal integrity only; no underlying entity or historical facts are certified.' }) : page.text })),
  }
}
