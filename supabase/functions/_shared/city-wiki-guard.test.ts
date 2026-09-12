import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  cityWikiVerdict,
  regionQualifiedTitle,
  usableRegion,
  LEAD_CHARS,
} from './city-wiki-guard.ts'

// Every extract below is the REAL lead en.wikipedia.org served for that bare name on
// 2026-09-12, captured during the audit. Paraphrasing them would test the fixture
// rather than the corpus.

// Each carries the gate that actually stops it. Englewood is the interesting one:
// its lead contains the phrase "English Neighborhood", and `neighborhood` is place
// vocabulary — so it PASSES the place gate and only corroboration refuses it. That is
// the concrete reason the two gates cannot be collapsed into one.
const WRONG_SUBJECT: Record<string, [string, 'not-place' | 'uncorroborated']> = {
  Daphne: [
    "Daphne (; DAFF-nee; Ancient Greek: Δάφνη, Dáphnē, lit. 'laurel'), a figure in Greek " +
    'mythology, was in various retellings a mortal woman or a nymph, daughter of a river god. ' +
    'The god Apollo fell in love with her after being struck by an arrow.', 'not-place'],
  West: [
    'West is one of the four cardinal directions or points of the compass. It is the opposite ' +
    'direction from east and is the direction in which the Sun sets on the Earth.', 'not-place'],
  Highland: [
    'Highland is a general term referring to areas of high elevation such as mountainous ' +
    'regions, plateaus, or high hills.', 'not-place'],
  Englewood: [
    'Englewood is a corruption of Dutch Engelse woud (English woods or forest) & Engelse buurt, ' +
    'or "English Neighborhood", which originally referred to Englewood, New Jersey.',
    'uncorroborated'],
  Delphi: [
    'Delphi (; Greek: Δελφοί), in legend previously called Pytho, was an ancient sacred ' +
    'precinct in central Greece. It was the seat of Pythia, the major oracle.', 'not-place'],
}

const DISAMBIGUATION: Record<string, string> = {
  Ephrata:
    'Ephrata may refer to:\n\n\n== Places ==\nEphrata, Suriname\nEphrata, Pennsylvania, U.S.\n' +
    'Ephrata, Washington, U.S.\nEphrata Township, Pennsylvania, U.S.',
  Milton:
    'Milton may refer to:\n\n\n== People and fictional characters ==\nMilton (surname), a list ' +
    'of people with that surname\nJohn Milton (1608–1674), English poet',
}

// Correctly-resolved articles from the same audit, which must keep passing.
const GOOD: Array<[string, string | null, string | null, string]> = [
  ['Yellowknife', 'Northwest Territories', 'Canada',
    'Yellowknife is the capital, largest community, and the only city in the Northwest ' +
    'Territories, Canada. It is on the northern shore of Great Slave Lake.'],
  ['Vadnais Heights', 'Minnesota', 'United States',
    'Vadnais Heights ( VAD-niz) is a city in Ramsey County, Minnesota, United States. The ' +
    'population was 12,912 at the 2020 census.'],
  // A city-state is a city. Without `island country` in the vocabulary this was a
  // measured false block.
  ['Singapore', null, 'Singapore',
    'Singapore, officially the Republic of Singapore, is an island country in Southeast Asia. ' +
    'Its territory comprises a main island, over 60 satellite islands and islets.'],
  // Auckland's local boards: the lead says "local boards", not "city".
  ['Henderson-Massey', 'Auckland', 'New Zealand',
    'The Henderson-Massey Local Board is one of the 21 local boards of the Auckland Council. ' +
    "The board's administrative area includes the suburbs of Glendene, Henderson, Massey."],
  // Corroborated by COUNTRY where the row carries no region at all.
  ['Genève', null, 'Switzerland',
    'Geneva is the second-most populous city in Switzerland, a global city and international ' +
    'financial centre.'],
]

Deno.test('refuses an article about a different subject under the same name', () => {
  for (const [name, [extract, expected]] of Object.entries(WRONG_SUBJECT)) {
    const v = cityWikiVerdict(extract, {
      name,
      region_name: 'Alabama',
      countryName: 'United States',
    })
    assertEquals(v.adopt, false, `${name} must be refused`)
    assertEquals(v.reason, expected, `${name} refused for the wrong reason`)
  }
})

Deno.test('refuses a disambiguation page', () => {
  for (const [name, extract] of Object.entries(DISAMBIGUATION)) {
    const v = cityWikiVerdict(extract, {
      name,
      region_name: 'Pennsylvania',
      countryName: 'United States',
    })
    assertEquals(v.adopt, false, `${name} must be refused`)
    assertEquals(v.reason, 'disambiguation')
  }
})

Deno.test('adopts a real settlement article', () => {
  for (const [name, region, country, extract] of GOOD) {
    const v = cityWikiVerdict(extract, {
      name,
      region_name: region,
      countryName: country,
    })
    assertEquals(v.adopt, true, `${name} must be adopted, got ${v.reason} ${v.detail ?? ''}`)
  }
})

Deno.test('a place-shaped lead about the WRONG place is still refused', () => {
  // Parma, Italy is unimpeachably a city — the defect is that our row is Parma, OHIO.
  // Only the corroboration gate can see this, which is why the place gate cannot be
  // the only one.
  const parmaItaly =
    'Parma (Italian: [ˈparma]) is a city in the region of Emilia-Romagna in Northern Italy, ' +
    'known for its architecture, music, art, prosciutto (ham), cheese.'
  const v = cityWikiVerdict(parmaItaly, {
    name: 'Parma',
    region_name: 'Ohio',
    countryName: 'United States',
  })
  assertEquals(v.adopt, false)
  assertEquals(v.reason, 'uncorroborated')
})

Deno.test('corroboration reads the LEAD only, never the whole article', () => {
  // The real Brisbane, Australia extract mentions the United States far below the lead.
  // Searching the whole body was measured and rejected: it corroborated Brisbane,
  // California against Brisbane, Australia's article.
  const brisbaneAu =
    'Brisbane is the capital and largest city of the Australian state of Queensland and the ' +
    'third-most populous city in Australia.' +
    'x'.repeat(LEAD_CHARS) +
    ' Sister cities include several in the United States and California.'
  const v = cityWikiVerdict(brisbaneAu, {
    name: 'Brisbane',
    region_name: 'California',
    countryName: 'United States',
  })
  assertEquals(v.adopt, false)
  assertEquals(v.reason, 'uncorroborated')
})

Deno.test('an empty or missing extract is refused, not adopted', () => {
  for (const empty of [null, undefined, '', '   ']) {
    assertEquals(cityWikiVerdict(empty, { name: 'X' }).reason, 'no-extract')
  }
})

Deno.test('usableRegion rejects values that carry no signal', () => {
  assertEquals(usableRegion('07'), null)       // opaque FIPS code
  assertEquals(usableRegion('CA'), null)       // unexpanded short code
  assertEquals(usableRegion(''), null)
  assertEquals(usableRegion(null), null)
  assertEquals(usableRegion('Alabama'), 'Alabama')
})

Deno.test('regionQualifiedTitle builds the retry Wikipedia actually uses', () => {
  assertEquals(
    regionQualifiedTitle({ name: 'Daphne', region_name: 'Alabama' }),
    'Daphne, Alabama',
  )
  // No usable region — guessing a title is the thing this module exists to stop.
  assertEquals(regionQualifiedTitle({ name: 'Genève', region_name: null }), null)
  assertEquals(regionQualifiedTitle({ name: 'Melbourne', region_name: '07' }), null)
  // Already qualified: retrying would produce "Brisbane, California, California".
  assertEquals(
    regionQualifiedTitle({ name: 'Brisbane, California', region_name: 'California' }),
    null,
  )
})

// The `city-factual-backfill` / `city-corroboration` residue that 22500101100000
// corrects. These two rows were NOT reachable by the 21050101100000 audit — that pass
// selected agentic-enriched cities with no `wikidata_qid`, and both of these carry a
// correct QID, a correct cached `wikipedia_title`, and were never agentic-enriched.
// They are the same defect through a different producer: the published description
// came from the BARE name while the correct article sat unpublished in the row's own
// `field_provenance.description.candidates[0]`, because the filler is fill-if-empty.
//
// Both strings below are the REAL leads en.wikipedia.org served on 2026-09-12.
// This asserts the pair the migration turns on: the text it REMOVES is refused by the
// seal, and the text it PUBLISHES is adopted by it. A correction that published prose
// the seal would itself reject would be a defect wearing a fix's clothes.
Deno.test('the bare-name text 22500101100000 retracts is refused by the seal', () => {
  const cambriaWales =
    'Cambria is a name for Wales, being the Latinised form of the Welsh name for the ' +
    'country, Cymru. The term was not in use during the Roman period or the early ' +
    'medieval period.'
  const wales = cityWikiVerdict(cambriaWales, {
    name: 'Cambria',
    region_name: 'California',
    countryName: 'United States',
  })
  assertEquals(wales.adopt, false)

  const timonName = 'Timon is a masculine given name and a surname which may refer to:'
  const given = cityWikiVerdict(timonName, {
    name: 'Timon',
    region_name: '13',
    countryName: 'Brazil',
  })
  assertEquals(given.adopt, false)
  // The given-name page is caught as a disambiguation, not merely as a non-place —
  // "may refer to:" is the signature, and `13` is an unusable region either way.
  assertEquals(given.reason, 'disambiguation')
})

Deno.test('the cached-title text 22500101100000 publishes is adopted by the seal', () => {
  const cambria = cityWikiVerdict(
    'Cambria is a coastal town in San Luis Obispo County, California, United States ' +
    'midway between San Francisco and Los Angeles along California State Route 1. ' +
    'The name Cambria, chosen in 1869, is the Latin name for Wales.',
    { name: 'Cambria', region_name: 'California', countryName: 'United States' },
  )
  assertEquals(cambria.adopt, true)

  // Note this text MENTIONS Wales — the defect's own explanation is inside the correct
  // article ("the Latin name for Wales" is why the bare name resolved there). A guard
  // that keyed on the word rather than on the lead's subject would refuse the fix.
  const timon = cityWikiVerdict(
    'Timon is a Brazilian municipality in the State of Maranhão. The population is ' +
    '174,465 (2022 Census) and the total area is 1765 km2.',
    { name: 'Timon', region_name: '13', countryName: 'Brazil' },
  )
  assertEquals(timon.adopt, true)
})
