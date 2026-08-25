import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  applyLabels,
  bestStatement,
  currentStatements,
  parseCityFacts,
  parseCityNames,
  pickAirports,
  pickUniversities,
  resolveLabels,
  type Claims,
  type Statement,
} from './wikidata-city.ts'

const qty = (amount: string, rank: Statement['rank'] = 'normal', pointInTime?: string): Statement => ({
  rank,
  mainsnak: { snaktype: 'value', datavalue: { value: { amount }, type: 'quantity' } },
  ...(pointInTime
    ? { qualifiers: { P585: [{ snaktype: 'value', datavalue: { value: { time: pointInTime } } }] } }
    : {}),
})
const str = (value: string, quals?: Statement['qualifiers']): Statement => ({
  rank: 'normal',
  mainsnak: { snaktype: 'value', datavalue: { value, type: 'string' } },
  ...(quals ? { qualifiers: quals } : {}),
})
const ent = (id: string, quals?: Statement['qualifiers']): Statement => ({
  rank: 'normal',
  mainsnak: { snaktype: 'value', datavalue: { value: { id }, type: 'wikibase-entityid' } },
  ...(quals ? { qualifiers: quals } : {}),
})
const endedAt = (time: string) => ({ P582: [{ snaktype: 'value', datavalue: { value: { time } } }] })

// --- rank: the bug this module exists to fix -------------------------------

Deno.test('bestStatement prefers preferred rank over document order (Cape Town population)', () => {
  // Real shape from Q5465: the FIRST statement is the stale 433,688.
  const claims: Claims = {
    P1082: [
      qty('+433688', 'normal', '+2001-01-01T00:00:00Z'),
      qty('+3776313', 'preferred', '+2011-01-01T00:00:00Z'),
      qty('+3776001', 'normal', '+2011-01-01T00:00:00Z'),
    ],
  }
  assertEquals(parseCityFacts(claims).population, 3776313)
})

Deno.test('bestStatement falls back to the newest point-in-time when no rank is preferred', () => {
  const claims: Claims = {
    P1082: [
      qty('+2145906', 'normal', '+2015-01-01T00:00:00Z'),
      qty('+2243739', 'normal', '+2020-01-01T00:00:00Z'),
      qty('+2113705', 'normal', '+2018-01-01T00:00:00Z'),
    ],
  }
  assertEquals(parseCityFacts(claims).population, 2243739)
})

Deno.test('bestStatement never returns a deprecated statement', () => {
  assertEquals(bestStatement([{ rank: 'deprecated', mainsnak: { snaktype: 'value', datavalue: { value: { amount: '+1' } } } }]), null)
  assertEquals(bestStatement([]), null)
  assertEquals(bestStatement(undefined), null)
})

// --- mayor: no dead mayors -------------------------------------------------

Deno.test('currentStatements excludes anything with a past end date', () => {
  // Every P6 on Cape Town / Paris / NYC carries P580+P582.
  const sts = [ent('Q445654', endedAt('+2018-10-31T00:00:00Z')), ent('Q379122', endedAt('+2011-06-01T00:00:00Z'))]
  assertEquals(currentStatements(sts).length, 0)
  assertEquals(parseCityFacts({ P6: sts }).refs.mayor, [])
})

Deno.test('currentStatements keeps a statement with no end date', () => {
  assertEquals(parseCityFacts({ P6: [ent('Q123')] }).refs.mayor, ['Q123'])
})

Deno.test('currentStatements keeps a future end date', () => {
  assertEquals(parseCityFacts({ P6: [ent('Q123', endedAt('+2099-01-01T00:00:00Z'))] }).refs.mayor, ['Q123'])
})

Deno.test('an unparseable end date counts as ENDED (never publish a maybe-former mayor)', () => {
  // snaktype 'somevalue' = "ended, date unknown".
  const sts = [ent('Q379122', { P582: [{ snaktype: 'somevalue' }] })]
  assertEquals(currentStatements(sts).length, 0)
})

// --- postal / area codes ---------------------------------------------------

Deno.test('postal codes prefer city-wide values over P518-scoped ones (Cape Town)', () => {
  const claims: Claims = {
    P281: [str('8001'), str('8000', { P518: [{ snaktype: 'value', datavalue: { value: { id: 'Q1' } } }] })],
  }
  assertEquals(parseCityFacts(claims).postal_codes, ['8001'])
})

Deno.test('when every postal code is scoped, keep them all (Paris arrondissements)', () => {
  const scoped = { P518: [{ snaktype: 'value', datavalue: { value: { id: 'Q1' } } }] }
  const claims: Claims = { P281: [str('75001', scoped), str('75002', scoped), str('75003', scoped)] }
  assertEquals(parseCityFacts(claims).postal_codes, ['75001', '75002', '75003'])
})

Deno.test('postal code ranges are stored verbatim (NYC)', () => {
  assertEquals(parseCityFacts({ P281: [str('10000–10499')] }).postal_codes, ['10000–10499'])
})

Deno.test('area codes split on separators and dedupe (NYC)', () => {
  const claims: Claims = { P473: [str('212'), str('347/646'), str('212')] }
  assertEquals(parseCityFacts(claims).area_codes, ['212', '347', '646'])
})

// --- founded year ----------------------------------------------------------

Deno.test('founded_year reads a positive inception year', () => {
  const claims: Claims = {
    P571: [{ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1652-01-01T00:00:00Z' } } } }],
  }
  assertEquals(parseCityFacts(claims).founded_year, 1652)
})

Deno.test('BCE foundation dates are skipped, not written as positive years', () => {
  const claims: Claims = {
    P571: [{ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { time: '-0753-01-01T00:00:00Z' } } } }],
  }
  assertEquals(parseCityFacts(claims).founded_year, undefined)
})

// --- website ---------------------------------------------------------------

Deno.test('official_website must be an http(s) url', () => {
  assertEquals(parseCityFacts({ P856: [str('https://www.capetown.gov.za')] }).official_website, 'https://www.capetown.gov.za')
  assertEquals(parseCityFacts({ P856: [str('capetown.gov.za')] }).official_website, undefined)
})

// --- languages -------------------------------------------------------------

Deno.test('P37 wins over P2936', () => {
  assertEquals(parseCityFacts({ P37: [ent('Q14196')], P2936: [ent('Q1860')] }).refs.local_language, ['Q14196'])
})

Deno.test('a short P2936 is an acceptable fallback (Manila -> Tagalog)', () => {
  assertEquals(parseCityFacts({ P2936: [ent('Q1860')] }).refs.local_language, ['Q1860'])
  assertEquals(parseCityFacts({ P2936: [ent('Q1860'), ent('Q2')] }).refs.local_language, ['Q1860', 'Q2'])
})

Deno.test('a long P2936 is an inventory, not a local language — leave it empty', () => {
  // Jerusalem "Yevanic, Lishana Deni, Biblical Hebrew"; Delhi "Punjabi, Bauria,
  // Central Tibetan". Every 3+ value result measured was wrong.
  const claims: Claims = { P2936: [ent('Q1'), ent('Q2'), ent('Q3')] }
  assertEquals(parseCityFacts(claims).refs.local_language, [])
})

Deno.test('an unknown-value P37 snak falls through rather than throwing', () => {
  // Mexico City's P37 is snaktype 'somevalue'; its P2936 is long -> empty.
  const claims: Claims = {
    P37: [{ rank: 'normal', mainsnak: { snaktype: 'somevalue' } }],
    P2936: [ent('Q1'), ent('Q2'), ent('Q3')],
  }
  assertEquals(parseCityFacts(claims).refs.local_language, [])
})

// --- labels ----------------------------------------------------------------

Deno.test('applyLabels shapes each column correctly', () => {
  const labels = new Map([
    ['Q14196', 'Afrikaans'], ['Q1860', 'English'],
    ['Q1017', 'Aachen'], ['Q41621', 'Nantes'],
    ['Q864320', 'humid subtropical climate'], ['Q7', 'Alice Mayor'],
  ])
  const out = applyLabels(
    {
      sister_cities: ['Q41621', 'Q1017'],
      local_language: ['Q14196', 'Q1860'],
      mayor: ['Q7'],
      climate_type: ['Q864320'],
      economy_sectors: [],
    },
    labels,
  )
  assertEquals(out.sister_cities, ['Aachen', 'Nantes'])   // sorted
  assertEquals(out.local_language, 'Afrikaans, English')  // singular text column
  assertEquals(out.mayor, 'Alice Mayor')
  assertEquals(out.climate_type, 'humid subtropical climate')
  assertEquals(out.economy_sectors, undefined)            // gaps stay empty
})

Deno.test('resolveLabels batches, caches, and does not refetch known misses', () => {
  let calls = 0
  const cache = new Map<string, string>()
  const fetchJson = (url: string) => {
    calls++
    const ids = decodeURIComponent(url.match(/ids=([^&]+)/)![1]).split('|')
    const entities: Record<string, unknown> = {}
    for (const id of ids) entities[id] = id === 'Q999' ? {} : { labels: { en: { value: `L-${id}` } } }
    return Promise.resolve({ entities })
  }
  return (async () => {
    const first = await resolveLabels(fetchJson, ['Q1', 'Q2', 'Q999'], cache)
    assertEquals(calls, 1)
    assertEquals(first.get('Q1'), 'L-Q1')
    assertEquals(first.has('Q999'), false)      // no English label -> omitted
    await resolveLabels(fetchJson, ['Q1', 'Q999'], cache)
    assertEquals(calls, 1)                      // both cached, including the miss
  })()
})

// --- SPARQL group B --------------------------------------------------------

const ab = (city: string, iata: string, label: string, sl: string) => ({
  city: { value: `http://www.wikidata.org/entity/${city}` },
  iata: { value: iata }, apLabel: { value: label }, sl: { value: sl },
})

Deno.test('pickAirports picks the primary airport by sitelink count', () => {
  const got = pickAirports([
    ab('Q60', 'LGA', 'LaGuardia Airport', '58'),
    ab('Q60', 'JFK', 'John F. Kennedy International Airport', '81'),
    ab('Q60', 'EWR', 'Newark Liberty International Airport', '53'),
  ])
  assertEquals(got.get('Q60')!.major_airport_code, 'JFK')
  assertEquals(got.get('Q60')!.airport_codes, ['JFK', 'LGA', 'EWR'])
})

Deno.test('an exact sitelink tie leaves major_airport_code NULL (Berlin TXL/BER)', () => {
  const got = pickAirports([
    ab('Q64', 'TXL', 'Berlin-Tegel Airport', '55'),
    ab('Q64', 'BER', 'Berlin Brandenburg Airport', '55'),
  ])
  assertEquals(got.get('Q64')!.major_airport_code, undefined)
  assertEquals(got.get('Q64')!.airport_codes.length, 2)
})

Deno.test('a single airport is decisive', () => {
  assertEquals(pickAirports([ab('Q5465', 'CPT', 'Cape Town International Airport', '41')]).get('Q5465')!.major_airport_code, 'CPT')
})

Deno.test('pickAirports rejects non-IATA codes', () => {
  assertEquals(pickAirports([ab('Q1', 'ZZZZ', 'x', '1'), ab('Q1', 'ab', 'y', '1')]).size, 0)
})

Deno.test('pickUniversities dedupes, sorts and drops unlabelled QID echoes', () => {
  const rows = [
    { city: { value: 'e/Q60' }, xLabel: { value: 'New York University' } },
    { city: { value: 'e/Q60' }, xLabel: { value: 'New York University' } },
    { city: { value: 'e/Q60' }, xLabel: { value: 'Columbia University' } },
    { city: { value: 'e/Q60' }, xLabel: { value: 'Q12345' } },
  ]
  assertEquals(pickUniversities(rows).get('Q60'), ['Columbia University', 'New York University'])
})

// --------------------------------------------------------------- parseCityNames

const monoStatement = (text: string, language: string, rank: 'preferred' | 'normal' | 'deprecated' = 'normal') => ({
  rank,
  mainsnak: { snaktype: 'value', datavalue: { value: { text, language }, type: 'monolingualtext' } },
})

Deno.test('parseCityNames: harvests the exonym that makes the resolver work', () => {
  const names = parseCityNames(
    {},
    { en: { value: 'Cape Town' }, de: { value: 'Kapstadt' }, fr: { value: 'Le Cap' } },
    { de: [{ value: 'Kaapstad' }] },
    {},
  )
  const values = names.map(n => n.alias)
  assertEquals(values.includes('Kapstadt'), true)
  assertEquals(values.includes('Le Cap'), true)
  assertEquals(values.includes('Kaapstad'), true)
  // The locale rides along so a later reader can tell a German exonym from an
  // English label; the resolver itself ignores it and matches on alias_key.
  assertEquals(names.find(n => n.alias === 'Kapstadt')?.locale, 'de')
  assertEquals(names.find(n => n.alias === 'Kaapstad')?.source, 'altlabel')
})

Deno.test('parseCityNames: a comma-qualified sitelink is NOT a synonym', () => {
  // "Bern (Stadt)" is the same place with a disambiguator; "Washington, D.C."
  // trimmed to "Washington" is a different and famously ambiguous one. An alias
  // is a claim of identity, so only the parenthetical form may be trimmed.
  const names = parseCityNames({}, {}, {}, {
    dewiki: { title: 'Bern (Stadt)' },
    enwiki: { title: 'Washington, D.C.' },
  })
  const values = names.map(n => n.alias)
  assertEquals(values.includes('Bern'), true)
  assertEquals(values.some(v => v.startsWith('Washington')), false)
})

Deno.test('parseCityNames: monolingual claims respect rank', () => {
  // Wikidata retracts a wrong name by DEPRECATING it, not by deleting it.
  // Reading array position would resurrect exactly those.
  const claims = {
    P1448: [
      monoStatement('Wrong Official Name', 'de', 'deprecated'),
      monoStatement('Freie und Hansestadt Hamburg', 'de', 'preferred'),
    ],
  } as unknown as Claims
  const names = parseCityNames(claims, {}, {}, {})
  const official = names.filter(n => n.source === 'official').map(n => n.alias)
  assertEquals(official, ['Freie und Hansestadt Hamburg'])
})

Deno.test('parseCityNames: deduplicates case-insensitively and drops junk', () => {
  const names = parseCityNames(
    {},
    { en: { value: 'Lyss' }, de: { value: 'lyss' } },
    { en: [{ value: 'https://www.notion.so/Lyss-CH-6045c2ad' }, { value: 'L' }] },
    { enwiki: { title: 'Lyss' } },
  )
  assertEquals(names.length, 1)
  assertEquals(names[0].alias, 'Lyss')
})
