import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { fetchPublisherRss, isProxyPublisherFeed, manualFeedSourceIds } from './publisher-feed.ts'
const url = 'https://www.losangelesblade.com/feed/'
Deno.test('publisher proxy accepts only exact researched public feeds', () => {
  assertEquals(isProxyPublisherFeed(url), true)
  for (const other of ['http://www.losangelesblade.com/feed/','https://www.losangelesblade.com/private','https://other.example/feed/','https://127.0.0.1/feed/',url+'?target=private','https://user:password@www.losangelesblade.com/feed/']) assertEquals(isProxyPublisherFeed(other),false)
})
Deno.test('publisher proxy requests bounded raw RSS through the existing basic service', async () => {
  let seen: Record<string, unknown> = {}
  const xml = '<?xml version="1.0"?><rss><channel><item><title>Publisher story</title></item></channel></rss>'
  const fetcher = ((input, init) => { seen={endpoint:String(input),body:JSON.parse(String(init?.body)),redirect:init?.redirect}; return Promise.resolve(Response.json({success:true,data:{rawHtml:xml,metadata:{statusCode:200}}})) }) as typeof fetch
  assertEquals(await fetchPublisherRss(url,'test-key',AbortSignal.timeout(1000),fetcher),xml)
  assertEquals(seen,{endpoint:'https://api.firecrawl.dev/v2/scrape',body:{url,formats:['rawHtml'],onlyMainContent:false,proxy:'basic',maxAge:900000,timeout:15000},redirect:'error'})
})
Deno.test('publisher proxy surfaces quota/errors and rejects challenge pages and oversized replies', async () => {
  for (const result of [{success:false},{success:true,data:{rawHtml:'<html>Challenge</html>',metadata:{statusCode:200}}},{success:true,data:{rawHtml:'<rss></rss>',metadata:{statusCode:403}}}]) await assertRejects(()=>fetchPublisherRss(url,'test-key',AbortSignal.timeout(1000),(()=>Promise.resolve(Response.json(result))) as typeof fetch))
  await assertRejects(()=>fetchPublisherRss(url,'test-key',AbortSignal.timeout(1000),(()=>Promise.resolve(new Response('quota',{status:402}))) as typeof fetch),Error,'HTTP 402')
  await assertRejects(()=>fetchPublisherRss(url,'test-key',AbortSignal.timeout(1000),(()=>Promise.resolve(new Response('x'.repeat(2000001)))) as typeof fetch),Error,'byte budget')
})
Deno.test('manual source selection never turns an invalid or empty request into a global fetch', () => {
  assertEquals(manualFeedSourceIds(undefined),undefined)
  const id='a16c6693-83fb-4e95-bc91-4087e31151bf'
  assertEquals(manualFeedSourceIds([id,id]),[id])
  for (const invalid of [[],["not-a-source"],Array(31).fill(id),"all"]) assertThrows(()=>manualFeedSourceIds(invalid))
})
