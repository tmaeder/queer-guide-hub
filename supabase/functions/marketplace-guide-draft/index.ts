// marketplace-guide-draft
//
// Generates a Wirecutter-style intro_md + per-pick rationale_md + pros/cons
// for an admin-editor-in-progress guide. Editor reviews + edits + saves
// (we never auto-write — caller is responsible for applying suggestions).
//
// Requires admin auth. Uses the existing anthropicMessages shim
// (routes to Workers AI or real Anthropic per USE_ANTHROPIC).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { anthropicMessages } from '../_shared/anthropic-shim.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = new Set([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(data: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const SYSTEM_PROMPT = `You are an editorial assistant for a Wirecutter-style LGBTQ+ marketplace guide. Voice: direct, factual, never breathless. No "discover/explore/unlock/curated/journey/amazing/tailored". Write like you genuinely use the products. Honest about trade-offs.

Output ONLY minified JSON matching this exact schema:
{
  "intro_md": "string (2 short paragraphs, 80–280 chars total)",
  "picks": [
    {
      "listing_id": "uuid string from input",
      "rationale_md": "string (1–2 sentences, what makes this pick worth it)",
      "pros": ["string", ...] (2–3 concrete pros),
      "cons": ["string", ...] (1–2 honest cons)
    }
  ]
}

Never fabricate facts about a listing. If you don't know something, write something safely general about the tier or category instead.`

interface PickInput {
  listing_id: string
  tier: string
  title: string
  business_name: string | null
  price: number | null
  currency: string | null
  description: string | null
}

interface DraftResponse {
  intro_md: string
  picks: Array<{
    listing_id: string
    rationale_md: string
    pros: string[]
    cons: string[]
  }>
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Auth: require admin. has_role_jwt('admin') is the canonical check.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401, req)
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (token === SUPABASE_SERVICE_ROLE_KEY || token === Deno.env.get('SUPABASE_ANON_KEY')) {
    return json({ error: 'admin user JWT required' }, 401, req)
  }
  const { data: userData } = await supabase.auth.getUser(token)
  if (!userData?.user) return json({ error: 'invalid token' }, 401, req)
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
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
        .from('marketplace_guides')
        .select('id, title, dek, category_slug, audience_tags')
        .eq('id', guideId)
        .maybeSingle(),
      supabase
        .from('marketplace_guide_picks')
        .select(
          `tier,
           listing:marketplace_listings(id, title, business_name, price, currency, description)`,
        )
        .eq('guide_id', guideId),
    ])
    if (gerr) return json({ error: gerr.message }, 500, req)
    if (perr) return json({ error: perr.message }, 500, req)
    if (!guide) return json({ error: 'guide not found' }, 404, req)
    if (!picks || picks.length === 0) {
      return json({ error: 'add picks before generating a draft' }, 422, req)
    }

    const pickInputs: PickInput[] = (
      picks as unknown as Array<{
        tier: string
        listing: {
          id: string
          title: string
          business_name: string | null
          price: number | null
          currency: string | null
          description: string | null
        } | null
      }>
    )
      .filter((p) => !!p.listing)
      .map((p) => ({
        listing_id: p.listing!.id,
        tier: p.tier,
        title: p.listing!.title,
        business_name: p.listing!.business_name,
        price: p.listing!.price,
        currency: p.listing!.currency,
        description: (p.listing!.description ?? '').slice(0, 600),
      }))

    const userPrompt = JSON.stringify({
      guide: {
        title: guide.title,
        dek: guide.dek,
        category: guide.category_slug,
        audience_tags: guide.audience_tags,
      },
      picks: pickInputs,
    })

    const resp = await anthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      temperature: 0.5,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = resp?.content?.[0]?.text
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'no JSON in LLM response', sample: text.slice(0, 200) }, 502, req)

    let parsed: DraftResponse
    try {
      parsed = JSON.parse(match[0])
    } catch (e) {
      return json({ error: 'JSON parse failed', detail: (e as Error).message }, 502, req)
    }

    // Sanitize: only return picks whose listing_id is one we sent in.
    const validIds = new Set(pickInputs.map((p) => p.listing_id))
    parsed.picks = (parsed.picks ?? []).filter((p) => validIds.has(p.listing_id))

    return json({ draft: parsed, model: resp.model, usage: resp.usage }, 200, req)
  } catch (err) {
    return json({ error: (err as Error).message }, 500, req)
  }
})
