import { assertEquals } from 'jsr:@std/assert'
import {
  isKnownPlaceholderPersonalityImage,
  normalizeLegacyPersonalityFields,
  normalizeWikidata,
  validatePersonalityContract,
} from '../_shared/personality-contract.ts'

Deno.test('normalizes bare and URL Wikidata identifiers without preserving sentinels', () => {
  assertEquals(normalizeWikidata('Q42'), { wikidata_qid: 'Q42', wikidata_status: 'resolved' })
  assertEquals(normalizeWikidata('https://www.wikidata.org/wiki/Q464699'), {
    wikidata_qid: 'Q464699', wikidata_status: 'resolved',
  })
  assertEquals(normalizeWikidata('SKIP_deadbeef'), {
    wikidata_qid: null, wikidata_status: 'not_found',
  })
})

Deno.test('extracts party objects and keeps only strings in legacy fields', () => {
  assertEquals(normalizeLegacyPersonalityFields([
    'Activism', { parties: ['Green Party', 'Green Party'] }, 7,
  ]), {
    fields: ['Activism'],
    affiliations: [{ affiliation_type: 'political_party', name: 'Green Party' }],
    rejected: [7],
  })
})

Deno.test('detects known placeholder and season-artwork images', () => {
  assertEquals(isKnownPlaceholderPersonalityImage('https://x/pics/pornstars/default/male.jpg'), true)
  assertEquals(isKnownPlaceholderPersonalityImage('https://x/Drag_Race_Season_2_poster.jpg'), true)
  assertEquals(isKnownPlaceholderPersonalityImage('https://x/person-portrait.jpg'), false)
})

Deno.test('contract catches malformed identity, dates, fields and summary duplication', () => {
  const result = validatePersonalityContract({
    name: 'Example Person', wikidata_qid: 'SKIP_x', birth_date: '2020-01-01',
    death_date: '2019-01-01', is_living: true, description: 'same', bio: 'same',
    fields: [{ parties: ['Example Party'] }], image_url: 'https://x/default/male.jpg',
  })
  assertEquals(result.errors.includes('E_INVALID_WIKIDATA_QID'), true)
  assertEquals(result.errors.includes('E_BIRTH_AFTER_DEATH'), true)
  assertEquals(result.errors.includes('E_LIVING_WITH_DEATH_DATE'), true)
  assertEquals(result.errors.includes('E_FIELDS_NOT_STRING_ARRAY'), true)
  assertEquals(result.errors.includes('E_PLACEHOLDER_IMAGE'), true)
  assertEquals(result.errors.includes('E_SUMMARY_EQUALS_BIO'), true)
})

Deno.test('contract keeps one primary profession and controlled role slugs', () => {
  const result = validatePersonalityContract({
    name: 'Example Person', profession: 'Actor, Director', roles: ['Film Director'],
    is_adult: true, tags: ['platform-category'],
  })
  assertEquals(result.errors.includes('E_PROFESSION_NOT_PRIMARY'), true)
  assertEquals(result.errors.includes('E_INVALID_ROLE_SLUG'), true)
  assertEquals(result.errors.includes('E_ADULT_TAGS_NOT_SEPARATED'), true)
})
