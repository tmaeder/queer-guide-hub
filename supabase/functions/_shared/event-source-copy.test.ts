import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { sourceHtmlDescription, storedAgendaqDescription } from './event-source-copy.ts'

const prose = 'An evening of queer art, conversation and live performances with local artists and community members.'
const event = { id: 'fixture', title: 'Queer Arts Night', external_id: 'arts', start_date: '2026-11-03T19:00:00Z', end_date: null, description: 'Short source summary.' }
const source = { source_slug: 'agendaq', source_url: 'https://www.agendaq.fr/fr/agenda/arts', raw: {
  name: event.title, slug: event.external_id, start: event.start_date, end: null,
  descShort: event.description, full_description: `<p>${prose}</p><p>Doors at 19:00 &amp; live music from 20:00.</p>`,
  source_id: 'stored-source', payload_hash: 'a'.repeat(64),
} }

Deno.test('source fragments preserve paragraph structure and decode entities once', () => {
  assertEquals(sourceHtmlDescription(source.raw.full_description), `${prose}\n\nDoors at 19:00 & live music from 20:00.`)
  assertEquals(sourceHtmlDescription(`<p>${prose} &amp;quot;quoted&amp;quot;</p>`), `${prose} &quot;quoted&quot;`)
  assertEquals(sourceHtmlDescription(`<p>${prose}</p><script>invented claim</script><style>junk</style><div hidden>hidden claim</div><p aria-hidden="true">hidden claim</p><div style="display:none">hidden</div>`), prose)
})

Deno.test('source fragments reject markup reconstruction, boilerplate, short and oversized copy', () => {
  assertEquals(sourceHtmlDescription(`<p>${prose} &lt;script&gt;bad&lt;/script&gt;</p>`), null)
  assertEquals(sourceHtmlDescription('<p>Too short</p>'), null)
  assertEquals(sourceHtmlDescription(`<p>Accept cookies to read our privacy policy. ${prose}</p>`), null)
  assertEquals(sourceHtmlDescription('x'.repeat(100001)), null)
  assertEquals(sourceHtmlDescription(`<p>${'x'.repeat(20001)}</p>`), null)
})

Deno.test('captured descriptions require exact provider occurrence identity and preserve owned prose', () => {
  assertEquals(storedAgendaqDescription([source], event)?.description, `${prose}\n\nDoors at 19:00 & live music from 20:00.`)
  assertEquals(storedAgendaqDescription([source], event)?.source_payload_hash, source.raw.payload_hash)
  for (const patch of [{ title: 'Other show' }, { external_id: 'other' }, { start_date: '2026-11-04T19:00:00Z' },
    { end_date: '2026-11-04T20:00:00Z' }, { description: 'Independent editorial copy' }, { field_provenance: { description: { human_reviewed: true } } }]) {
    assertEquals(storedAgendaqDescription([source], { ...event, ...patch }), null)
  }
  assertEquals(storedAgendaqDescription([{ ...source, source_slug: 'unknown' }], event), null)
  assertEquals(storedAgendaqDescription([{ ...source, source_url: 'https://evil.example/arts' }], event), null)
  assertEquals(storedAgendaqDescription([source], { ...event, description: '' })?.source_id, 'stored-source')
})
