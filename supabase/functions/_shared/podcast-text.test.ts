import { assertEquals, assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { cleanPodcastNotes, podcastText, podcastSourceNotes, PODCAST_SUMMARY_LIMIT } from './podcast-text.ts'

Deno.test('podcasts: new imports omit sponsor codes, empty social labels and host boilerplate', () => {
  const notes = `The guests discuss attraction and gender euphoria.
Download FEELD: https://example.com/app
Beducated: use code COLLECTIVE60
TomboyX code: code QUEER15 for 15% off your order
Wet For Her: use code WETFORQUEERCOLLECTIVE for 10% off
Plume: use code QC20 to save 20
Instagram: https://instagram.com/example
Tiktok:
Facebook:
Website:
Email: podcast@example.com
12:55 Sponsors: Beducated & Plume
38:30 Bottom Growth
Sources:
Hosted by Simplecast, an AdsWizz company.`
  assertEquals(cleanPodcastNotes(notes), 'The guests discuss attraction and gender euphoria.\n\n12:55 Sponsors: Beducated & Plume\n\n38:30 Bottom Growth')
  assertEquals(podcastText(notes).summary, 'The guests discuss attraction and gender euphoria.')
  assertEquals(cleanPodcastNotes('Sources: Queer community archives\nInstagram shapes queer visibility.'), 'Sources: Queer community archives\n\nInstagram shapes queer visibility.')
})

Deno.test('podcasts: keeps episode topics and chapters, removes promotional tails', () => {
  const result = podcastText('Mike and Kyle discuss queer friendship. In this episode: News- 6:12 || Main Topic- 12:09 If you want to join Mike and Kyle on our cruise, visit example.com. On the Patreon bonus segment, Mike talks about cooking. If you want to support our show, go to www.patreon.com/example.')
  assertStringIncludes(result.notes, 'Main Topic- 12:09')
  assertEquals(result.summary, 'Mike and Kyle discuss queer friendship.')
  assertEquals(/cruise|Patreon|support our/.test(result.notes), false)
})

Deno.test('podcasts: removes interleaved ads without dropping later editorial paragraphs', () => {
  const result = cleanPodcastNotes('<p>Alex discusses housing for trans people.</p><p>This episode is sponsored by Example. Use our code PRIDE.</p><p>Guest Sam shares their experience of community organizing.</p>')
  assertStringIncludes(result, 'Alex discusses housing')
  assertStringIncludes(result, 'Guest Sam shares')
  assertEquals(/sponsored|PRIDE/.test(result), false)
})

Deno.test('podcasts: decodes nested markup, deduplicates and removes URL/hashtag walls', () => {
  const result = cleanPodcastNotes('&lt;p&gt;A conversation about queer art &amp;amp; identity.&lt;/p&gt;\nA conversation about queer art & identity.\nReading recommendations https://bookshop.org/shop/artist\n#queer #podcast #pride\nFollow us on Instagram @example')
  assertEquals(result, 'A conversation about queer art & identity.\n\nReading recommendations')
})

Deno.test('podcasts: does not confuse editorial sponsorship discussion with a call to action', () => {
  const input = 'The hosts discuss how Patreon and sponsorship shape independent media. They question whether donations affect editorial independence.'
  assertEquals(podcastText(input).summary, input)
})

Deno.test('podcasts: preserves multilingual descriptions, warnings and timestamps', () => {
  const input = '<p>Wir sprechen mit José über queeres Leben in Zürich.</p><p>Inhaltswarnung: Gewalt.</p><p>12:34 Gespräch mit José</p><p>東京のクィアコミュニティについて話します。</p>'
  const result = podcastText(input)
  assertStringIncludes(result.notes, 'Inhaltswarnung: Gewalt.')
  assertStringIncludes(result.notes, '12:34 Gespräch mit José')
  assertStringIncludes(result.notes, '東京のクィアコミュニティ')
  assertStringIncludes(result.summary, 'José')
})

Deno.test('podcasts: promotional-only and missing descriptions never invent episode details', () => {
  for (const input of ['', 'Follow us on Instagram. Subscribe to our podcast. Donate here https://patreon.com/test']) {
    assertEquals(podcastText(input), { notes: '', summary: '', method: 'unavailable' })
    assertEquals(podcastText(input, 'Invented topic with enough text to look like a usable summary.').summary, '')
  }
})

Deno.test('podcasts: caps extracts at a word boundary and uses only supplied text', () => {
  const text = 'An extended discussion about queer history and local community archives '.repeat(20)
  const result = podcastText(text)
  assert(result.summary.length <= PODCAST_SUMMARY_LIMIT)
  assert(text.startsWith(result.summary.replace(/…$/, '')))
  assertEquals(result.method, 'show_notes_extract')
})

Deno.test('podcasts: accepts short supplied AI summaries and rejects oversized ones', () => {
  const notes = 'A conversation about queer artists and their community archives in Zürich.'
  assertEquals(podcastText(notes, 'The hosts discuss queer artists and community archives in Zürich.').method, 'ai_show_notes')
  assertEquals(podcastText(notes, 'word '.repeat(200)).method, 'show_notes_extract')
  assertEquals(cleanPodcastNotes(cleanPodcastNotes(notes)), cleanPodcastNotes(notes))
})

Deno.test('podcasts: recovers paragraph boundaries only if the source words still match', () => {
  const raw = 'A discussion of queer archives.\n\nGuest Alex joins the hosts.'
  assertEquals(podcastSourceNotes(raw.replace(/\s+/g, ' '), raw), raw)
  assertEquals(podcastSourceNotes('An editor corrected the guest name to Sam.', raw), 'An editor corrected the guest name to Sam.')
})

Deno.test('podcasts: explicit episode description outranks a rhetorical opening', () => {
  const result = podcastText('Are you ready for a relationship? In this episode, we discuss emotional readiness and loneliness. The hosts share their experiences of dating.')
  assertEquals(result.summary, 'In this episode, we discuss emotional readiness and loneliness. The hosts share their experiences of dating.')
})

Deno.test('podcasts: decorated headings and subscriber sections do not contaminate the overview', () => {
  const result = podcastText('༺𓆩༒︎𓆪༻ DISCUSSED IN THIS EPISODE ༺𓆩༒︎𓆪༻\nConnor’s Vogue cover and queer representation\nThe upcoming Bell Jar adaptation\n⛧° 。 ⋆༺♱ ONLY ON PATREON ♱༻⋆\nBonus subscriber segment\nFOLLOW US\n@showname\nContent warning: violence.')
  assertEquals(result.summary, 'Connor’s Vogue cover and queer representation. The upcoming Bell Jar adaptation. Content warning: violence.')
  assertEquals(/PATREON|subscriber|𓆩|@showname/.test(result.notes), false)
})

Deno.test('podcasts: preserves hashtag subjects and guest handles inside editorial prose', () => {
  const text = 'Join us this week as we discuss #MeToo with @sam_archives. Our guest explains how #BlackLivesMatter changed community organizing.'
  assertEquals(podcastText(text).summary, text)
  assertEquals(cleanPodcastNotes('#queer #podcast #pride\n@showname'), '')
})

Deno.test('podcasts: keeps editorial invitations while removing subscription invitations', () => {
  const text = 'Join our hosts as they explore queer cinema and interview Alex.'
  const result = podcastText(text + ' Join us on Patreon for bonus episodes.')
  assertEquals(result.summary, text)
  assertEquals(result.notes, text)
})

Deno.test('podcasts: malformed whitespace runs cannot exhaust the import CPU budget', () => {
  const started = performance.now()
  const text = 'Alex discusses queer archives.' + ' '.repeat(90_000) + ' Guest Sam explains their work.'
  assertEquals(podcastText(text).summary, 'Alex discusses queer archives. Guest Sam explains their work.')
  assertEquals(cleanPodcastNotes(' '.repeat(100_000)), '')
  assert(performance.now() - started < 1000, 'Whitespace normalization must stay within the edge CPU budget')
})

Deno.test('podcasts: summary cuts remain valid UTF-8 even inside a dense emoji run', () => {
  const { summary } = podcastText('Queer art ' + '🌈'.repeat(220) + ' community history')
  assert(summary.length <= PODCAST_SUMMARY_LIMIT)
  assertEquals(new TextDecoder().decode(new TextEncoder().encode(summary)), summary)
})
