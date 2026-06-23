import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  decideCandidate,
  classifyFamily,
  composeStagingEmbedText,
  DEDUP_REGISTRY,
  type RawCandidate,
} from './dedup-engine.ts'

const venue = DEDUP_REGISTRY.venue
const event = DEDUP_REGISTRY.event
const city = DEDUP_REGISTRY.city
const country = DEDUP_REGISTRY.country
const news = DEDUP_REGISTRY.news

Deno.test('deterministic exact signal auto-merges', () => {
  const raws: RawCandidate[] = [{ entity_id: 'a', match_type: 'phone_exact', score: 1.0, distance_m: 20 }]
  const v = decideCandidate(venue, raws, {})
  assertEquals(v.decision, 'duplicate')
  assertEquals(v.action, 'auto_merge')
  assertEquals(v.matchId, 'a')
})

Deno.test('semantic CONFIRMS a near-threshold deterministic match (lift into auto)', () => {
  // name_proximity 0.88 (just below 0.90 auto) + strong semantic confirm.
  const raws: RawCandidate[] = [
    { entity_id: 'a', match_type: 'name_proximity', score: 0.88, distance_m: 40 },
    { entity_id: 'a', match_type: 'semantic', score: 0.96, distance_m: 40 },
  ]
  const v = decideCandidate(venue, raws, {})
  // 0.88 + 0.06*0.96 = 0.9376 -> auto-merge
  assertEquals(v.decision, 'duplicate')
  assertEquals(v.score >= venue.thresholds.autoMerge, true)
})

Deno.test('semantic ALONE can only reach merge_candidate, never auto-merge', () => {
  const raws: RawCandidate[] = [{ entity_id: 'a', match_type: 'semantic', score: 0.999, distance_m: 30 }]
  const v = decideCandidate(venue, raws, {})
  assertEquals(v.decision, 'merge_candidate')
  assertEquals(v.action, 'flag_review')
  assertEquals(v.score < venue.thresholds.autoMerge, true)
})

Deno.test('weak semantic with no deterministic support stays unique', () => {
  // cosine 0.90 is below venue.standaloneReviewCosine (0.93) and there is no det signal.
  const raws: RawCandidate[] = [{ entity_id: 'a', match_type: 'semantic', score: 0.90, distance_m: 10 }]
  const v = decideCandidate(venue, raws, {})
  assertEquals(v.decision, 'unique')
  assertEquals(v.matchId, null)
})

Deno.test('geo guard vetoes a high-similarity venue 5km away', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'a', match_type: 'name_proximity', score: 0.95, distance_m: 5000 },
    { entity_id: 'a', match_type: 'semantic', score: 0.98, distance_m: 5000 },
  ]
  const v = decideCandidate(venue, raws, {})
  assertEquals(v.decision, 'unique')
  assertEquals(v.guardsFired.includes('geo>250m'), true)
})

Deno.test('event time guard vetoes same-title outside the 48h window', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'e', match_type: 'title_city_time', score: 0.95, distance_m: 100, time_diff_hours: 72 },
  ]
  const v = decideCandidate(event, raws, {})
  assertEquals(v.decision, 'unique')
  assertEquals(v.guardsFired.includes('time>48h'), true)
})

Deno.test('event within the time window still matches', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'e', match_type: 'venue_date_exact', score: 0.98, distance_m: 50, time_diff_hours: 12 },
  ]
  const v = decideCandidate(event, raws, {})
  assertEquals(v.decision, 'duplicate')
})

Deno.test('country guard vetoes same-name cities in different countries', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'c', match_type: 'name_proximity_country', score: 0.99, distance_m: null, country: 'United States' },
    { entity_id: 'c', match_type: 'semantic', score: 0.97, country: 'United States' },
  ]
  const v = decideCandidate(city, raws, { itemCountry: 'Australia' })
  assertEquals(v.decision, 'unique')
  assertEquals(v.guardsFired.includes('cross-country'), true)
})

Deno.test('country dedup ignores semantic (disabled) and uses code_exact', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'gb', match_type: 'code_exact', score: 1.0 },
    { entity_id: 'gb', match_type: 'semantic', score: 0.999 },
  ]
  const v = decideCandidate(country, raws, {})
  assertEquals(v.decision, 'duplicate')
  assertEquals(v.matchType, 'code_exact')
})

Deno.test('news semantic is confirm-only and cannot move a sub-review score', () => {
  // No fingerprint/url match here (handled out of band); a lone strong semantic
  // neighbour can flag review but confirmWeight=0 means it never lifts a det score.
  const raws: RawCandidate[] = [{ entity_id: 'n', match_type: 'semantic', score: 0.96 }]
  const v = decideCandidate(news, raws, {})
  assertEquals(v.decision, 'merge_candidate')
  assertEquals(v.score < news.thresholds.autoMerge, true)
})

Deno.test('best candidate wins when multiple entities match', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'weak', match_type: 'name_proximity', score: 0.80, distance_m: 50 },
    { entity_id: 'strong', match_type: 'phone_exact', score: 1.0, distance_m: 50 },
  ]
  const v = decideCandidate(venue, raws, {})
  assertEquals(v.matchId, 'strong')
})

Deno.test('classifyFamily buckets match types', () => {
  assertEquals(classifyFamily('semantic'), 'semantic')
  assertEquals(classifyFamily('phone_exact'), 'exact')
  assertEquals(classifyFamily('source_entity_id'), 'exact')
  assertEquals(classifyFamily('domain_proximity'), 'strong')
  assertEquals(classifyFamily('name_proximity'), 'fuzzy')
})

Deno.test('composeStagingEmbedText mirrors the worker text shape', () => {
  const text = composeStagingEmbedText({
    name: 'Café de Flore',
    description: 'Historic café',
    tags: ['cafe', 'historic'],
    category: 'cafe',
    location: { city: 'Paris', country: 'France' },
  })
  assertEquals(text.startsWith('Café de Flore. Historic café'), true)
  assertEquals(text.includes('City: Paris'), true)
  assertEquals(text.includes('Country: France'), true)
})
