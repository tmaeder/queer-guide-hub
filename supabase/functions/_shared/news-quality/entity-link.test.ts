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

function cityLookup(rows: { id: string; name: string; region_name: string }[]) {
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
