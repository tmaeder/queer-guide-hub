import type { QualityDecision } from '../_shared/news-quality/schema.ts'

type QualityAttempt =
  | { kind: 'decision'; decision: QualityDecision }
  | { kind: 'malformed' }
  | { kind: 'deferred'; reason: 'service_unavailable' | 'provider_failure'; error?: unknown }

/** Infrastructure failures leave the row eligible for a later machine attempt. */
export async function attemptNewsQuality(
  available: () => Promise<boolean>,
  infer: () => Promise<QualityDecision | null>,
): Promise<QualityAttempt> {
  try {
    if (!await available()) return { kind: 'deferred', reason: 'service_unavailable' }
    const decision = await infer()
    return decision ? { kind: 'decision', decision } : { kind: 'malformed' }
  } catch (error) {
    return { kind: 'deferred', reason: 'provider_failure', error }
  }
}
