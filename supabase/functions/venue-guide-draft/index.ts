// venue-guide-draft — admin-only Wirecutter draft generator for venue guides.
// Mirror of marketplace-guide-draft adapted for venues.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

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

const SYSTEM_PROMPT = `You are an editorial assistant for a Wirecutter-style LGBTQ+ venue guide (bars, clubs, saunas, restaurants, etc.). Voice: direct, factual, never breathless. No "discover/explore/unlock/curated/journey/amazing/tailored/vibrant". Write like a local who knows the door policies, the crowds, the music, and isn't selling anything. Honest about trade-offs.

Output ONLY minified JSON matching this exact schema:
{
  "intro_md": "string (2 short paragraphs, 80-280 chars total)",
  "picks": [
    {
      "venue_id": "uuid string from input",
      "rationale_md": "string (1-2 sentences, what makes this pick worth visiting)",
      "pros": ["string", "..."],
      "cons": ["string", "..."]
    }
  ]
}

Never fabricate facts about a venue. If you don't know something, write something safely general about the tier, category, or city scene instead.`

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
      max_tokens: 2000,
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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
        .from('venue_guides')
        .select('id, title, dek, category, audience_tags, city_id')
        .eq('id', guideId)
        .maybeSingle(),
      supabase
        .from('venue_guide_picks')
        .select(`tier, venue:venues(id, name, category, city, address, description)`)
        .eq('guide_id', guideId),
    ])
    if (gerr) return json({ error: gerr.message }, 500, req)
    if (perr) return json({ error: perr.message }, 500, req)
    if (!guide) return json({ error: 'guide not found' }, 404, req)
    if (!picks || picks.length === 0) {
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

    const pickInputs = (
      picks as Array<{
        tier: string
        venue: {
          id: string
          name: string
          category: string | null
          city: string | null
          address: string | null
          description: string | null
        } | null
      }>
    )
      .filter((p) => !!p.venue)
      .map((p) => ({
        venue_id: p.venue!.id,
        tier: p.tier,
        name: p.venue!.name,
        category: p.venue!.category,
        city: p.venue!.city,
        address: p.venue!.address,
        description: (p.venue!.description ?? '').slice(0, 600),
      }))

    const userPrompt = JSON.stringify({
      guide: {
        title: guide.title,
        dek: guide.dek,
        category: guide.category,
        audience_tags: guide.audience_tags,
        city: cityName,
      },
      picks: pickInputs,
    })

    const resp = await callClaude(userPrompt)
    const raw = resp?.content?.[0]?.text
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'no JSON in LLM response', sample: text.slice(0, 200) }, 502, req)

    let parsed: { intro_md?: string; picks?: Array<{ venue_id?: string }> }
    try {
      parsed = JSON.parse(match[0])
    } catch (e) {
      return json({ error: 'JSON parse failed', detail: (e as Error).message }, 502, req)
    }
    const validIds = new Set(pickInputs.map((p) => p.venue_id))
    parsed.picks = (parsed.picks ?? []).filter(
      (p) => p.venue_id && validIds.has(p.venue_id),
    )
    return json({ draft: parsed, model: resp.model, usage: resp.usage }, 200, req)
  } catch (err) {
    return json({ error: (err as Error).message }, 500, req)
  }
})
