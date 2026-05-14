// Structured output schema for the news quality LLM call.
// Mirrors the JSON contract in the project plan; parsing here strips unknown keys
// (preventing field injection from a misbehaving model).

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
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(match[0]) as Record<string, unknown>
  } catch {
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
