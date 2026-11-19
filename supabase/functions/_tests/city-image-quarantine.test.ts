import assert from 'node:assert/strict'

Deno.test('city image handler preserves quarantine before search/write and excludes held rows from automatic batches', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PEXELS_API_KEY']
  const previous = new Map(names.map(name => [name, Deno.env.get(name)]))
  Deno.env.set('SUPABASE_URL', 'https://fixture.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-city-image-service-key')
  Deno.env.set('PEXELS_API_KEY', 'fixture-no-external-requests')
  const originalServe = Deno.serve
  const originalFetch = globalThis.fetch
  let handler: ((req: Request) => Promise<Response>) | undefined
  let existing = { image_url: 'https://images.test/munich.jpg', image_flagged: true, curated_image_url: null as string | null,
    name: 'Cleves', latitude: 51.789, longitude: 6.138, countries: { name: 'Germany' } }
  const calls: URL[] = []
  const unexpected: string[] = []
  try {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (candidate: unknown) => {
      handler = candidate as (req: Request) => Promise<Response>
      return {}
    } })
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method !== 'GET' || url.origin !== 'https://fixture.supabase.co') unexpected.push(request.method + ' ' + request.url)
      assert.equal(request.method, 'GET', 'Automatic quarantine handling attempted a write')
      assert.equal(url.origin, 'https://fixture.supabase.co', 'Quarantined image reached an external provider')
      assert.equal(url.pathname, '/rest/v1/cities')
      calls.push(url)
      const single = url.searchParams.get('select')?.includes('image_flagged')
      return new Response(JSON.stringify(single ? existing : []), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    await import('../fetch-images/index.ts')
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: originalServe })
    assert.ok(handler)
    const request = (body: unknown, authenticated = true) => new Request('https://fixture.invalid/fetch-images', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer fixture-city-image-service-key' } : {}) },
      body: JSON.stringify(body),
    })
    const body = { entity_type: 'city', id: '00000000-0000-0000-0000-000000000001', name: 'Cleves', country: 'Germany' }
    const held = await handler(request(body))
    assert.equal(held.status, 400)
    assert.equal((await held.json()).rejected, true)
    assert.equal(calls.length, 1)

    existing = { ...existing, curated_image_url: 'https://images.test/curated-cleves.jpg' }
    const curated = await handler(request(body))
    assert.equal(curated.status, 200)
    assert.equal((await curated.json()).image_url, existing.curated_image_url)

    existing = { ...existing, curated_image_url: null, image_flagged: false }
    const cached = await handler(request(body))
    assert.equal(cached.status, 200)
    assert.equal((await cached.json()).cached, true)

    const batch = await handler(request({ entity_type: 'city', batchMode: true }))
    assert.equal(batch.status, 200)
    const selection = calls.at(-1)!
    assert.equal(selection.searchParams.get('image_url'), 'is.null')
    assert.equal(selection.searchParams.get('curated_image_url'), 'is.null')
    assert.equal(selection.searchParams.get('or'), '(image_flagged.is.null,image_flagged.eq.false)')
    const beforeAnonymous = calls.length
    assert.equal((await handler(request(body, false))).status, 401)
    assert.equal(calls.length, beforeAnonymous)
    assert.deepEqual(unexpected, [])
  } finally {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: originalServe })
    globalThis.fetch = originalFetch
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})

