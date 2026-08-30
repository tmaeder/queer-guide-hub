import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  addressOf,
  coordsOf,
  isQueerSpecialised,
  payloadsFromFeed,
  pickLocalized,
  pickedLanguage,
  pickTyped,
  resolveLabels,
  secondaryContacts,
  serviceTags,
  targetTerms,
  toPayload,
  type AidsChRecord,
  type LabelMap,
} from './aids-ch-parse.ts'

// Trimmed verbatim from the live feed on 2026-08-30 (record id 18, the first in
// the document). Every localized field keeps its present-but-empty siblings,
// because those empties ARE trap 1.
const RECORD: AidsChRecord = {
  id: 18,
  name: {
    de: 'Spital Langenthal, Familienplanungs- und Beratungsstelle',
    fr: '',
    it: '',
    en: '',
  },
  centerType: ['cs_857_5_agency', 'ipaas_lagh_2004', 'stgb_120c_agency'],
  street: 'St. Urbanstrasse 67',
  supplement: '',
  zipCode: '4900',
  city: 'Langenthal',
  canton: 'BE',
  accessibility: [],
  cantonsOfOperation: ['BE'],
  coordinates: { lat: '47.216104', lng: '7.793889' },
  phoneNumbers: [{ type: 'main', value: '+41 62 916 31 93' }],
  emailAddresses: [{ type: 'main', value: 'frauenklinik@sro.ch' }],
  urls: [{ type: 'main', value: 'https://www.sro.ch/gyn/' }],
  hours_url: 'https://www.sro.ch/gyn/',
  description: { de: 'Unser gynäkologisches Ambulatorium steht allen Frauen offen.', fr: '', it: '', en: '' },
  serviceLanguages: ['de', 'fr', 'en'],
  serviceSignLanguages: { de: '', fr: '', it: '', en: '' },
  serviceChannels: ['personally'],
  serviceTopics: ['contraception', 'emergency_contraception', 'pergnancy', 'abortion', 'prenatal_examinations'],
  serviceTopicsOther: { de: 'Vorsorgeuntersuchung mit Krebsabstrich', fr: '', it: '', en: '' },
  offeredTests: ['chlamydia', 'gonorrhoea', 'pregnancy'],
  offeredTestsOther: { de: '', fr: '', it: '', en: '' },
  offeredVaccinations: ['hpv', 'hep_ab'],
  offeredVaccinationsOther: { de: 'Boostrix, MMR, Twinrix', fr: '', it: '', en: '' },
  healthcareServices: ['gynaecological_exam_treat', 'administering_hec'],
  additionalServices: { de: 'Schwangerschaftsbetreuung', fr: '', it: '', en: '' },
  specialisedGroups: [],
  certifications: [],
  memberships: [],
  campaignParticipations: [],
  reportChangeUrl: 'https://repertoire-sante-sexuelle.ch/de/report-change/18/',
}

const LABELS: LabelMap = {
  centerType: {
    cs_857_5_agency: {
      de: 'Schwangerschaftsberatungsstelle',
      en: 'Counselling Centre for Sexual and Reproductive Health',
    },
    hiv_sti_testcenter: { de: 'HIV/STI Testzentren', en: 'HIV/STI Testing Centres (VCT-Centres)' },
    // Deliberately no label for ipaas_lagh_2004 / stgb_120c_agency: resolveLabels
    // must fall back to the raw key rather than invent a title.
  },
  specialisedGroups: {
    gay_bi_trans_queer_men: { de: 'Schwule, bisexuelle und queere Männer', en: 'Gay, Bisexual and Queer Men' },
  },
}

/** A queer-specialised testing centre, the other half of the corpus. */
const TESTING_RECORD: AidsChRecord = {
  id: 42,
  name: { de: '', fr: '', it: '', en: 'Checkpoint Zurich' },
  centerType: ['hiv_sti_testcenter', 'regional_aids_relief_organisations'],
  street: 'Konradstrasse 1',
  supplement: '2. Stock',
  zipCode: '8005',
  city: 'Zürich',
  canton: 'ZH',
  accessibility: ['wheelchair'],
  coordinates: { lat: 47.3808, lng: 8.5364 },
  phoneNumbers: [
    { type: 'testing', value: '+41 44 000 00 02' },
    { type: 'main', value: '+41 44 000 00 01' },
  ],
  emailAddresses: [{ type: 'main', value: 'info@example.ch' }],
  urls: [
    { type: 'testing', value: 'https://example.ch/test' },
    { type: 'main', value: 'https://example.ch' },
  ],
  description: { de: 'Testzentrum', fr: '', it: '', en: '' },
  serviceChannels: ['personally', 'without_appointment', 'anonymous', 'interpreter', 'sign_lang_interpreter'],
  serviceTopics: ['hiv_stis', 'sexual_orientation', 'gender_identity'],
  offeredTests: ['hiv', 'syphilis', 'hepatitis_c', 'drug_checking'],
  offeredVaccinations: ['mpx'],
  healthcareServices: [
    'administering_prep',
    'administering_pep',
    'doxy_pep',
    'treating_stis',
    'hiv_treatment',
    'trans_medicine_gaht',
    'psych_counselling',
    'medical_abortion',
  ],
  specialisedGroups: ['gay_bi_trans_queer_men', 'trans_nonbinary', 'male_sex_worker', 'people_w_hiv', 'immigrants'],
  certifications: ['vct'],
  memberships: ['aids_help_ch_active'],
}

// ── trap 1: present-but-empty localized fields ──────────────────────────────

Deno.test('pickLocalized skips empty strings rather than only null', () => {
  // The whole point: `rec.name.en ?? rec.name.de` would return '' here.
  assertEquals(RECORD.name.en, '')
  assertEquals(pickLocalized(RECORD.name), 'Spital Langenthal, Familienplanungs- und Beratungsstelle')
  assertEquals(pickedLanguage(RECORD.name), 'de')
})

Deno.test('pickLocalized prefers English when it is actually filled in', () => {
  assertEquals(pickLocalized(TESTING_RECORD.name), 'Checkpoint Zurich')
  assertEquals(pickedLanguage(TESTING_RECORD.name), 'en')
})

Deno.test('pickLocalized returns null when every language is blank', () => {
  assertEquals(pickLocalized({ de: '', fr: '', it: '', en: '' }), null)
  assertEquals(pickLocalized(undefined), null)
  assertEquals(pickedLanguage({ de: '  ', en: '' }), null)
})

Deno.test('a record with no name in any language is rejected, not published blank', () => {
  assertThrows(() => toPayload({ ...RECORD, name: { de: '', fr: '', it: '', en: '' } }))
})

// ── trap 2: typed contact arrays ────────────────────────────────────────────

Deno.test('pickTyped promotes the main contact over declaration order', () => {
  // Array order puts the testing line first; publishing [0] would print the
  // testing hotline as the switchboard.
  assertEquals(pickTyped(TESTING_RECORD.phoneNumbers), '+41 44 000 00 01')
  assertEquals(pickTyped(TESTING_RECORD.urls), 'https://example.ch')
})

Deno.test('pickTyped falls back to the first usable entry when no main exists', () => {
  assertEquals(pickTyped([{ type: 'consulting', value: 'a@b.ch' }]), 'a@b.ch')
  assertEquals(pickTyped([{ type: 'main', value: '  ' }, { type: 'other', value: 'x@y.ch' }]), 'x@y.ch')
  assertEquals(pickTyped([]), null)
  assertEquals(pickTyped(undefined), null)
})

Deno.test('the non-primary contacts are preserved, not dropped', () => {
  assertEquals(secondaryContacts(TESTING_RECORD.phoneNumbers), [
    { type: 'testing', value: '+41 44 000 00 02' },
  ])
  assertEquals(secondaryContacts(TESTING_RECORD.urls), [
    { type: 'testing', value: 'https://example.ch/test' },
  ])
})

// ── trap 3: accessibility is an array, absence is not a negative claim ──────

Deno.test('wheelchair maps to the positive term only when the source states it', () => {
  assertEquals(serviceTags(TESTING_RECORD).includes('wheelchair-accessible'), true)
  const tags = serviceTags(RECORD)
  assertEquals(tags.includes('wheelchair-accessible'), false)
  // Absence must never become the opposite assertion.
  assertEquals(tags.includes('not-wheelchair-accessible'), false)
})

// ── trap 4: appointment-required is never inferred ──────────────────────────

Deno.test('walk-in is set from without_appointment and never inverted', () => {
  assertEquals(serviceTags(TESTING_RECORD).includes('walk-in'), true)
  // RECORD lists only `personally`, i.e. access mode unknown.
  assertEquals(serviceTags(RECORD).includes('walk-in'), false)
  assertEquals(serviceTags(RECORD).includes('appointment-required'), false)
  assertEquals(serviceTags(TESTING_RECORD).includes('appointment-required'), false)
})

// ── vocabulary mapping ──────────────────────────────────────────────────────

Deno.test('service tags cover tests, treatment, vaccines, channels and VCT', () => {
  assertEquals(serviceTags(TESTING_RECORD), [
    'abortion-care',
    'anonymous-testing',
    'doxy-pep',
    'drug-checking',
    'gender-affirming-care',
    'hepatitis-testing',
    'hiv-testing',
    'hiv-treatment',
    'interpreter-available',
    'pep',
    'prep',
    'psychosocial-support',
    'sign-language-interpreted',
    'sti-testing',
    'sti-treatment',
    'testing-counselling',
    'vaccination',
    'walk-in',
    'wheelchair-accessible',
  ])
})

Deno.test('a family-planning centre collapses its topics onto one term', () => {
  assertEquals(serviceTags(RECORD), ['family-planning', 'sti-testing', 'vaccination'])
})

Deno.test('unmapped source terms are dropped rather than slugified into fiction', () => {
  const tags = serviceTags(RECORD)
  // gynaecological_exam_treat has no vocabulary term.
  assertEquals(tags.some((t) => t.includes('gynaecological')), false)
  // hiv_stis is a counselling topic, not a testing-counselling accreditation.
  assertEquals(serviceTags({ id: 1, name: { en: 'x' }, serviceTopics: ['hiv_stis'] }), [])
})

Deno.test('testing-counselling comes from the VCT centre type or certification', () => {
  assertEquals(serviceTags({ id: 1, name: { en: 'x' }, centerType: ['hiv_sti_testcenter'] }), [
    'testing-counselling',
  ])
  assertEquals(serviceTags({ id: 1, name: { en: 'x' }, certifications: ['vct'] }), ['testing-counselling'])
})

Deno.test('one source facet can map to several target groups', () => {
  assertEquals(targetTerms(TESTING_RECORD), [
    'bisexual',
    'gay',
    'migrants',
    'non-binary',
    'people-with-hiv',
    'sex-workers',
    'trans',
  ])
  assertEquals(targetTerms(RECORD), [])
})

Deno.test('queer specialisation reads the published facet, not the service list', () => {
  assertEquals(isQueerSpecialised(TESTING_RECORD), true)
  assertEquals(isQueerSpecialised(RECORD), false)
  // A centre serving only sex workers of unspecified gender is not, by itself,
  // a claim about queer specialisation.
  assertEquals(isQueerSpecialised({ id: 1, name: { en: 'x' }, specialisedGroups: ['male_sex_worker'] }), false)
})

// ── geography and address ───────────────────────────────────────────────────

Deno.test('coordinates parse from strings and reject the 0,0 sentinel', () => {
  assertEquals(coordsOf(RECORD), { lat: 47.216104, lng: 7.793889 })
  assertEquals(coordsOf({ id: 1, name: {}, coordinates: { lat: 0, lng: 0 } }), null)
  assertEquals(coordsOf({ id: 1, name: {}, coordinates: { lat: '47.1', lng: null } }), null)
  assertEquals(coordsOf({ id: 1, name: {}, coordinates: { lat: 91, lng: 8 } }), null)
  assertEquals(coordsOf({ id: 1, name: {} }), null)
})

Deno.test('the building supplement joins the street line', () => {
  assertEquals(addressOf(RECORD), 'St. Urbanstrasse 67')
  assertEquals(addressOf(TESTING_RECORD), 'Konradstrasse 1, 2. Stock')
  assertEquals(addressOf({ id: 1, name: {} }), null)
})

// ── labels ──────────────────────────────────────────────────────────────────

Deno.test('labels resolve from the feed and fall back to the raw key', () => {
  assertEquals(resolveLabels(RECORD.centerType, 'centerType', LABELS), [
    'Counselling Centre for Sexual and Reproductive Health',
    'ipaas_lagh_2004',
    'stgb_120c_agency',
  ])
  assertEquals(resolveLabels(['x'], 'nope', LABELS), ['x'])
  assertEquals(resolveLabels(undefined, 'centerType', LABELS), [])
})

// ── payload shape ───────────────────────────────────────────────────────────

Deno.test('the payload carries identity, contact, geography and provenance', () => {
  const p = toPayload(TESTING_RECORD, LABELS, '2026-08-30T00:00:00.000Z')
  assertEquals(p.external_id, '42')
  assertEquals(p.name, 'Checkpoint Zurich')
  assertEquals(p.address, 'Konradstrasse 1, 2. Stock')
  assertEquals(p.postal_code, '8005')
  assertEquals(p.city, 'Zürich')
  assertEquals(p.country_code, 'CH')
  assertEquals(p.latitude, 47.3808)
  assertEquals(p.phone, '+41 44 000 00 01')
  assertEquals(p.website, 'https://example.ch')
  assertEquals(p.source.name, 'aids-ch')
  assertEquals(p.source.external_id, '42')
  assertEquals(p.source.report_change_url, null)
  assertEquals(p.detail.queer_specialised, true)
  assertEquals(p.detail.canton, 'ZH')
  assertEquals(p.detail.name_language, 'en')
  assertEquals(p.detail.description_language, 'de')
})

Deno.test('free-text "other" fields survive, because no enum covers them', () => {
  const p = toPayload(RECORD, LABELS)
  assertEquals(p.detail.offered_vaccinations_other, 'Boostrix, MMR, Twinrix')
  assertEquals(p.detail.service_topics_other, 'Vorsorgeuntersuchung mit Krebsabstrich')
  assertEquals(p.detail.additional_services, 'Schwangerschaftsbetreuung')
  assertEquals(p.detail.opening_hours_url, 'https://www.sro.ch/gyn/')
})

Deno.test('payloadsFromFeed reports what it skipped instead of silently losing it', () => {
  const { payloads, skipped } = payloadsFromFeed({
    data: [RECORD, { ...TESTING_RECORD, id: 43, name: { de: '', en: '' } }],
    additionalData: { labels: LABELS },
  })
  assertEquals(payloads.length, 1)
  assertEquals(payloads[0].external_id, '18')
  assertEquals(skipped.length, 1)
  assertEquals(skipped[0].id, 43)
})

Deno.test('an empty feed is an empty result, not a throw', () => {
  assertEquals(payloadsFromFeed({ data: [] }).payloads.length, 0)
  assertEquals(payloadsFromFeed({} as never).payloads.length, 0)
})
