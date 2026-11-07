import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { _internals, resolveEntities } from './entity-link.ts'

const { trigramSimilarity, passesDisambiguationGuard } = _internals

Deno.test('trigramSimilarity exact match = 1', () => {
  assertEquals(trigramSimilarity('berlin', 'berlin'), 1)
})

Deno.test('trigramSimilarity catches small typos', () => {
  assert(trigramSimilarity('berlim', 'berlin') > 0.6)
})

Deno.test('trigramSimilarity rejects unrelated', () => {
  assert(trigramSimilarity('berlin', 'tokyo') < 0.3)
})

Deno.test('Georgia disambiguation: blocks without country context', () => {
  const r = passesDisambiguationGuard('country', 'Georgia',
    'A new law in the state of Georgia takes effect Monday, Atlanta lawmakers said.')
  assertFalse(r.ok)
  assert(r.reason?.includes('Georgia'))
})

Deno.test('Georgia disambiguation: passes with Tbilisi context', () => {
  const r = passesDisambiguationGuard('country', 'Georgia',
    'In Tbilisi, the Georgian government announced new restrictions.')
  assert(r.ok)
})

Deno.test('Disambiguation only applies to countries, not cities', () => {
  const r = passesDisambiguationGuard('city', 'Georgia',
    'Random body without any disambiguation hints.')
  assert(r.ok)
})

function cityLookup(rows: { id: string; name: string; region_name: string; shell_status?: string }[]) {
  const client = {
    rpc(name: string, args: unknown) {
      assertEquals(name, 'city_canonical_key')
      assertEquals(args, { p_name: 'Montréal' })
      return Promise.resolve({ data: 'montreal', error: null })
    },
    from(table: string) {
      assertEquals(table, 'cities')
      return {
        select: () => ({
          eq(column: string, key: string) {
            assertEquals(column, 'canonical_key')
            assertEquals(key, rows[0].name.toLowerCase())
            return {
              is(column: string, value: unknown) {
                assertEquals(column, 'duplicate_of_id')
                assertEquals(value, null)
                return {
                  limit(n: number) {
                    assertEquals(n, 2)
                    return Promise.resolve({ data: rows, error: null })
                  },
                }
              },
            }
          },
        }),
      }
    },
  }
  return client as unknown as Parameters<typeof resolveEntities>[0]
}

Deno.test('an exact archived city name does not fall back to a different settlement', async () => {
  const client = cityLookup([
    { id: 'texas', name: 'Texas', region_name: 'Texas', shell_status: 'ghost' },
  ])
  const result = await resolveEntities(client, 'cities', 'city', ['Texas'], 'A law in Texas.')
  assertEquals(result, { linked: [], needsReview: [] })
})

Deno.test('fuzzy city search excludes archived and merged records before limiting candidates', async () => {
  const filters: unknown[][] = []
  const fuzzy = {
    ilike(column: string, pattern: string) {
      filters.push([column, pattern])
      return this
    },
    neq(column: string, value: string) {
      filters.push([column, value])
      return this
    },
    is(column: string, value: null) {
      filters.push([column, value])
      return this
    },
    limit(count: number) {
      filters.push([count])
      return Promise.resolve({ data: [], error: null })
    },
  }
  const client = {
    from: () => ({
      select: () => ({
        ...fuzzy,
        eq: () => ({ is: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
  } as unknown as Parameters<typeof resolveEntities>[0]
  await resolveEntities(client, 'cities', 'city', ['Texa'], 'A law in Texa.')
  assertEquals(filters, [['name', '%Texa%'], ['shell_status', 'ghost'], ['duplicate_of_id', null], [8]])
})

Deno.test('city resolution prefers the canonical key for accented city names', async () => {
  const client = cityLookup([{ id: 'montreal', name: 'Montreal', region_name: 'Quebec' }])
  const result = await resolveEntities(client, 'cities', 'city', ['Montréal'], 'Un festival à Montréal.')
  assertEquals(result, {
    linked: [{ id: 'montreal', name: 'Montreal', score: 1 }],
    needsReview: [],
  })
})

Deno.test('city resolution does not choose between same-name canonical cities', async () => {
  const client = cityLookup([
    { id: 'london-uk', name: 'London', region_name: 'England' },
    { id: 'london-ca', name: 'London', region_name: 'Ontario' },
  ])
  const result = await resolveEntities(client, 'cities', 'city', ['London'], 'A festival in London.')
  assertEquals(result.linked, [])
  assertEquals(result.needsReview.length, 1)
  assert(result.needsReview[0].reason.startsWith('ambiguous:'))
})

Deno.test('an exact city key still honors the region conflict guard', async () => {
  const client = cityLookup([{ id: 'richmond-bc', name: 'Richmond', region_name: 'British Columbia' }])
  const result = await resolveEntities(client, 'cities', 'city', ['Richmond'], 'A festival in Richmond, Virginia.')
  assertEquals(result.linked, [])
  assertEquals(result.needsReview.length, 1)
  assert(result.needsReview[0].reason.startsWith('city_collision:'))
})

function fuzzyCityLookup(name: string, region_name: string) {
  const exact = { limit: () => Promise.resolve({ data: [], error: null }) }
  const fuzzy = {
    neq() { return this },
    is() { return this },
    limit: () => Promise.resolve({ data: [{ id: 'city', name, region_name }], error: null }),
  }
  return {
    from: () => ({ select: () => ({ eq: () => ({ is: () => exact }), ilike: () => fuzzy }) }),
  } as unknown as Parameters<typeof resolveEntities>[0]
}

Deno.test('state-only hints do not queue a city that the article never mentions', async () => {
  const client = fuzzyCityLookup('California City', 'California')
  const result = await resolveEntities(client, 'cities', 'city', ['California'], 'California voters elected a senator.')
  assertEquals(result, { linked: [], needsReview: [] })
})

Deno.test('a city in the headline remains reviewable even when the body names only the state', async () => {
  const client = fuzzyCityLookup('California City', 'California')
  const result = await resolveEntities(
    client, 'cities', 'city', ['California'], 'California voters elected a senator.', 'name', 'Election night in California City',
  )
  assertEquals(result.needsReview.map((row) => row.name), ['California City'])
})

Deno.test('a separately named city remains reviewable when its state was the model hint', async () => {
  const client = fuzzyCityLookup('Raleigh, North Carolina', 'North Carolina')
  const result = await resolveEntities(
    client, 'cities', 'city', ['North Carolina'], 'Delegates from North Carolina gathered in Raleigh.',
  )
  assertEquals(result.needsReview.map((row) => row.name), ['Raleigh, North Carolina'])
})
