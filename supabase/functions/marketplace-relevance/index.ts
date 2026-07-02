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

// Coerce CF Workers AI result (.result.response can be a string OR an object).
function coerceText(x: unknown): string {
  if (typeof x === 'string') return x
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    return String(o.response ?? o.text ?? JSON.stringify(o))
  }
  return String(x ?? '')
}

async function validateRelevance(item: { title: string; description: string; brand?: string; category?: string; tags?: string[] }): Promise<RelevanceResult> {
  // Cloudflare Workers AI (primary). ANTHROPIC_API_KEY is not configured project-wide,
  // and CF is the chosen provider. Native /ai/run endpoint (the /ai/v1 compat endpoint
  // hangs on JSON mode); coerce the string|object response before parsing.
  const acct = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (!acct || !cfToken) throw new Error('CF Workers AI not configured (CF_ACCOUNT_ID + CF_AI_API_TOKEN)')
  const model = Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  const userPrompt = `Product: ${item.title}\nBrand: ${item.brand || 'N/A'}\nCategory: ${item.category || 'N/A'}\nTags: ${(item.tags || []).join(', ')}\nDescription: ${(item.description || '').slice(0, 800)}\n\nReturn ONLY minified JSON: {"queer_relevant":boolean,"confidence":0-1,"reasoning":"brief","suggested_tags":["..."],"sensitivity_flags":[{"category":"legal|medical|nsfw","confidence":0-1,"severity":"low|medium|high","indicators":["terms"]}]}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45000)
  let data: unknown
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${cfToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }], max_tokens: 512 }),
    })
    if (!res.ok) throw new Error(`workers-ai ${res.status}: ${(await res.text()).slice(0, 150)}`)
    data = await res.json()
  } finally { clearTimeout(timer) }
  const text = coerceText((data as { result?: { response?: unknown } })?.result?.response ?? (data as { result?: unknown })?.result)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('non-json LLM response')
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
    // Multi-brand resellers get a stricter gate: their mainstream-wholesale
    // bulk drowns the catalog, while indie single-brand shops keep 0.5.
    const aggregatorThreshold = body.aggregator_threshold ?? 0.6
    const aggregatorSources: string[] = body.aggregator_sources ?? ['ohmyfantasy', 'misterb']
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
        const itemSource = String(n.sourceName ?? meta.source_slug ?? '')
        const effectiveThreshold = aggregatorSources.includes(itemSource) ? aggregatorThreshold : threshold
        if (r.confidence < effectiveThreshold) {
          update.disposition = 'rejected'
          update.error_message = `relevance_below_${effectiveThreshold}: ${r.reasoning.slice(0, 120)}`
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
