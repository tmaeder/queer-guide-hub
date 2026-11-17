import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isIlgaMonitorFeed, parseIlgaMonitorItems } from './ilga-monitor.ts'

Deno.test('ILGA Monitor maps real JSON field names and bounds valid items', () => {
  const row = { h: 'Original headline', th: 'Translation', u: 'https://publisher.org/story', d: '<p>Reported facts</p>', da: '2026-11-11T01:05:24.000Z' }
  const result = parseIlgaMonitorItems([null, { ...row, u: 'javascript:alert(1)' }, row, row], 1)
  assertEquals(result.length, 1)
  assertEquals(result[0].title, 'Original headline')
  assertEquals(result[0].url, row.u)
  assertEquals(result[0].content, 'Reported facts')
  assertEquals(result[0].published_at, row.da)
  assertEquals(parseIlgaMonitorItems({}, 1), [])
  assertEquals(parseIlgaMonitorItems([row], 0), [])
})

Deno.test('ILGA JSON parsing applies only to the registered host and endpoint', () => {
  assertEquals(isIlgaMonitorFeed('https://monitor.ilga.org/api/articles/latest_mou_general'), true)
  assertEquals(isIlgaMonitorFeed('https://example.org/api/articles/latest_mou_general'), false)
  assertEquals(isIlgaMonitorFeed('https://monitor.ilga.org/feed/'), false)
})
