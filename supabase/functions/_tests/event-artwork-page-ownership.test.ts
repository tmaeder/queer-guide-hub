import assert from 'node:assert/strict'
import { imageCandidates, sourceArtwork } from '../_shared/event-gap-core.ts'
const event = { id: 'event', title: 'Queer Arts Night', start_date: '2026-11-03T19:00:00Z' }
const page = 'https://arts.example.org/show'
const poster = 'https://posters.example.org/event-123.jpg'
const html = (node: Record<string, unknown>, extra = '') => '<script type="application/ld+json">' + JSON.stringify(node) + '</script>' + extra
const source = { '@type': 'Event', name: event.title, startDate: event.start_date, image: poster }
Deno.test('event artwork requires a named dated Event, excluding generic social metadata', () => {
  for (const tag of ['og:image', 'twitter:image', 'og:image:secure_url']) {
    assert.deepEqual(imageCandidates(`<meta property="${tag}" content="${poster}">`, event, page), [])
  }
  assert.deepEqual(imageCandidates(html(source, '<meta property="og:image" content="https://posters.example.org/logo.jpg">'), event, page), [poster])
  assert.deepEqual(imageCandidates(html({ ...source, image: { url: '/event-poster.jpg' } }), event, page), ['https://arts.example.org/event-poster.jpg'])
  assert.deepEqual(imageCandidates(html({ ...source, name: 'Different event' }), event, page), [])
  for (const startDate of ['', 'invalid', '2026-11-03not-a-date', '2026-02-30', '2027-11-03T19:00:00Z']) {
    assert.deepEqual(imageCandidates(html({ ...source, startDate }), event, page), [])
  }
  assert.deepEqual(imageCandidates(html(source), { ...event, start_date: '' }, page), [])
})
Deno.test('event artwork excludes known stock and city-cover namespaces even inside Event metadata', () => {
  for (const image of ['https://images.pexels.com/photos/123/photo.jpeg', 'https://images.unsplash.com/photo-123', 'https://www.gayout.com/uploads/cities/berlin/cover.jpg', 'https://www.gayout.com/uploads/mega-events/night/pexels_123.jpg']) {
    assert.deepEqual(imageCandidates(html({ ...source, image }), event, page), [])
  }
})
Deno.test('registered event-owned feed posters stay available without HTML or inference', () => {
  assert.deepEqual(sourceArtwork([{ source_slug: 'agendaq', source_url: 'https://www.agendaq.fr/fr/agenda/arts', raw: { assets: [['poster', '/assets/events/arts/original.png', 'image/png', 1200, 800]] } }]), [{ url: 'https://data.agendaq.fr/assets/events/arts/original.png', source_url: 'https://www.agendaq.fr/fr/agenda/arts' }])
})
