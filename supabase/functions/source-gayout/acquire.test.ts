import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { acquireGayOutDocument } from './acquire.ts'
import { extractGayOutDocument } from './extract.ts'
const sitemap = 'https://www.gayout.com/sitemap-venues.xml'
const xml = '<urlset><url><loc>https://www.gayout.com/europe/france/paris/bars/example</loc></url></urlset>'
const env = (key: string) => ({ EXTRACT_WORKER_URL: 'https://extract.queer.guide', EXTRACT_WORKER_SECRET: 'worker-secret' })[key]
Deno.test('GayOut uses internal raw sitemap extraction without Firecrawl', async () => {
  const requests: string[] = []
  const document = await acquireGayOutDocument(sitemap, true, env, ((url, init) => {
    requests.push(String(url))
    if (String(url) === sitemap) return Promise.resolve(new Response('', { status: 403 }))
    assertEquals(((init as { headers?: Record<string, string> })?.headers ?? {})['X-Internal-Secret'], 'worker-secret')
    assertEquals(JSON.parse(String((init as { body?: unknown })?.body)), { url: sitemap, raw: true, render: false })
    return Promise.resolve(Response.json({ rawHtml: xml, finalUrl: sitemap }))
  }) as typeof fetch)
  assertEquals(document.method, 'extract')
  assertEquals(document.html, xml)
  assertEquals(requests, [sitemap, 'https://extract.queer.guide/extract'])
})
Deno.test('GayOut retries ordinary extraction with a bounded render attempt', async () => {
  const renders: boolean[] = []
  const result = await extractGayOutDocument(sitemap, true, env, ((_url, init) => {
    const render = JSON.parse(String((init as { body?: unknown })?.body)).render; renders.push(render)
    return Promise.resolve(render ? Response.json({ rawHtml: xml, finalUrl: sitemap }) : new Response('', { status: 502 }))
  }) as typeof fetch)
  assertEquals(result?.html, xml)
  assertEquals(renders, [false, true])
})
Deno.test('GayOut rejects challenge pages and unrelated redirect identities', async () => {
  for (const data of [{ rawHtml: '<title>Just a moment...</title>', finalUrl: sitemap },
    { rawHtml: xml, finalUrl: 'https://other.example/sitemap-venues.xml' },
    { rawHtml: xml, finalUrl: 'https://www.gayout.com/other.xml' },
    { rawHtml: '<html>not a sitemap</html>', finalUrl: sitemap }])
    assertEquals(await extractGayOutDocument(sitemap, true, env, (() => Promise.resolve(Response.json(data))) as typeof fetch), null)
})
Deno.test('GayOut never spends Firecrawl credits by default', async () => {
  await assertRejects(() => acquireGayOutDocument(sitemap, true, key => key === 'FIRECRAWL_API_KEY' ? 'funded-or-empty' : env(key),
    ((url) => { if (String(url).includes('firecrawl')) throw Error('must not call Firecrawl'); return Promise.resolve(new Response('', { status: String(url) === sitemap ? 403 : 502 })) }) as typeof fetch), Error, 'Firecrawl fallback is disabled')
})
Deno.test('GayOut gone pages do not consume extraction or provider calls', async () => {
  let calls = 0
  await assertRejects(() => acquireGayOutDocument(sitemap, true, env, (() => { calls++; return Promise.resolve(new Response('', { status: 404 })) }) as typeof fetch), Error, 'E_GAYOUT_SOURCE_GONE')
  assertEquals(calls, 1)
})
Deno.test('GayOut rejects an untrusted worker host before sending the secret', async () => {
  await assertRejects(() => extractGayOutDocument(sitemap, true, key => key === 'EXTRACT_WORKER_URL' ? 'https://attacker.example' : env(key),
    (() => { throw Error('must not fetch') }) as typeof fetch), Error, 'Invalid internal extraction worker URL')
})
Deno.test('GayOut identifies an internal secret mismatch without spending another render request', async () => {
  let calls = 0
  await assertRejects(() => extractGayOutDocument(sitemap, true, env, (() => { calls++; return Promise.resolve(new Response('', { status: 401 })) }) as typeof fetch), Error, 'E_GAYOUT_EXTRACT_AUTH')
  assertEquals(calls, 1)
})
