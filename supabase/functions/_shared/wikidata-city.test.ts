import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  applyLabels,
  bestStatement,
  currentStatements,
  capitalQuery,
  parseCityFacts,
  pickAirports,
  pickCapitals,
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

// --- capital scope (P1376) --------------------------------------------------

const cb = (
  city: string,
  unit: string,
  label: string,
  flags: {
    country?: boolean
    countryClass?: boolean
    firstLevel?: boolean
    /** Defaults true — the same-country case is the ordinary one. */
    sameCountry?: boolean
  } = {},
) => ({
  city: { value: `http://www.wikidata.org/entity/${city}` },
  unit: { value: `http://www.wikidata.org/entity/${unit}` },
  unitLabel: { value: label },
  isCountry: { value: String(!!flags.country) },
  isCountryClass: { value: String(!!flags.countryClass) },
  isFirstLevel: { value: String(!!flags.firstLevel) },
  sameCountry: { value: String(flags.sameCountry !== false) },
})

Deno.test('capitalQuery excludes former capitals and deprecated statements', () => {
  const q = capitalQuery(['Q64', 'Q1726'])
  // A P582 (end time) qualifier is what marks Bonn or Rio as a FORMER capital,
  // and deprecated rank is how Wikidata retracts a wrong claim without deleting
  // it. Both have to be filtered in the query, not after it.
  assertEquals(q.includes('FILTER NOT EXISTS { ?st pq:P582 ?ended }'), true)
  assertEquals(q.includes('FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }'), true)
  // Measured live against WDQS: without this, Cologne publishes as the capital
  // of the Electorate of Cologne — a first-level subdivision by class that
  // simply ceased to exist in 1803, with no end qualifier on the statement to
  // give it away. Cologne is not a Landeshauptstadt; Düsseldorf is.
  assertEquals(q.includes('FILTER NOT EXISTS { ?unit wdt:P576 ?dissolved }'), true)
  // Reified statements, not wdt: — a truthy path cannot see the qualifiers the
  // two filters above depend on.
  assertEquals(q.includes('?city p:P1376 ?st'), true)
  assertEquals(q.includes('wd:Q64'), true)
})

Deno.test('a national capital is not a regional one (Berlin)', () => {
  const got = pickCapitals([cb('Q64', 'Q183', 'Germany', { country: true })])
  assertEquals(got.get('Q64')!.national, true)
  assertEquals(got.get('Q64')!.regional, false)
  assertEquals(got.get('Q64')!.regionOf, undefined)
})

Deno.test('a first-level subdivision capital resolves with its label (Munich)', () => {
  const got = pickCapitals([cb('Q1726', 'Q980', 'Bavaria', { firstLevel: true })])
  assertEquals(got.get('Q1726')!.regional, true)
  assertEquals(got.get('Q1726')!.national, false)
  assertEquals(got.get('Q1726')!.regionOf, 'Bavaria')
})

Deno.test('a dependent territory reads as national via class, not via P17', () => {
  // The city's P17 is the parent sovereign state (United Kingdom) while P1376
  // points at the territory, so isCountry is false. Without the class arm this
  // would be published as a REGIONAL capital.
  const got = pickCapitals([cb('Q1410', 'Q1410', 'Gibraltar', { countryClass: true })])
  assertEquals(got.get('Q1410')!.national, true)
  assertEquals(got.get('Q1410')!.regional, false)
})

Deno.test('a first-level unit in another country is not a regional capital', () => {
  // The corroborating signal. A P1376 that points across a border cannot
  // publish a flag; a null column is recoverable, a wrong one is not.
  const got = pickCapitals([cb('Q1', 'Q2', 'Some State', { firstLevel: true, sameCountry: false })])
  assertEquals(got.get('Q1')!.regional, false)
  assertEquals(got.get('Q1')!.regionOf, undefined)
})

Deno.test('a district capital qualifies for neither arm', () => {
  const got = pickCapitals([cb('Q1', 'Q2', 'Some Landkreis')])
  assertEquals(got.get('Q1')!.national, false)
  assertEquals(got.get('Q1')!.regional, false)
  assertEquals(got.get('Q1')!.units, ['Q2'])
})

Deno.test('a city that is both national and regional keeps both flags', () => {
  // City-states: Berlin, Vienna, Hamburg, Bremen. This is exactly why the
  // schema carries two booleans instead of one scope enum.
  const got = pickCapitals([
    cb('Q1055', 'Q183', 'Germany', { country: true }),
    cb('Q1055', 'Q1055', 'Hamburg', { firstLevel: true }),
  ])
  assertEquals(got.get('Q1055')!.national, true)
  assertEquals(got.get('Q1055')!.regional, true)
  assertEquals(got.get('Q1055')!.regionOf, 'Hamburg')
})

Deno.test('an unlabelled unit keeps the flag but publishes no region name', () => {
  // The label service echoes the QID when there is no English label. The
  // classification still held, so the flag stands; the column stays empty
  // rather than rendering "Q1221156".
  const got = pickCapitals([cb('Q1', 'Q1221156', 'Q1221156', { firstLevel: true })])
  assertEquals(got.get('Q1')!.regional, true)
  assertEquals(got.get('Q1')!.regionOf, undefined)
})

Deno.test('among several regional units the answer does not depend on row order', () => {
  const rows = [
    cb('Q1', 'Q10', 'Zealand', { firstLevel: true }),
    cb('Q1', 'Q11', 'Alsace', { firstLevel: true }),
  ]
  assertEquals(pickCapitals(rows).get('Q1')!.regionOf, 'Alsace')
  assertEquals(pickCapitals([...rows].reverse()).get('Q1')!.regionOf, 'Alsace')
})
