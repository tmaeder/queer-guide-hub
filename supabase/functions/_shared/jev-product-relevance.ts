import { JEV_MODEL, type JevRequest, type JevResponse } from './jev-client.ts'

export const PRODUCT_RELEVANCE_VERSION = 'jev-product-relevance-v1'
export const PRODUCT_RELEVANCE_POLICY_VERSION = 'jev-product-routing-v2'
const SIGNALS = ['pride_design', 'queer_culture', 'gender_affirming_function', 'queer_positioned_intimacy'] as const
const SENSITIVITY = ['explicit_adult', 'medical_claim', 'legal_claim'] as const

/** Public adapter text only. Merchant ownership/trust stays an authorized code input. */
export function buildProductRelevanceRequest(product: { title: string; text: string }): JevRequest {
  if (typeof product.title !== 'string' || !product.title.trim() || product.title.length > 500 ||
    typeof product.text !== 'string' || product.text.trim().length < 40 || product.text.length > 12000) throw new Error('Invalid public product evidence')
  return { model: JEV_MODEL, state: { question_version: PRODUCT_RELEVANCE_VERSION, original_product: { title: product.title, text: product.text } }, questions: {
    pride_design: { type: 'noul', instructions: 'Does `original_product` expressly describe an LGBTQ Pride design?', criteria: {
      true: 'The product is explicitly described as LGBTQ Pride, an identified community pride flag, or LGBTQ solidarity merchandise.',
      false: 'The source describes an ordinary product, a generic rainbow color, or unrelated use of the word pride without LGBTQ framing.',
    } },
    queer_culture: { type: 'noul', instructions: 'Does `original_product` describe cultural content about LGBTQ experiences?', criteria: {
      true: 'A book, artwork, film or performance product expressly concerns LGBTQ lives, history, community or drag/ballroom culture.',
      false: 'The content has no stated LGBTQ subject. An author or brand name alone does not establish a subject or personal identity.',
    } },
    gender_affirming_function: { type: 'noul', instructions: 'Does `original_product` expressly describe a product for affirming gender expression?', criteria: {
      true: 'The product is expressly for gender expression, such as chest binding, tucking, gender-affirming packing or pronoun affirmation.',
      false: 'The product has no stated gender-affirming function. Ordinary sports compression, travel packing and grammar materials do not establish it.',
    } },
    queer_positioned_intimacy: { type: 'noul', instructions: 'Does `original_product` expressly position an intimacy product for LGBTQ people?', criteria: {
      true: 'The source explicitly describes an intimacy product for LGBTQ people or a named LGBTQ community.',
      false: 'The source describes no intimacy product or a generic intimacy product without explicit LGBTQ positioning.',
    } },
    brand_affiliation_claim: { type: 'noul', instructions: 'Does `original_product` explicitly claim that its brand is LGBTQ affiliated?', criteria: {
      true: 'The source explicitly calls the brand LGBTQ owned, LGBTQ operated or a dedicated LGBTQ organization.',
      false: 'No brand affiliation is stated. A brand name, logo, founder name or rainbow color alone does not establish affiliation.',
    } },
    explicit_adult: { type: 'noul', instructions: 'Does `original_product` explicitly describe adult sexual use?', criteria: {
      true: 'The source expressly describes a sex toy, sexual stimulation, pornography or explicit sexual activity.',
      false: 'The source has no explicit adult sexual use. LGBTQ identity, pronouns, Pride designs and nonexplicit cultural content alone are not adult sexual content.',
    } },
    medical_claim: { type: 'noul', instructions: 'Does `original_product` make a medical claim?', criteria: {
      true: 'The source claims to diagnose, prevent or treat a health condition, or offers clinical care.',
      false: 'The source makes no medical claim. Gender expression, clothing, ordinary comfort and an anatomical product name alone do not assert clinical care.',
    } },
    legal_claim: { type: 'noul', instructions: 'Does `original_product` assert a legal entitlement or restriction?', criteria: {
      true: 'The source asserts a legal right, prohibited conduct, asylum entitlement or jurisdiction-specific legal restriction.',
      false: 'The source asserts no legal entitlement or restriction. A product name or ordinary delivery policy alone is not a legal assertion.',
    } },
  } }
}

export function productRelevanceJudgment(response: JevResponse) {
  const probabilities = Object.fromEntries([...SIGNALS, 'brand_affiliation_claim', ...SENSITIVITY].map(key => {
    const answer = response.answers[key] as { type?: string; noul?: unknown } | undefined
    if (answer?.type !== 'noul' || typeof answer.noul !== 'number' || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) throw new Error('Invalid product relevance judgment')
    return [key, answer.noul]
  }))
  // This is an observable support score, not a calibrated probability of a union.
  const score = Math.max(...SIGNALS.map(key => probabilities[key]))
  const relevance = score >= 0.7 ? 'relevant' : score <= 0.3 ? 'irrelevant' : 'uncertain'
  const sensitivityUncertain = SENSITIVITY.some(key => probabilities[key] > 0.3 && probabilities[key] < 0.7)
  const sensitivity = SENSITIVITY.filter(key => probabilities[key] >= 0.7)
  // Independent product evidence can establish relevance without certifying a
  // separate seller-ownership assertion. Affiliation alone needs authorization.
  const affiliationRequiresAuthorization = score < 0.7 && probabilities.brand_affiliation_claim > 0.3
  // Flags route to review; they do not certify medical/legal facts or personal identity.
  const route = relevance === 'irrelevant' && !affiliationRequiresAuthorization ? 'reject'
    : relevance === 'uncertain' || affiliationRequiresAuthorization || sensitivityUncertain || sensitivity.length ? 'review' : 'approve'
  return { relevance, score, route, sensitivity, sensitivity_uncertain: sensitivityUncertain, affiliation_requires_authorization: affiliationRequiresAuthorization, probabilities, policy_version: PRODUCT_RELEVANCE_POLICY_VERSION }
}
