// Structured output schema for the news quality LLM call.
// Mirrors the JSON contract in the project plan; parsing here strips unknown keys
// (preventing field injection from a misbehaving model).

import { extractJsonCandidates, parseJsonObject } from '../json-extract.ts'

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed'

export interface QualityImageAssessment {
  isUsable: boolean
  qualityScore: number
  isRelevant: boolean
  needsReplacement: boolean
  reason: string
}

export interface QualityDecision {
  isRelevant: boolean
  relevanceScore: number
  qualityScoreBefore: number
  qualityScoreAfter: number
  shouldPublish: boolean
  needsManualReview: boolean
  title: string
  excerpt: string
  cleanedBody: string
  sentiment: Sentiment
  tags: string[]
  linkedCountries: string[]
  linkedCities: string[]
  linkedRegions: string[]
  linkedVenues: string[]
  linkedEvents: string[]
  linkedPersonalities: string[]
  linkedOrganisations: string[]
  imageAssessment: QualityImageAssessment
  removedArtifacts: string[]
  warnings: string[]
  confidence: number
  isSatire?: boolean
  isAdvertorial?: boolean
}

const SENTIMENTS: ReadonlyArray<Sentiment> = ['positive', 'neutral', 'negative', 'mixed']

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback)

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean) : []

const sentiment = (v: unknown): Sentiment => {
  if (typeof v === 'string' && (SENTIMENTS as ReadonlyArray<string>).includes(v)) return v as Sentiment
  return 'neutral'
}

export function parseQualityDecision(content: string): QualityDecision | null {
  // Try each candidate, best-first, instead of the single greedy span this used
  // to run. A reasoning model that fences its object or writes a sentence
  // containing a brace defeats the greedy match, and the caller then records
  // `no_decision` — indistinguishable from "the model had no answer". Measured
  // on prod 2026-09-19: 547 successful completions, 268 decisions; the ~279
  // discarded answers are why 78 ordinary news articles sat unjudged in
  // /admin/inbox. See _shared/json-extract.ts for why the order is what it is
  // and why the legacy greedy span is kept as the final candidate.
  // parseJsonObject retries each candidate with control characters escaped.
  // Measured on prod 2026-09-20, that is 14 of 19 failures on this path: the
  // model writes cleanedBody's paragraph breaks as literal newlines inside the
  // JSON string. See _shared/json-extract.ts for why the unescaped-quote half
  // is deliberately not repaired here.
  let raw: Record<string, unknown> | null = null
  for (const candidate of extractJsonCandidates(content)) {
    raw = parseJsonObject(candidate)
    if (raw) break
  }
  if (!raw) {
    // A discarded answer must SAY so. The old path returned null silently, so
    // the only trace of ~279 lost verdicts was a bare 'no_decision' string on
    // the job row with the response itself gone — nothing anyone could diagnose
    // from. Bounded, because this is a per-article loop, not a one-shot.
    console.error(
      `[news-quality] no parseable JSON in a ${content.length}-char completion; first 600 chars: ` +
        content.slice(0, 600),
    )
    return null
  }

  const img = (raw.imageAssessment ?? {}) as Record<string, unknown>

  return {
    isRelevant: bool(raw.isRelevant),
    relevanceScore: num(raw.relevanceScore),
    qualityScoreBefore: num(raw.qualityScoreBefore),
    qualityScoreAfter: num(raw.qualityScoreAfter),
    shouldPublish: bool(raw.shouldPublish),
    needsManualReview: bool(raw.needsManualReview, true),
    title: str(raw.title).slice(0, 240),
    excerpt: str(raw.excerpt).slice(0, 600),
    cleanedBody: str(raw.cleanedBody),
    sentiment: sentiment(raw.sentiment),
    tags: strArr(raw.tags).slice(0, 12),
    linkedCountries: strArr(raw.linkedCountries).slice(0, 12),
    linkedCities: strArr(raw.linkedCities).slice(0, 12),
    linkedRegions: strArr(raw.linkedRegions).slice(0, 12),
    linkedVenues: strArr(raw.linkedVenues).slice(0, 20),
    linkedEvents: strArr(raw.linkedEvents).slice(0, 12),
    linkedPersonalities: strArr(raw.linkedPersonalities).slice(0, 20),
    linkedOrganisations: strArr(raw.linkedOrganisations).slice(0, 20),
    imageAssessment: {
      isUsable: bool(img.isUsable),
      qualityScore: num(img.qualityScore),
      isRelevant: bool(img.isRelevant),
      needsReplacement: bool(img.needsReplacement),
      reason: str(img.reason).slice(0, 240),
    },
    removedArtifacts: strArr(raw.removedArtifacts).slice(0, 30),
    warnings: strArr(raw.warnings).slice(0, 20),
    confidence: num(raw.confidence),
    isSatire: bool(raw.isSatire),
    isAdvertorial: bool(raw.isAdvertorial),
  }
}

export const QUALITY_PIPELINE_VERSION = 'news-quality.2026.04.27.0'
