import { fillDataGaps, isDataGap } from './gap-fill.ts'

// scan-merge — merge extracted items coming from parallel content chunks into a
// deduped list. Pure (no Deno/network) so it's unit-testable.

export type MergeDetectedType = 'event' | 'venue' | 'hotel' | 'news' | 'marketplace'

export interface MergeItem {
  detected_type: MergeDetectedType
  fields: Record<string, unknown>
  raw_tags: string[]
}

/** Stable dedup key. Empty title/name → key ends with '|' and the item is dropped. */
export function itemKey(item: MergeItem): string {
  const v = (k: string) => {
    const f = item.fields[k] as { value?: unknown; confidence?: unknown; merge_evidence?: unknown[] } | undefined
    return String(f?.value ?? '').trim().toLowerCase()
  }
  const t = item.detected_type
  if (t === 'venue' || t === 'hotel') return `venue|${v('name')}`
  if (t === 'event') return `event|${v('title')}|${v('start_date').slice(0, 10)}`
  return `${t}|${v('title')}`
}

/**
 * Dedup items by key (first wins), fill missing fields from later duplicates,
 * union raw_tags, drop empties/untitled, and cap at maxItems.
 */
export function mergeExtractedItems<T extends MergeItem>(items: T[], maxItems = 60): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) {
    if (!item || Object.keys(item.fields).length === 0) continue
    const key = itemKey(item)
    if (key.endsWith('|')) continue // no title/name → noise
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...item, fields: { ...item.fields }, raw_tags: [...item.raw_tags] })
      continue
    }
    for (const [k, f] of Object.entries(item.fields)) {
      const prior = existing.fields[k] as { value?: unknown; confidence?: unknown; merge_evidence?: unknown[] } | undefined
      const donor = f as { value?: unknown; confidence?: unknown; merge_evidence?: unknown[] } | undefined
      if (!donor || isDataGap(donor.value)) continue
      if (!prior || isDataGap(prior.value)) existing.fields[k] = f
      else if (prior.value && typeof prior.value === 'object' && !Array.isArray(prior.value)) {
        const value = fillDataGaps(prior.value, donor.value)
        if (JSON.stringify(value) === JSON.stringify(prior.value)) continue
        const confidence = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0
        existing.fields[k] = {
          ...prior, value,
          confidence: Math.min(confidence(prior.confidence), confidence(donor.confidence)),
          merge_evidence: [...(Array.isArray(prior.merge_evidence) ? prior.merge_evidence : [prior]), donor],
        }
      }
    }
    for (const tag of item.raw_tags) if (!existing.raw_tags.includes(tag)) existing.raw_tags.push(tag)
  }
  return [...byKey.values()].slice(0, maxItems)
}
