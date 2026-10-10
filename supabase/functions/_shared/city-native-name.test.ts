// Fixtures are the live Wikidata P1705 statements and labels fetched
// 2026-10-06 for Q1726 (Munich), Q270 (Warsaw), Q1490 (Tokyo), Q239 (Brussels),
// Q1156 (Mumbai) and Q64 (Berlin).
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { parseCityNativeName, type Claims, type Statement, type WdLabels } from './wikidata-city.ts'
import { countryLanguageCodes, LANGUAGE_NAME_TO_CODE } from './language-codes.ts'

const mono = (text: string, language: string, rank: Statement['rank'] = 'normal', ended?: string): Statement => ({
  rank,
  mainsnak: { snaktype: 'value', datavalue: { value: { text, language }, type: 'monolingualtext' } },
  ...(ended
    ? { qualifiers: { P582: [{ snaktype: 'value', datavalue: { value: { time: ended }, type: 'time' } }] } }
    : {}),
})
const labels = (o: Record<string, string>): WdLabels =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { language: k, value: v }]))

Deno.test('Munich: the label in the country language wins', () => {
  const claims: Claims = { P1705: [mono('München', 'de')] }
  assertEquals(
    parseCityNativeName(claims, labels({ en: 'Munich', de: 'München' }), ['de']),
    { name: 'München', lang: 'de', source: 'label' },
  )
})

Deno.test('Munich without labels: P1705 in the country language', () => {
  const claims: Claims = { P1705: [mono('München', 'de')] }
  assertEquals(
    parseCityNativeName(claims, undefined, ['de']),
    { name: 'München', lang: 'de', source: 'P1705' },
  )
})

Deno.test('Toronto: the label beats the corporate P1705 form (live 2026-10-07)', () => {
  const claims: Claims = { P1705: [mono('City of Toronto', 'en')] }
  assertEquals(
    parseCityNativeName(claims, labels({ en: 'Toronto', fr: 'Toronto' }), ['en', 'fr']),
    { name: 'Toronto', lang: 'en', source: 'label' },
  )
})

Deno.test('Ho Chi Minh City: a lone Khmer P1705 never beats the Vietnamese label (live 2026-10-07)', () => {
  const claims: Claims = { P1705: [mono('ក្រុងព្រៃនគរ', 'km')] }
  assertEquals(
    parseCityNativeName(claims, labels({ en: 'Ho Chi Minh City', vi: 'Thành phố Hồ Chí Minh' }), ['vi']),
    { name: 'Thành phố Hồ Chí Minh', lang: 'vi', source: 'label' },
  )
})

Deno.test('Casablanca: bidi control characters are stripped (live 2026-10-07)', () => {
  assertEquals(
    parseCityNativeName({}, labels({ ar: '\u202bالدار البيضاء' }), ['ar'])?.name,
    'الدار البيضاء',
  )
})

Deno.test('Warsaw: Polish endonym, not the German exonym', () => {
  const claims: Claims = { P1705: [mono('Warszawa', 'pl')] }
  assertEquals(
    parseCityNativeName(claims, labels({ en: 'Warsaw', de: 'Warschau', pl: 'Warszawa' }), ['pl'])?.name,
    'Warszawa',
  )
})

Deno.test('Tokyo: first P1705 in statement order wins (kanji before kana and romaji)', () => {
  const claims: Claims = {
    P1705: [mono('東京都', 'ja'), mono('とうきょうと', 'ja'), mono('Tōkyō-to', 'ja')],
  }
  assertEquals(parseCityNativeName(claims, undefined, ['ja'])?.name, '東京都')
})

Deno.test('Brussels: multilingual country keeps Wikidata order, walloon value is not a Belgian official language', () => {
  const claims: Claims = { P1705: [mono('Brussel', 'nl'), mono('Bruxelles', 'fr'), mono('Brussele', 'wa')] }
  assertEquals(
    parseCityNativeName(claims, undefined, ['nl', 'fr', 'de']),
    { name: 'Brussel', lang: 'nl', source: 'P1705' },
  )
})

Deno.test('preferred rank beats statement order', () => {
  const claims: Claims = { P1705: [mono('Brussel', 'nl'), mono('Bruxelles', 'fr', 'preferred')] }
  assertEquals(parseCityNativeName(claims, undefined, ['nl', 'fr'])?.name, 'Bruxelles')
})

Deno.test('Mumbai: a country-language label beats an off-list P1705', () => {
  // countries.languages for India is [Hindi, English]; Mumbai's native label is Marathi.
  const claims: Claims = { P1705: [mono('मुंबई', 'mr')] }
  assertEquals(
    parseCityNativeName(claims, labels({ en: 'Mumbai', hi: 'मुम्बई' }), ['hi', 'en']),
    { name: 'मुम्बई', lang: 'hi', source: 'label' },
  )
})

Deno.test('a single off-list P1705 is accepted only when no country-language label exists', () => {
  const claims: Claims = { P1705: [mono('मुंबई', 'mr')] }
  assertEquals(
    parseCityNativeName(claims, labels({ de: 'Mumbai' }), ['hi']),
    { name: 'मुंबई', lang: 'mr', source: 'P1705' },
  )
})

Deno.test('two unmatched P1705 values are ambiguous and fall through to the label', () => {
  const claims: Claims = { P1705: [mono('A', 'xx'), mono('B', 'yy')] }
  assertEquals(
    parseCityNativeName(claims, labels({ cs: 'Praha' }), ['cs']),
    { name: 'Praha', lang: 'cs', source: 'label' },
  )
})

Deno.test('deprecated and ended P1705 values are ignored', () => {
  const claims: Claims = {
    P1705: [mono('Königsberg', 'de', 'deprecated'), mono('Old', 'ru', 'normal', '+1946-07-04T00:00:00Z')],
  }
  assertEquals(
    parseCityNativeName(claims, labels({ ru: 'Калининград' }), ['ru']),
    { name: 'Калининград', lang: 'ru', source: 'label' },
  )
})

Deno.test('English-speaking country with no P1705: the English label is the local name', () => {
  assertEquals(parseCityNativeName({}, labels({ en: 'Brisbane' }), ['en'])?.name, 'Brisbane')
})

Deno.test('nothing corroborates a value: null, never a guess', () => {
  assertEquals(parseCityNativeName({}, labels({ en: 'Foo', de: 'Fuh' }), ['pl']), null)
  assertEquals(parseCityNativeName({}, undefined, []), null)
})

Deno.test('countryLanguageCodes keeps country order, dedupes, reports unmapped names', () => {
  assertEquals(
    countryLanguageCodes(['Dutch', 'French', 'German', 'Klingon', 'Mandarin', 'Chinese']),
    { codes: ['nl', 'fr', 'de', 'zh'], unmapped: ['Klingon'] },
  )
  assertEquals(countryLanguageCodes(null), { codes: [], unmapped: [] })
})

Deno.test('every mapped code satisfies the cities_name_local_shape CHECK', () => {
  const re = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/
  for (const [name, code] of Object.entries(LANGUAGE_NAME_TO_CODE)) {
    assertEquals(re.test(code), true, `${name} -> ${code}`)
  }
})
