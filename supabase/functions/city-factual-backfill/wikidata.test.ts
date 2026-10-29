import { deepStrictEqual as equal, rejects, ok } from 'node:assert/strict'
import { readWikidataJson, WikidataReadError } from './wikidata.ts'
const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1&format=json'
const valid = { entities: { Q1: { claims: {} } } }
const response = (body: unknown, headers: Record<string, string> = {}) => Response.json(body, { headers })
Deno.test('HTTP200 maxlag backs off before accepting the real entity response', async () => {
  const delays: number[] = []; let calls = 0
  const result = await readWikidataJson(url, 'fixture', { sleep: ms => { delays.push(ms); return Promise.resolve() }, fetcher: (input, init) => {
    equal(new URL(input).searchParams.get('maxlag'), '5'); ok(init.signal)
    return Promise.resolve(++calls === 1 ? response({ error: { code: 'maxlag' } }, { 'Retry-After': '3' }) : response(valid))
  } })
  equal(result, valid); equal(calls, 2); equal(delays, [5000])
})
Deno.test('transient API error retries are bounded and never return a missing entity', async () => {
  let calls = 0; const delays: number[] = []
  await rejects(() => readWikidataJson(url, 'fixture', { sleep: ms => { delays.push(ms); return Promise.resolve() }, fetcher: () => { calls++; return Promise.resolve(response({ error: { code: 'ratelimited' } })) } }), (e: unknown) => e instanceof WikidataReadError && e.code === 'ratelimited')
  equal(calls, 3); equal(delays, [5000, 5000])
})
Deno.test('long numeric or dated Retry-After defers without an early retry', async () => {
  for (const header of ['120', 'Wed, 28 Oct 2026 22:02:00 GMT']) {
    let calls = 0; let waits = 0
    await rejects(() => readWikidataJson(url, 'fixture', { now: () => Date.parse('2026-10-28T22:00:00Z'), sleep: () => { waits++; return Promise.resolve() }, fetcher: () => { calls++; return Promise.resolve(response({ error: { code: 'maxlag' } }, { 'Retry-After': header })) } }), (e: unknown) => e instanceof WikidataReadError && e.retryAfterSeconds === 120)
    equal(calls, 1); equal(waits, 0)
  }
})
Deno.test('permanent API errors, malformed JSON and missing entity keys fail closed', async () => {
  for (const [make, code] of [[() => response({ error: { code: 'badvalue', info: 'DO_NOT_EXPORT' } }), 'badvalue'], [() => new Response('<html>not JSON</html>'), 'json_invalid'], [() => response({ entities: {} }), 'entity_keys_missing'], [() => response(null), 'payload_invalid']] as const) {
    let calls = 0
    await rejects(() => readWikidataJson(url, 'fixture', { sleep: () => { throw new Error('must not retry') }, fetcher: () => { calls++; return Promise.resolve(make()) } }), (e: unknown) => e instanceof WikidataReadError && e.code === code && !e.message.includes('DO_NOT_EXPORT'))
    equal(calls, 1)
  }
})
Deno.test('modern multi-errors do not retry a permanent failure alongside lag', async () => {
  await rejects(() => readWikidataJson(url, 'fixture', { fetcher: () => Promise.resolve(response({ errors: [{ code: 'maxlag' }, { code: 'badvalue' }] })), sleep: () => { throw new Error('must not retry') } }), (e: unknown) => e instanceof WikidataReadError && e.code === 'badvalue')
})
Deno.test('HTTP429 respects the same bounded backoff and preserves request headers', async () => {
  const delays: number[] = []; let calls = 0
  equal(await readWikidataJson(url, 'contact fixture', { sleep: ms => { delays.push(ms); return Promise.resolve() }, fetcher: (_input, init) => {
    equal((init.headers as Record<string, string>)['User-Agent'], 'contact fixture')
    return Promise.resolve(++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '5' } }) : response(valid))
  } }), valid)
  equal(delays, [5000])
})
Deno.test('observed CirrusSearch busy and documented temporary backend errors back off before retry', async () => {
  for (const code of ['cirrussearch-too-busy-error', 'cirrussearch-regex-too-busy-error', 'cirrussearch-backend-error']) {
    let calls = 0; const delays: number[] = []
    equal(await readWikidataJson(url, 'fixture', { sleep: ms => { delays.push(ms); return Promise.resolve() }, fetcher: () => Promise.resolve(++calls === 1 ? response({ error: { code } }) : response(valid)) }), valid)
    equal(calls, 2); equal(delays, [5000])
  }
})
Deno.test('persistent CirrusSearch busy stops after the retry budget and honors long deferral', async () => {
  for (const wait of [5, 90]) {
    let calls = 0; const delays: number[] = []
    await rejects(() => readWikidataJson(url, 'fixture', { sleep: ms => { delays.push(ms); return Promise.resolve() }, fetcher: () => {
      calls++; return Promise.resolve(response({ error: { code: 'cirrussearch-too-busy-error' } }, { 'Retry-After': String(wait) }))
    } }), (e: unknown) => e instanceof WikidataReadError && e.retryable && e.retryAfterSeconds === wait)
    equal(calls, wait === 5 ? 3 : 1); equal(delays, wait === 5 ? [5000, 5000] : [])
  }
})
Deno.test('a permanent CirrusSearch syntax error is never retried as overload', async () => {
  let calls = 0
  await rejects(() => readWikidataJson(url, 'fixture', { sleep: () => { throw Error('must not retry') }, fetcher: () => {
    calls++; return Promise.resolve(response({ error: { code: 'cirrussearch-query-too-complex-error' } }))
  } }), (e: unknown) => e instanceof WikidataReadError && !e.retryable)
  equal(calls, 1)
})
