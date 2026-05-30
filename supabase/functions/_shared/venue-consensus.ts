// Venue Truth Engine — pure field-level consensus voting.
// No I/O. Imported by pipeline-consensus-merge and unit-tested in isolation.
//
// Given candidate values for a venue field from multiple sources, decide the
// winning value and a confidence in [0,1] derived from cross-source agreement.
// Agreement raises confidence (noisy-OR of source trust); conflict lowers it.

import { extractDomain, normalizeEmail, normalizeName, normalizePhone } from './venue-pipeline-utils.ts'

// Source trust weights. Higher = more authoritative. `existing` is the venue's
// current DB value — trusted enough to resist churn but beatable by consensus.
export const SOURCE_WEIGHTS: Record<string, number> = {
  admin: 1.0,
  google: 0.85,
  foursquare: 0.8,
  tripadvisor: 0.8,
  tomtom: 0.75,
  wikidata: 0.75,
  osm: 0.7,
  existing: 0.6,
  website: 0.6,
  llm: 0.5,
}

export function sourceWeight(source: string): number {
  return SOURCE_WEIGHTS[source] ?? 0.5
}

export type FieldKind = 'identity' | 'url' | 'phone' | 'email' | 'coords' | 'text' | 'number' | 'array'

export interface FieldSpec {
  field: string
  // path within normalized_data, dot-separated (e.g. 'contacts.website')
  path: string
  kind: FieldKind
  // numeric agreement tolerance (number kind) — values within are "the same"
  tolerance?: number
}

// Canonical venue consensus fields and where they live in normalized_data.
export const VENUE_FIELDS: FieldSpec[] = [
  { field: 'name', path: 'name', kind: 'identity' },
  { field: 'description', path: 'description', kind: 'text' },
  { field: 'website', path: 'contacts.website', kind: 'url' },
  { field: 'phone', path: 'contacts.phone', kind: 'phone' },
  { field: 'email', path: 'contacts.email', kind: 'email' },
  { field: 'latitude', path: 'location.lat', kind: 'coords' },
  { field: 'longitude', path: 'location.lng', kind: 'coords' },
  { field: 'address', path: 'location.address', kind: 'text' },
  { field: 'city', path: 'location.city', kind: 'text' },
  { field: 'country', path: 'location.country', kind: 'text' },
  { field: 'category', path: 'category', kind: 'text' },
  { field: 'hours', path: 'hours', kind: 'text' },
  { field: 'tags', path: 'tags', kind: 'array' },
  { field: 'images', path: 'images', kind: 'array' },
  { field: 'lgbti_relevance_score', path: 'lgbti_relevance_score', kind: 'number', tolerance: 0.15 },
]

export interface Candidate {
  source: string
  value: unknown
}

export interface FieldDecision {
  field: string
  winner: unknown
  winningSource: string
  confidence: number
  agreeing: string[]
  conflicting: string[]
  action: 'auto_commit' | 'triage' | 'no_change' | 'skipped'
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'number') return !Number.isFinite(v)
  return false
}

// Comparison key: two candidates "agree" iff their keys are equal.
function comparisonKey(kind: FieldKind, value: unknown): string {
  switch (kind) {
    case 'identity':
    case 'text':
      return normalizeName(value)
    case 'url': {
      const d = extractDomain(value)
      return d ?? ''
    }
    case 'phone': {
      const p = normalizePhone(value)
      return p ?? ''
    }
    case 'email': {
      const e = normalizeEmail(value)
      return e ?? ''
    }
    case 'coords':
      return String(Math.round(Number(value) * 1000) / 1000) // ~110m grid
    case 'number':
      return String(value)
    default:
      return JSON.stringify(value)
  }
}

// noisy-OR combination of independent source trust weights.
function noisyOr(weights: number[]): number {
  const p = weights.reduce((acc, w) => acc * (1 - Math.max(0, Math.min(1, w))), 1)
  return Math.round((1 - p) * 100) / 100
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (isEmpty(v)) return []
  return [v]
}

/**
 * Decide the winning value + confidence for one field across source candidates.
 * @param autoThreshold confidence at/above which the field is safe to auto-commit
 */
export function decideField(
  spec: FieldSpec,
  rawCandidates: Candidate[],
  autoThreshold = 0.85,
): FieldDecision | null {
  const candidates = rawCandidates.filter((c) => !isEmpty(c.value))
  if (candidates.length === 0) return null

  // Arrays: union of all values; every contributing source agrees.
  if (spec.kind === 'array') {
    const seen = new Set<string>()
    const union: unknown[] = []
    for (const c of candidates) {
      for (const item of toArray(c.value)) {
        const k = normalizeName(item)
        if (k && !seen.has(k)) {
          seen.add(k)
          union.push(item)
        }
      }
    }
    const agreeing = candidates.map((c) => c.source)
    const confidence = noisyOr(agreeing.map(sourceWeight))
    return {
      field: spec.field,
      winner: union,
      winningSource: agreeing.sort((a, b) => sourceWeight(b) - sourceWeight(a))[0],
      confidence,
      agreeing,
      conflicting: [],
      action: confidence >= autoThreshold ? 'auto_commit' : 'triage',
    }
  }

  // Numbers: cluster within tolerance; winner = weight-avg of best cluster.
  if (spec.kind === 'number') {
    const tol = spec.tolerance ?? 0.1
    const nums = candidates
      .map((c) => ({ source: c.source, n: Number(c.value) }))
      .filter((x) => Number.isFinite(x.n))
    if (nums.length === 0) return null
    let best: { members: typeof nums; weight: number } | null = null
    for (const anchor of nums) {
      const members = nums.filter((x) => Math.abs(x.n - anchor.n) <= tol)
      const weight = members.reduce((s, m) => s + sourceWeight(m.source), 0)
      if (!best || weight > best.weight) best = { members, weight }
    }
    const members = best!.members
    const totalW = members.reduce((s, m) => s + sourceWeight(m.source), 0)
    const avg = members.reduce((s, m) => s + m.n * sourceWeight(m.source), 0) / totalW
    const agreeing = members.map((m) => m.source)
    const conflicting = nums.filter((x) => !agreeing.includes(x.source)).map((x) => x.source)
    let confidence = noisyOr(agreeing.map(sourceWeight))
    if (conflicting.length > 0) confidence = Math.round(confidence * 0.7 * 100) / 100
    return {
      field: spec.field,
      winner: Math.round(avg * 100) / 100,
      winningSource: agreeing.sort((a, b) => sourceWeight(b) - sourceWeight(a))[0],
      confidence,
      agreeing,
      conflicting,
      action: confidence >= autoThreshold && conflicting.length === 0 ? 'auto_commit' : 'triage',
    }
  }

  // Scalar fields: group by comparison key, pick the group with the most trust.
  const groups = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = comparisonKey(spec.kind, c.value)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  if (groups.size === 0) return null

  let bestKey = ''
  let bestWeight = -1
  for (const [key, members] of groups) {
    const w = members.reduce((s, m) => s + sourceWeight(m.source), 0)
    // tie-break: prefer the heavier single source
    const topSingle = Math.max(...members.map((m) => sourceWeight(m.source)))
    const score = w + topSingle / 1000
    if (score > bestWeight) {
      bestWeight = score
      bestKey = key
    }
  }
  const winners = groups.get(bestKey)!
  const agreeing = winners.map((c) => c.source)
  const conflicting = candidates.filter((c) => !agreeing.includes(c.source)).map((c) => c.source)
  // winner value = raw value from the highest-trust source in the winning group
  const winner = [...winners].sort((a, b) => sourceWeight(b.source) - sourceWeight(a.source))[0].value
  let confidence = noisyOr(agreeing.map(sourceWeight))
  if (conflicting.length > 0) confidence = Math.round(confidence * 0.7 * 100) / 100

  return {
    field: spec.field,
    winner,
    winningSource: agreeing.sort((a, b) => sourceWeight(b) - sourceWeight(a))[0],
    confidence,
    agreeing,
    conflicting,
    action: confidence >= autoThreshold && conflicting.length === 0 ? 'auto_commit' : 'triage',
  }
}

export interface SourceRecord {
  source: string
  data: Record<string, unknown> // normalized_data
}

/** Run consensus over every venue field for a group of source records. */
export function runConsensus(
  sources: SourceRecord[],
  autoThreshold = 0.85,
): FieldDecision[] {
  const decisions: FieldDecision[] = []
  for (const spec of VENUE_FIELDS) {
    const candidates: Candidate[] = sources.map((s) => ({
      source: s.source,
      value: getPath(s.data, spec.path),
    }))
    const decision = decideField(spec, candidates, autoThreshold)
    if (decision) decisions.push(decision)
  }
  return decisions
}

// --- Closure detection -------------------------------------------------------

export type ClosureSignal = { source: string; reason: string }

const CLOSED_STATUSES = new Set(['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY', 'closed', 'permanently_closed'])

/** Extract a closure signal from one source's normalized_data, if any. */
export function closureSignal(source: string, data: Record<string, unknown>): ClosureSignal | null {
  const meta = (data.metadata ?? {}) as Record<string, unknown>
  const status = String(meta.business_status ?? data.business_status ?? '').trim()
  if (status && CLOSED_STATUSES.has(status)) return { source, reason: `business_status=${status}` }
  if (meta.permanently_closed === true || data.permanently_closed === true) {
    return { source, reason: 'permanently_closed=true' }
  }
  const urlStatus = String(meta.url_status ?? data.url_status ?? '')
  if (urlStatus === '404' || urlStatus === '410') return { source, reason: `url_status=${urlStatus}` }
  return null
}

export interface ClosureVerdict {
  closed: boolean // >=2 independent signals → high confidence auto-close
  needsAttention: boolean // exactly 1 signal → flag for human
  signals: ClosureSignal[]
}

export function evaluateClosure(signals: ClosureSignal[]): ClosureVerdict {
  const distinct = Array.from(new Map(signals.map((s) => [s.source, s])).values())
  return {
    closed: distinct.length >= 2,
    needsAttention: distinct.length === 1,
    signals: distinct,
  }
}
