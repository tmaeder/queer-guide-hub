import assert from 'node:assert/strict'

Deno.test('stock imagery rejects event requests before selection/search/storage and preserves supported modes', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'IMAGE_QUALITY_WEBHOOK_SECRET']
  const previous = new Map(names.map(name => [name, Deno.env.get(name)]))
  const secret = 'fixture-event-stock-guard-secret-20261024'
  Deno.env.set('SUPABASE_URL', 'https://fixture.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
  Deno.env.set('IMAGE_QUALITY_WEBHOOK_SECRET', secret)
  const originalServe = Deno.serve
  const originalFetch = globalThis.fetch
  let handler: ((req: Request) => Promise<Response>) | undefined
  const calls: Array<Record<string, unknown>> = []
  try {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (candidate: unknown) => {
      assert.equal(typeof candidate, 'function')
      handler = candidate as (req: Request) => Promise<Response>
      return {}
    } })
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      assert.equal(request.url, 'https://fixture.supabase.co/rest/v1/rpc/entities_due_for_queer_image', 'Unexpected external request or write')
      calls.push(await request.json())
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    await import('../queer-imagery-backfill/index.ts')
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: originalServe })
    assert.ok(handler)
    const request = (body: unknown, token: string | null = secret) => new Request('https://fixture.invalid/queer-imagery-backfill', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Webhook-Secret': token } : {}) }, body: JSON.stringify(body),
    })
    for (const body of [{ entity_type: 'event' }, { entityType: 'event' }, { entity_type: 'event', dry_run: true }, { entity_type: 'event', event_ids: ['00000000-0000-0000-0000-000000000001'] }]) {
      const response = await handler(request(body))
      assert.equal(response.status, 409)
      assert.match((await response.json()).error, /event-image-backfill/)
      assert.equal(calls.length, 0, 'Event stock request reached selection or an image provider')
    }
    for (const token of [null, 'wrong-secret']) {
      const response = await handler(request({ entity_type: 'event' }, token))
      assert.ok([401, 403].includes(response.status), 'Event guard bypassed authentication')
      assert.equal(calls.length, 0)
    }
    for (const entity_type of ['city', 'country', 'milestone']) {
      const response = await handler(request({ entity_type, dry_run: true }))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).processed, 0)
    }
    assert.deepEqual(calls.map(body => body.p_entity_type), ['city', 'country', 'milestone'])

    // The other legacy stock endpoint must reject event batches too, including
    // force-update requests authenticated through its unchanged admin gate.
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (candidate: unknown) => {
      assert.equal(typeof candidate, 'function')
      handler = candidate as (req: Request) => Promise<Response>
      return {}
    } })
    await import('../fetch-images/index.ts')
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: originalServe })
    for (const body of [{ entity_type: 'event', batchMode: true }, { entity_type: 'event', forceUpdate: true, dry_run: true }]) {
      const response = await handler(new Request('https://fixture.invalid/fetch-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-service-key' }, body: JSON.stringify(body),
      }))
      assert.equal(response.status, 409)
      assert.match((await response.json()).error, /event-image-backfill/)
      assert.equal(calls.length, 3, 'Retired event stock batch selected or changed data')
    }
    const anonymous = await handler(new Request('https://fixture.invalid/fetch-images', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'event' }),
    }))
    assert.equal(anonymous.status, 401)
    assert.equal(calls.length, 3)

  } finally {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: originalServe })
    globalThis.fetch = originalFetch
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
