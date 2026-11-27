import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { feedTranscriptLinks, podcastTranscriptLinks, transcriptUrl } from './podcast-transcripts.ts'

Deno.test('transcripts: sound credits and cited news transcripts are not episode transcripts', () => {
  assertEquals(podcastTranscriptLinks('http://www.freesound.org/people/a/sounds/123/Transcript:A story.'), [])
  assertEquals(podcastTranscriptLinks('<a href="https://news.test/science-60-minutes-transcript/">Teens prove a theorem</a>'), [])
  assertEquals(podcastTranscriptLinks('News sources: https://news.test/60-minutes-transcript/'), [])
  assertEquals(transcriptUrl('https://example.test/123http://other.test/Transcript:A'), null)
})

Deno.test('transcripts: publisher archive moves keep archive labels even for old episode metadata', () => {
  for (const [url, expected] of [
    ['https://www.howitendspodcast.com/how-it-ends-podcast-transcripts', 'https://howitendsstudio.com/transcripts'],
    ['https://www.thelogbooks.org/transcript/s3-e10-thank-you-for-being-here-transcript', 'https://auntnell.com/projects/the-log-books/'],
  ]) {
    const links = podcastTranscriptLinks('', [{ url, scope: 'episode', source: 'show_notes' }])
    assertEquals(links[0].scope, 'show')
    assertEquals(links[0].url, expected)
  }
  assertEquals(podcastTranscriptLinks('<a href="https://publisher.test/show-transcripts">Transcripts for this episode</a>')[0].scope, 'show')
})

Deno.test('transcripts: wrong Buzzsprout episode IDs and editor forms are rejected', () => {
  const links = [
    { url: 'https://www.buzzsprout.com/903484/6177556/transcript', source: 'feed', scope: 'episode' },
    { url: 'https://www.buzzsprout.com/903484/6322228/transcript', source: 'feed', scope: 'episode' },
  ]
  assertEquals(podcastTranscriptLinks('', links, 'https://publisher.test/episode', 'https://www.buzzsprout.com/903484/episodes/6322228-title.mp3').map((l) => l.url), [links[1].url])
  assertEquals(transcriptUrl('https://www.buzzsprout.com/903484/episodes/6177556-title/transcript/new'), null)
})

Deno.test('transcripts: discovers a publisher episode anchor before cleanup removes it', () => {
  assertEquals(podcastTranscriptLinks('<p>Read the <a href="https://publisher.test/ep-42">transcript for this episode</a>.</p>'), [
    { url: 'https://publisher.test/ep-42', scope: 'episode', source: 'show_notes' },
  ])
  assertEquals(podcastTranscriptLinks('Transcript: https://publisher.test/42.txt')[0].scope, 'episode')
})

Deno.test('transcripts: preserves a show archive without claiming an episode match', () => {
  for (const notes of [
    'Transcripts available at https://rustyquill.com/transcripts/the-magnus-protocol/',
    'Additional transcripts: https://publisher.test/episodes',
    '<a href="https://publisher.test/transcripts">All transcripts</a>',
  ]) assertEquals(podcastTranscriptLinks(notes)[0].scope, 'show')
})

Deno.test('transcripts: unrelated promotions and email requests are not transcripts', () => {
  assertEquals(podcastTranscriptLinks('Request a transcript by emailing transcripts@example.com. Support us: https://patreon.com/show'), [])
  assertEquals(podcastTranscriptLinks('<p>Transcript available on request.</p><a href="https://shop.test">Buy merch</a>'), [])
  assertEquals(podcastTranscriptLinks('Transcripts are not available. Follow us: https://social.test/show'), [])
})

Deno.test('transcripts: resolves explicit relative anchors, decodes entities and deduplicates', () => {
  const notes = '&lt;a href=&quot;/ep-42-transcript?a=1&amp;amp;b=2&quot;&gt;Episode transcript&lt;/a&gt;'
  assertEquals(podcastTranscriptLinks(notes, [], 'https://publisher.test/ep-42'), [
    { url: 'https://publisher.test/ep-42-transcript?a=1&b=2', scope: 'episode', source: 'show_notes' },
  ])
  assertEquals(podcastTranscriptLinks('Transcript: https://publisher.test/42.txt https://publisher.test/42.txt').length, 1)
})

Deno.test('transcripts: rejects unsafe, credential-bearing and malformed destinations', () => {
  for (const url of ['javascript:alert(1)', 'data:text/plain,Hello', 'https://user:secret@publisher.test/t', 'http://127.0.0.1/t', 'http://169.254.169.254/t', 'http://[::1]/t', 'http://localhost/t', 'http://0x7f000001/t', 'not a URL']) {
    assertEquals(transcriptUrl(url), null, url)
    assertEquals(podcastTranscriptLinks('<a href="' + url + '">Transcript</a>'), [])
  }
})

Deno.test('transcripts: reads namespace aliases, formats and language, not foreign tags', () => {
  const feed = '<rss xmlns:p="https://podcastindex.org/namespace/1.0" xmlns:other="https://other.test"><channel>'
  const item = '<p:transcript type="text/vtt" language="es" rel="captions" url="https://publisher.test/42.vtt?a=1&amp;b=2"/><other:transcript url="https://wrong.test/t" type="text/html"/><p:transcript url="javascript:alert(1)" type="text/html"/>'
  assertEquals(feedTranscriptLinks(item, feed), [
    { url: 'https://publisher.test/42.vtt?a=1&b=2', scope: 'episode', source: 'feed', type: 'text/vtt', language: 'es' },
  ])
  assertEquals(feedTranscriptLinks('<podcast:transcript url="https://wrong.test/t" type="text/html"/>', '<rss xmlns:podcast="https://wrong.test">'), [])
})

Deno.test('transcripts: keeps format alternatives, prefers feed provenance and bounds metadata', () => {
  const declared = [
    { url: 'https://publisher.test/42.txt', scope: 'episode', source: 'feed', type: 'text/plain', language: 'en' },
    { url: 'https://publisher.test/42.vtt', scope: 'episode', source: 'feed', type: 'text/vtt' },
  ]
  const links = podcastTranscriptLinks('Transcript: https://publisher.test/42.txt', declared)
  assertEquals(links.length, 2)
  assertEquals(links[0].source, 'feed')
  assertEquals(podcastTranscriptLinks('', [...declared, { url: 'https://evil.test/t', source: 'invented' }]).length, 2)
  assertEquals(podcastTranscriptLinks('', declared.map((v) => ({ ...v, language: '<script>' })))[0].language, undefined)
})
