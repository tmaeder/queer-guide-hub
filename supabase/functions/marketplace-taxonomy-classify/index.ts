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

const SAFETY_CATEGORY_GROUPS = new Set([
  'anal_toys', 'dildos', 'masturbators', 'vibrators', 'cock_rings', 'chastity',
  'pumps', 'lubes', 'poppers', 'safer_sex', 'sex_toys', 'pup_play', 'bondage',
  'impact_play', 'gags', 'hoods_masks', 'fetish_gear',
])

const GROUP_ALIASES: Record<string, string> = {
  lubricants: 'lubes', condoms: 'safer_sex', penis_pumps: 'pumps', butt_plugs: 'anal_toys',
  bdsm: 'bondage', fetish_wear: 'fetish_gear', sex_toy: 'sex_toys', clothing: 'apparel',
  t_shirts: 'tops', shirts: 'tops', pants: 'bottoms', shorts: 'bottoms', shoes: 'footwear',
  hats: 'headwear', necklaces: 'jewelry', rings: 'jewelry', bracelets: 'jewelry',
  movies: 'film', artwork: 'art', home_decor: 'home', personal_care: 'grooming',
}

const PROMPT = `Classify one marketplace product using ONLY the supplied source category, title, description and structured attributes. Return minified JSON {"group":"one allowed group","confidence":0.0}. Do not infer sensitive/adult meaning without explicit product evidence. Allowed groups: ${Object.keys(GROUP_DEPARTMENT).join(', ')}.`

function parseResult(raw: unknown): { group: string; confidence: number } {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('model returned no JSON object')
  const parsed = JSON.parse(match[0]) as { group?: unknown; confidence?: unknown }
  const rawGroup = String(parsed.group ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const group = GROUP_ALIASES[rawGroup] ?? rawGroup
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
      return jsonResponse({
        success: true,
        items_examined: rows.length,
        items_changed: 0,
        // Budget denial is a completed outcome for this dispatch. The rows
        // return to pending and become eligible after the UTC budget window
        // rolls; reporting zero terminal work would falsely auto-pause a
        // healthy, deliberately capped worker.
        items_terminal: rows.length,
        items_failed: 0,
        message: 'llm_budget_deferred',
        daily_cap: budget.cap,
      }, 200, req)
    }
    let changed = 0
    let terminal = 0
    let failed = 0
    const errors: string[] = []
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
        const useSafetyCategory = SAFETY_CATEGORY_GROUPS.has(result.group)
        const previousContentRating = useSafetyCategory
          ? (await supabase.from('marketplace_listings').select('content_rating').eq('id', row.id).single()).data?.content_rating
          : null
        const { data: updated, error: updateError } = await supabase.from('marketplace_listings').update({
          subcategory_group: result.group,
          department: GROUP_DEPARTMENT[result.group],
          subcategory_fine: null,
          taxonomy_confidence: result.confidence,
          taxonomy_classifier_version: 'marketplace-taxonomy-model-v1',
          taxonomy_model_status: 'done',
          title: row.title,
          ...(useSafetyCategory
            ? {
              subcategory: result.group,
              attributes: {
                ...(row.attributes ?? {}),
                _quality_original_subcategory: row.source_category,
                _quality_safety_normalized_at: new Date().toISOString(),
                _quality_safety_version: 'marketplace-content-rating-v4',
              },
            }
            : {}),
        }).eq('id', row.id).select('content_rating').single()
        if (updateError) throw updateError
        if (useSafetyCategory && previousContentRating !== updated?.content_rating) {
          await supabase.from('marketplace_quality_events').insert({
            listing_id: row.id,
            dimension: 'safety',
            previous_value: previousContentRating,
            new_value: updated?.content_rating,
            classifier_version: 'marketplace-content-rating-v4',
            confidence: result.confidence,
          })
        }
        if (updated?.content_rating === 'adult' || updated?.content_rating === 'explicit') {
          await supabase.from('search_documents').delete()
            .eq('entity_type', 'marketplace').eq('entity_id', row.id)
        }
        changed++
      } catch (error) {
        failed++
        if (errors.length < 3) errors.push((error as Error).message.slice(0, 240))
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
      errors,
      dry_run: dryRun,
      classifier_version: 'marketplace-taxonomy-model-v1',
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
