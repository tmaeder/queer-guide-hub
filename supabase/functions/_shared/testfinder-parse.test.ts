import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  cleanText,
  normalizeUrl,
  nullable,
  parseCenterDetail,
  parseCoords,
  parseCountryList,
  parseLastUpdated,
  parseResultCount,
  parseSearchResults,
  serviceTags,
  slugFromHref,
  splitDualTitle,
  stripComments,
  splitList,
  targetPopulationTerms,
  unmappedServices,
} from './testfinder-parse.ts'

// Trimmed verbatim from https://testfinder.info/search?country=Denmark&HIV=true
// (fetched 2026-08-22). Two cards so the card-boundary regex is exercised.
const SEARCH_HTML = `
<p class="scroll__results-show">
    Found 12 matching results. The search results only show sites which match all the services selected.
</p>
<div id="items-row" class="row">
    <div id="B&#xFC;lowsvej 38 1870 Frederiksberg" class="col-md-4 results__sites">
        <!-- Display english title for countries with different alphabet -->
        <h3 class="results__site-title"><a href="/centers/checkpoint-frederiksberg/">Checkpoint Frederiksberg </a></h3>
        <p class="results__last-updated">Last updated: 15 November, 2021</p>
        <p class="results__distance"></p>
        <p id="results__country" class="results__country"><i class="fa-solid fa-location-dot"></i> Denmark <br /></p>
        <p id="results__city" class="results__city">K&#xF8;benhavn<br /></p>
        <p id="results__street" class="results__street">B&#xFC;lowsvej 38 1870 Frederiksberg</p>
        <p class="service-item"><i class="fa-solid fa-phone"></i> 33911119</p>
        <p class="service-item"><i class="fa-regular fa-at"></i> raadgivning@aidsfondet.dk</p>
        <p class="service-item"><i class="fa-solid fa-globe"></i> <a href="//www.mitcheckpoint.dk" target="_blank">www.mitcheckpoint.dk</a></p>
        <p class="service-item results__infections">
            <strong>Services offered: </strong>HIV testing, Viral Hepatitis testing, STI testing,
            Testing related counselling, STI treatment, Partner notification &amp; testing
        </p>
        <p class="service-item"><strong>STIs tested for: </strong> Syphilis, Chlamydia, Gonorrhea</p>
        <p class="service-item"><strong>Referral for test: </strong>Unnecessary</p>
        <div class="results__more">
            <a class="results__more-info" href="/centers/checkpoint-frederiksberg/">More info</a>
        </div>
        <p style="display:none" class="addressLat">55.683070</p>
        <p style="display:none" class="addressLng">12.545540</p>
    </div>
    <div id="Jovana Cvijica 1" class="col-md-4 results__sites">
        <h3 class="results__site-title"><a href="/centers/zavod-za-javno-zdravlje-sabac/">Zavod za javno zdravlje Sabac / Institut of public Health Sabac </a></h3>
        <p class="results__last-updated">Last updated: 19 November, 2021</p>
        <p id="results__country" class="results__country"><i class="fa-solid fa-location-dot"></i> Serbia <br /></p>
        <p id="results__city" class="results__city">Sabac<br /></p>
        <p id="results__street" class="results__street">Jovana Cvijica 1</p>
        <p class="service-item"><i class="fa-solid fa-phone"></i> 15343605</p>
        <p class="service-item"><i class="fa-regular fa-at"></i> epidemiologija@zjz.org.rs</p>
        <p class="service-item"><i class="fa-solid fa-globe"></i> <a href="//www.zjz.org.rs" target="_blank">www.zjz.org.rs</a></p>
        <p class="service-item results__infections">
            <strong>Services offered: </strong>HIV testing, Viral Hepatitis testing, STI testing,
        </p>
        <p class="service-item"><strong>STIs tested for: </strong> Syphilis, Chlamydia, Gonorrhea</p>
        <p class="service-item"><strong>Referral for test: </strong>Information not provided</p>
        <p style="display:none" class="addressLat">0</p>
        <p style="display:none" class="addressLng">0</p>
    </div>
</div>
`

// Trimmed verbatim from https://testfinder.info/centers/checkpoint-frederiksberg/
// (fetched 2026-08-22). The commented-out Umbraco block is REAL and is the
// reason stripComments runs before any field is read — see trap 1.
const DETAIL_HTML = `
<title>Checkpoint Frederiksberg</title>
<div class="row">
<div class="col-md-6">
    <h3 class="results__site-title-subpage">Checkpoint Frederiksberg</h3>
    <p class="results__last-updated">Last updated: 15 November, 2021</p>
    <p id="results__country" class="results__country"><i class="fa-solid fa-location-dot"></i> Denmark <br /></p>
    <p id="results__city" class="results__city">K&#xF8;benhavn<br /></p>
    <p id="results__street" class="results__street">B&#xFC;lowsvej 38 1870 Frederiksberg</p>
    <p class="service-item"><i class="fa-solid fa-phone"></i> 33911119</p>
    <p class="service-item"><i class="fa-regular fa-at"></i> <a href="mailto:raadgivning@aidsfondet.dk"> raadgivning@aidsfondet.dk</a></p>
    <p class="service-item"><i class="fa-solid fa-globe"></i> <a href="//www.mitcheckpoint.dk" target="_blank">www.mitcheckpoint.dk</a></p>
    <p class="service-item"><strong>Services offered: </strong>HIV testing, Viral Hepatitis testing, STI testing</p>
    <p class="service-item">Testing related counselling, STI treatment, Partner notification &amp; testing</p>
    <p class="service-item"></p>
    <p class="service-item"><strong>Referral for test: </strong>Unnecessary</p>
    <p class="service-item"><strong>Testing site opening hours: </strong>Mondays, every other week (even weeks). From 4pm-6pm.</p>
    <p class="service-item"><strong>HIV testing is free for </strong>LGBTQIA&#x2B; and people from high-risk countries</p>
    <p class="service-item"><strong>Hepatitis testing is free for: </strong>People who practice chemsex</p>
    <p class="service-item"><strong>STI test types: </strong>Syphilis, Chlamydia, Gonorrhea</p>
    <p class="service-item"><strong>HIV test types: </strong>HIV on site rapid test (finger prick)</p>
    <p class="service-item"><strong>Services access: </strong>Walk in/drop in &amp; by appointment</p>
    <p class="service-item">
        <strong>Website for booking appointments: </strong><a href="//www.mitcheckpoint.dk" target="_blank">www.mitcheckpoint.dk</a>
    </p>
    <p class="service-item"><strong>Phone number for booking appointments: </strong>33911119</p>
    <p class="service-item"><strong>Testing site type: </strong>Community based setting (non-hospital)</p>
    <!-- if (Model.HasValue("otherServicesOptional"))
    {
        <p class="service-item"><strong>Other self services: </strong>Model.Value("otherServicesOptional")</p>
    } -->
    <p class="service-item"><strong>Target population: </strong>Youth, LGBTQI*, Migrants</p>
    <p style="display: none;" class="addressLat">55.683070</p>
    <p style="display: none;" class="addressLng">12.545540</p>
</div>
</div>
`

const COUNTRY_FORM_HTML = `
<form method="get">
<select required class="form-control" name="country" title="country" autocomplete="off">
    <option value="">Select a country</option>
    <option value="Albania" >Albania</option>
    <option value="Bosnia and Herzegovina" >Bosnia and Herzegovina</option>
    <option value="T&#xFC;rkiye" >T&#xFC;rkiye</option>
</select>
</form>
`

// --------------------------------------------------------------------------
// Primitives
// --------------------------------------------------------------------------

Deno.test('nullable treats source sentinels as absent', () => {
  assertEquals(nullable('Information not provided'), null)
  assertEquals(nullable('  information NOT provided '), null)
  assertEquals(nullable('Other, specify'), null)
  assertEquals(nullable(''), null)
  assertEquals(nullable(null), null)
  assertEquals(nullable('Unnecessary'), 'Unnecessary')
})

Deno.test('nullable rejects leaked Umbraco template source', () => {
  assertEquals(nullable('Model.Value("otherServicesOptional")'), null)
  assertEquals(nullable('Model.HasValue("x")'), null)
})

Deno.test('splitList drops the trailing empty member their lists carry', () => {
  assertEquals(splitList('HIV testing, Viral Hepatitis testing, STI testing,'), [
    'HIV testing',
    'Viral Hepatitis testing',
    'STI testing',
  ])
  assertEquals(splitList('Chlamydia, Gonorrhea, Other, specify'), ['Chlamydia', 'Gonorrhea'])
  assertEquals(splitList('Information not provided'), [])
})

Deno.test('parseCoords rejects the 0,0 unknown sentinel', () => {
  assertEquals(parseCoords('0', '0'), { lat: null, lng: null })
  assertEquals(parseCoords('0.000000', '0.000000'), { lat: null, lng: null })
  assertEquals(parseCoords('55.683070', '12.545540'), { lat: 55.68307, lng: 12.54554 })
  // 0 on ONE axis is a real place (Greenwich meridian), so it must survive.
  assertEquals(parseCoords('51.4778', '0'), { lat: 51.4778, lng: 0 })
  assertEquals(parseCoords('', ''), { lat: null, lng: null })
  assertEquals(parseCoords('999', '12'), { lat: null, lng: null })
})

Deno.test('parseLastUpdated reads their date format', () => {
  assertEquals(parseLastUpdated('Last updated: 15 November, 2021'), '2021-11-15')
  assertEquals(parseLastUpdated('Last updated: 1 May, 2024'), '2024-05-01')
  assertEquals(parseLastUpdated('Last updated:'), null)
  assertEquals(parseLastUpdated(null), null)
})

Deno.test('splitDualTitle only splits a genuine two-part title', () => {
  assertEquals(splitDualTitle('Zavod za javno zdravlje Sabac / Institut of public Health Sabac'), {
    local: 'Zavod za javno zdravlje Sabac',
    english: 'Institut of public Health Sabac',
  })
  assertEquals(splitDualTitle('Checkpoint Frederiksberg'), { local: null, english: null })
  // Three parts is not a dual title and must not be guessed at.
  assertEquals(splitDualTitle('A / B / C'), { local: null, english: null })
})

Deno.test('normalizeUrl upgrades their protocol-relative hrefs', () => {
  assertEquals(normalizeUrl('//www.mitcheckpoint.dk'), 'https://www.mitcheckpoint.dk')
  assertEquals(normalizeUrl('www.zjz.org.rs'), 'https://www.zjz.org.rs')
  assertEquals(normalizeUrl('https://example.org/path'), 'https://example.org/path')
  assertEquals(normalizeUrl('Information not provided'), null)
  assertEquals(normalizeUrl('nonsense'), null)
})

Deno.test('slugFromHref extracts the stable external id', () => {
  assertEquals(slugFromHref('/centers/checkpoint-frederiksberg/'), 'checkpoint-frederiksberg')
  assertEquals(slugFromHref('/centers/abc'), 'abc')
  assertEquals(slugFromHref('/search?country=Denmark'), null)
  assertEquals(slugFromHref(null), null)
})

Deno.test('entity-encoded non-Latin slugs survive the fragment guard', () => {
  // Verbatim from https://testfinder.info/search?country=Georgia (2026-08-22).
  // `&#x10D0;` contains a literal '#', so a [^/?#]+ capture returned just '&'
  // and 18 centres across Georgia, Greece, Israel, Cyprus, North Macedonia and
  // Ukraine deduplicated into ONE row. Regression guard — if this returns '&'
  // again, 17 real testing sites are being dropped silently.
  const href =
    '/centers/&#x10D0;&#x10EE;&#x10D0;&#x10DA;&#x10D8;-&#x10D2;&#x10D6;&#x10D0;-&#x10E5;&#x10E3;&#x10D7;&#x10D0;&#x10D8;&#x10E1;&#x10D8;-1/'
  assertEquals(slugFromHref(href), 'ახალი-გზა-ქუთაისი-1')

  // Two different Georgian centres must not collapse to the same key.
  const other =
    '/centers/&#x10D0;&#x10EE;&#x10D0;&#x10DA;&#x10D8;-&#x10D2;&#x10D6;&#x10D0;-&#x10D7;&#x10D1;&#x10D8;&#x10DA;&#x10D8;&#x10E1;&#x10D8;-1/'
  assertEquals(slugFromHref(other) === slugFromHref(href), false)

  // A mixed Latin/Georgian title, and a real fragment still being stripped.
  assertEquals(
    slugFromHref('/centers/equality-movement&#x10D7;&#x10D0;&#x10DC;/'),
    'equality-movementთან',
  )
  assertEquals(slugFromHref('/centers/some-clinic/#section'), 'some-clinic')
})

Deno.test('cleanText strips comments before tags', () => {
  assertEquals(cleanText('<p>Hi <!-- Model.Value("x") --> there</p>'), 'Hi there')
  assertEquals(cleanText('LGBTQIA&#x2B;'), 'LGBTQIA+')
})

Deno.test('comment stripping is idempotent — one pass can splice a new comment', () => {
  // Removing the inner comment joins '<!' + '-- payload -->' into a comment
  // that never existed in the source. A single-pass replace leaves it standing,
  // in the function whose whole job is that comment contents are never read as
  // data. CodeQL flags this as incomplete multi-character sanitization.
  assertEquals(stripComments('<!<!-- -->-- payload -->'), '')
  assertEquals(cleanText('<p>a<!<!-- -->-- payload -->b</p>'), 'ab')

  // An unterminated comment has no --> to match and must not survive either.
  assertEquals(stripComments('ok <!-- dangling'), 'ok ')
  assertEquals(cleanText('<p>ok <!-- Model.Value("x")'), 'ok')

  // Ordinary content is untouched.
  assertEquals(stripComments('<p>plain</p>'), '<p>plain</p>')
})

// --------------------------------------------------------------------------
// Page parsers
// --------------------------------------------------------------------------

Deno.test('parseCountryList reads the search form vocabulary', () => {
  assertEquals(parseCountryList(COUNTRY_FORM_HTML), [
    'Albania',
    'Bosnia and Herzegovina',
    'Türkiye',
  ])
})

Deno.test('parseResultCount reads the declared total', () => {
  assertEquals(parseResultCount(SEARCH_HTML), 12)
  assertEquals(parseResultCount('<p>nothing here</p>'), null)
})

Deno.test('parseSearchResults extracts both cards with full field coverage', () => {
  const rows = parseSearchResults(SEARCH_HTML)
  assertEquals(rows.length, 2)

  const dk = rows[0]
  assertEquals(dk.slug, 'checkpoint-frederiksberg')
  assertEquals(dk.name, 'Checkpoint Frederiksberg')
  assertEquals(dk.country, 'Denmark')
  assertEquals(dk.city, 'København')
  assertEquals(dk.street, 'Bülowsvej 38 1870 Frederiksberg')
  assertEquals(dk.lastUpdated, '2021-11-15')
  assertEquals(dk.phone, '33911119')
  assertEquals(dk.email, 'raadgivning@aidsfondet.dk')
  assertEquals(dk.website, 'https://www.mitcheckpoint.dk')
  assertEquals(dk.referral, 'Unnecessary')
  assertEquals(dk.stiTestedFor, ['Syphilis', 'Chlamydia', 'Gonorrhea'])
  assertEquals(dk.lat, 55.68307)
  assertEquals(dk.lng, 12.54554)
})

Deno.test('search card keeps BOTH service lines — the whole point of trap 2', () => {
  const dk = parseSearchResults(SEARCH_HTML)[0]
  assertEquals(dk.services, [
    'HIV testing',
    'Viral Hepatitis testing',
    'STI testing',
    'Testing related counselling',
    'STI treatment',
    'Partner notification & testing',
  ])
})

Deno.test('second card: dual title split, sentinel referral, 0,0 coords dropped', () => {
  const rs = parseSearchResults(SEARCH_HTML)[1]
  assertEquals(rs.slug, 'zavod-za-javno-zdravlje-sabac')
  assertEquals(rs.nameLocal, 'Zavod za javno zdravlje Sabac')
  assertEquals(rs.nameEnglish, 'Institut of public Health Sabac')
  assertEquals(rs.referral, null)
  assertEquals(rs.lat, null)
  assertEquals(rs.lng, null)
  assertEquals(rs.services, ['HIV testing', 'Viral Hepatitis testing', 'STI testing'])
})

Deno.test('parseCenterDetail absorbs the unlabelled services continuation', () => {
  const detail = parseCenterDetail(DETAIL_HTML, 'checkpoint-frederiksberg')!
  assertEquals(detail.services, [
    'HIV testing',
    'Viral Hepatitis testing',
    'STI testing',
    'Testing related counselling',
    'STI treatment',
    'Partner notification & testing',
  ])
})

Deno.test('parseCenterDetail never publishes the commented-out template block', () => {
  const detail = parseCenterDetail(DETAIL_HTML, 'checkpoint-frederiksberg')!
  const serialized = JSON.stringify(detail)
  assertEquals(serialized.includes('Model.Value'), false)
  assertEquals(serialized.includes('otherServicesOptional'), false)
  assertEquals(serialized.includes('Other self services'), false)
})

Deno.test('parseCenterDetail reads the colon-less label (trap 5)', () => {
  const detail = parseCenterDetail(DETAIL_HTML, 'checkpoint-frederiksberg')!
  assertEquals(detail.hivFreeFor, 'LGBTQIA+ and people from high-risk countries')
  assertEquals(detail.hepatitisFreeFor, 'People who practice chemsex')
})

Deno.test('parseCenterDetail extracts the full labelled field set', () => {
  const detail = parseCenterDetail(DETAIL_HTML, 'checkpoint-frederiksberg')!
  assertEquals(detail.slug, 'checkpoint-frederiksberg')
  assertEquals(detail.name, 'Checkpoint Frederiksberg')
  assertEquals(detail.city, 'København')
  assertEquals(detail.openingHours, 'Mondays, every other week (even weeks). From 4pm-6pm.')
  assertEquals(detail.stiTestTypes, ['Syphilis', 'Chlamydia', 'Gonorrhea'])
  assertEquals(detail.hivTestTypes, ['HIV on site rapid test (finger prick)'])
  assertEquals(detail.servicesAccess, 'Walk in/drop in & by appointment')
  assertEquals(detail.bookingWebsite, 'https://www.mitcheckpoint.dk')
  assertEquals(detail.bookingPhone, '33911119')
  assertEquals(detail.siteType, 'Community based setting (non-hospital)')
  assertEquals(detail.targetPopulation, ['Youth', 'LGBTQI*', 'Migrants'])
  assertEquals(detail.lat, 55.68307)
})

Deno.test('contact icons are read as standalone fields, not continuations', () => {
  const detail = parseCenterDetail(DETAIL_HTML, 'checkpoint-frederiksberg')!
  assertEquals(detail.phone, '33911119')
  assertEquals(detail.email, 'raadgivning@aidsfondet.dk')
  assertEquals(detail.website, 'https://www.mitcheckpoint.dk')
})

// --------------------------------------------------------------------------
// Vocabulary mapping
// --------------------------------------------------------------------------

Deno.test('serviceTags maps the real Checkpoint record', () => {
  const detail = parseCenterDetail(DETAIL_HTML, 'checkpoint-frederiksberg')!
  assertEquals(serviceTags(detail), [
    'free-testing',
    'hepatitis-testing',
    'hiv-testing',
    'no-referral-needed',
    'partner-notification',
    'rapid-test',
    'sti-testing',
    'sti-treatment',
    'testing-counselling',
    'walk-in',
  ])
})

Deno.test('a site offering walk-in AND appointments is not appointment-required', () => {
  const tags = serviceTags({
    services: ['HIV testing'],
    servicesAccess: 'Walk in/drop in & by appointment',
  })
  assertEquals(tags.includes('walk-in'), true)
  assertEquals(tags.includes('appointment-required'), false)
})

Deno.test('appointment-only sites keep appointment-required', () => {
  const tags = serviceTags({ services: ['HIV testing'], servicesAccess: 'By appointment only' })
  assertEquals(tags.includes('appointment-required'), true)
  assertEquals(tags.includes('walk-in'), false)
})

Deno.test('hepatitis is not swallowed by the looser testing arms', () => {
  assertEquals(serviceTags({ services: ['Viral Hepatitis testing'] }), ['hepatitis-testing'])
})

Deno.test('"Hepatitis" contains the letters sti and must not be tagged sti-testing', () => {
  // The reason \b anchors the sti arm. Without them this returns both tags.
  assertEquals(serviceTags({ services: ['Hepatitis testing'] }), ['hepatitis-testing'])
})

Deno.test('a parenthetical gloss between the words still tags sti-testing', () => {
  // Serbia/JAZAAS writes it this way. An adjacent-words rule silently produced
  // a testing centre carrying no sti-testing tag at all.
  assertEquals(serviceTags({ services: ['STI (Sexually Transmitted Infections) testing'] }), [
    'sti-testing',
  ])
  assertEquals(serviceTags({ services: ['Sexually transmitted infection testing'] }), [
    'sti-testing',
  ])
})

Deno.test('psychosocial support is not testing-related counselling', () => {
  assertEquals(serviceTags({ services: ['Psychosocial counselling and support'] }), [
    'psychosocial-support',
  ])
  assertEquals(serviceTags({ services: ['Testing related counselling'] }), ['testing-counselling'])
})

Deno.test('prophylaxis and vaccination services are recognised', () => {
  assertEquals(serviceTags({ services: ['PrEP'] }), ['prep'])
  assertEquals(serviceTags({ services: ['Pre-exposure prophylaxis'] }), ['prep'])
  assertEquals(serviceTags({ services: ['PEP'] }), ['pep'])
  assertEquals(serviceTags({ services: ['Hepatitis B vaccination'] }), [
    'hepatitis-testing',
    'vaccination',
  ])
})

Deno.test('unmappedServices surfaces labels no rule recognises', () => {
  assertEquals(unmappedServices(['HIV testing', 'STI treatment']), [])
  assertEquals(unmappedServices(['Acupuncture', 'HIV testing']), ['Acupuncture'])
})

Deno.test('the measured long tail is tagged, not silently dropped', () => {
  // Counts are occurrences across all 530 centres, so these are the four
  // largest services the first ruleset ignored.
  assertEquals(serviceTags({ services: ['Referral for prevention'] }), ['prevention-referral']) // 199
  assertEquals(serviceTags({ services: ['family planning'] }), ['family-planning']) //  76
  assertEquals(serviceTags({ services: ['Contraception & sexual health counselling'] }), [
    'family-planning',
  ]) //  75
  assertEquals(serviceTags({ services: ['Needle-syringe programmes (harm reduction)'] }), [
    'needle-exchange',
  ]) //  62
  assertEquals(serviceTags({ services: ['Tuberculosis services'] }), ['tuberculosis-services']) //  55
})

Deno.test('a bare disease name in a services list means testing for it', () => {
  assertEquals(serviceTags({ services: ['HIV'] }), ['hiv-testing'])
  assertEquals(serviceTags({ services: ['STI (Sexually Transmitted Infections)'] }), ['sti-testing'])
  assertEquals(serviceTags({ services: ['Hepatitis'] }), ['hepatitis-testing'])
})

Deno.test('the bare-name rule does not swallow a qualified service', () => {
  // "HIV treatment" must NOT become hiv-testing — the bare rule runs only when
  // no ordinary rule matched, and treatment matches one.
  assertEquals(serviceTags({ services: ['HIV treatment'] }), ['sti-treatment'])
  // "HIV counselling only" matches nothing: it is neither testing nor
  // explicitly testing-related counselling. Reporting it as unmapped is the
  // designed outcome — an unrecognised label must surface in the crawl summary
  // rather than be guessed into a tag that claims a service on health content.
  assertEquals(unmappedServices(['HIV counselling only']), ['HIV counselling only'])
  assertEquals(serviceTags({ services: ['HIV counselling only'] }), [])
})

Deno.test('form artifacts are sentinels, never services', () => {
  assertEquals(splitList('None of the listed'), [])
  assertEquals(splitList('we only offer testing services'), [])
  assertEquals(serviceTags({ services: ['None of the listed'] }), [])
})

Deno.test('anonymity is never inferred — the source has no such field', () => {
  const tags = serviceTags({
    services: ['HIV testing'],
    hivFreeFor: 'Anyone, anonymously',
    servicesAccess: 'Anonymous walk in',
  })
  assertEquals(tags.includes('anonymous-testing'), false)
})

Deno.test('free-testing requires an actual free-for statement', () => {
  assertEquals(serviceTags({ services: ['HIV testing'] }).includes('free-testing'), false)
  assertEquals(
    serviceTags({ services: ['HIV testing'], stiFreeFor: 'Under 25s' }).includes('free-testing'),
    true,
  )
})

Deno.test('targetPopulationTerms lowercases for SQL resolution, drops sentinels', () => {
  assertEquals(targetPopulationTerms(['Youth', 'LGBTQI*', 'Migrants']), [
    'lgbtqi*',
    'migrants',
    'youth',
  ])
  assertEquals(targetPopulationTerms(['Information not provided']), [])
  assertEquals(targetPopulationTerms([]), [])
})
