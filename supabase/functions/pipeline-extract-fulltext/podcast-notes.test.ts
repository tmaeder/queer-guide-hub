import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { hasCompletePodcastNotes } from './podcast-notes.ts'

const complete = 'The hosts speak with the producer about how the new film was made and how the cast prepared for its live premiere. '.repeat(4)
const podcast = { name: 'Film interview', metadata: { media_type: 'podcast', audio_url: 'https://example.test/episode.mp3' } }

Deno.test('complete RSS episode notes take precedence over page extraction', () => {
  assertEquals(hasCompletePodcastNotes(podcast, complete), true)
})

Deno.test('short notes still allow page extraction', () => {
  assertEquals(hasCompletePodcastNotes(podcast, '<p>Listen to the new episode.</p>'), false)
})

Deno.test('normal article extraction and entries without audio keep their previous path', () => {
  assertEquals(hasCompletePodcastNotes({ metadata: { media_type: 'article' } }, complete), false)
  assertEquals(hasCompletePodcastNotes({ metadata: { media_type: 'podcast' } }, complete), false)
})
