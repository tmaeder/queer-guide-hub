// One-off backfill classifier: scores LGBTQ+ relevance (0..1) for existing entities
// that were never classified. Self-contained (inline Supabase + native CF /ai/run to
// dodge the /ai/v1 json-hang). Resumable via classified_at. Personalities intentionally
// EXCLUDED (auto-labeling real people's LGBTQ+ status = outing risk).
import { getServiceClient, getCorsHeaders, corsResponse } from '../_shared/supabase-client.ts'

const json = (b: unknown, s = 200, req?: Request) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } })

type Row = Record<string, unknown>
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : '')
const CFG: Record<string, { table: string; cols: string; text: (r: Row) => string }> = {
  venue: { table: 'venues', cols: 'id,name,category,venue_subtype,city,country,description,tags,amenities,target_groups',
    text: (r) => `Venue "${r.name ?? ''}" — type: ${r.category ?? ''} ${r.venue_subtype ?? ''}; location: ${r.city ?? ''} ${r.country ?? ''}; tags: ${arr(r.tags)}; target groups: ${arr(r.target_groups)}; amenities: ${arr(r.amenities)}. ${String(r.description ?? '').slice(0, 400)}` },
  event: { table: 'events', cols: 'id,title,event_type,city,country,description,target_groups',
    text: (r) => `Event "${r.title ?? ''}" — ${r.event_type ?? ''}, ${r.city ?? ''} ${r.country ?? ''}; target groups: ${arr(r.target_groups)}. ${String(r.description ?? '').slice(0, 400)}` },
  marketplace: { table: 'marketplace_listings', cols: 'id,title,category,brand,description',
    text: (r) => `Product "${r.title ?? ''}" — ${r.category ?? ''} ${r.brand ?? ''}. ${String(r.description ?? '').slice(0, 400)}` },
  news: { table: 'news_articles', cols: 'id,title,excerpt,content,tags',
    text: (r) => `Article headline: "${r.title ?? ''}"; tags: ${arr(r.tags)}. ${String(r.excerpt ?? r.content ?? '').slice(0, 500)}` },
}

const SYS = `You rate how relevant an item is to LGBTQ+ travelers and community, from 0.00 to 1.00.
1.0 = explicitly LGBTQ+ (gay/queer bar, sauna, pride event, LGBTQ+ org, trans health, queer bookstore).
0.6-0.8 = strongly LGBTQ+-welcoming or adjacent (signals in tags/target-groups/description).
0.3-0.5 = general / mainstream venue or topic.
0.0-0.2 = clearly unrelated to LGBTQ+.
CRITICAL: if the input is only a bare name with no description, tags, or other signal, you CANNOT judge — reply exactly UNKNOWN. Do NOT guess a low score just because information is missing.
Reply with ONLY a number 0.00-1.00, or the word UNKNOWN. Nothing else.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  try {
    const { entity_type, batch_size = 25 } = await req.json().catch(() => ({}))
    const cfg = CFG[entity_type as string]
    if (!cfg) return json({ error: 'bad entity_type (venue|event|marketplace|news)' }, 400)

    const sb = getServiceClient()
    const { data: rows, error } = await sb.from(cfg.table).select(cfg.cols).is('classified_at', null).limit(batch_size)
    if (error) return json({ error: error.message }, 500)
    if (!rows?.length) return json({ done: true, processed: 0, ok: 0, failed: 0 })

    const acct = Deno.env.get('CF_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
    const tok = Deno.env.get('CF_AI_API_TOKEN') ?? Deno.env.get('CLOUDFLARE_API_TOKEN')
    // Relevance scoring is a classification task → cheap 8B (cost control, IN-72568830).
    const model = Deno.env.get('CF_AI_MODEL') ?? '@cf/meta/llama-3.1-8b-instruct'
    if (!acct || !tok) return json({ error: 'CF AI not configured in edge env' }, 500)
    const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`

    const classify = async (r: Row): Promise<{ id: unknown; score: number | null; retry: boolean }> => {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 20000)
      try {
        const resp = await fetch(url, {
          method: 'POST', signal: ac.signal,
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'system', content: SYS }, { role: 'user', content: cfg.text(r) }], max_tokens: 8, temperature: 0 }),
        })
        if (resp.status === 429 || resp.status >= 500) return { id: r.id, score: null, retry: true }
        const j = await resp.json().catch(() => ({}))
        const txt = j?.result?.response ?? ''
        const m = String(txt).match(/\d*\.?\d+/)
        const score = m ? Math.max(0, Math.min(1, parseFloat(m[0]))) : null
        return { id: r.id, score, retry: false }
      } catch { return { id: r.id, score: null, retry: true } } finally { clearTimeout(t) }
    }

    const results = await Promise.all((rows as Row[]).map(classify))
    let ok = 0, failed = 0, retry = 0
    await Promise.all(results.map(async (res) => {
      if (res.retry) { retry++; return } // leave classified_at null → retried next pass
      const patch: Record<string, unknown> = { classified_at: new Date().toISOString() }
      if (res.score !== null) { patch.lgbti_relevance_score = res.score; ok++ } else { failed++ }
      await sb.from(cfg.table).update(patch).eq('id', res.id)
    }))
    return json({ processed: ok + failed, ok, failed, retry, batch: rows.length })
  } catch (e) {
    console.error('classify-relevance-backfill error', e)
    return json({ error: 'internal error' }, 500)
  }
})
