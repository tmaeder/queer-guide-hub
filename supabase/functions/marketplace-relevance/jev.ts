import { callJev, createJevBudget } from '../_shared/jev-client.ts'
import { buildProductRelevanceRequest, PRODUCT_RELEVANCE_VERSION, productRelevanceJudgment } from '../_shared/jev-product-relevance.ts'

// Initial promotion is limited to adapters with captured-public evaluation.
// Other authorized adapters can be shadowed at the shared pipeline gate.
export const JEV_RELEVANCE_PILOT_SOURCES = ['ohmyfantasy', 'autostraddle'] as const
type BudgetDb = Parameters<typeof createJevBudget>[0]

export async function classifyPublicProduct(db: BudgetDb, original: { title: string; text: string }, apiKey: string, dryRun: boolean) {
  const request = buildProductRelevanceRequest(original)
  const response = await callJev(request, { apiKey, caller: 'marketplace-relevance',
    budget: createJevBudget(db, dryRun ? 'validation-2026-10-29' : 'production') })
  const judgment = productRelevanceJudgment(response)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ model: request.model, state: request.state, questions: request.questions })))
  const inputHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  const flagNames = { explicit_adult: 'nsfw', medical_claim: 'medical', legal_claim: 'legal' } as const
  const sensitivityFlags = judgment.sensitivity.map(key => ({ category: flagNames[key], confidence: judgment.probabilities[key], severity: 'high', indicators: [key] }))
  const classification = {
    // Review is an unsettled admission decision, never a false factual label.
    // The native SQL guard cannot publish this null through a later score gate.
    lgbti_relevant: judgment.route === 'review' ? null : judgment.route === 'approve',
    lgbti_relevance_score: judgment.score,
    lgbti_reasoning: `Jev public product evidence: ${judgment.relevance}; ${judgment.route}`,
    classifier: PRODUCT_RELEVANCE_VERSION, policy_version: judgment.policy_version,
    routing_decision: judgment.route, source_relevance: judgment.relevance,
    sensitivity_flags: sensitivityFlags,
    review_priority: sensitivityFlags.length || judgment.sensitivity_uncertain || judgment.affiliation_requires_authorization ? 'high' : judgment.route === 'review' ? 'medium' : 'normal',
    suggested_tags: [] as string[], model: response.model, judgments: response.answers,
    input_hash: inputHash, input_tokens: response.usage.input_tokens,
    classified_at: new Date().toISOString(),
  }
  return { judgment, classification, request, response }
}
