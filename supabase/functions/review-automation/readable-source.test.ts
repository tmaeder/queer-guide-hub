import test from 'node:test'
import assert from 'node:assert/strict'
import { readableSource } from './readable-source.ts'
import { fetchEvidence } from './evidence.ts'

const programme = 'The official venue programme identifies Example Theatre at 12 Market Street, Example Town. The performance is on 21 November 2026 at 20:30. '

test('navigation cannot crowd the actual page out of the existing evidence limit', async () => {
  const html = '<title>Example Theatre</title><nav>' + 'Unrelated council service links. '.repeat(1500) +
    '</nav><main><header><h1>Performance at 20:30</h1></header><p>' + programme + '</p></main>'
  const result = await fetchEvidence('https://example.org/programme', async () =>
    new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  assert.ok(result.text.includes('12 Market Street'))
  assert.ok(result.text.includes('Performance at 20:30'))
  assert.ok(!result.text.includes('Unrelated council'))
  assert.ok(result.text.length < 18000)
})

test('head structured event dates and footer address survive main-content selection', () => {
  const html = '<title>Official programme</title><script type=" application/ld+json ">' +
    '{"@type":"Event","startDate":"2026-11-21T20:30:00+01:00"}</script>' +
    '<main><p>' + programme + '</p></main><footer>Operator contact: 15 Public Street, 12345 Example.</footer>'
  const text = readableSource(html, 'text/html')
  assert.ok(text.includes('2026-11-21T20:30:00+01:00'))
  assert.ok(text.includes('15 Public Street'))
  assert.ok(text.includes('12 Market Street'))
})

test('body fallback retains usable pages without a main element and decodes entities', () => {
  const text = readableSource('<nav>menu only</nav><section><h1>Stadt M&uuml;nchen</h1><p>' + programme + '</p></section>', 'text/html')
  assert.ok(text.includes('Stadt München'))
  assert.ok(text.includes('12 Market Street'))
  assert.ok(!text.includes('menu only'))
})

test('hidden, executable and template content is not readable evidence', () => {
  const html = '<main hidden>HIDDEN WRONG ADDRESS</main><div role="navigation">MENU WRONG ADDRESS</div>' +
    '<main><script>EXECUTABLE WRONG ADDRESS</script><style>CSS WRONG ADDRESS</style>' +
    '<template>TEMPLATE WRONG ADDRESS</template><p aria-hidden="true">ARIA WRONG ADDRESS</p><p>' + programme + '</p></main>'
  const text = readableSource(html, 'text/html')
  assert.ok(text.includes('12 Market Street'))
  assert.ok(!text.includes('WRONG ADDRESS'))
})

test('JSON and plain text preserve literal angle brackets', () => {
  const json = '{"name":"Example <Theatre>","description":"' + programme + '"}'
  assert.equal(readableSource(json, 'application/ld+json'), json)
  const plain = 'Example <Theatre> ' + programme
  assert.equal(readableSource(plain, 'text/plain').trim(), plain.trim())
})

test('adjacent block elements retain separate names, places and dates', () => {
  assert.equal(readableSource('<h1>Film Night</h1><p>Basel</p><p>2026-11-19</p><div>Doors<br>20:00</div>', 'text/html'),
    'Film Night Basel 2026-11-19 Doors 20:00')
})

test('main and fallback text retain the existing 18000-character bound', () => {
  for (const text of [readableSource('<main>' + programme.repeat(300) + '</main>', 'text/html'),
    readableSource(programme.repeat(300), 'text/plain')]) {
    assert.equal(text.length, 18000)
    assert.ok(text.endsWith('[Source text omitted beyond the 18000-character evidence limit.]'))
  }
  assert.ok(!readableSource(programme, 'text/plain').includes('omitted'))
})

test('a navigation-only response is not independent source evidence', async () => {
  await assert.rejects(fetchEvidence('https://example.org/', async () => new Response(
    '<nav>' + 'Service navigation link '.repeat(200) + '</nav>',
    { headers: { 'content-type': 'text/html' } })), /insufficient readable text/)
})
