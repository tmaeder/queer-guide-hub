import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { repairReplacementChars, sourceTextFromMarkup } from './repair-replacement-chars.ts'

const F = '�'
// Shape of a real queer.de article page (decoded correctly), and the row the
// broken fetcher stored for it.
const page = sourceTextFromMarkup(`<html><body><h1>EPPride: Gerben Horst f&uuml;hrt queeres EVP-Netzwerk</h1>
<p>Der Niederländer Gerben Horst führt künftig die queeren Gruppen an.</p>
<p>Auf den größten Festivalbühnen der Welt – „wirklich“ – feierte er.</p></body></html>`)

Deno.test('restores umlauts and ß from context', () => {
  const r = repairReplacementChars(`Der Niederl${F}nder Gerben Horst f${F}hrt k${F}nftig`, page)
  assertEquals(r.text, 'Der Niederländer Gerben Horst führt künftig')
  assertEquals([r.repaired, r.remaining], [3, 0])
})

Deno.test('a run of k replacement chars restores k characters', () => {
  assertEquals(repairReplacementChars(`den gr${F}${F}ten Festivalb${F}hnen`, page).text, 'den größten Festivalbühnen')
})

Deno.test('windows-1252 punctuation (dash, low/high quotes)', () => {
  assertEquals(repairReplacementChars(`der Welt ${F} ${F}wirklich${F} ${F} feierte`, page).text, 'der Welt – „wirklich“ – feierte')
})

Deno.test('entities in the source are decoded before matching', () => {
  assertEquals(repairReplacementChars(`Gerben Horst f${F}hrt queeres`, page).text, 'Gerben Horst führt queeres')
})

Deno.test('no context in the source -> left in place and counted, never guessed', () => {
  const r = repairReplacementChars(`ganz anderer Satz mit ${F}berraschung`, page)
  assertEquals(r.text, `ganz anderer Satz mit ${F}berraschung`)
  assertEquals([r.repaired, r.remaining], [0, 1])
})

Deno.test('ambiguous context -> left in place', () => {
  const src = 'die Schön und die Schän'
  assertEquals(repairReplacementChars(`die Sch${F}n`, src).remaining, 1)
})

Deno.test('clean text is returned untouched', () => {
  assertEquals(repairReplacementChars('nichts kaputt', page), { text: 'nichts kaputt', repaired: 0, remaining: 0 })
})
