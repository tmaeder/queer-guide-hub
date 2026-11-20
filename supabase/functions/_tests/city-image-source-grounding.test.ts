import assert from 'node:assert/strict'

Deno.test('actual image handlers reject namesakes and missing city points without inventing or erasing evidence', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY', 'IMAGE_QUALITY_WEBHOOK_SECRET']
  const previous = new Map(keys.map(key => [key, Deno.env.get(key)]))
  Deno.env.set('SUPABASE_URL', 'https://grounding.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-grounding-key')
  Deno.env.set('PEXELS_API_KEY', 'fixture-stock-provider-must-not-be-called')
  Deno.env.set('UNSPLASH_ACCESS_KEY', 'fixture-stock-provider-must-not-be-called')
  Deno.env.set('IMAGE_QUALITY_WEBHOOK_SECRET', 'fixture-grounding-webhook')
  const savedServe = Deno.serve
  const savedFetch = globalThis.fetch
  let handle: ((req: Request) => Promise<Response>) | undefined
  const capture = () => Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: (handler: unknown) => {
    handle = handler as typeof handle
    return {}
  } })
  let mode: 'missing' | 'namesake' | 'nearby' | 'race' = 'missing'
  let searches = 0
  let points = 0
  const attemptedWrites: string[] = []
  const unexpectedRequests: string[] = []
  const refusedUpdates: URL[] = []
  const raceLogs: Record<string, unknown>[] = []
  const source = () => ({ query: { pages: { 1: { pageid: 1, title: 'File:York Pride.jpg', imageinfo: [{
    mime: 'image/jpeg', width: 1600, height: 1000, url: 'https://images.test/york.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:York_Pride.jpg',
    extmetadata: { ImageDescription: { value: mode === 'nearby' || mode === 'race' ? 'York Pride in York, England' : 'Hudson River Park in New York City Pride' },
      LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Fixture creator' },
      GPSLatitude: { value: mode === 'nearby' || mode === 'race' ? '53.96' : '40.7335' }, GPSLongitude: { value: mode === 'nearby' || mode === 'race' ? '-1.08' : '-74.0106' }, GPSMapDatum: { value: 'WGS-84' } },
  }] } } } })
  try {
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
      if (mode === 'race' && url.origin === 'https://images.test') {
        return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } })
      }
      if (url.hostname === 'commons.wikimedia.org') {
        searches++
        assert(!url.searchParams.get('gsrsearch')?.includes('Spoofed'), 'Client name overrode the stored city')
        return json(source())
      }
      if (url.origin !== 'https://grounding.supabase.co') unexpectedRequests.push(url.href)
      assert.equal(url.origin, 'https://grounding.supabase.co', 'An ungrounded stock provider, image download or upload was called')
      if (url.pathname.endsWith('/rpc/entities_due_for_queer_image')) {
        return json([{ id: '00000000-0000-0000-0000-000000000001', name: 'York', country_name: 'United Kingdom', capital: null, current_image_url: null, wiki_url: null }])
      }
      if (mode === 'race' && url.pathname.endsWith('/cities') && request.method === 'PATCH') {
        refusedUpdates.push(url)
        return json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }, 406)
      }
      if (mode === 'race' && url.pathname.endsWith('/enrichment_log') && request.method === 'POST') {
        raceLogs.push(await request.json())
        return new Response(null, { status: 201 })
      }
      if (request.method !== 'GET') attemptedWrites.push(request.method + ' ' + url.pathname)
      assert.equal(request.method, 'GET', 'Miss or dry-run changed source image evidence')
      assert.equal(url.pathname, '/rest/v1/cities')
      points++
      const latitude = mode === 'missing' ? null : 53.95763
      const point = { id: '00000000-0000-0000-0000-000000000001', name: 'York', latitude, longitude: -1.08271, updated_at: '2026-01-01T00:00:00Z', image_url: 'https://images.test/retained.jpg', image_flagged: false, curated_image_url: null, countries: { name: 'United Kingdom' } }
      return json(url.searchParams.get('id')?.startsWith('in.') ? [point] : point)
    }
    capture()
    await import('../fetch-images/index.ts')
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: savedServe })
    assert.ok(handle)
    const fetchHandler = handle
    const request = () => new Request('https://fixture.invalid/fetch-images', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-grounding-key' },
      body: JSON.stringify({ entity_type: 'city', id: '00000000-0000-0000-0000-000000000001', name: 'Spoofed', country: 'Spoofed', forceUpdate: true }),
    })
    let response = await handle(request())
    assert.equal(response.status, 400)
    assert.equal((await response.json()).rejected, true)
    assert.equal(searches, 0)
    mode = 'namesake'
    response = await handle(request())
    assert.equal(response.status, 400)
    assert.equal((await response.json()).rejected, true)
    assert.equal(searches, 2)
    assert.equal(points, 2)

    capture()
    await import('../queer-imagery-backfill/index.ts')
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: savedServe })
    const backfillRequest = () => new Request('https://fixture.invalid/queer-imagery-backfill', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'fixture-grounding-webhook' },
      body: JSON.stringify({ entity_type: 'city', dry_run: mode !== 'race', batch_size: 1 }),
    })
    mode = 'missing'
    searches = 0
    let result = await (await handle(backfillRequest())).json()
    assert.equal(result.hits, 0)
    assert.equal(searches, 0)
    mode = 'namesake'
    result = await (await handle(backfillRequest())).json()
    assert.equal(result.hits, 0)
    assert.equal(searches, 3)
    mode = 'nearby'
    searches = 0
    result = await (await handle(backfillRequest())).json()
    assert.equal(result.hits, 1)
    assert.equal(searches, 1)
    assert.deepEqual(attemptedWrites, [])
    assert.deepEqual(unexpectedRequests, [])
    mode = 'race'
    response = await fetchHandler(request())
    assert.equal(response.status, 400)
    assert.equal((await response.json()).rejected, true)
    result = await (await handle(backfillRequest())).json()
    assert.equal(result.hits, 0)
    assert.equal(result.misses, 1)
    assert.equal(refusedUpdates.length, 2)
    assert(refusedUpdates.every(url => url.searchParams.get('updated_at') === 'eq.2026-01-01T00:00:00Z'))
    assert.deepEqual(raceLogs.map(log => log.status), ['skipped'])
    assert.deepEqual(attemptedWrites, [])
    assert.deepEqual(unexpectedRequests, [])
  } finally {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: savedServe })
    globalThis.fetch = savedFetch
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})

