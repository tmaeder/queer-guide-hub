import { assertEquals, assertRejects } from 'jsr:@std/assert'
import { cityDiscoveryInput, discoverCityEvidence } from './city-discovery.ts'
import type { Context } from './policy.ts'

const ctx: Context = {
  item: { queue_type: 'geography', title: 'Private issue detail must never become the search query' },
  record: { name: 'Oklahoma City', country_id: '00000000-0000-0000-0000-000000000001', latitude: 35.47, longitude: -97.52, shell_status: 'real' },
  proposal: null, research: null, related: {}, urls: [], input_hash: 'hash',
  candidates: [{ id: 'recheck', action: 'recheck', payload: {}, explanation: 'Recheck the original invariant' }],
}
const statement = (value: unknown) => ({ mainsnak: { snaktype: 'value', datavalue: { value } } })
const entity = (latitude = 35.47, country = 'Q30') => ({ claims: {
  P31: [statement({ id: 'Q515' })], P17: [statement({ id: country })],
  P625: [statement({ latitude, longitude: -97.52, globe: 'http://www.wikidata.org/entity/Q2' })],
} })
function fixture(extra: Record<string, unknown> = {}, search = [{ id: 'Q1', label: 'Oklahoma City' }]) {
  const entities: Record<string, unknown> = { Q1: entity(), Q515: { labels: { en: { value: 'city' } } },
    Q30: { claims: { P297: [statement('US')] } }, Q16: { claims: { P297: [statement('CA')] } }, ...extra }
  const fetcher = ((input: URL, init: RequestInit) => {
    const u = new URL(input)
    assertEquals(u.origin + u.pathname, 'https://www.wikidata.org/w/api.php')
    assertEquals(init.redirect, 'error')
    if (u.searchParams.get('action') === 'wbsearchentities') {
      assertEquals(u.searchParams.get('search'), 'Oklahoma City')
      return Promise.resolve(Response.json({ search }))
    }
    const ids = u.searchParams.get('ids')?.split('|') ?? []
    return Promise.resolve(Response.json({ entities: Object.fromEntries(ids.map(id => [id, entities[id]])) }))
  }) as typeof fetch
  return fetcher
}

Deno.test('discovery excludes protected, merged and non-recheck cases', () => {
  const changed = (record: Context['record']) => cityDiscoveryInput({ ...ctx, record })
  assertEquals(cityDiscoveryInput({ ...ctx, item: { ...ctx.item, queue_type: 'moderation' } }), null)
  // Geography uses the safety threshold even for public settlement lookups.
  assertEquals(cityDiscoveryInput({ ...ctx, item: { ...ctx.item, risk: 'safety' } }), changed(ctx.record))
  assertEquals(cityDiscoveryInput({ ...ctx, blocker: 'protected' }), null)
  assertEquals(cityDiscoveryInput({ ...ctx, candidates: [{ ...ctx.candidates[0], action: 'approve' }] }), null)
  assertEquals(changed({ ...ctx.record, shell_status: 'ghost' }), null)
  assertEquals(changed({ ...ctx.record, duplicate_of_id: 'merged' }), null)
  assertEquals(changed({ ...ctx.record, name: 'https://private.example/' }), null)
  assertEquals(changed({ ...ctx.record, latitude: null }), null)
})
Deno.test('a live unique match supplies only scoped identity evidence', async () => {
  const found = await discoverCityEvidence(cityDiscoveryInput(ctx)!, 'US', fixture())
  assertEquals(found?.url, 'https://www.wikidata.org/wiki/Q1')
  assertEquals(JSON.parse(found?.text ?? '').coordinate_match, 'agree')
})
Deno.test('ambiguous, distant and wrong-country namesakes cannot supply evidence', async () => {
  const input = cityDiscoveryInput(ctx)!
  assertEquals(await discoverCityEvidence(input, 'US', fixture({ Q2: entity() }, [
    { id: 'Q1', label: 'Oklahoma City' }, { id: 'Q2', label: 'Oklahoma City' },
  ])), null)
  assertEquals(await discoverCityEvidence(input, 'US', fixture({ Q1: entity(35.7) })), null)
  assertEquals(await discoverCityEvidence(input, 'US', fixture({ Q1: entity(35.47, 'Q16') })), null)
})
Deno.test('provider failure cannot create evidence or fall back to a guessed URL', async () => {
  const fetcher = (() => Promise.resolve(new Response(null, { status: 503 }))) as typeof fetch
  await assertRejects(() => discoverCityEvidence(cityDiscoveryInput(ctx)!, 'US', fetcher), Error, 'Wikidata city discovery unavailable')
})
