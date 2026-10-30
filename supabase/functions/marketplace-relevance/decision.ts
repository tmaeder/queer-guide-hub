export interface RelevanceResult {
  queer_relevant: boolean
  confidence: number
  reasoning: string
  suggested_tags: string[]
  sensitivity_flags: { category: 'legal' | 'medical' | 'nsfw'; confidence: number; severity: 'low' | 'medium' | 'high'; indicators: string[] }[]
}

/** Legacy generative output is untrusted. A string "false" is not true. */
export function readRelevanceResult(value: unknown): RelevanceResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relevance result')
  const r = value as Record<string, unknown>
  const probability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
  if (typeof r.queer_relevant !== 'boolean' || !probability(r.confidence) || typeof r.reasoning !== 'string') throw new Error('Invalid relevance judgment')
  if (!Array.isArray(r.suggested_tags) || !r.suggested_tags.every(t => typeof t === 'string' && t.length <= 120)) throw new Error('Invalid relevance tags')
  if (!Array.isArray(r.sensitivity_flags) || !r.sensitivity_flags.every(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
    const f = raw as Record<string, unknown>
    return ['legal', 'medical', 'nsfw'].includes(String(f.category)) && probability(f.confidence) &&
      ['low', 'medium', 'high'].includes(String(f.severity)) && Array.isArray(f.indicators) && f.indicators.every(i => typeof i === 'string' && i.length <= 160)
  })) throw new Error('Invalid relevance sensitivity judgments')
  return { queer_relevant: r.queer_relevant, confidence: r.confidence, reasoning: r.reasoning.slice(0, 2000),
    suggested_tags: r.suggested_tags.slice(0, 10), sensitivity_flags: r.sensitivity_flags.slice(0, 5) as RelevanceResult['sensitivity_flags'] }
}

/** Confidence describes the stated answer; it cannot turn a negative into approval. */
export function relevanceDisposition(r: RelevanceResult, threshold: number): 'approve' | 'reject' | 'review' {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid relevance threshold')
  if (r.confidence < threshold) return 'review'
  if (!r.queer_relevant) return 'reject'
  if (r.sensitivity_flags.some(f => f.severity === 'high')) return 'review'
  return 'approve'
}
