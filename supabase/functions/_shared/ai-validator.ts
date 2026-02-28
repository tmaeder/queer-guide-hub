export interface AIValidationResult {
  queer_relevant: boolean
  confidence: number
  reasoning: string
  extracted_fields: Record<string, unknown>
  suggested_tags: string[]
}

const SYSTEM_PROMPT = `You are a data quality validator for queer.guide, an LGBTQ+ travel and community platform.
Your job is to assess whether a data item is relevant to the LGBTQ+ community and extract structured information.

Rules:
- Items MUST have clear LGBTQ+ relevance (gay bars, pride events, queer organizations, LGBTQ+ personalities, drag venues, leather bars, etc.)
- General restaurants/hotels are NOT relevant unless explicitly LGBTQ+-friendly or LGBTQ+-owned
- Return confidence 0.0-1.0 where 1.0 = definitely LGBTQ+ relevant
- Items with confidence < 0.7 should have queer_relevant = false
- Extract any structured fields you can identify from the raw data
- Be generous with items from known LGBTQ+ directories (Spartacus, GayCities, etc.) — they are likely relevant

Respond ONLY with valid JSON, no markdown code blocks.`

function sanitizeUserData(value: string): string {
  return value.replace(/<\/?user_data>/gi, '')
}

function buildUserPrompt(
  item: { name: string; description?: string; category?: string; source_url?: string; raw_data: Record<string, unknown> },
  targetTable: string
): string {
  return `Validate this ${targetTable} item for LGBTQ+ relevance:

Name: <user_data>${sanitizeUserData(item.name)}</user_data>
Description: <user_data>${sanitizeUserData((item.description || 'N/A').slice(0, 500))}</user_data>
Category: <user_data>${sanitizeUserData(item.category || 'N/A')}</user_data>
Source: <user_data>${sanitizeUserData(item.source_url || 'N/A')}</user_data>

Raw data (truncated): ${JSON.stringify(item.raw_data).slice(0, 1500)}

Respond with JSON:
{
  "queer_relevant": boolean,
  "confidence": number,
  "reasoning": "brief explanation",
  "extracted_fields": {},
  "suggested_tags": ["tag1", "tag2"]
}`
}

export async function validateWithClaude(
  item: { name: string; description?: string; category?: string; source_url?: string; raw_data: Record<string, unknown> },
  targetTable: string
): Promise<AIValidationResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(item, targetTable) }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'

  // Extract JSON — handle both raw JSON and markdown-wrapped JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Claude returned non-JSON response')
  }

  const result = JSON.parse(jsonMatch[0])

  return {
    queer_relevant: result.queer_relevant ?? false,
    confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0)),
    reasoning: String(result.reasoning || ''),
    extracted_fields: result.extracted_fields ?? {},
    suggested_tags: Array.isArray(result.suggested_tags) ? result.suggested_tags : [],
  }
}

// Estimate cost per call (input ~500 tokens, output ~200 tokens for Sonnet)
const ESTIMATED_COST_PER_CALL_USD = 0.0025

export async function batchValidateWithClaude(
  items: Array<{ name: string; description?: string; category?: string; source_url?: string; raw_data: Record<string, unknown> }>,
  targetTable: string,
  options: { delayMs?: number } = {}
): Promise<{ results: AIValidationResult[]; totalCostUsd: number }> {
  const results: AIValidationResult[] = []
  const delay = options.delayMs ?? 200
  let totalCostUsd = 0

  for (const item of items) {
    try {
      const result = await validateWithClaude(item, targetTable)
      results.push(result)
      totalCostUsd += ESTIMATED_COST_PER_CALL_USD
    } catch (error) {
      console.error(`AI validation failed for "${item.name}":`, error)
      results.push({
        queer_relevant: false,
        confidence: 0,
        reasoning: `Validation error: ${(error as Error).message}`,
        extracted_fields: {},
        suggested_tags: [],
      })
    }
    if (delay > 0 && items.indexOf(item) < items.length - 1) {
      await new Promise(r => setTimeout(r, delay))
    }
  }

  return { results, totalCostUsd }
}
