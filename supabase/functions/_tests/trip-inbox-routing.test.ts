import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { InboxRouting, INBOX_WORKER, inboxAddress } from '../_shared/trip-inbox-routing.ts'
const short = 'abc234def567'
const address = inboxAddress(short)
const owned = { id: 'a'.repeat(32), enabled: true, matchers: [{ type: 'literal', field: 'to', value: address }], actions: [{ type: 'worker', value: [INBOX_WORKER] }] }
function provider(responses: unknown[]) {
  const requests: { url: string; method: string; body: unknown }[] = []
  const send = ((url: string, init: RequestInit) => {
    requests.push({ url, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const data = responses.shift()
    if (!data) throw new Error('Unexpected provider call')
    return Promise.resolve(Response.json(data))
  }) as typeof fetch
  return { routing: new InboxRouting('private-test-token', 'f'.repeat(32), send), requests }
}
Deno.test('enable creates an exact Worker route and is idempotent', async () => {
  const { routing, requests } = provider([{ success: true, result: [] }, { success: true, result: owned }, { success: true, result: [owned] }])
  assertEquals(await routing.ensure(short), owned.id)
  assertEquals(await routing.ensure(short), owned.id)
  assertEquals(requests.map(r => r.method), ['GET', 'POST', 'GET'])
  assertEquals((requests[1].body as typeof owned).matchers, owned.matchers)
  assertEquals((requests[1].body as typeof owned).actions, owned.actions)
})
Deno.test('conflicting routes are never overwritten', async () => {
  const { routing, requests } = provider([{ success: true, result: [{ ...owned, actions: [{ type: 'forward', value: ['someone@example.com'] }] }] }])
  await assertRejects(() => routing.ensure(short), Error, 'conflicting')
  assertEquals(requests.length, 1)
})
Deno.test('revoke only deletes this inbox exact Worker rule', async () => {
  const catchall = { ...owned, id: 'b'.repeat(32), matchers: [{ type: 'all' }] }
  const unrelated = { ...owned, id: 'c'.repeat(32), matchers: [{ type: 'literal', field: 'to', value: 'info@queer.guide' }] }
  const { routing, requests } = provider([{ success: true, result: [owned, catchall, unrelated] }, { success: true, result: owned }])
  await routing.remove(short)
  assertEquals(requests.map(r => r.method), ['GET', 'DELETE'])
  assertEquals(requests[1].url.endsWith('/' + owned.id), true)
})
Deno.test('provider failures cannot report a ready address', async () => {
  const { routing } = provider([{ success: true, result: [] }, { success: false }, { success: true, result: [] }])
  await assertRejects(() => routing.ensure(short), Error, 'provider request failed')
})
Deno.test('recovers a concurrent create only after confirming the exact route', async () => {
  const { routing } = provider([{ success: true, result: [] }, { success: false }, { success: true, result: [owned] }])
  assertEquals(await routing.ensure(short), owned.id)
})
Deno.test('paginated listing finds existing routes beyond the first page', async () => {
  const { routing, requests } = provider([{ success: true, result: Array.from({ length: 50 }, () => ({ matchers: [] })), result_info: { total_pages: 2 } }, { success: true, result: [owned] }])
  assertEquals(await routing.ensure(short), owned.id)
  assertEquals(requests[1].url.includes('page=2'), true)
})
Deno.test('re-enables a disabled matching route without consuming another rule', async () => {
  const { routing, requests } = provider([{ success: true, result: [{ ...owned, enabled: false }] }, { success: true, result: owned }])
  await routing.ensure(short)
  assertEquals(requests.map(r => r.method), ['GET', 'PUT'])
})
Deno.test('invalid identifiers cannot create arbitrary recipient rules', async () => {
  const { routing, requests } = provider([])
  await assertRejects(() => routing.ensure('a@evil.example'), Error, 'Invalid inbox')
  assertEquals(requests.length, 0)
})
