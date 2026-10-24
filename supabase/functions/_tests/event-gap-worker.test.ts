import { serveEventGaps } from '../_shared/event-gap-worker.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const description = 'An attributable evening of queer art and live performances, followed by a discussion with the artists and community members.'
const event = { id: '00000000-0000-0000-0000-000000000001', title: 'Queer Arts Night', website: 'https://arts.example.org/show' }

async function harness(
  body: unknown,
  options: { fullDescription?: boolean; failFinish?: boolean; budgetAvailable?: boolean; rawDescription?: boolean; capturedHtml?: boolean; imageGallery?: boolean; imagePage?: string } = {},
) {
  const savedFetch = globalThis.fetch
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'EVENT_QUALITY_WEBHOOK_SECRET']
  const previous = keys.map(k => Deno.env.get(k))
  Deno.env.set(keys[0], 'https://gap-db.example.test')
  Deno.env.set(keys[1], 'fixture-key')
  Deno.env.set(keys[2], 'fixture-secret')
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const payload = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ path: url.pathname, body: payload })
    if (url.hostname === 'arts.example.org' && options.imagePage !== undefined) return Promise.resolve(new Response(options.imagePage, { headers: { 'Content-Type': 'text/html' } }))
    if ((url.hostname === 'data.agendaq.fr' && options.imageGallery) || (url.hostname === 'posters.example.org' && options.imagePage !== undefined)) {
      const bytes = new Uint8Array(40000).fill(127)
      bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
      bytes.set([73, 72, 68, 82], 12)
      const view = new DataView(bytes.buffer)
      view.setUint32(16, 800); view.setUint32(20, 600)
      return Promise.resolve(new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.length) } }))
    }
    let data: unknown
    if (url.pathname.endsWith('/claim_event_gaps')) data = [{
      event_id: event.id,
      event: { ...event, description: options.fullDescription ? description : '',
        ...(options.imagePage !== undefined ? { start_date: '2026-11-03T19:00:00Z', images: [] } : {}),
        ...(options.capturedHtml ? { external_id: 'arts', start_date: '2026-11-03T19:00:00Z' } : {}),
        ...(options.imageGallery ? { images: ['https://data.agendaq.fr/assets/events/arts/tiny.png', 'https://data.agendaq.fr/assets/events/arts/poster.png'] } : {}) },
      sources: options.imageGallery ? [{ source_slug: 'agendaq', source_url: 'https://www.agendaq.fr/fr/agenda/arts', raw: {
        assets: [['poster', '/assets/events/arts/poster.png', 'image/png', 800, 600]],
      } }] : options.capturedHtml ? [{ source_slug: 'agendaq', source_url: 'https://www.agendaq.fr/fr/agenda/arts', raw: {
        description: `<p>${description}</p>`, full_description: `<p>${description}</p>`, name: event.title,
        slug: 'arts', start: '2026-11-03T19:00:00Z', source_id: 'source-fixture', payload_hash: 'a'.repeat(64),
      } }] : [{ source_url: event.website, raw: options.rawDescription === false ? {} : { description } }],
    }]
    else if (url.pathname.endsWith('/llm_budget_consume')) data = {
      allowed: options.budgetAvailable ?? true, cap: 60,
      remaining: options.budgetAvailable === false ? 0 : 60,
    }
    else if (url.pathname.endsWith('/finish_event_gap')) {
      if (options.failFinish) return Promise.resolve(new Response(JSON.stringify({ message: 'fixture write rejected' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
      const fields = Object.keys((payload.p_patch ?? {}) as object)
      data = { outcome: fields.length ? 'updated' : payload.p_outcome, fields }
    } else throw new Error(`Unexpected external request: ${url.href}`)
    return Promise.resolve(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }))
  }) as typeof fetch
  try {
    const response = await serveEventGaps(options.imageGallery || options.imagePage !== undefined ? 'image' : 'content')(new Request('https://worker.example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'fixture-secret' }, body: JSON.stringify(body),
    }))
    return { status: response.status, body: await response.json(), calls }
  } finally {
    globalThis.fetch = savedFetch
    keys.forEach((k, i) => previous[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, previous[i]!))
  }
}

Deno.test('event gaps: dry-run claims no lease, makes no page requests or budget writes', async () => {
  const result = await harness({ dry_run: true })
  assert(result.status === 200 && result.body.dry_run, 'dry-run failed')
  assert(result.calls.length === 1, 'dry-run made additional calls')
  assert(result.calls[0].body.p_dry_run === true, 'dry-run acquired a lease')
})

Deno.test('event gaps: raw evidence fills a description without a page or model request', async () => {
  const result = await harness({ batch_limit: 1 })
  assert(result.status === 200 && result.body.fields_filled === 1, 'grounded fill was not counted')
  assert(result.body.network_requests === 0 && result.body.ai_attempts === 0, 'raw evidence incurred external work')
  const finish = result.calls.find(c => c.path.endsWith('/finish_event_gap'))!
  assert((finish.body.p_evidence as Record<string, unknown>).source_url === event.website, 'provenance missing')
})

Deno.test('event gaps: a persistence error never reports a successful fill', async () => {
  const result = await harness({}, { failFinish: true })
  assert(result.status === 500, 'write failure reported HTTP success')
  assert(result.body.fields_filled === 0 && result.body.failed === 1, 'write failure counted as a fill')
})

Deno.test('event gaps: exhausted optional-field budget avoids external requests', async () => {
  const result = await harness({}, { fullDescription: true, rawDescription: false, budgetAvailable: false })
  assert(result.status === 200, 'budget cooldown is not a worker failure')
  assert(result.body.results[0].outcome === 'capped', 'budget exhaustion was not recorded')
  assert(result.body.network_requests === 0 && result.body.ai_attempts === 0, 'empty budget wasted external calls')
})

Deno.test('event gaps: invalid request body is rejected before work is claimed', async () => {
  const result = await harness([])
  assert(result.status === 400 && result.calls.length === 0, 'invalid body claimed work')
})

Deno.test('event gaps: captured HTML enriches without page requests or inference at zero model budget', async () => {
  const result = await harness({ batch_size: 1 }, { capturedHtml: true, budgetAvailable: false })
  assert(result.status === 200, 'captured copy failed')
  const finish = result.calls.find(c => c.path.endsWith('/finish_event_gap'))
  assert(finish !== undefined, 'missing native finish')
  assert((finish.body.p_patch as Record<string, unknown>).description === description, 'original copy not preserved')
  const details = finish.body.p_details as Record<string, unknown>
  assert(details.method === 'captured_source_html' && details.source_payload_hash === 'a'.repeat(64), 'missing source proof')
  assert(details.network_requests === 0 && details.ai_attempts === 0, 'unexpected source fetch or inference')
})

Deno.test('event gaps: a valid captured gallery poster is promoted past a poor primary image', async () => {
  const result = await harness({ batch_size: 1 }, { imageGallery: true, budgetAvailable: false })
  assert(result.status === 200 && result.body.fields_filled === 1, 'gallery artwork was not promoted')
  const finish = result.calls.find(c => c.path.endsWith('/finish_event_gap'))!
  const images = (finish.body.p_patch as Record<string, unknown>).images as string[]
  assert(images[0] === 'https://data.agendaq.fr/assets/events/arts/poster.png', 'wrong primary artwork')
  assert((finish.body.p_evidence as Record<string, unknown>).previous_images instanceof Array, 'missing compare-and-swap snapshot')
  assert(result.body.network_requests === 1 && result.body.ai_attempts === 0, 'promotion made unnecessary page or model requests')
})

Deno.test('event gaps: an unrelated social-preview image is never probed or promoted', async () => {
  const result = await harness({}, { imagePage: '<meta property="og:image" content="https://posters.example.org/unrelated-city-cover.png">' })
  assert(result.status === 200 && result.body.fields_filled === 0, 'Unverified page preview changed event artwork')
  assert(result.body.network_requests === 1 && result.body.ai_attempts === 0, 'Unverified preview triggered image requests or inference')
  const finish = result.calls.find(c => c.path.endsWith('/finish_event_gap'))!
  assert(Object.keys(finish.body.p_patch as object).length === 0, 'Preview became a canonical patch')
})

Deno.test('event gaps: a named and dated Event image retains full native promotion', async () => {
  const page = '<script type="application/ld+json">' + JSON.stringify({ '@type': 'Event', name: event.title, startDate: '2026-11-03T19:00:00Z', image: 'https://posters.example.org/actual-poster.png' }) + '</script><meta property="og:image" content="https://posters.example.org/irrelevant-logo.png">'
  const result = await harness({}, { imagePage: page })
  assert(result.status === 200 && result.body.fields_filled === 1, 'Grounded poster was not promoted')
  const finish = result.calls.find(c => c.path.endsWith('/finish_event_gap'))!
  const images = (finish.body.p_patch as Record<string, unknown>).images as string[]
  assert(images.length === 1 && images[0] === 'https://posters.example.org/actual-poster.png', 'Incorrect artwork selected')
  assert(result.body.network_requests === 2 && result.body.ai_attempts === 0, 'Grounded poster incurred unexpected requests')
})
