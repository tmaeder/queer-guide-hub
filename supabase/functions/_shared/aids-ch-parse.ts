// Parsers for the Swiss AIDS Federation health-centre directory
// (aids.ch/en/addresses — the public face of repertoire-sante-sexuelle.ch,
// the national sexual-health referral registry run with Sexuelle Gesundheit
// Schweiz).
//
// WHY THERE IS NO HTML IN HERE. `/en/addresses/` server-renders an EMPTY list:
// the Vue app hydrates and the `contentBlocksMap` component fetches the whole
// corpus as one JSON document from the URL below (found in
// `/assets/content-blocks-map-*.js`). 201 records, one request, no pagination,
// no key. Scraping the rendered DOM would be slower, lossier and more fragile
// than reading the document the page itself reads.
//
// IDENTITY IS `record.id`, THEIRS NOT OURS. The registry's own
// `reportChangeUrl` is `.../report-change/<id>/`, which is the proof that the
// integer is the registry's stable primary key rather than an array position.
// `import-patroc.mjs:14-25` records why that distinction is load-bearing: the
// 2026-04-26 Spartacus cohort keyed on a name-derived id and duplicated 47% of
// itself the first time an operator renamed a venue.
//
// FOUR traps this module exists to absorb, each measured against the live
// document on 2026-08-29 rather than assumed:
//
//  1. EVERY LOCALIZED FIELD IS PRESENT-BUT-EMPTY, NEVER ABSENT. `name` and
//     `description` are always `{de,fr,it,en}` with `""` for the languages a
//     centre never filled in. `rec.name.en ?? rec.name.de` therefore ALWAYS
//     returns the empty English string — `??` only falls through on
//     null/undefined. Only 31 of 201 centres have an English name; 108 are
//     German-only, 56 French-only, 6 Italian-only. Emptiness must be tested,
//     not nullishness. (Same class as the news `||` vs `??` note in
//     pipeline-validate.)
//
//  2. CONTACT ARRAYS ARE TYPED AND UNORDERED. `phoneNumbers`, `emailAddresses`
//     and `urls` are `[{type,value}]` where type is main/consulting/testing/
//     treatment/emergency/other. Taking `[0]` publishes a testing-line number
//     as the switchboard on the 6 records that list one first. `main` wins;
//     the rest are preserved in `detail` rather than dropped, because "the
//     testing hotline" is exactly the number a user of this directory wants.
//
//  3. `accessibility` IS A ONE-VALUE ARRAY, NOT A BOOLEAN. Its only member in
//     the whole corpus is `wheelchair` (93 of 201). An absent array means "not
//     stated", NOT "not accessible" — so it maps to `wheelchair-accessible`
//     when present and to nothing at all when absent. Never invert it into
//     `not-wheelchair-accessible`; that vocabulary term is a positive
//     assertion the source has not made.
//
//  4. `serviceChannels` CANNOT EXPRESS "APPOINTMENT REQUIRED". It lists what a
//     centre offers, so `without_appointment` present means walk-in and
//     `without_appointment` absent means unknown. testfinder-parse can derive
//     `appointment-required` because its source states access mode as a closed
//     field; this one cannot, and guessing it would tell a user to book when
//     they could have walked in.
//
// LABELS ARE RESOLVED FROM THE FEED, NOT HARDCODED. The document ships its own
// `additionalData.labels` map (`{group: {key: {de,fr,it,en}}}`) covering all
// ten controlled vocabularies. Copying those strings in here would freeze them
// at import time and silently rot; `resolveLabels` reads them per run instead.

/** The document the `/en/addresses/` map component fetches on hydration. */
export const AIDS_CH_FEED_URL =
  'https://activepieces.do.five-agency.ch/api/v1/webhooks/YutlqfUGSxZ5Rhcn0gtw5/sync'

/** Public page the feed backs — used as `source.url` provenance. */
export const AIDS_CH_PAGE_URL = 'https://aids.ch/en/addresses/'

/** Provenance tag written to `organizations.tags`, mirroring 'european-test-finder'. */
export const AIDS_CH_SOURCE = 'aids-ch'

export type Localized = Partial<Record<'de' | 'fr' | 'it' | 'en', string>>

export interface TypedValue {
  type?: string
  value?: string
}

export interface AidsChRecord {
  id: number
  name: Localized
  centerType?: string[]
  street?: string
  supplement?: string
  zipCode?: string
  city?: string
  canton?: string
  accessibility?: string[]
  cantonsOfOperation?: string[]
  coordinates?: { lat?: string | number | null; lng?: string | number | null }
  phoneNumbers?: TypedValue[]
  emailAddresses?: TypedValue[]
  urls?: TypedValue[]
  hours_url?: string
  description?: Localized
  serviceLanguages?: string[]
  serviceSignLanguages?: Localized
  serviceChannels?: string[]
  serviceTopics?: string[]
  serviceTopicsOther?: Localized
  offeredTests?: string[]
  offeredTestsOther?: Localized
  offeredVaccinations?: string[]
  offeredVaccinationsOther?: Localized
  healthcareServices?: string[]
  additionalServices?: Localized
  specialisedGroups?: string[]
  certifications?: string[]
  memberships?: string[]
  campaignParticipations?: unknown
  reportChangeUrl?: string
}

export type LabelMap = Record<string, Record<string, Localized>>

export interface AidsChFeed {
  data: AidsChRecord[]
  additionalData?: { labels?: LabelMap; campaigns?: unknown }
}

/** Language preference for the English-first product. */
const LANG_ORDER = ['en', 'de', 'fr', 'it'] as const

/**
 * First non-EMPTY value across the language ladder.
 *
 * Trap 1 above: the keys always exist, so this must test emptiness. A `??`
 * chain returns `""` for the 170 centres with no English name.
 */
export function pickLocalized(v: Localized | null | undefined, order: readonly string[] = LANG_ORDER): string | null {
  if (!v) return null
  for (const lang of order) {
    const s = String((v as Record<string, unknown>)[lang] ?? '').trim()
    if (s) return s
  }
  return null
}

/** Which language `pickLocalized` actually used, for provenance. */
export function pickedLanguage(v: Localized | null | undefined, order: readonly string[] = LANG_ORDER): string | null {
  if (!v) return null
  for (const lang of order) {
    if (String((v as Record<string, unknown>)[lang] ?? '').trim()) return lang
  }
  return null
}

/** `main` first, then declaration order. Returns null when the array is empty. */
export function pickTyped(list: TypedValue[] | null | undefined, preferred = 'main'): string | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const main = list.find((e) => e?.type === preferred && String(e?.value ?? '').trim())
  const any = list.find((e) => String(e?.value ?? '').trim())
  const chosen = main ?? any
  return chosen ? String(chosen.value).trim() : null
}

/** Every typed contact except the one `pickTyped` promoted, kept for `detail`. */
export function secondaryContacts(list: TypedValue[] | null | undefined, preferred = 'main'): TypedValue[] {
  if (!Array.isArray(list)) return []
  const primary = pickTyped(list, preferred)
  return list
    .filter((e) => String(e?.value ?? '').trim() && String(e.value).trim() !== primary)
    .map((e) => ({ type: e.type ?? 'other', value: String(e.value).trim() }))
}

// ── Vocabulary → `public.amenities` slug ────────────────────────────────────
//
// Every target below is a slug that exists in `public.amenities`; the seven
// added by this import's migration are marked. Unmapped source terms are
// deliberately dropped rather than slugified — `commit_health_service_org`
// filters against the vocabulary table anyway, so an invented slug would be
// silently discarded there and this map would lie about coverage.

const TEST_TAGS: Record<string, string> = {
  hiv: 'hiv-testing',
  chlamydia: 'sti-testing',
  gonorrhoea: 'sti-testing',
  syphilis: 'sti-testing',
  hepatitis_ab: 'hepatitis-testing',
  hepatitis_c: 'hepatitis-testing',
  pregnancy: 'family-planning',
  drug_checking: 'drug-checking', // new
}

const HEALTHCARE_TAGS: Record<string, string> = {
  administering_prep: 'prep',
  administering_pep: 'pep',
  doxy_pep: 'doxy-pep', // new
  treating_stis: 'sti-treatment',
  hiv_treatment: 'hiv-treatment', // new
  psych_counselling: 'psychosocial-support',
  psychiatry: 'psychosocial-support',
  trans_medicine_gaht: 'gender-affirming-care', // new
  medical_abortion: 'abortion-care', // new
  surgical_abortion: 'abortion-care', // new
  administering_hec: 'family-planning',
  emergency_cop_iuds: 'family-planning',
  // gynaecological_exam_treat / family_medicine / urology / proctology /
  // screening_sex_violence / additional_services have no vocabulary term and
  // are carried in `detail` instead of being flattened into a near-miss.
}

const TOPIC_TAGS: Record<string, string> = {
  contraception: 'family-planning',
  emergency_contraception: 'family-planning',
  pergnancy: 'family-planning', // upstream spelling, kept verbatim as the key
  abortion: 'family-planning',
  conf_birth_adoption: 'family-planning',
  prenatal_examinations: 'family-planning',
  maternity_paternity: 'family-planning',
}

const CHANNEL_TAGS: Record<string, string> = {
  without_appointment: 'walk-in',
  anonymous: 'anonymous-testing', // new
  interpreter: 'interpreter-available', // new
  sign_lang_interpreter: 'sign-language-interpreted',
}

const ACCESSIBILITY_TAGS: Record<string, string> = {
  wheelchair: 'wheelchair-accessible',
}

/**
 * Voluntary Counselling and Testing is an accreditation, not a service list —
 * both the centre type and the certification assert it, and either is enough.
 */
const VCT_CENTER_TYPES = new Set(['hiv_sti_testcenter'])
const VCT_CERTIFICATIONS = new Set(['vct'])

/** Amenity/accessibility slugs a record supports, sorted and deduplicated. */
export function serviceTags(rec: AidsChRecord): string[] {
  const tags = new Set<string>()
  const add = (map: Record<string, string>, keys: string[] | undefined) => {
    for (const k of keys ?? []) {
      const slug = map[k]
      if (slug) tags.add(slug)
    }
  }

  add(TEST_TAGS, rec.offeredTests)
  add(HEALTHCARE_TAGS, rec.healthcareServices)
  add(TOPIC_TAGS, rec.serviceTopics)
  add(CHANNEL_TAGS, rec.serviceChannels)
  add(ACCESSIBILITY_TAGS, rec.accessibility)

  // Any vaccine at all is a vaccination service; which ones is in `detail`.
  if ((rec.offeredVaccinations ?? []).length) tags.add('vaccination')

  if ((rec.centerType ?? []).some((t) => VCT_CENTER_TYPES.has(t))) tags.add('testing-counselling')
  if ((rec.certifications ?? []).some((c) => VCT_CERTIFICATIONS.has(c))) tags.add('testing-counselling')

  // Trap 4: never derive `appointment-required` from the absence of walk-in.

  return [...tags].sort()
}

// ── "Specialised for" → `public.target_groups` ──────────────────────────────
//
// These are the site's own published filter facets ("Specialised for"), i.e.
// the centre's explicit claim about who it serves — not an inference from its
// service list. One source facet can legitimately cover several of our groups:
// "Gay, Bisexual and Queer Men" is not reducible to `gay` alone.
//
// Terms are emitted as target_groups SLUGS. `commit_health_service_org` also
// matches names and aliases, so a slug rename upstream degrades to "no match"
// rather than to a wrong match.

const GROUP_TERMS: Record<string, string[]> = {
  teens: ['youth'],
  gay_bi_trans_queer_men: ['gay', 'bisexual'],
  gay_bi_trans_queer_women: ['lesbian', 'sapphic', 'bisexual'],
  trans_nonbinary: ['trans', 'non-binary'],
  male_sex_worker: ['sex-workers'], // new group
  female_sex_worker: ['sex-workers'],
  trans_sex_worker: ['sex-workers', 'trans'],
  people_w_hiv: ['people-with-hiv'], // new group
  people_with_disabilities: ['disabled'],
  immigrants: ['migrants'],
  substance_users: ['people-who-use-drugs'], // new group
}

export function targetTerms(rec: AidsChRecord): string[] {
  const out = new Set<string>()
  for (const g of rec.specialisedGroups ?? []) {
    for (const term of GROUP_TERMS[g] ?? []) out.add(term)
  }
  return [...out].sort()
}

/** Source facets that mark a centre as explicitly serving queer communities. */
const QUEER_GROUPS = new Set([
  'gay_bi_trans_queer_men',
  'gay_bi_trans_queer_women',
  'trans_nonbinary',
  'trans_sex_worker',
])

export function isQueerSpecialised(rec: AidsChRecord): boolean {
  return (rec.specialisedGroups ?? []).some((g) => QUEER_GROUPS.has(g))
}

/**
 * Turn the feed's own `additionalData.labels` into readable English strings.
 *
 * Falls back through the language ladder per term, and keeps the raw key when
 * the feed ships a value with no label at all — a bare key is honest, an
 * invented title-cased string is not.
 */
export function resolveLabels(keys: string[] | undefined, group: string, labels: LabelMap | undefined): string[] {
  return (keys ?? []).map((k) => pickLocalized(labels?.[group]?.[k]) ?? k)
}

/**
 * A numeric coordinate half, or null.
 *
 * `Number(null)` and `Number('')` are both **0**, not NaN, so a `Number.isFinite`
 * guard alone turns a missing longitude into a real-looking meridian. Emptiness
 * is therefore checked before coercion — the same shape as trap 1 one field over.
 */
function coordHalf(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Coordinates, or null when either half is missing or the pair is 0,0. */
export function coordsOf(rec: AidsChRecord): { lat: number; lng: number } | null {
  const lat = coordHalf(rec.coordinates?.lat)
  const lng = coordHalf(rec.coordinates?.lng)
  if (lat === null || lng === null) return null
  // Same guard as testfinder-parse: 0,0 is the "unknown" sentinel every map
  // library filters, not a point in the Gulf of Guinea.
  if (lat === 0 && lng === 0) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Street line plus the building/floor supplement.
 *
 * `supplement` holds things like "Haus 3 / 1.Obergeschoss" and "MEDIN
 * Biel-Bienne" — genuinely part of finding the door, and there is no other
 * column for it.
 */
export function addressOf(rec: AidsChRecord): string | null {
  const parts = [rec.street, rec.supplement].map((s) => String(s ?? '').trim()).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export interface HealthServicePayload {
  external_id: string
  name: string
  description: string | null
  website: string | null
  email: string | null
  phone: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string
  country_code: string
  latitude: number | null
  longitude: number | null
  tags: string[]
  target_terms: string[]
  source: Record<string, unknown>
  detail: Record<string, unknown>
}

/**
 * One feed record → the jsonb `commit_health_service_org` consumes.
 *
 * Everything the controlled vocabularies cannot express is preserved verbatim
 * under `detail`, resolved to English labels where the feed provides them. The
 * whole point of an "other" free-text field (`serviceTopicsOther`,
 * `offeredVaccinationsOther`, `additionalServices`) is that it holds the thing
 * no enum covers, so dropping it would discard the most specific information
 * in the record.
 */
export function toPayload(rec: AidsChRecord, labels?: LabelMap, fetchedAt = new Date().toISOString()): HealthServicePayload {
  const name = pickLocalized(rec.name)
  if (!name) throw new Error(`aids-ch record ${rec.id} has no name in any language`)

  const coords = coordsOf(rec)

  return {
    external_id: String(rec.id),
    name,
    description: pickLocalized(rec.description),
    website: pickTyped(rec.urls),
    email: pickTyped(rec.emailAddresses),
    phone: pickTyped(rec.phoneNumbers),
    address: addressOf(rec),
    postal_code: String(rec.zipCode ?? '').trim() || null,
    city: String(rec.city ?? '').trim() || null,
    country: 'Switzerland',
    country_code: 'CH',
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    tags: serviceTags(rec),
    target_terms: targetTerms(rec),
    source: {
      name: AIDS_CH_SOURCE,
      external_id: String(rec.id),
      url: AIDS_CH_PAGE_URL,
      feed_url: AIDS_CH_FEED_URL,
      report_change_url: rec.reportChangeUrl ?? null,
      fetched_at: fetchedAt,
      registry: 'repertoire-sante-sexuelle.ch',
    },
    detail: {
      // Which language each free-text field came from, so a future English
      // translation pass knows what it is translating and from what.
      name_language: pickedLanguage(rec.name),
      description_language: pickedLanguage(rec.description),
      canton: rec.canton ?? null,
      cantons_of_operation: rec.cantonsOfOperation ?? [],
      center_types: resolveLabels(rec.centerType, 'centerType', labels),
      center_type_keys: rec.centerType ?? [],
      service_topics: resolveLabels(rec.serviceTopics, 'serviceTopics', labels),
      service_topics_other: pickLocalized(rec.serviceTopicsOther),
      healthcare_services: resolveLabels(rec.healthcareServices, 'healthcareServices', labels),
      offered_tests: resolveLabels(rec.offeredTests, 'offeredTests', labels),
      offered_tests_other: pickLocalized(rec.offeredTestsOther),
      offered_vaccinations: resolveLabels(rec.offeredVaccinations, 'offeredVaccinations', labels),
      offered_vaccinations_other: pickLocalized(rec.offeredVaccinationsOther),
      additional_services: pickLocalized(rec.additionalServices),
      service_channels: resolveLabels(rec.serviceChannels, 'serviceChannels', labels),
      service_languages: rec.serviceLanguages ?? [],
      service_sign_languages: pickLocalized(rec.serviceSignLanguages),
      specialised_groups: resolveLabels(rec.specialisedGroups, 'specialisedGroups', labels),
      specialised_group_keys: rec.specialisedGroups ?? [],
      queer_specialised: isQueerSpecialised(rec),
      certifications: resolveLabels(rec.certifications, 'certifications', labels),
      memberships: resolveLabels(rec.memberships, 'memberships', labels),
      accessibility: rec.accessibility ?? [],
      opening_hours_url: rec.hours_url || null,
      other_phones: secondaryContacts(rec.phoneNumbers),
      other_emails: secondaryContacts(rec.emailAddresses),
      other_urls: secondaryContacts(rec.urls),
    },
  }
}

/** Whole-feed convenience: parse, map, and report what was skipped and why. */
export function payloadsFromFeed(
  feed: AidsChFeed,
  fetchedAt = new Date().toISOString(),
): { payloads: HealthServicePayload[]; skipped: Array<{ id: unknown; reason: string }> } {
  const labels = feed.additionalData?.labels
  const payloads: HealthServicePayload[] = []
  const skipped: Array<{ id: unknown; reason: string }> = []

  for (const rec of feed.data ?? []) {
    try {
      payloads.push(toPayload(rec, labels, fetchedAt))
    } catch (e) {
      skipped.push({ id: rec?.id, reason: (e as Error).message })
    }
  }
  return { payloads, skipped }
}
