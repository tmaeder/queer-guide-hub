import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

interface RelevanceResult {
  queer_relevant: boolean
  confidence: number
  reasoning: string
  suggested_tags: string[]
  sensitivity_flags: { category: 'legal'|'medical'|'nsfw'; confidence: number; severity: 'low'|'medium'|'high'; indicators: string[] }[]
}

const SYSTEM_PROMPT = `You are a data quality validator for queer.guide marketplace.
Assess whether a product is relevant to the LGBTQ+ community.

Queer-relevant signals: rainbow/pride imagery, explicit LGBTQ+ language, drag/ballroom items, queer art, binders, packers, tucking aids, gender-affirming gear, sex toys with LGBTQ+ positioning, queer books, pride flags, allyship/solidarity merch, LGBTQ+-owned brands.

NOT queer-relevant: generic commodity products unless explicitly framed queer.

Also flag sensitivity: "nsfw" (explicit adult), "medical" (HIV, gender-affirming care), "legal" (criminalization/asylum).

Return ONLY JSON, no markdown.`

async function validateRelevance(item: { title: string; description: string; brand?: string; category?: string; tags?: string[] }): Promise<RelevanceResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  const userPrompt = `Product: ${item.title}\nBrand: ${item.brand || 'N/A'}\nCategory: ${item.category || 'N/A'}\nTags: ${(item.tags || []).join(', ')}\nDescription: ${(item.description || '').slice(0, 800)}\n\nReturn JSON: {"queer_relevant":boolean,"confidence":0-1,"reasoning":"brief","suggested_tags":["..."],"sensitivity_flags":[{"category":"legal|medical|nsfw","confidence":0-1,"severity":"low|medium|high","indicators":["terms"]}]}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('non-json Claude response')
  const parsed = JSON.parse(match[0])
  return {
    queer_relevant: !!parsed.queer_relevant,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    reasoning: String(parsed.reasoning || ''),
    suggested_tags: Array.isArray(parsed.suggested_tags) ? parsed.suggested_tags.slice(0, 10) : [],
    sensitivity_flags: Array.isArray(parsed.sensitivity_flags) ? parsed.sensitivity_flags.filter((f: Record<string, unknown>) => ['legal','medical','nsfw'].includes(f.category as string)).slice(0, 5) : [],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize = body.batch_size || 25
    const threshold = body.threshold ?? 0.5
    const dryRun = body.dry_run || false
    let query = supabase.from('ingestion_staging').select('id, normalized_data').eq('target_table', 'marketplace_listings').eq('ai_validation_status', 'approved').is('classification_result', null).order('created_at', { ascending: true }).limit(batchSize)
    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)
    const { data: items, error } = await query
    if (error) return errorResponse(error.message, 500, req)
    if (!items || items.length === 0) return jsonResponse({ success: true, items: 0, message: 'nothing to classify' }, 200, req)
    let approved = 0, rejected = 0
    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const meta = (n.metadata ?? {}) as Record<string, unknown>
      try {
        const r = await validateRelevance({
          title: String(n.name ?? n.title ?? meta.product_name ?? ''),
          description: String(n.description ?? meta.description ?? ''),
          brand: String(n.brand ?? meta.brand ?? meta.brand_name ?? ''),
          category: String(n.category ?? meta.category ?? ''),
          tags: (n.tags as string[]) || [],
        })
        const classification = {
          lgbti_relevant: r.queer_relevant, lgbti_relevance_score: r.confidence, lgbti_reasoning: r.reasoning,
          sensitivity_flags: r.sensitivity_flags,
          review_priority: r.sensitivity_flags.some(f => f.severity === 'high') ? 'high' : r.sensitivity_flags.length > 0 ? 'medium' : 'normal',
          suggested_tags: r.suggested_tags, classified_at: new Date().toISOString(),
        }
        if (dryRun) continue
        const update: Record<string, unknown> = { classification_result: classification, ai_confidence_score: r.confidence }
        if (r.confidence < threshold) {
          update.disposition = 'rejected'
          update.error_message = `relevance_below_${threshold}: ${r.reasoning.slice(0, 120)}`
          rejected++
        } else if (r.sensitivity_flags.some(f => f.severity === 'high')) {
          update.review_status = 'pending_review'
        } else { approved++ }
        await supabase.from('ingestion_staging').update(update).eq('id', item.id)
        await supabase.from('ingestion_events').insert({ staging_id: item.id, stage: 'relevance', new_status: r.queer_relevant ? 'approved' : 'rejected', actor: 'marketplace-relevance', payload: classification })
        await new Promise(r => setTimeout(r, 200))
      } catch (err) { console.error(`relevance ${item.id}:`, (err as Error).message) }
    }
    return jsonResponse({ success: true, items: approved + rejected, items_processed: approved + rejected, items_succeeded: approved, items_failed: rejected, approved, rejected, dry_run: dryRun }, 200, req)
  } catch (error) { return errorResponse((error as Error).message, 500, req) }
})
