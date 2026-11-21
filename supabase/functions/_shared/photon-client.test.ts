import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  __setPhotonTestHooks,
  comparePhotonTop1,
  flushPhotonMetrics,
  photonConfigFrom,
  photonReverse,
  photonSearch,
  photonThrottleMs,
  settlePhotonBackground,
} from './photon-client.ts'

const SELF = 'https://geo-internal.example'
const isSelf = (url: string) => new URL(url).host === new URL(SELF).host
const ZURICH = {
  type: 'Feature',
  properties: { name: 'Zürich', type: 'city', countrycode: 'CH' },
  geometry: { type: 'Point', coordinates: [8.541, 47.374] as [number, number] },
}
const BODY = { type: 'FeatureCollection', features: [ZURICH] }
const SECRET_Q = 'Langstrasse 42 Zürich'

interface Call { url: string; headers: Record<string, string> }
type Reply = (url: string) => Response | Promise<Response> | 'timeout' | 'neterr'

function setup(env: Record<string, string>, reply: Reply) {
  const calls: Call[] = []
  const logs: string[] = []
  const breakerEvents: string[] = []
  const metricRows: Array<Record<string, unknown>> = []
  let t = 1_000_000
  let dbAllowed = true
  __setPhotonTestHooks({
    env: (k) => env[k],
    now: () => t,
    log: (l) => logs.push(l),
    metricsSink: async (rows) => { metricRows.push(...rows.map((r) => ({ ...r }) as Record<string, unknown>)) },
    breaker: {
      check: async () => { breakerEvents.push('check'); return dbAllowed },
      fail: async (r) => { breakerEvents.push(`fail:${r}`); return false },
      ok: async () => { breakerEvents.push('ok') },
    },
    fetch: async (url, init) => {
      calls.push({ url, headers: { ...(init.headers as Record<string, string>) } })
      const r = await reply(url)
      if (r === 'timeout') {
        await new Promise((_, rej) => {
          const s = init.signal!
          s.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        })
      }
      if (r === 'neterr') throw new TypeError('connection refused')
      return r as Response
    },
  })
  return {
    calls, logs, breakerEvents, metricRows,
    advance(ms: number) { t += ms },
    setDb(v: boolean) { dbAllowed = v },
  }
}
const ok = () => new Response(JSON.stringify(BODY), { status: 200 })
const PRIMARY = { PHOTON_MODE: 'primary', PHOTON_PRIMARY_URL: SELF, PHOTON_ACCESS_CLIENT_ID: 'id', PHOTON_ACCESS_CLIENT_SECRET: 'sec' }

Deno.test('config: komoot by default, and without a primary URL whatever the mode', () => {
  assertEquals(photonConfigFrom(() => undefined).mode, 'komoot')
  assertEquals(photonConfigFrom((k) => ({ PHOTON_MODE: 'primary' } as Record<string, string>)[k]).mode, 'komoot')
  const c = photonConfigFrom((k) => ({ ...PRIMARY, PHOTON_MODE: 'bogus' } as Record<string, string>)[k])
  assertEquals(c.mode, 'komoot')
  assertEquals(c.fallbackUrl, 'https://photon.komoot.io')
})

Deno.test('config: legacy endpoint env vars still set the fallback base', () => {
  const c = photonConfigFrom((k) => ({ PHOTON_SEARCH_URL: 'https://p.example/api/' } as Record<string, string>)[k])
  assertEquals(c.fallbackUrl, 'https://p.example')
})

Deno.test('komoot mode: one call to komoot, no Access headers, raw shape returned', async () => {
  const h = setup({}, ok)
  const r = await photonSearch(SECRET_Q, { caller: 't', lang: 'de', limit: 5, lat: 47.3, lon: 8.5 })
  assertEquals(r.upstream, 'komoot')
  assertEquals(r.data, BODY)
  assertEquals(h.calls.length, 1)
  assert(new URL(h.calls[0].url).host === 'photon.komoot.io' && new URL(h.calls[0].url).pathname === '/api')
  const u = new URL(h.calls[0].url)
  assertEquals([u.searchParams.get('lang'), u.searchParams.get('limit'), u.searchParams.get('lat')], ['de', '5', '47.3'])
  assertEquals(h.calls[0].headers['CF-Access-Client-Id'], undefined)
  assertEquals(h.calls[0].headers['User-Agent'], 'QueerGuide/1.0 (https://queer.guide)')
})

Deno.test('primary mode: self answers, Access headers only on the self request', async () => {
  const h = setup(PRIMARY, ok)
  const r = await photonReverse(47.37, 8.54, { caller: 't', lang: 'en' })
  assertEquals([r.upstream, r.fallback, r.ok], ['self', false, true])
  assertEquals(h.calls.length, 1)
  assert(isSelf(h.calls[0].url) && new URL(h.calls[0].url).pathname === '/reverse')
  assertEquals(h.calls[0].headers['CF-Access-Client-Id'], 'id')
  assertEquals(h.calls[0].headers['CF-Access-Client-Secret'], 'sec')
})

for (const [name, reply] of [
  ['5xx', () => new Response('x', { status: 503 })],
  ['403', () => new Response('denied', { status: 403 })],
  ['Access login redirect', () => new Response(null, { status: 302, headers: { location: 'https://x.cloudflareaccess.com' } })],
  ['network error', () => 'neterr' as const],
] as [string, () => Response | 'neterr'][]) {
  Deno.test(`primary mode: ${name} falls back to komoot, komoot gets no Access headers`, async () => {
    const h = setup(PRIMARY, (url) => (isSelf(url) ? reply() : ok()))
    const r = await photonSearch('x', { caller: 't' })
    assertEquals([r.upstream, r.fallback, r.ok], ['komoot', true, true])
    assertEquals(h.calls.length, 2)
    assertEquals(h.calls[1].headers['CF-Access-Client-Id'], undefined)
    await settlePhotonBackground()
    assert(h.breakerEvents.some((e) => e.startsWith('fail:')))
  })
}

Deno.test('primary mode: timeout falls back after PHOTON_PRIMARY_TIMEOUT_MS', async () => {
  const h = setup({ ...PRIMARY, PHOTON_PRIMARY_TIMEOUT_MS: '30' }, (url) => (isSelf(url) ? 'timeout' : ok()))
  const r = await photonSearch('x', { caller: 't' })
  assertEquals([r.upstream, r.fallback], ['komoot', true])
  await settlePhotonBackground()
  assert(h.breakerEvents.includes('fail:timeout'))
})

Deno.test('primary mode: a 400 from self is returned as-is, not retried on komoot', async () => {
  const h = setup(PRIMARY, (url) => (isSelf(url) ? new Response('bad', { status: 400 }) : ok()))
  const r = await photonSearch('x', { caller: 't' })
  assertEquals([r.upstream, r.ok, r.status], ['self', false, 400])
  assertEquals(h.calls.length, 1)
})

Deno.test('breaker: 3 local failures skip self entirely, recovery reopens it', async () => {
  let selfUp = false
  const h = setup(PRIMARY, (url) => (isSelf(url) ? (selfUp ? ok() : new Response('', { status: 502 })) : ok()))
  for (let i = 0; i < 3; i++) await photonSearch('x', { caller: 't' })
  assertEquals(h.calls.filter((c) => isSelf(c.url)).length, 3)
  h.calls.length = 0
  await photonSearch('x', { caller: 't' })
  assertEquals(h.calls.map((c) => isSelf(c.url)), [false]) // fast fail, komoot only
  selfUp = true
  h.advance(61_000)
  h.calls.length = 0
  const r = await photonSearch('x', { caller: 't' })
  assertEquals(r.upstream, 'self')
  await settlePhotonBackground()
  assert(h.breakerEvents.includes('ok'), 'recovery must close the shared breaker')
})

Deno.test('breaker: an open shared circuit skips self without calling it', async () => {
  const h = setup(PRIMARY, ok)
  h.setDb(false)
  const r = await photonSearch('x', { caller: 't' })
  assertEquals([r.upstream, r.fallback], ['komoot', true])
  assertEquals(h.calls.length, 1)
})

Deno.test('breaker: healthy traffic does not hit the DB on every request', async () => {
  const h = setup(PRIMARY, ok)
  for (let i = 0; i < 10; i++) await photonSearch('x', { caller: 't' })
  await settlePhotonBackground()
  assertEquals(h.breakerEvents, ['check'])
})

Deno.test('shadow mode: komoot answers, self is asked in the background, agreement aggregated', async () => {
  const h = setup({ ...PRIMARY, PHOTON_MODE: 'shadow' }, ok)
  const r = await photonSearch(SECRET_Q, { caller: 't' })
  assertEquals(r.upstream, 'komoot')
  await settlePhotonBackground()
  assertEquals(h.calls.map((c) => isSelf(c.url)), [false, true])
  await flushPhotonMetrics()
  const self = h.metricRows.find((m) => m.upstream === 'self')!
  assertEquals([self.mode, self.shadow_compared, self.shadow_top1_250m, self.shadow_same_city], ['shadow', 1, 1, 1])
})

Deno.test('privacy: no query text or coordinates in logs or metrics', async () => {
  const h = setup({ ...PRIMARY, PHOTON_MODE: 'shadow' }, (url) => (isSelf(url) ? 'neterr' : ok()))
  await photonSearch(SECRET_Q, { caller: 't', lat: 47.123, lon: 8.456 })
  await photonReverse(52.5201, 13.4049, { caller: 't' })
  await settlePhotonBackground()
  await flushPhotonMetrics()
  const blob = JSON.stringify([h.logs, h.metricRows])
  for (const leak of ['Langstrasse', 'Zürich', '47.123', '8.456', '52.5201', '13.4049']) {
    assert(!blob.includes(leak), `leaked ${leak}`)
  }
  assert(h.logs.length >= 3)
})

Deno.test('an unsupported lang is dropped instead of sent (Photon 400s on lang=it)', async () => {
  const h = setup({}, ok)
  await photonSearch('x', { caller: 't', lang: 'it' })
  assertEquals(new URL(h.calls[0].url).searchParams.get('lang'), null)
})

Deno.test('throttle is per upstream', () => {
  setup({}, ok)
  assertEquals(photonThrottleMs('komoot'), 1100)
  assertEquals(photonThrottleMs('self'), 50)
  setup({ PHOTON_INTERVAL_MS: '2000', PHOTON_SELF_INTERVAL_MS: '0' }, ok)
  assertEquals([photonThrottleMs('komoot'), photonThrottleMs('self')], [2000, 0])
})

Deno.test('agreement: far-apart top-1 or a missing side disagrees', () => {
  const far = { ...ZURICH, geometry: { type: 'Point', coordinates: [-97.4, 38.2] as [number, number] } }
  assertEquals(comparePhotonTop1(ZURICH, far).top1_250m, false)
  assertEquals(comparePhotonTop1(ZURICH, undefined).sameCountry, false)
  assertEquals(comparePhotonTop1(undefined, undefined).bothEmpty, true)
})
