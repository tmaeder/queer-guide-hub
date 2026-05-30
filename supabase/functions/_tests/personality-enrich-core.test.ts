import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { fillBlanks, refreshTtlDays, isStale, parseWikipediaSummary } from '../_shared/personality-enrich-core.ts'

Deno.test('fillBlanks only fills null/empty, never clobbers curated', () => {
  const existing = { description: 'Curated bio', birth_date: null, nationality: '' }
  const incoming = { description: 'Wiki desc', birth_date: '1945-08-24', nationality: 'American', profession: 'activist' }
  assertEquals(fillBlanks(existing, incoming), {
    birth_date: '1945-08-24',
    nationality: 'American',
    profession: 'activist',
  })
})

Deno.test('fillBlanks ignores null/undefined incoming values', () => {
  const existing = { image_url: null }
  const incoming = { image_url: null, profession: undefined }
  assertEquals(fillBlanks(existing, incoming), {})
})

Deno.test('refreshTtlDays: living=90, recently deceased=7, default=365', () => {
  assertEquals(refreshTtlDays({ is_living: true }), 90)
  assertEquals(refreshTtlDays({ is_living: false, death_date: '2026-05-01' }, '2026-05-30'), 7)
  assertEquals(refreshTtlDays({ is_living: false, death_date: '1992-07-06' }, '2026-05-30'), 365)
})

Deno.test('isStale compares last_refreshed_at against ttl', () => {
  assertEquals(isStale({ is_living: true, last_refreshed_at: '2026-01-01' }, '2026-05-30'), true)
  assertEquals(isStale({ is_living: true, last_refreshed_at: '2026-05-25' }, '2026-05-30'), false)
  assertEquals(isStale({ is_living: true, last_refreshed_at: null }, '2026-05-30'), true)
})

Deno.test('parseWikipediaSummary extracts text + thumbnail', () => {
  const json = { extract: 'Marsha was an activist.', thumbnail: { source: 'https://x/t.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Marsha' } } }
  assertEquals(parseWikipediaSummary(json), {
    extract: 'Marsha was an activist.',
    image_url: 'https://x/t.jpg',
    source_url: 'https://en.wikipedia.org/wiki/Marsha',
  })
})

Deno.test('parseWikipediaSummary tolerates missing fields', () => {
  assertEquals(parseWikipediaSummary({}), { extract: null, image_url: null, source_url: null })
  assertEquals(parseWikipediaSummary({ type: 'disambiguation', extract: 'x' }), { extract: null, image_url: null, source_url: null })
})
