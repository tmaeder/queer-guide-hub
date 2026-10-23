import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('internal suggestion rejection preserves system audit ownership and never writes tag content', async () => {
  const env = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INTERNAL_INVOKE_SECRET']
  const previous = env.map(key => Deno.env.get(key))
  const savedFetch = globalThis.fetch
  const savedServe = Deno.serve
  let handler: ((req: Request) => Promise<Response>) | undefined
  const writes: Array<{ path: string; body: Record<string, unknown> }> = []
  let stale = false
  const id = '00000000-0000-0000-0000-000000000001'
  const before = { id, entity_type: 'unified_tags', suggestion_type: 'description', status: 'pending', proposed_value: { field: 'description', value: 'Unsupported model claim' } }
  Deno.env.set(env[0], 'https://fixture-db.example.test')
  Deno.env.set(env[1], 'fixture-service-key')
  Deno.env.set(env[2], 'fixture-internal-secret')
  Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (callback: typeof handler) => { handler = callback } })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    if (method === 'PATCH' && url.pathname.endsWith('/ai_suggestions')) {
      if (stale) {
        assertEquals(url.searchParams.get('status'), 'eq.pending')
        assertEquals(url.searchParams.get('updated_at'), 'eq.2026-10-22T00:00:00Z')
        return new Response(JSON.stringify({ code: 'PGRST116', message: 'No matching revision' }), { status: 406, headers: { 'Content-Type': 'application/json' } })
      }
      const body = JSON.parse(String(init?.body))
      writes.push({ path: url.pathname, body })
      return new Response(JSON.stringify({ ...before, ...body }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (method === 'POST' && url.pathname.endsWith('/search_audit_log')) {
      writes.push({ path: url.pathname, body: JSON.parse(String(init?.body)) })
      return new Response(null, { status: 201 })
    }
    if (method === 'GET' && url.pathname.endsWith('/ai_suggestions')) {
      return new Response(JSON.stringify(before), { headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`)
  }) as typeof fetch
  try {
    await import('../search-intelligence/index.ts')
    if (!handler) throw new Error('Handler not registered')
    const result = await handler(new Request(`https://fixture.test/functions/v1/search-intelligence/suggestions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'fixture-internal-secret' },
      body: JSON.stringify({ status: 'rejected', review_notes: 'Rejected ungrounded automatic proposal; original tag preserved.' }),
    }))
    assertEquals(result.status, 200)
    assertEquals((await result.json()).success, true)
    assertEquals(writes.length, 2)
    assertEquals(writes[0].body.status, 'rejected')
    assertEquals(writes[0].body.reviewer_id, null)
    assertEquals(writes[1].body.actor_id, null)
    assertEquals(writes[1].body.action, 'suggestion.update')
    stale = true
    const changed = await handler(new Request(`https://fixture.test/functions/v1/search-intelligence/suggestions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'fixture-internal-secret' },
      body: JSON.stringify({ status: 'rejected', expected_status: 'pending', expected_updated_at: '2026-10-22T00:00:00Z' }),
    }))
    assertEquals(changed.status, 409)
    assertEquals(writes.length, 2)
  } finally {
    globalThis.fetch = savedFetch
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: savedServe })
    env.forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!))
  }
})
