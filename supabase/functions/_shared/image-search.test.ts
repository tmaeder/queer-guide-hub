import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { fetchFromPexels, fetchFromUnsplash, fetchFromWikimedia } from './image-search.ts'

Deno.test('provider parsers preserve missing captions instead of inventing query evidence', async () => {
  const saved = globalThis.fetch
  try {
    globalThis.fetch = async input => {
      const data = new URL(String(input)).hostname === 'api.pexels.com'
        ? { photos: [{ id: 1, src: { large: 'https://images.test/a.jpg', medium: 'https://images.test/a.jpg' }, width: 1600, height: 1000 }] }
        : { results: [{ id: '2', urls: { regular: 'https://images.test/b.jpg', small: 'https://images.test/b.jpg' }, user: { name: 'Creator', links: { html: 'https://images.test/creator' } }, width: 1600, height: 1000 }] }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    }
    assertEquals((await fetchFromPexels('fixture', 'York UK pride'))[0].alt, '')
    assertEquals((await fetchFromUnsplash('fixture', 'York UK pride'))[0].alt, '')
  } finally { globalThis.fetch = saved }
})

Deno.test('Commons parser exposes actual WGS84 evidence, faithful credits and no assumed licence', async () => {
  const saved = globalThis.fetch
  try {
    const info = { mime: 'image/jpeg', width: 1600, height: 1000, url: 'https://images.test/york.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:York.jpg' }
    globalThis.fetch = async () => new Response(JSON.stringify({ query: { pages: {
      1: { pageid: 1, title: 'File:York.jpg', imageinfo: [{ ...info, extmetadata: {
        ImageDescription: { value: '<p>York Pride &amp; celebration</p>' },
        Artist: { value: '<a href="https://images.test/creator">S&#252;ßen &amp; Co</a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        GPSLatitude: { value: '53.96' }, GPSLongitude: { value: '-1.08' }, GPSMapDatum: { value: 'WGS-84' },
      } }] },
      2: { pageid: 2, title: 'File:York other.jpg', imageinfo: [{ ...info, extmetadata: {} }] },
    } } }), { headers: { 'Content-Type': 'application/json' } })
    const rows = await fetchFromWikimedia('York pride')
    assertEquals(rows[0].alt, 'York Pride & celebration')
    assertEquals(rows[0].photographer, 'Süßen & Co')
    assertEquals(rows[0].location, { latitude: 53.96, longitude: -1.08, datum: 'WGS-84', source: 'commons_extended_metadata' })
    assertEquals(rows[1].license, undefined)
    assertEquals(rows[1].location, undefined)
  } finally { globalThis.fetch = saved }
})

