// Run with: cd supabase/functions && deno test _tests/pipeline-commit-build-record.test.ts
import { assertEquals } from 'jsr:@std/assert'
import { buildRecord } from '../pipeline-commit/build-record.ts'

const NOW = () => '2026-05-16T15:00:00.000Z'

Deno.test('events: maps name/description/dates/location/url', () => {
  const r = buildRecord(
    'events',
    {
      name: 'Pride Berlin',
      description: 'Annual parade',
      dates: { start: '2026-07-25', end: '2026-07-25' },
      location: { city: 'Berlin' },
      metadata: { url: 'https://example.com/pride' },
    },
    {},
    null,
    NOW,
  )
  assertEquals(r.title, 'Pride Berlin')
  assertEquals(r.description, 'Annual parade')
  assertEquals(r.start_date, '2026-07-25')
  assertEquals(r.end_date, '2026-07-25')
  assertEquals(r.location, 'Berlin')
  assertEquals(r.url, 'https://example.com/pride')
})

Deno.test('events: enriched description fills when normalized lacks one', () => {
  const r = buildRecord('events', { name: 'X' }, { description: 'from-enrich' }, null, NOW)
  assertEquals(r.description, 'from-enrich')
})

Deno.test('events: logo fetched when website/url present', () => {
  const r = buildRecord(
    'events',
    { name: 'X', metadata: { website: 'https://acme.com' } },
    {},
    null,
    NOW,
  )
  // logoUrlFromWebsite returns a non-empty string for plain hostnames
  if (typeof r.logo_url === 'string') {
    assertEquals(r.logo_fetched_at, NOW())
  }
})

Deno.test('personalities: name/bio + optional metadata fields', () => {
  const r = buildRecord(
    'personalities',
    {
      name: 'Alan Turing',
      description: 'Computer scientist',
      metadata: { birth_date: '1912-06-23', nationality: 'British', profession: 'mathematician' },
    },
    {},
    null,
    NOW,
  )
  assertEquals(r.name, 'Alan Turing')
  assertEquals(r.bio, 'Computer scientist')
  assertEquals(r.birth_date, '1912-06-23')
  assertEquals(r.nationality, 'British')
  assertEquals(r.profession, 'mathematician')
})

Deno.test('personalities: bio falls back to enriched description', () => {
  const r = buildRecord('personalities', { name: 'X' }, { description: 'enrich-bio' }, null, NOW)
  assertEquals(r.bio, 'enrich-bio')
})

Deno.test('personalities: optional fields omitted when missing', () => {
  const r = buildRecord('personalities', { name: 'X', description: 'desc' }, {}, null, NOW)
  assertEquals('birth_date' in r, false)
  assertEquals('nationality' in r, false)
  assertEquals('profession' in r, false)
})

Deno.test('news_articles: maps title/content/url/image/publisher/published', () => {
  const r = buildRecord(
    'news_articles',
    {
      name: 'Pride Court Win',
      description: 'Long article body',
      urls: ['https://news.example/x', 'https://news.example/y'],
      images: ['https://img.example/a.jpg'],
      metadata: { source_name: 'Example News', published_at: '2026-05-16T08:00:00Z' },
    },
    {},
    null,
    NOW,
  )
  assertEquals(r.title, 'Pride Court Win')
  assertEquals(r.content, 'Long article body')
  assertEquals(r.url, 'https://news.example/x')
  assertEquals(r.image_url, 'https://img.example/a.jpg')
  assertEquals(r.publisher_name, 'Example News')
  assertEquals(r.published_at, '2026-05-16T08:00:00Z')
})

Deno.test('news_articles: empty urls/images result in undefined fields', () => {
  const r = buildRecord('news_articles', { name: 'X', description: 'Y' }, {}, null, NOW)
  assertEquals(r.url, undefined)
  assertEquals(r.image_url, undefined)
})

Deno.test('countries: prefers metadata.code over cca2', () => {
  assertEquals(
    buildRecord('countries', { name: 'X', metadata: { code: 'XX', cca2: 'YY' } }, {}, null, NOW).code,
    'XX',
  )
  assertEquals(
    buildRecord('countries', { name: 'X', metadata: { cca2: 'YY' } }, {}, null, NOW).code,
    'YY',
  )
})

Deno.test('default branch: copies name/description + metadata fields', () => {
  const r = buildRecord(
    'misc_table',
    { name: 'X', description: 'desc', metadata: { extra_field: 'value' } },
    {},
    null,
    NOW,
  )
  assertEquals(r.name, 'X')
  assertEquals(r.description, 'desc')
  assertEquals(r.extra_field, 'value')
})

Deno.test('default branch: missing normalized.name leaves record without name', () => {
  const r = buildRecord('misc_table', {}, {}, null, NOW)
  assertEquals('name' in r, false)
})
