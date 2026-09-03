import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { fetchOverpassElements } from './overpass-fetch.ts'

// The whole point of this module is that `null` and `[]` are different answers.
// These tests pin that distinction, because the bug it fixes was invisible: the
// run reported HTTP 200, "success", and zero new venues.

const realFetch = globalThis.fetch

function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0
  globalThis.fetch = ((): Promise<Response> => {
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return Promise.resolve(
      new Response(r.body === null ? 'not json' : JSON.stringify(r.body), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }) as typeof fetch
  return () => i
}

function restore() {
  globalThis.fetch = realFetch
}

Deno.test('200 with a remark is UNKNOWN (null), never an empty answer', async () => {
  stubFetch([{ status: 200, body: { elements: [], remark: 'runtime error: Query timed out' } }])
  try {
    const { elements, verdict } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0 })
    // The regression: this returned [] and staged "no venues in this city".
    assertEquals(elements, null)
    assertEquals(verdict, 'timeout')
  } finally {
    restore()
  }
})

Deno.test('a remark alongside partial results is still UNKNOWN', async () => {
  stubFetch([{ status: 200, body: { elements: [{ id: 1 }], remark: 'out of memory' } }])
  try {
    const { elements } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0 })
    assertEquals(elements, null)
  } finally {
    restore()
  }
})

Deno.test('a clean empty 200 IS an answer — nothing is mapped here', async () => {
  stubFetch([{ status: 200, body: { elements: [] } }])
  try {
    const { elements, verdict } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0 })
    assertEquals(elements, [])
    assertEquals(verdict, 'regional')
  } finally {
    restore()
  }
})

Deno.test('elements are returned on a normal answer', async () => {
  stubFetch([{ status: 200, body: { elements: [{ id: 7 }] } }])
  try {
    const { elements, verdict } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0 })
    assertEquals(elements, [{ id: 7 }])
    assertEquals(verdict, 'ok')
  } finally {
    restore()
  }
})

Deno.test('a busy mirror is retried, and a later success is used', async () => {
  const calls = stubFetch([
    { status: 504, body: {} },
    { status: 200, body: { elements: [{ id: 9 }] } },
  ])
  try {
    const { elements } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0 })
    assertEquals(elements, [{ id: 9 }])
    assertEquals(calls(), 2)
  } finally {
    restore()
  }
})

Deno.test('a 4xx is not retried — the query will be wrong next time too', async () => {
  const calls = stubFetch([{ status: 400, body: {} }])
  try {
    const { elements, verdict } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0 })
    assertEquals(elements, null)
    assertEquals(verdict, 'error')
    assertEquals(calls(), 1)
  } finally {
    restore()
  }
})

Deno.test('an unparseable body is UNKNOWN, not an empty answer', async () => {
  stubFetch([{ status: 200, body: null }])
  try {
    const { elements } = await fetchOverpassElements('http://x', 'q', { backoffMs: 0, attempts: 1 })
    assertEquals(elements, null)
  } finally {
    restore()
  }
})
