import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { bookIdentity, canonicalIsbn, conflictingBookEditions } from './marketplace-book-identity.ts'
import { decideCandidate, DEDUP_REGISTRY, type RawCandidate } from './dedup-engine.ts'

const book = (title: string, metadata: Record<string, unknown> = {}) =>
  bookIdentity({ name: title, metadata: { category: 'Hardback', ...metadata } })!

Deno.test('ISBN checksum and ISBN-10/13 equivalence reject unrelated SKUs', () => {
  assertEquals(canonicalIsbn('978-1-4449-6893-4'), '9781444968934')
  assertEquals(canonicalIsbn('1444968939'), '9781444968934')
  assertEquals(canonicalIsbn('9781444968935'), null)
  assertEquals(canonicalIsbn('12345'), null)
  assertEquals(canonicalIsbn('shirts-9781444968934'), null)
})

Deno.test('distinct Heartstopper volumes are not duplicates despite near-identical titles', () => {
  const a = book('Heartstopper Volume 1 Special Edition Hardback', { sku: '9781444968934' })
  const b = book('Heartstopper Volume 2 Special Edition Hardback', { sku: '9781444972443' })
  assertEquals(conflictingBookEditions(a, b), true)
  assertEquals(conflictingBookEditions(book('Heartstopper Volume 1'), book('Heartstopper Volume 2')), true)
})

Deno.test('spelled, numeric and roman volumes agree; collection ranges remain distinct', () => {
  assertEquals(book('Heartstopper Vol. One').volume, '1')
  assertEquals(book('Heartstopper Volume I').volume, '1')
  assertEquals(book('Heartstopper Volume 01').volume, '1')
  assertEquals(book('Heartstopper Volumes 1–3').volume, '1-3')
  assertEquals(book('Heartstopper Vol. 1–3').volume, '1-3')
  assertEquals(conflictingBookEditions(book('Series Book 1'), book('Series Book 1-3')), true)
  assertEquals(book('The Book Thief').volume, null)
})

Deno.test('explicit binding differences conflict while missing facts do not', () => {
  assertEquals(conflictingBookEditions(book('Story Hardback'), book('Story Paperback', { category: 'Paperback' })), true)
  assertEquals(conflictingBookEditions(book('Story Hardcover'), book('Story Hardback')), false)
  assertEquals(conflictingBookEditions(book('Story'), bookIdentity({ title: 'Story' }, true)!), false)
  assertEquals(bookIdentity({ title: 'Nova 2', metadata: { category: 'Vibrator', sku: '1234' } }), null)
  assertEquals(bookIdentity({ title: 'Story', metadata: { sku: '9781444968934' } })?.isbn, '9781444968934')
})

Deno.test('marketplace guard blocks deterministic AND confirming semantic signals for a different edition', () => {
  const raws: RawCandidate[] = [
    { entity_id: 'wrong', match_type: 'domain_title', score: 0.99, bookIdentity: book('Heartstopper Volume 2') },
    { entity_id: 'wrong', match_type: 'semantic', score: 0.99, bookIdentity: book('Heartstopper Volume 2') },
    { entity_id: 'right', match_type: 'despaced_exact', score: 0.95, bookIdentity: book('Heartstopper Volume 1') },
  ]
  const result = decideCandidate(DEDUP_REGISTRY.marketplace, raws, { itemBookIdentity: book('Heartstopper Volume 1') })
  assertEquals(result.matchId, 'right')
  assertEquals(result.guardsFired, ['book_edition_conflict'])
  assertEquals(result.decision, 'duplicate')
})

Deno.test('semantic-only conflicting edition cannot reappear as a review candidate', () => {
  const result = decideCandidate(DEDUP_REGISTRY.marketplace, [
    { entity_id: 'wrong', match_type: 'semantic', score: 0.99, bookIdentity: book('Series Book 2') },
  ], { itemBookIdentity: book('Series Book 1') })
  assertEquals(result.decision, 'unique')
  assertEquals(result.guardsFired, ['book_edition_conflict'])
})

Deno.test('exact source references preserve ordinary updates; non-books retain existing scoring', () => {
  for (const match_type of ['source_entity_id', 'external_url']) {
    const result = decideCandidate(DEDUP_REGISTRY.marketplace, [
      { entity_id: 'same-source', match_type, score: 0.97, bookIdentity: book('Series Book 2') },
    ], { itemBookIdentity: book('Series Book 1') })
    assertEquals(result.matchId, 'same-source')
    assertEquals(result.guardsFired, [])
  }
  assertEquals(decideCandidate(DEDUP_REGISTRY.marketplace, [
    { entity_id: 'product', match_type: 'domain_title', score: 0.97 },
  ]).decision, 'duplicate')
  // The deployed RPC's return column is listing_id, not marketplace_id.
  assertEquals(DEDUP_REGISTRY.marketplace.idField, 'listing_id')
})
