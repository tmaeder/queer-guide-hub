import {
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { consumeLlmBudget } from '../_shared/llm-budget.ts'

const GROUP_DEPARTMENT: Record<string, string> = {
  anal_toys: 'intimacy', dildos: 'intimacy', masturbators: 'intimacy', vibrators: 'intimacy',
  cock_rings: 'intimacy', chastity: 'intimacy', pumps: 'intimacy', lubes: 'intimacy',
  poppers: 'intimacy', safer_sex: 'intimacy', sex_toys: 'intimacy', pup_play: 'bdsm_fetish',
  bondage: 'bdsm_fetish', impact_play: 'bdsm_fetish', gags: 'bdsm_fetish',
  hoods_masks: 'bdsm_fetish', harnesses: 'bdsm_fetish', collars: 'bdsm_fetish',
  fetish_gear: 'bdsm_fetish', jockstraps: 'underwear', thongs: 'underwear',
  lingerie: 'underwear', underwear: 'underwear', swimwear: 'swimwear', socks: 'apparel',
  outerwear: 'apparel', bodywear: 'apparel', footwear: 'apparel', headwear: 'apparel',
  bottoms: 'apparel', tops: 'apparel', accessories: 'apparel', apparel: 'apparel',
  jewelry: 'jewelry', film: 'books_art', books: 'books_art', calendars: 'books_art',
  art: 'books_art', home_goods: 'home', grooming: 'hygiene', services: 'services', other: 'other',
}

const PROMPT = `Classify one marketplace product using ONLY the supplied source category, title, description and structured attributes. Return minified JSON {"group":"one allowed group","confidence":0.0}. Do not infer sensitive/adult meaning without explicit product evidence. Allowed groups: ${Object.keys(GROUP_DEPARTMENT).join(', ')}.`

function parseResult(raw: unknown): { group: string; confidence: number } {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('model returned no JSON object')
  const parsed = JSON.parse(match[0]) as { group?: unknown; confidence?: unknown }
  const group = String(parsed.group ?? '')
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)))
  if (!(group in GROUP_DEPARTMENT)) throw new Error(`unknown taxonomy group: ${group}`)
  return { group, confidence }
}

async function classify(facts: Record<string, unknown>): Promise<{ group: string; confidence: number }> {
  const account = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const token = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (!account || !token) throw new Error('Cloudflare AI credentials are not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/meta/llama-3.1-8b-instruct-fast`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: JSON.stringify(facts).slice(0, 5000) },
          ],
          max_tokens: 100,
        }),
      },
    )
    if (!response.ok) throw new Error(`workers-ai ${response.status}: ${(await response.text()).slice(0, 120)}`)
    const payload = await response.json()
    return parseResult(payload?.result?.response ?? payload?.result)
  } finally {
    clearTimeout(timeout)
  }
}

Deno.serve(async (req) => {
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(Number(body.batch_size ?? 25), 1), 50)
    const dryRun = body.dry_run === true
    const { data, error } = await supabase.rpc('marketplace_claim_taxonomy_model', { p_limit: limit, p_dry_run: dryRun })
    if (error) return errorResponse(error.message, 500, req)
    const rows = data ?? []
    const budget = dryRun
      ? { allowed: true }
      : await consumeLlmBudget(supabase, 'marketplace-taxonomy-classify', rows.length)
    if (!budget.allowed) {
      if (rows.length) {
        await supabase.from('marketplace_listings').update({ taxonomy_model_status: 'pending' }).in('id', rows.map((row) => row.id))
      }
      return jsonResponse({ success: true, items_examined: 0, items_changed: 0, items_terminal: 0, items_failed: 0, message: 'llm_budget_exhausted' }, 200, req)
    }
    let changed = 0
    let terminal = 0
    let failed = 0
    for (const row of rows) {
      try {
        const result = await classify({
          source_category: row.source_category,
          title: row.title,
          description: String(row.description ?? '').slice(0, 2500),
          attributes: row.attributes ?? {},
        })
        terminal++
        if (dryRun) continue
        const { error: updateError } = await supabase.from('marketplace_listings').update({
          subcategory_group: result.group,
          department: GROUP_DEPARTMENT[result.group],
          subcategory_fine: null,
          taxonomy_confidence: result.confidence,
          taxonomy_classifier_version: 'marketplace-taxonomy-model-v1',
          taxonomy_model_status: 'done',
          title: row.title,
        }).eq('id', row.id)
        if (updateError) throw updateError
        changed++
      } catch (error) {
        failed++
        if (!dryRun) {
          await supabase.from('marketplace_listings').update({ taxonomy_model_status: 'failed' }).eq('id', row.id)
        }
        console.error('[marketplace-taxonomy-classify]', row.id, error)
      }
    }
    return jsonResponse({
      success: failed === 0,
      items_examined: rows.length,
      items_changed: changed,
      items_terminal: terminal,
      items_failed: failed,
      dry_run: dryRun,
      classifier_version: 'marketplace-taxonomy-model-v1',
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
