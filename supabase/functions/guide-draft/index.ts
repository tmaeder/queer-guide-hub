// guide-draft — admin-only Wirecutter draft generator for the unified guides
// family (replaces marketplace-guide-draft + venue-guide-draft, and extends
// drafting to event guides, lists, and quest briefs).
//
// Unlike its predecessors it APPLIES the draft (guide is still in draft/review
// status and the editor reviews in the admin panel before publishing): fills
// intro_md when empty and rationale/pros/cons on picks that lack them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders as corsHeaders, jsonResponse as json, getServiceClient } from '../_shared/supabase-client.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT = `You are an editorial assistant for a Wirecutter-style LGBTQ+ guide (venues, events, products, destinations). Voice: direct, factual, never breathless. No "discover/explore/unlock/curated/journey/amazing/tailored/vibrant". Write like a local who knows the scene and isn't selling anything. Honest about trade-offs.

Output ONLY minified JSON matching this exact schema:
{
  "intro_md": "string (2 short paragraphs, 80-280 chars total)",
  "picks": [
    {
      "entity_id": "uuid string from input",
      "rationale_md": "string (1-2 sentences, what makes this pick worth it)",
      "pros": ["string", "..."],
      "cons": ["string", "..."]
    }
  ]
}

Never fabricate facts about an entity. If you don't know something, write something safely general about the tier, category, or city scene instead.`

// Per-entity-type hydration (search_documents vocab).
const ENTITY_SOURCES: Record<string, { table: string; select: string; toCtx: (r: Record<string, unknown>) => Record<string, unknown> }> = {
  venue: {
    table: 'venues',
    select: 'id, name, category, city, address, description',
    toCtx: (r) => ({ name: r.name, category: r.category, city: r.city, address: r.address, description: String(r.description ?? '').slice(0, 600) }),
  },
  event: {
    table: 'events',
    select: 'id, title, event_type, location, start_date, end_date, description',
    toCtx: (r) => ({ name: r.title, event_type: r.event_type, location: r.location, start_date: r.start_date, end_date: r.end_date, description: String(r.description ?? '').slice(0, 600) }),
  },
  marketplace: {
    table: 'marketplace_listings',
    select: 'id, title, business_name, category, price, currency, description',
    toCtx: (r) => ({ name: r.title, business: r.business_name, category: r.category, price: r.price, currency: r.currency, description: String(r.description ?? '').slice(0, 600) }),
  },
  city: {
    table: 'cities',
    select: 'id, name, region, editorial_hook, description',
    toCtx: (r) => ({ name: r.name, region: r.region, hook: r.editorial_hook, description: String(r.description ?? '').slice(0, 600) }),
  },
  country: {
    table: 'countries',
    select: 'id, name, editorial_hook, description',
    toCtx: (r) => ({ name: r.name, hook: r.editorial_hook, description: String(r.description ?? '').slice(0, 600) }),
  },
  queer_village: {
    table: 'queer_villages',
    select: 'id, name, city_name, description',
    toCtx: (r) => ({ name: r.name, city: r.city_name, description: String(r.description ?? '').slice(0, 600) }),
  },
}

async function callClaude(userPrompt: string) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      temperature: 0.5,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
  return await resp.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const supabase = getServiceClient()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401, req)
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (token === SUPABASE_SERVICE_ROLE_KEY || token === SUPABASE_ANON_KEY) {
    return json({ error: 'admin user JWT required' }, 401, req)
  }
  const { data: userData } = await supabase.auth.getUser(token)
  if (!userData?.user) return json({ error: 'invalid token' }, 401, req)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: isAdmin } = await userClient.rpc('has_role_jwt', { required_role: 'admin' })
  if (!isAdmin) return json({ error: 'admin role required' }, 403, req)

  try {
    const body = (await req.json().catch(() => ({}))) as { guide_id?: string }
    const guideId = body.guide_id
    if (!guideId) return json({ error: 'guide_id required' }, 400, req)

    const [{ data: guide, error: gerr }, { data: picks, error: perr }] = await Promise.all([
      supabase
        .from('guides')
        .select('id, format, title, dek, intro_md, category, audience_tags, city_id, criteria')
        .eq('id', guideId)
        .maybeSingle(),
      supabase
        .from('guide_picks')
        .select('id, entity_type, entity_id, tier, rationale_md, pros, cons')
        .eq('guide_id', guideId)
        .eq('is_orphaned', false),
    ])
    if (gerr) return json({ error: gerr.message }, 500, req)
    if (perr) return json({ error: perr.message }, 500, req)
    if (!guide) return json({ error: 'guide not found' }, 404, req)
    if (guide.format !== 'quest' && (!picks || picks.length === 0)) {
      return json({ error: 'add picks before generating a draft' }, 422, req)
    }

    let cityName: string | null = null
    if (guide.city_id) {
      const { data: city } = await supabase
        .from('cities')
        .select('name')
        .eq('id', guide.city_id)
        .maybeSingle()
      cityName = city?.name ?? null
    }

    // Hydrate pick contexts per entity type.
    const pickRows = (picks ?? []) as Array<{
      id: string
      entity_type: string
      entity_id: string
      tier: string | null
      rationale_md: string | null
      pros: string[]
      cons: string[]
    }>
    const ctxById = new Map<string, Record<string, unknown>>()
    const types = [...new Set(pickRows.map((p) => p.entity_type))]
    for (const t of types) {
      const src = ENTITY_SOURCES[t]
      if (!src) continue
      const ids = pickRows.filter((p) => p.entity_type === t).map((p) => p.entity_id)
      const { data: rows } = await supabase.from(src.table).select(src.select).in('id', ids)
      for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
        ctxById.set(`${t}:${r.id}`, src.toCtx(r))
      }
    }

    const pickInputs = pickRows
      .map((p) => {
        const ctx = ctxById.get(`${p.entity_type}:${p.entity_id}`)
        if (!ctx) return null
        return { entity_id: p.entity_id, entity_type: p.entity_type, tier: p.tier, ...ctx }
      })
      .filter(Boolean)

    const userPrompt = JSON.stringify({
      guide: {
        format: guide.format,
        title: guide.title,
        dek: guide.dek,
        category: guide.category,
        audience_tags: guide.audience_tags,
        city: cityName,
        criteria: guide.format === 'quest' ? guide.criteria : undefined,
      },
      picks: pickInputs,
    })

    const resp = await callClaude(userPrompt)
    const raw = resp?.content?.[0]?.text
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'no JSON in LLM response', sample: text.slice(0, 200) }, 502, req)

    let parsed: {
      intro_md?: string
      picks?: Array<{ entity_id?: string; rationale_md?: string; pros?: string[]; cons?: string[] }>
    }
    try {
      parsed = JSON.parse(match[0])
    } catch (e) {
      return json({ error: 'JSON parse failed', detail: (e as Error).message }, 502, req)
    }

    // Apply: intro only when empty; pick fields only where missing.
    let drafted = 0
    if (parsed.intro_md && !guide.intro_md) {
      await supabase.from('guides').update({ intro_md: parsed.intro_md }).eq('id', guideId)
    }
    const byEntity = new Map(pickRows.map((p) => [`${p.entity_id}`, p]))
    for (const dp of parsed.picks ?? []) {
      if (!dp.entity_id) continue
      const row = byEntity.get(dp.entity_id)
      if (!row) continue
      const patch: Record<string, unknown> = {}
      if (dp.rationale_md && !row.rationale_md) patch.rationale_md = dp.rationale_md
      if (dp.pros?.length && !row.pros?.length) patch.pros = dp.pros
      if (dp.cons?.length && !row.cons?.length) patch.cons = dp.cons
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('guide_picks').update(patch).eq('id', row.id)
        if (!error) drafted++
      }
    }

    return json({ drafted, intro_filled: !!(parsed.intro_md && !guide.intro_md), model: resp.model, usage: resp.usage }, 200, req)
  } catch (err) {
    return json({ error: (err as Error).message }, 500, req)
  }
})
