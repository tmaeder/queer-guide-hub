import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { fetchPublisherRss, isProxyPublisherFeed, manualFeedSourceIds } from './publisher-feed.ts'
const url = 'https://www.losangelesblade.com/feed/'
const xml = '<?xml version="1.0"?><rss><channel><item><title>Publisher story</title><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>'
Deno.test('publisher proxy accepts only exact researched public feeds', () => {
  assertEquals(isProxyPublisherFeed(url), true)
  assertEquals(isProxyPublisherFeed('https://thebicast.hendersonclark.us/feed/podcast'),true)
  for (const other of ['http://www.losangelesblade.com/feed/','https://www.losangelesblade.com/private','https://other.example/feed/','https://127.0.0.1/feed/',url+'?target=private','https://user:password@www.losangelesblade.com/feed/']) assertEquals(isProxyPublisherFeed(other),false)
})
Deno.test('publisher reader preserves original RSS including dates without paid API credentials', async () => {
  const seen: string[] = []
  const fetcher = ((input,init) => { seen.push(String(input));assertEquals(((init as {headers: Record<string,string>}).headers)['X-Return-Format'],'html');return Promise.resolve(new Response(xml)) }) as typeof fetch
  assertEquals(await fetchPublisherRss(url,AbortSignal.timeout(1000),{},fetcher),xml)
  assertEquals(seen,['https://r.jina.ai/'+url])
})
Deno.test('challenge responses fall back to the authenticated internal raw extractor', async () => {
  const seen: string[] = []
  const fetcher = ((input,init) => { seen.push(String(input)); if(seen.length===1)return Promise.resolve(new Response('<html><title>Just a moment</title></html>'));assertEquals(((init as {headers: Record<string,string>}).headers)['X-Internal-Secret'],'test-secret');assertEquals(JSON.parse(String((init as {body?: string}).body)),{url:'https://r.jina.ai/'+url,raw:true,render:false});return Promise.resolve(Response.json({rawHtml:xml})) }) as typeof fetch
  assertEquals(await fetchPublisherRss(url,AbortSignal.timeout(1000),{workerUrl:'https://extract.queer.guide',workerSecret:'test-secret'},fetcher),xml)
  assertEquals(seen.length,2)
})
Deno.test('publisher reader rejects challenge pages, service errors and oversized documents', async () => {
  for (const response of [new Response('<html>Challenge</html>'),new Response('rate limit',{status:429}),new Response('x'.repeat(1000001))]) await assertRejects(()=>fetchPublisherRss(url,AbortSignal.timeout(1000),{},(()=>Promise.resolve(response)) as typeof fetch))
})
Deno.test('manual source selection never turns an invalid or empty request into a global fetch', () => {
  assertEquals(manualFeedSourceIds(undefined),undefined)
  const id='a16c6693-83fb-4e95-bc91-4087e31151bf'
  assertEquals(manualFeedSourceIds([id,id]),[id])
  for (const invalid of [[],["not-a-source"],Array(31).fill(id),"all"]) assertThrows(()=>manualFeedSourceIds(invalid))
})
