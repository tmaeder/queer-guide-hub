import assert from 'node:assert/strict'
import { extractGaychEventArtwork } from '../_shared/gaych-parse.ts'
import { imageCandidates } from '../_shared/event-gap-core.ts'

const page = 'https://gay.ch/parties/gravity-10'
const original = page + '/@@download/image/Gravity_02-12-2017.jpg'
const thumbnail = page + '/@@images/6f981b4d-44f6-4051-8201-791b19395074.jpeg'
const event = { id: 'event', title: 'Gravity mit DJ Alexio', start_date: '2017-12-02T22:00:00Z' }
const node = { '@context': 'https://schema.org', '@type': 'Event', name: event.title, startDate: '2017-12-02T23:00:00+01:00', image: thumbnail }
const meta = (url: string) => `<meta content="${url}" property="og:image">`
const script = (value: unknown, attrs = '') => `<script${attrs}>${JSON.stringify(value)}</script>`
const html = (value: unknown = node, url = original, attrs = '') => `<html><head>${meta(url)}</head><body>${script(value, attrs)}</body></html>`

Deno.test('gay.ch bare Event selects the explicitly published original before its thumbnail', () => {
  assert.deepEqual(extractGaychEventArtwork(html(), event, page), [original, thumbnail])
  assert.deepEqual(imageCandidates(html(), event, page), [original, thumbnail])
  assert.deepEqual(imageCandidates(html(node, original, ' type="application/ld+json"'), event, page), [original, thumbnail])
})
Deno.test('gay.ch original requires a named Event with a valid matching occurrence', () => {
  for (const change of [{ name: 'Different event' }, { '@type': 'Place' }, { '@context': 'https://example.org' },
    { startDate: '' }, { startDate: 'invalid' }, { startDate: '2017-12-02not-a-date' },
    { startDate: '2017-02-30' }, { startDate: '2018-12-02' }]) {
    assert.deepEqual(extractGaychEventArtwork(html({ ...node, ...change }), event, page), [])
  }
  assert.deepEqual(extractGaychEventArtwork(html(), { ...event, start_date: '' }, page), [])
  assert.deepEqual(extractGaychEventArtwork(html(), { ...event, title: '' }, page), [])
  assert.deepEqual(imageCandidates('<head>' + meta(original) + '</head>', event, page), [])
})
Deno.test('gay.ch original cannot escape the exact event page namespace', () => {
  for (const url of ['https://other.example/parties/gravity-10', 'https://gay.ch/parties',
    page + '?other=1', page + '#other', 'https://user@gay.ch/parties/gravity-10']) {
    assert.deepEqual(extractGaychEventArtwork(html(), event, url), [])
  }
  for (const image of ['https://gay.ch/@@download/image/logo.jpg',
    'https://gay.ch/parties/other/@@download/image/poster.jpg',
    'https://other.example/poster.jpg', original + '?size=large', original + '#other',
    page + '/@@download/image/../../../other.jpg']) {
    assert.deepEqual(extractGaychEventArtwork(html({ ...node, image }, image), event, page), [])
  }
})
Deno.test('gay.ch generic previews, JavaScript, comments and body metadata do not supply originals', () => {
  assert.deepEqual(extractGaychEventArtwork(html(node, 'https://gay.ch/site-cover.jpg'), event, page), [thumbnail])
  assert.deepEqual(extractGaychEventArtwork(html(node, original, ' type="text/javascript"'), event, page), [])
  assert.deepEqual(extractGaychEventArtwork('<head>' + meta(original) + '</head><!--' + script(node) + '-->', event, page), [])
  assert.deepEqual(extractGaychEventArtwork('<head></head><body>' + meta(original) + script(node) + '</body>', event, page), [thumbnail])
  const fakeMeta = '<head><script>const markup = \'' + meta(original) + '\'</script></head>' + script(node)
  assert.deepEqual(extractGaychEventArtwork(fakeMeta, event, page), [thumbnail])
  assert.deepEqual(extractGaychEventArtwork('<head>' + meta(original) + '</head><script>window.event = ' + JSON.stringify(node) + '</script>', event, page), [])
})
Deno.test('gay.ch ambiguous Event objects cannot authorize an original', () => {
  const ambiguous = html() + script({ ...node, image: page + '/@@images/other.jpeg' })
  assert.deepEqual(extractGaychEventArtwork(ambiguous, event, page), [])
  assert.deepEqual(extractGaychEventArtwork(html() + script(node), event, page), [original, thumbnail])
  assert.deepEqual(extractGaychEventArtwork(html().replace('</head>', meta(page + '/@@download/image/second.jpg') + '</head>'), event, page), [thumbnail])
})
