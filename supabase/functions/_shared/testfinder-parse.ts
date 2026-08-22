// Parsers for testfinder.info (European Test Finder — EuroTEST/CHIP,
// Rigshospitalet, University of Copenhagen).
//
// Site shape (verified live 2026-08-22): an Umbraco CMS site, ~534 testing
// sites across 46 countries. Search is a plain server-rendered GET form —
// `/search?country=<Name>` with NO service filter returns every centre for
// that country, so 46 requests enumerate the whole corpus. Each result card
// links to a detail page at `/centers/<slug>/`.
//
// `<slug>` is the STABLE EXTERNAL IDENTITY KEY. It is theirs, not one we
// derived from a name — which is the whole point. `import-patroc.mjs:14-25`
// records why: the 2026-04-26 Spartacus cohort keyed on
// `spartacus:<name-slug>:<city>` duplicated 47% of itself because a name-
// derived key is not stable under renames.
//
// FIVE traps this module exists to absorb, every one of them measured against
// live HTML rather than guessed:
//
//  1. HTML COMMENTS CARRY UNRENDERED TEMPLATE SOURCE. The detail page ships a
//     broken Umbraco block verbatim inside a comment:
//         <!-- if (Model.HasValue("otherServicesOptional")) {
//              <p class="service-item">...Model.Value("otherServicesOptional")</p> } -->
//     A naive text extraction publishes the literal string
//     `Model.Value("otherServicesOptional")` as a centre's services. Comments
//     are therefore stripped BEFORE any field is read, not after.
//
//  2. "Services offered" SPANS TWO PARAGRAPHS on detail pages, and only the
//     first carries the <strong> label:
//         <p class="service-item"><strong>Services offered: </strong>HIV testing, ...</p>
//         <p class="service-item">Testing related counselling, STI treatment, ...</p>
//     Per-paragraph parsing silently drops half the services. The search card
//     puts BOTH lines in one `results__infections` paragraph, so the card is
//     the more reliable source for services and the detail page absorbs
//     trailing unlabelled paragraphs to compensate.
//
//  3. `Information not provided` IS A NULL SENTINEL, not a value (10 of 34
//     `Referral for test` values in a 4-page sample). So is the leaked form
//     option `Other, specify`. Publishing either as fact is a data-quality
//     defect on health content.
//
//  4. LAT/LNG OF EXACTLY 0,0 MEANS UNKNOWN. Their own `markersMap.js` filters
//     those before pinning: `parseFloat(location[0]) !== 0 && ...`. Treating
//     0,0 as a coordinate puts test centres in the Gulf of Guinea.
//
//  5. LABEL COLONS ARE INCONSISTENT. Every label ends in `:` except
//     `HIV testing is free for` , which does not. Matching on `Label:` drops
//     that field only, which is the kind of gap nobody notices.
//
// Titles in non-Latin-alphabet countries are a single string carrying both
// forms separated by " / " (e.g. "Zavod za javno zdravlje Sabac / Institut of
// public Health Sabac"). We keep the full string as `name` and expose the
// split only as a hint — some centre names legitimately contain a slash, so
// rewriting the name on that basis would corrupt them.

import { decodeEntities, stripTags } from './spartacus-parse.ts'

/** Values that mean "no data", not data. Compared case-insensitively. */
const NULL_SENTINELS = new Set([
  'information not provided',
  'not provided',
  'no information',
  'n/a',
  'na',
  '-',
  '',
  // A leaked Umbraco form option, seen inside "STIs tested for" value lists.
  'other, specify',
  'other specify',
  // Form artifacts found by crawling all 530 centres: an unselected radio and
  // a provider typing prose into a service picker. Neither is a service.
  'none of the listed',
  'none of the above',
  'we only offer testing services',
])

/** The unrendered-template leak from trap 1, in case a comment ever escapes. */
const TEMPLATE_LEAK = /Model\.(Value|HasValue)\s*\(/

export interface TestFinderCenter {
  /** Stable external id: the `<slug>` from `/centers/<slug>/`. */
  slug: string
  /** Full title as published, including any " / " dual form. */
  name: string
  /** Left of " / " when the title looks like a dual local/English form. */
  nameLocal: string | null
  /** Right of " / " when the title looks like a dual local/English form. */
  nameEnglish: string | null
  country: string | null
  city: string | null
  street: string | null
  /** ISO date parsed from "Last updated: 15 November, 2021". */
  lastUpdated: string | null
  phone: string | null
  email: string | null
  website: string | null
  /** Raw service labels, e.g. ["HIV testing", "STI testing"]. */
  services: string[]
  stiTestedFor: string[]
  referral: string | null
  lat: number | null
  lng: number | null
}

export interface TestFinderCenterDetail extends TestFinderCenter {
  openingHours: string | null
  hivFreeFor: string | null
  hepatitisFreeFor: string | null
  stiFreeFor: string | null
  stiTestTypes: string[]
  hivTestTypes: string[]
  servicesAccess: string | null
  bookingWebsite: string | null
  bookingPhone: string | null
  siteType: string | null
  targetPopulation: string[]
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Strip comments first (trap 1), then tags, then decode, then collapse space. */
export function cleanText(html: string): string {
  return decodeEntities(stripTags(stripComments(html))).replace(/\s+/g, ' ').trim()
}

/**
 * Remove HTML comments from a whole document before any field is read.
 *
 * LOOP UNTIL STABLE, for the same reason `stripTags` does. A single pass is
 * not idempotent here: removing an inner `<!-- … -->` splices its neighbours
 * together and can form a NEW comment that never existed in the source. Given
 *
 *     <!<!-- -->-- payload -->
 *
 * one pass removes `<!-- -->` and leaves `<!-- payload -->` intact — a
 * surviving comment, in the function whose entire job is that nothing inside a
 * comment is ever read as data (trap 1). CodeQL flags this as incomplete
 * multi-character sanitization and is right to.
 *
 * The trailing replace closes the other hole: an UNTERMINATED comment has no
 * `-->` to match, so it passes through with its markup intact. This output
 * becomes `organizations.name` / `description`, which `functions/_lib/detail.ts`
 * re-renders into the crawler JSON-LD, so it has to be markup-free rather than
 * merely comment-balanced.
 */
export function stripComments(html: string): string {
  let s = String(html)
  let prev: string
  do {
    prev = s
    s = s.replace(/<!--[\s\S]*?-->/g, '')
  } while (s !== prev)
  return s.replace(/<!--[\s\S]*$/, '')
}

/**
 * Null-sentinel guard. Returns null for absent values, the sentinels in
 * NULL_SENTINELS, and anything carrying unrendered template source.
 */
export function nullable(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  if (NULL_SENTINELS.has(trimmed.toLowerCase())) return null
  if (TEMPLATE_LEAK.test(trimmed)) return null
  return trimmed
}

/**
 * Multi-word sentinels that themselves CONTAIN a comma, and so must be removed
 * before the list is split. `Other, specify` is a leaked Umbraco form option
 * seen inside "STIs tested for" values; splitting first yields the two junk
 * members `Other` and `specify`, neither of which any per-member check can
 * recognise as the single sentinel it came from.
 */
const COMMA_BEARING_SENTINELS = [/\bother\s*,\s*specify\b/gi]

/**
 * Split a comma-separated value list, dropping empties (their lists routinely
 * carry a trailing comma) and sentinel members.
 */
export function splitList(value: string | null | undefined): string[] {
  const cleaned = nullable(value)
  if (!cleaned) return []
  let working = cleaned
  for (const sentinel of COMMA_BEARING_SENTINELS) working = working.replace(sentinel, '')
  return working
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter((part) => nullable(part) !== null)
}

/**
 * Coordinate parse with the 0,0 guard (trap 4). Returns null unless BOTH
 * components are finite and the pair is not the origin sentinel.
 */
export function parseCoords(
  latRaw: string | null | undefined,
  lngRaw: string | null | undefined,
): { lat: number | null; lng: number | null } {
  const lat = Number.parseFloat(String(latRaw ?? '').trim())
  const lng = Number.parseFloat(String(lngRaw ?? '').trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null }
  if (lat === 0 && lng === 0) return { lat: null, lng: null }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { lat: null, lng: null }
  return { lat, lng }
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

/** "Last updated: 15 November, 2021" -> "2021-11-15". Null when unparseable. */
export function parseLastUpdated(text: string | null | undefined): string | null {
  const cleaned = nullable(text)
  if (!cleaned) return null
  const m = cleaned.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/)
  if (!m) return null
  const month = MONTHS[m[2].toLowerCase()]
  if (!month) return null
  const day = m[1].padStart(2, '0')
  return `${m[3]}-${month}-${day}`
}

/** Split a dual local/English title. Returns nulls when there is no " / ". */
export function splitDualTitle(name: string): { local: string | null; english: string | null } {
  const parts = name.split(/\s+\/\s+/)
  if (parts.length !== 2) return { local: null, english: null }
  const [local, english] = parts.map((p) => p.trim())
  if (!local || !english) return { local: null, english: null }
  return { local, english }
}

/** Their hrefs are protocol-relative (`//www.example.com`). Normalize to https. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const cleaned = nullable(raw)
  if (!cleaned) return null
  let url = cleaned
  if (url.startsWith('//')) url = `https:${url}`
  else if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/**
 * `/centers/checkpoint-frederiksberg/` -> `checkpoint-frederiksberg`.
 *
 * DECODE ENTITIES FIRST. Slugs in non-Latin-alphabet countries are published
 * as HTML numeric character references — Georgia's is
 *   /centers/&#x10D0;&#x10EE;&#x10D0;&#x10DA;&#x10D8;-&#x10D2;&#x10D6;&#x10D0;-…/
 * — and `&#x10D0;` contains a literal `#`. A `[^/?#]+` capture treats that as
 * the start of a URL fragment and stops dead, returning the single character
 * `&`. Measured: 18 centres across Georgia, Greece, Israel, Cyprus, North
 * Macedonia and Ukraine ALL produced the slug `&`, so they deduplicated into
 * one row and 17 real testing sites vanished — silently, because a collapsed
 * map key looks exactly like a source that listed fewer sites.
 *
 * Decoding before matching turns the reference back into the character it
 * denotes, and the fragment guard then means what it says.
 */
export function slugFromHref(href: string | null | undefined): string | null {
  const cleaned = nullable(href)
  if (!cleaned) return null
  const decoded = decodeEntities(cleaned)
  const m = decoded.match(/\/centers\/([^/?#]+)/i)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    // A stray '%' that is not a valid escape throws; the raw form is still a
    // usable stable key.
    return m[1]
  }
}

// ---------------------------------------------------------------------------
// Label extraction
// ---------------------------------------------------------------------------

/**
 * Pull every `<p class="service-item"><strong>Label</strong>Value</p>` pair,
 * plus the unlabelled paragraphs that follow a labelled one (trap 2).
 *
 * Label keys are normalized to lowercase with the trailing colon removed,
 * because `HIV testing is free for` ships without one while its siblings all
 * have it (trap 5).
 */
export function parseServiceItems(html: string): {
  labelled: Map<string, string>
  iconFields: { phone: string | null; email: string | null; website: string | null }
} {
  const doc = stripComments(html)
  const labelled = new Map<string, string>()
  const iconFields = {
    phone: null as string | null,
    email: null as string | null,
    website: null as string | null,
  }

  let lastLabel: string | null = null

  const paraRe = /<p[^>]*class="[^"]*service-item[^"]*"[^>]*>([\s\S]*?)<\/p>/gi
  let match: RegExpExecArray | null
  while ((match = paraRe.exec(doc)) !== null) {
    const inner = match[1]

    const strongMatch = inner.match(/<strong>([\s\S]*?)<\/strong>([\s\S]*)/i)
    if (strongMatch) {
      const label = cleanText(strongMatch[1]).replace(/:\s*$/, '').toLowerCase()
      const value = cleanText(strongMatch[2])
      if (label) {
        labelled.set(label, value)
        lastLabel = label
      }
      continue
    }

    // Unlabelled paragraph. Icon-discriminated contact fields first — these are
    // standalone rows, not continuations, so they must not be appended to the
    // previous label.
    const hasPhoneIcon = /fa-phone/i.test(inner)
    const hasMailIcon = /fa-at|fa-envelope|mailto:/i.test(inner)
    const hasGlobeIcon = /fa-globe/i.test(inner)

    if (hasPhoneIcon || hasMailIcon || hasGlobeIcon) {
      lastLabel = null
      const hrefMatch = inner.match(/href="([^"]+)"/i)
      const text = cleanText(inner)
      if (hasPhoneIcon) iconFields.phone = nullable(text)
      else if (hasMailIcon) {
        const mailto = hrefMatch?.[1]?.replace(/^mailto:/i, '')
        iconFields.email = nullable(mailto ?? text)
      } else if (hasGlobeIcon) {
        iconFields.website = normalizeUrl(hrefMatch?.[1] ?? text)
      }
      continue
    }

    // A genuine continuation of the previous labelled field (trap 2).
    const continuation = cleanText(inner)
    if (continuation && lastLabel) {
      const existing = labelled.get(lastLabel) ?? ''
      labelled.set(lastLabel, existing ? `${existing}, ${continuation}` : continuation)
    }
  }

  return { labelled, iconFields }
}

function labelValue(labelled: Map<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const found = labelled.get(key.toLowerCase().replace(/:\s*$/, ''))
    const cleaned = nullable(found)
    if (cleaned) return cleaned
  }
  return null
}

// ---------------------------------------------------------------------------
// Page parsers
// ---------------------------------------------------------------------------

/** Country `<option>` values from the search form. */
export function parseCountryList(html: string): string[] {
  const doc = stripComments(html)
  const selectMatch = doc.match(/<select[^>]*name="country"[^>]*>([\s\S]*?)<\/select>/i)
  if (!selectMatch) return []
  const out: string[] = []
  const optRe = /<option\s+value="([^"]*)"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = optRe.exec(selectMatch[1])) !== null) {
    const value = decodeEntities(m[1]).trim()
    if (value) out.push(value)
  }
  return out
}

/** "Found 12 matching results" -> 12. Null when the phrase is absent. */
export function parseResultCount(html: string): number | null {
  const m = stripComments(html).match(/Found\s+(\d+)\s+matching results/i)
  return m ? Number.parseInt(m[1], 10) : null
}

/** Every result card on a `/search?country=<Name>` page. */
export function parseSearchResults(html: string): TestFinderCenter[] {
  const doc = stripComments(html)
  const cardRe = /<div\s+id="[^"]*"\s+class="col-md-4 results__sites">([\s\S]*?)(?=<div\s+id="[^"]*"\s+class="col-md-4 results__sites">|<\/div>\s*<\/div>\s*<\/div>|$)/gi

  const out: TestFinderCenter[] = []
  let match: RegExpExecArray | null
  while ((match = cardRe.exec(doc)) !== null) {
    const card = match[1]

    const titleMatch = card.match(
      /<h3[^>]*class="[^"]*results__site-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    const slug = slugFromHref(titleMatch?.[1])
    const name = cleanText(titleMatch?.[2] ?? '')
    // A card with no slug has no stable identity and must not be imported.
    if (!slug || !name) continue

    const { labelled, iconFields } = parseServiceItems(card)
    const dual = splitDualTitle(name)

    // Services come from the card's own `results__infections` paragraph, which
    // holds the whole list in one element (trap 2).
    const infectionsMatch = card.match(
      /<p[^>]*class="[^"]*results__infections[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    )
    const servicesRaw = infectionsMatch
      ? cleanText(infectionsMatch[1]).replace(/^Services offered:\s*/i, '')
      : labelValue(labelled, 'services offered')

    const coords = parseCoords(
      card.match(/class="addressLat"[^>]*>([\s\S]*?)<\/p>/i)?.[1],
      card.match(/class="addressLng"[^>]*>([\s\S]*?)<\/p>/i)?.[1],
    )

    out.push({
      slug,
      name,
      nameLocal: dual.local,
      nameEnglish: dual.english,
      country: nullable(cleanText(card.match(/class="results__country"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')),
      city: nullable(cleanText(card.match(/class="results__city"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')),
      street: nullable(cleanText(card.match(/class="results__street"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')),
      lastUpdated: parseLastUpdated(
        cleanText(card.match(/class="results__last-updated"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? ''),
      ),
      phone: iconFields.phone,
      email: iconFields.email,
      website: iconFields.website,
      services: splitList(servicesRaw),
      stiTestedFor: splitList(labelValue(labelled, 'stis tested for')),
      referral: labelValue(labelled, 'referral for test'),
      lat: coords.lat,
      lng: coords.lng,
    })
  }
  return out
}

/** A `/centers/<slug>/` detail page. `slug` is passed in — the page omits it. */
export function parseCenterDetail(html: string, slug: string): TestFinderCenterDetail | null {
  const doc = stripComments(html)

  const name =
    cleanText(doc.match(/<h3[^>]*class="[^"]*results__site-title-subpage[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '') ||
    cleanText(doc.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  if (!name) return null

  const { labelled, iconFields } = parseServiceItems(doc)
  const dual = splitDualTitle(name)
  const coords = parseCoords(
    doc.match(/class="addressLat"[^>]*>([\s\S]*?)<\/p>/i)?.[1],
    doc.match(/class="addressLng"[^>]*>([\s\S]*?)<\/p>/i)?.[1],
  )

  return {
    slug,
    name,
    nameLocal: dual.local,
    nameEnglish: dual.english,
    country: nullable(cleanText(doc.match(/class="results__country"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')),
    city: nullable(cleanText(doc.match(/class="results__city"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')),
    street: nullable(cleanText(doc.match(/class="results__street"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '')),
    lastUpdated: parseLastUpdated(
      cleanText(doc.match(/class="results__last-updated"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? ''),
    ),
    phone: iconFields.phone,
    email: iconFields.email,
    website: iconFields.website,
    services: splitList(labelValue(labelled, 'services offered')),
    stiTestedFor: splitList(labelValue(labelled, 'stis tested for', 'sti test types')),
    referral: labelValue(labelled, 'referral for test'),
    lat: coords.lat,
    lng: coords.lng,
    openingHours: labelValue(labelled, 'testing site opening hours', 'opening hours'),
    hivFreeFor: labelValue(labelled, 'hiv testing is free for'),
    hepatitisFreeFor: labelValue(labelled, 'hepatitis testing is free for'),
    stiFreeFor: labelValue(labelled, 'sti testing is free for'),
    stiTestTypes: splitList(labelValue(labelled, 'sti test types')),
    hivTestTypes: splitList(labelValue(labelled, 'hiv test types')),
    servicesAccess: labelValue(labelled, 'services access'),
    bookingWebsite: normalizeUrl(labelValue(labelled, 'website for booking appointments')),
    bookingPhone: labelValue(labelled, 'phone number for booking appointments'),
    siteType: labelValue(labelled, 'testing site type'),
    targetPopulation: splitList(labelValue(labelled, 'target population')),
  }
}

// ---------------------------------------------------------------------------
// Vocabulary mapping
// ---------------------------------------------------------------------------

/**
 * Source service labels -> our amenity slugs.
 *
 * These labels are typed by site administrators across 46 countries, so they
 * are free-ish text and the rules have to tolerate padding INSIDE the phrase,
 * not merely around it. The measured case that broke a naive
 * `/sti testing/` rule is Serbia's JAZAAS, which writes
 *   "STI (Sexually Transmitted Infections) testing"
 * — the words are separated by a parenthetical gloss, so an adjacent-words
 * pattern silently produced a testing centre with no `sti-testing` tag.
 * Hence `\bsti\b[\s\S]*test` rather than `sti test`.
 *
 * `\b` around `sti` and `hiv` is load-bearing in the other direction:
 * "Hepatitis" contains the letters `sti`, so an unanchored `sti` arm tags
 * every hepatitis-only site as an STI testing site.
 *
 * Psychosocial counselling is a DIFFERENT service from testing-related
 * counselling and gets its own tag — the first draft matched a bare
 * `/counsel/` and labelled "Psychosocial counselling and support" as
 * testing counselling, which is a claim the source never made.
 */
const SERVICE_RULES: Array<{ match: RegExp; tag: string }> = [
  { match: /hepatitis/i, tag: 'hepatitis-testing' },
  { match: /partner notification/i, tag: 'partner-notification' },
  { match: /psychosocial|psycho-social|mental health/i, tag: 'psychosocial-support' },
  { match: /testing[\s-]*related counsel|test.*counsel|counsel.*test/i, tag: 'testing-counselling' },
  { match: /\btreatment\b/i, tag: 'sti-treatment' },
  { match: /\bhiv\b[\s\S]*test/i, tag: 'hiv-testing' },
  { match: /\bsti\b[\s\S]*test|sexually transmitted[\s\S]*test/i, tag: 'sti-testing' },
  { match: /\bprep\b|pre-?exposure prophylaxis/i, tag: 'prep' },
  { match: /\bpep\b|post-?exposure prophylaxis/i, tag: 'pep' },
  { match: /vaccinat|immunis|immuniz/i, tag: 'vaccination' },
  // The long tail, measured across all 530 centres rather than guessed:
  // "Referral for prevention" appears on 199 of them, "family planning" and
  // "Contraception & sexual health counselling" on 152 between them,
  // needle-syringe programmes on 62, TB services on 55. Left unmapped these
  // were the four largest silently-untagged services in the corpus.
  { match: /referral for prevention|prevention referral/i, tag: 'prevention-referral' },
  { match: /family planning|contraception/i, tag: 'family-planning' },
  { match: /needle[\s-]*syringe|needle exchange|harm reduction/i, tag: 'needle-exchange' },
  { match: /tuberculosis|\btb\b/i, tag: 'tuberculosis-services' },
]

/**
 * A bare disease name in a "Services offered" list means testing for it.
 *
 * Two centres list the service as literally "HIV" and "STI (Sexually
 * Transmitted Infections)" — no verb. On a directory whose entire purpose is
 * testing locations, that is not ambiguous, but the `.*test` arms above cannot
 * see it. Strip a trailing parenthetical gloss and check for an exact bare
 * name, so this stays a narrow reading of an obvious case rather than a loose
 * substring rule that would also fire on "HIV treatment only".
 */
const BARE_DISEASE: Array<{ name: RegExp; tag: string }> = [
  { name: /^hiv$/i, tag: 'hiv-testing' },
  { name: /^stis?$/i, tag: 'sti-testing' },
  { name: /^(viral )?hepatitis$/i, tag: 'hepatitis-testing' },
]

function bareDiseaseTag(service: string): string | null {
  const stripped = service.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return BARE_DISEASE.find((r) => r.name.test(stripped))?.tag ?? null
}

/**
 * Service labels that produced no tag. The importer prints these per run so an
 * unrecognised label from a country we have not sampled shows up as a visible
 * gap rather than a silently untagged centre.
 */
export function unmappedServices(services: string[]): string[] {
  return services.filter(
    (service) =>
      !SERVICE_RULES.some((rule) => rule.match.test(service)) && bareDiseaseTag(service) === null,
  )
}

const ACCESS_RULES: Array<{ match: RegExp; tag: string }> = [
  { match: /walk in|walk-in|drop in|drop-in/i, tag: 'walk-in' },
  { match: /appointment/i, tag: 'appointment-required' },
]

const TEST_TYPE_RULES: Array<{ match: RegExp; tag: string }> = [
  { match: /rapid test|finger prick|point of care/i, tag: 'rapid-test' },
  { match: /self[- ]?test|self[- ]?sampling|home test/i, tag: 'self-test' },
]

/**
 * Build our tag slugs from a centre's fields.
 *
 * `anonymous-testing` is deliberately NOT inferred from prose — the source has
 * no anonymity field, and guessing it wrong on health content is exactly the
 * kind of fabricated claim this repo's safety rules forbid.
 */
export function serviceTags(center: Partial<TestFinderCenterDetail>): string[] {
  const tags = new Set<string>()

  for (const service of center.services ?? []) {
    let matched = false
    for (const rule of SERVICE_RULES) {
      if (rule.match.test(service)) {
        tags.add(rule.tag)
        matched = true
      }
    }
    if (!matched) {
      const bare = bareDiseaseTag(service)
      if (bare) tags.add(bare)
    }
  }

  if (center.servicesAccess) {
    for (const rule of ACCESS_RULES) {
      if (rule.match.test(center.servicesAccess)) tags.add(rule.tag)
    }
    // "Walk in/drop in & by appointment" offers both, so appointment is not
    // *required*. Only a walk-in-less site genuinely requires one.
    if (tags.has('walk-in')) tags.delete('appointment-required')
  }

  for (const testType of [...(center.hivTestTypes ?? []), ...(center.stiTestTypes ?? [])]) {
    for (const rule of TEST_TYPE_RULES) {
      if (rule.match.test(testType)) tags.add(rule.tag)
    }
  }

  // Referral is a genuine boolean-ish field with a controlled-enough vocabulary.
  if (center.referral && /unnecessary|not (required|needed)|no referral/i.test(center.referral)) {
    tags.add('no-referral-needed')
  }

  // "free for" fields naming any group at all mean some cohort tests free.
  if (center.hivFreeFor || center.hepatitisFreeFor || center.stiFreeFor) {
    tags.add('free-testing')
  }

  return [...tags].sort()
}

/**
 * Source "Target population" values, lowercased and de-duplicated, ready to be
 * resolved against `public.target_groups` (slug / name / aliases) IN SQL.
 *
 * There is deliberately NO TypeScript slug map here. `target_groups` is a
 * 30-row table whose `aliases` column is the documented extension point
 * ("extend target_groups.aliases, no migration needed" — CLAUDE.md), so a
 * hardcoded mirror would be a second source of truth that silently drifts.
 * The first draft of this function had three slugs that do not exist
 * (`sex-workers`, `people-who-use-drugs`, `everyone`) and mapped gay men to
 * `gay-men` when the real slug is `gay` — which is exactly the drift the table
 * lookup prevents.
 *
 * Unresolvable values are dropped by the SQL side rather than passed through:
 * `target_groups` is an exact-match filter and a live search facet, so free
 * text breaks both.
 */
export function targetPopulationTerms(values: string[]): string[] {
  const out = new Set<string>()
  for (const value of values) {
    const key = value.toLowerCase().replace(/\s+/g, ' ').trim()
    if (key && nullable(key)) out.add(key)
  }
  return [...out].sort()
}
