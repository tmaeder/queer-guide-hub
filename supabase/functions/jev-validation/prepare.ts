import { buildClaimRequest, decideClaim, relationProbs } from '../_shared/accessibility-claim-check.ts'
import { LIVE_QUEUE } from '../_shared/accessibility-evidence.fixtures.ts'
import { buildFieldEvidenceRequest, EVIDENCE_QUESTION_VERSION, fieldEvidenceVerdict } from '../_shared/jev-evidence-judgments.ts'
import type { JevRequest, JevResponse } from '../_shared/jev-client.ts'
import { VALIDATION_FIXTURES } from './fixtures.ts'
import { PIPELINE_FIXTURES } from './pipeline-fixtures.ts'
import { PIPELINE_QUESTION_VERSION, pipelineJudgment } from '../_shared/jev-pipeline-judgments.ts'

export interface ValidationCase {
  name: string
  questionVersion: string
  kind: 'synthetic_field' | 'historical_accessibility' | 'synthetic_pipeline'
  expected: unknown
  request: JevRequest
  judge(response: JevResponse): { verdict: unknown; matches: boolean; reason_matches?: boolean }
}
/** Historical labels are evaluation data only; no live facts or publication rights are asserted. */
export function prepareValidationCase(name: string): ValidationCase | null {
  if (Object.hasOwn(PIPELINE_FIXTURES, name)) {
    const { request, expected } = PIPELINE_FIXTURES[name]
    return { name, questionVersion: PIPELINE_QUESTION_VERSION, kind: 'synthetic_pipeline', expected, request, judge(response) {
      const verdict = pipelineJudgment(response)
      return { verdict, matches: verdict === expected }
    } }
  }
  if (Object.hasOwn(VALIDATION_FIXTURES, name)) {
    const { candidate, expected } = VALIDATION_FIXTURES[name]
    return { name, questionVersion: EVIDENCE_QUESTION_VERSION, kind: 'synthetic_field', expected, request: buildFieldEvidenceRequest(candidate), judge(response) {
      const verdict = fieldEvidenceVerdict(candidate, response)
      return { verdict, matches: verdict === expected }
    } }
  }
  const match = /^accessibility-benchmark-(\d{2})$/.exec(name)
  const row = match ? LIVE_QUEUE[Number(match[1])] : null
  if (!row) return null
  const prepared = buildClaimRequest({ venueName: row.name, sourceText: row.src, slugs: row.slugs, citations: row.citations })
  const expected = Object.fromEntries([...new Set(row.slugs)].map(slug => [slug, {
    kept: row.keep.includes(slug), reason: row.keep.includes(slug) ? 'supported' : row.why[slug],
  }]))
  return { name, questionVersion: 'accessibility-claims-20261029', kind: 'historical_accessibility', expected, request: prepared.body, judge(response) {
    const probabilities = Object.fromEntries(Object.entries(response.answers).map(([key, answer]) => [key, relationProbs(answer)]))
    const verdict = Object.fromEntries(Object.keys(expected).map(slug => {
      const judgment = decideClaim(slug, prepared, probabilities)
      return [slug, { kept: judgment.ok, reason: judgment.reason }]
    }))
    return { verdict, matches: Object.keys(expected).every(slug => verdict[slug].kept === expected[slug].kept),
      reason_matches: Object.keys(expected).every(slug => verdict[slug].reason === expected[slug].reason) }
  } }
}
