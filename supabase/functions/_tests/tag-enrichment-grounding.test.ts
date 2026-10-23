import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('tag enrichment preserves curated prose and skips unsourced definitions without inference or proposals', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INTERNAL_INVOKE_SECRET']
  const previous = keys.map(key => Deno.env.get(key))
  const savedFetch = globalThis.fetch
  const savedServe = Deno.serve
  let handler: ((req: Request) => Promise<Response>) | undefined
  let phase = 'prose'
  const calls: Array<{ method: string; path: string }> = []
  const id = '00000000-0000-0000-0000-000000000001'
  keys.forEach((key, i) => Deno.env.set(key, ['https://tag-db.example.test', 'fixture-key', 'fixture-secret'][i]))
  Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (callback: typeof handler) => { handler = callback } })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    calls.push({ method, path: url.pathname })
    let data: unknown
    if (url.hostname === 'en.wikipedia.org') return new Response(null, { status: 404 })
    if (method === 'GET' && url.pathname.endsWith('/unified_tags')) {
      data = url.searchParams.has('category_id') ? [] : [{ id, name: 'Source fixture', category: 'General',
        description: phase === 'prose' ? 'A definition reviewed by an editor.' : null,
        human_reviewed: phase === 'prose', wikidata_id: null, wikipedia_url: null }]
    } else if (method === 'POST' && url.pathname.endsWith('/rpc/tags_due_for_category')) {
      data = []
    } else if (method === 'POST' && url.pathname.endsWith('/rpc/tag_enrichment_apply')) {
      assertEquals(JSON.parse(String(init?.body)).p_kind, 'prose_cursor')
      data = true
    } else throw new Error(`Unexpected request: ${method} ${url.href}`)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    await import('../tag-enrichment-sweep/index.ts')
    if (!handler) throw new Error('Handler not registered')
    const request = (mode: string) => new Request('https://worker.example.test', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'fixture-secret' }, body: JSON.stringify({ mode, batch_limit: 1 }) })
    const preserved = await handler(request('prose'))
    assertEquals(preserved.status, 200)
    const prose = await preserved.json()
    assertEquals(prose.prose_preserved, 1)
    assertEquals(prose.prose_queued_rewrite, 0)
    phase = 'fill'
    const skipped = await handler(request('fill'))
    assertEquals(skipped.status, 200)
    const fill = await skipped.json()
    assertEquals(fill.ungrounded_skipped, 1)
    assertEquals(fill.desc_queued, 0)
    assertEquals(fill.desc_applied, 0)
    assertEquals(calls.filter(c => c.method !== 'GET'), [
      { method: 'POST', path: '/rest/v1/rpc/tag_enrichment_apply' },
      { method: 'POST', path: '/rest/v1/rpc/tags_due_for_category' },
    ])
  } finally {
    globalThis.fetch = savedFetch
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: savedServe })
    keys.forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!))
  }
})
