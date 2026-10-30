import { buildQuestions, type Context, type Evidence } from '../review-automation/policy.ts'

const evidence = (text: string): Evidence[] => [{ url: 'https://example.org/source', retrieved_at: '2026-10-30T00:00:00Z', text }]
const base: Context = { item: { queue_type: 'milestone-review', title: 'Synthetic historical detector' },
  record: { title: 'Example gathering', description: 'The first gathering possibly took place in 1920.' },
  proposal: { field: 'description', proposed_value: { issues: ['uncertainty_language'] } }, related: {}, research: null,
  candidates: [{ id: 'reject', action: 'reject', payload: { integrity_rule: 'uncertainty_without_replacement' },
    explanation: 'Close only the detector proposal that objects solely to qualified historical wording and supplies no replacement. Preserve the text and historical verification status.' }],
  urls: [], input_hash: 'synthetic' }
const quality: Context = { ...base, item: { queue_type: 'quality-venue', title: 'Example Centre accessibility text', risk: 'safety' },
  record: { name: 'Example Centre', address: '1 Example Street, Example City', description: 'The ground floor is accessible; upper floors require stairs.' },
  proposal: { field: 'description', proposed_value: { value: 'The entire venue is wheelchair accessible.' } },
  candidates: [{ id: 'approve', action: 'approve', payload: {}, explanation: 'Replace the description with the exact proposed text, only if all its access claims are explicitly supported.' }] }
const namesake: Context = { ...quality, item: { queue_type: 'quality-city', title: 'Example City website proposal' },
  record: { name: 'Example City', country_id: 'synthetic-country', description: 'This record concerns Example City in Country A.' },
  proposal: { field: 'website', proposed_value: { value: 'https://example.org/other-city' } },
  candidates: [{ id: 'approve', action: 'approve', payload: {}, explanation: 'Assign this website to the exact Example City in Country A only if the source establishes that identity.' }] }

// Fixed synthetic canaries of the unchanged decision policy after state
// minimization. Labels are evaluation-only, never part of a vendor request.
export const REVIEW_FIXTURES: Record<string, { context: Context; evidence: Evidence[]; expected: 'reject' | 'blocked' }> = {
  'review-integrity-uncertainty': { context: base, evidence: evidence('Structural proposal integrity only.'), expected: 'reject' },
  'review-integrity-missing-target': { context: { ...base, item: { queue_type: 'entity-links', title: 'Synthetic link without target' },
    record: { name: 'Example Museum' }, proposal: { candidate_id: null, reason: 'The text mentions another institution.' },
    candidates: [{ id: 'reject', action: 'reject' as const, payload: { integrity_rule: 'missing_link_candidate' },
      explanation: 'Reject this unusable proposal solely because it has no canonical target. Do not assert that the institution does not exist.' }] },
    evidence: evidence('Structural proposal integrity only.'), expected: 'reject' },
  'review-access-qualification': { context: quality,
    evidence: evidence('Example Centre at 1 Example Street, Example City: the ground floor is wheelchair accessible. All upper floors require stairs and have no lift.'), expected: 'blocked' },
  'review-city-namesake': { context: namesake,
    evidence: evidence('Welcome to Example City in Country B. Our website describes only the Country B municipality, not the municipality of the same name in Country A.'), expected: 'blocked' },
}

export function reviewFixtureRequest(fixture: typeof REVIEW_FIXTURES[keyof typeof REVIEW_FIXTURES]) {
  const structural = fixture.context.candidates[0]?.payload.integrity_rule
  return buildQuestions(fixture.context, structural ? [{ ...fixture.evidence[0], kind: 'proposal_integrity' }] : [...fixture.evidence])
}
