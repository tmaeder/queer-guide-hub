// Exercise the real handler, SDK and persistence calls with synthetic HTTP only.
let handle: (req: Request) => Promise<Response>
const savedServe = Deno.serve
Deno.serve = ((callback: unknown) => {
  handle = callback as typeof handle
  return {}
}) as unknown as typeof Deno.serve
try { await import('../country-image-health/index.ts') } finally { Deno.serve = savedServe }

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

async function harness(mode: 'oversized' | 'stream_oversized' | 'broken' | 'healthy' | 'persistence_failure', countryIds?: unknown) {
  const savedFetch = globalThis.fetch
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INTERNAL_INVOKE_SECRET']
  const previous = keys.map(key => Deno.env.get(key))
  keys.forEach((key, i) => Deno.env.set(key, ['https://health-db.example.test', 'fixture-key', 'fixture-internal-secret'][i]))
  const updates: Record<string, unknown>[] = []
  const suggestions: Record<string, unknown>[] = []
  const linkQueries: string[] = []
  let cancelled = false
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'photos.example.org') {
      if (mode === 'broken') return new Response('Missing', { status: 404, headers: { 'Content-Type': 'text/plain' } })
      const bytes = new Uint8Array(1000)
      bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
      const view = new DataView(bytes.buffer)
      view.setUint32(16, 800); view.setUint32(20, 600)
      const body = mode === 'healthy' ? bytes : new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(mode === 'stream_oversized' ? new Uint8Array(20 * 1024 * 1024 + 1) : bytes) },
        cancel() { cancelled = true },
      })
      return new Response(body, { headers: { 'Content-Type': 'image/png',
        ...(mode === 'stream_oversized' ? {} : { 'Content-Length': mode === 'healthy' ? '1000' : String(25 * 1024 * 1024) }) } })
    }
    if (url.hostname !== 'health-db.example.test') throw new Error('Unexpected external request')
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { 'Content-Type': 'application/json' },
    })
    if (url.pathname.endsWith('/image_asset_links')) {
      linkQueries.push(url.href)
      return json([{
      asset_id: '00000000-0000-4000-8000-000000000001', entity_id: '00000000-0000-4000-8000-000000000002',
      image_assets: { id: '00000000-0000-4000-8000-000000000001', url: 'https://photos.example.org/original.png', health_consecutive_failures: 3 },
      }])
    }
    if (url.pathname.endsWith('/image_assets') && init?.method === 'PATCH') {
      updates.push(JSON.parse(String(init.body)))
      return mode === 'persistence_failure' ? json({ message: 'fixture write refused' }, 500) : new Response(null, { status: 204 })
    }
    if (url.pathname.endsWith('/ai_suggestions')) {
      if (init?.method === 'POST') suggestions.push(JSON.parse(String(init.body)))
      return init?.method === 'POST' ? new Response(null, { status: 201 }) : json([])
    }
    throw new Error(`Unexpected database request ${url.pathname}`)
  }) as typeof fetch
  try {
    const response = await handle(new Request('https://health-worker.example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'fixture-internal-secret' },
      body: JSON.stringify({ batch_limit: 1, ...(countryIds === undefined ? {} : { country_ids: countryIds }) }),
    }))
    return { status: response.status, body: await response.json(), updates, suggestions, cancelled, linkQueries }
  } finally {
    globalThis.fetch = savedFetch
    keys.forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!))
  }
}

Deno.test('country image health: oversized reachable original is deferred without replacement or fabricated dimensions', async () => {
  const result = await harness('oversized')
  assert(result.status === 200 && result.body.deferred === 1 && result.body.failed === 0 && result.body.healthy === 0, 'Size limit became availability failure')
  assert(result.cancelled && result.suggestions.length === 0, 'Oversized original was downloaded or replacement proposed')
  assert(result.updates[0].health_consecutive_failures === 0 && !('width' in result.updates[0]) && !('content_hash' in result.updates[0]), 'Incomplete probe certified image data')
})
Deno.test('country image health: genuinely missing asset still produces a failure and replacement proposal', async () => {
  const result = await harness('broken')
  assert(result.status === 200 && result.body.failed === 1 && result.body.deferred === 0, 'Real failure was hidden')
  assert(result.updates[0].health_consecutive_failures === 4 && result.suggestions.length === 1, 'Failure counter or proposal lost')
})
Deno.test('country image health: fully read probe still records dimensions and content hash', async () => {
  const result = await harness('healthy')
  assert(result.body.healthy === 1 && result.body.deferred === 0 && result.suggestions.length === 0, 'Healthy probe changed')
  assert(result.updates[0].width === 800 && result.updates[0].height === 600 && typeof result.updates[0].content_hash === 'string', 'Healthy evidence missing')
})
Deno.test('country image health: oversized stream without Content-Length is bounded and deferred', async () => {
  const result = await harness('stream_oversized')
  assert(result.status === 200 && result.body.deferred === 1 && result.body.failed === 0, 'Stream limit became availability failure')
  assert(result.cancelled && result.suggestions.length === 0 && !('content_hash' in result.updates[0]), 'Stream was not cancelled or partial image certified')
})
Deno.test('country image health: deferred persistence failure is not reported as success', async () => {
  const result = await harness('persistence_failure')
  assert(result.status === 500 && result.suggestions.length === 0, 'Write failure was hidden')
})
Deno.test('country image health: explicit country recheck stays scoped to its active cover', async () => {
  const id = '00000000-0000-4000-8000-000000000002'
  const result = await harness('healthy', [id])
  const query = new URL(result.linkQueries[0]).searchParams
  assert(query.get('entity_id') === `in.(${id})` && query.get('entity_type') === 'eq.country' && query.get('role') === 'eq.cover', 'Recheck scope lost')
  assert(query.get('image_assets.status') === 'eq.active' && !query.has('image_assets.or'), 'Active scope or explicit freshness changed')
})
Deno.test('country image health: invalid country IDs fail before querying or probing', async () => {
  const result = await harness('healthy', ['not-a-uuid'])
  assert(result.status === 400 && result.linkQueries.length === 0 && result.updates.length === 0, 'Invalid recheck performed work')
})
