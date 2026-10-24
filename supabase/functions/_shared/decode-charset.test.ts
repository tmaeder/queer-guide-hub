import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decodeBytes, charsetFromContentType, hasReplacementChar } from './decode-charset.ts'

// Real shape of the queer.de feed: ISO-8859-1 bytes, declared only in the XML
// prolog, served as a bare `application/xml`.
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
const utf8 = (s: string) => new TextEncoder().encode(s)

Deno.test('queer.de feed: charset from the XML declaration', () => {
  const xml = '<?xml version="1.0" encoding="iso-8859-1"?><rss><title>Bühne für Gefühlschaos, große Straße</title></rss>'
  const r = decodeBytes(latin1(xml), 'application/xml')
  assertEquals(r.source, 'document')
  assertEquals(hasReplacementChar(r.text), false)
  assertEquals(r.text.includes('Bühne für Gefühlschaos, große'), true)
})

Deno.test('the old forced UTF-8 decode is what produced U+FFFD', () => {
  const bytes = latin1('<?xml version="1.0" encoding="iso-8859-1"?><t>Bühne</t>')
  assertEquals(new TextDecoder('utf-8').decode(bytes).includes('B�hne'), true)
})

Deno.test('Content-Type header charset wins', () => {
  const r = decodeBytes(latin1('<html>Sängerin</html>'), 'text/html; charset=ISO-8859-1')
  assertEquals(r.source, 'header')
  assertEquals(r.text, '<html>Sängerin</html>')
})

Deno.test('HTML meta charset', () => {
  const r = decodeBytes(latin1('<html><head><meta charset="iso-8859-1"></head>Debüt</html>'), 'text/html')
  assertEquals(r.text.includes('Debüt'), true)
})

Deno.test('windows-1252 curly quotes under an iso-8859-1 label', () => {
  const r = decodeBytes(Uint8Array.from([0x93, 0x61, 0x94]), 'text/html; charset=iso-8859-1')
  assertEquals(r.text, '“a”')
})

Deno.test('UTF-8 stays UTF-8 (default and declared)', () => {
  const s = 'Rainbow Games in Tāmaki Makaurau — “queer joy”'
  assertEquals(decodeBytes(utf8(s), 'application/rss+xml').text, s)
  assertEquals(decodeBytes(utf8(s), 'text/xml; charset=utf-8').text, s)
})

Deno.test('undeclared non-UTF-8 falls back to windows-1252, not U+FFFD', () => {
  const r = decodeBytes(latin1('<rss>für</rss>'), 'application/xml')
  assertEquals(r.source, 'fallback')
  assertEquals(r.text, '<rss>für</rss>')
})

Deno.test('a UTF-8 sequence cut by a byte cap does not trigger the Latin-1 fallback', () => {
  const full = utf8('<rss>für ü')
  const cut = full.subarray(0, full.length - 1)
  const r = decodeBytes(cut, 'application/xml', { truncated: true })
  assertEquals(r.charset, 'utf-8')
  assertEquals(r.text.startsWith('<rss>für '), true)
})

Deno.test('unknown declared label falls through instead of throwing', () => {
  assertEquals(charsetFromContentType('text/html; charset=x-bogus'), null)
  assertEquals(decodeBytes(utf8('ok ä'), 'text/html; charset=x-bogus').text, 'ok ä')
})
