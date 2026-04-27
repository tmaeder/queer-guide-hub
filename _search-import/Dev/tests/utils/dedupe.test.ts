import { describe, it, expect } from 'vitest'
import {
  computeStrongKey,
  compareEntities,
  jaroWinkler,
  type DedupeKey,
} from '../../src/utils/dedupe.js'

describe('computeStrongKey', () => {
  it('produces equal keys for same name+city+domain', () => {
    const a: DedupeKey = { name: 'The Eagle', city: 'London', website: 'https://eagle.com' }
    const b: DedupeKey = { name: 'The Eagle', city: 'London', website: 'https://www.eagle.com' }
    expect(computeStrongKey(a)).toBe(computeStrongKey(b))
  })

  it('produces different keys for different cities', () => {
    const a: DedupeKey = { name: 'The Eagle', city: 'London' }
    const b: DedupeKey = { name: 'The Eagle', city: 'Manchester' }
    expect(computeStrongKey(a)).not.toBe(computeStrongKey(b))
  })

  it('is case-insensitive', () => {
    const a: DedupeKey = { name: 'the eagle', city: 'london' }
    const b: DedupeKey = { name: 'THE EAGLE', city: 'LONDON' }
    expect(computeStrongKey(a)).toBe(computeStrongKey(b))
  })
})

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('foo', 'foo')).toBe(1)
  })

  it('returns 0 for empty strings', () => {
    expect(jaroWinkler('', 'foo')).toBe(0)
  })

  it('returns high score for similar strings', () => {
    const score = jaroWinkler('Village Pub', 'Village Bar')
    expect(score).toBeGreaterThan(0.8)
  })

  it('returns low score for dissimilar strings', () => {
    const score = jaroWinkler('Eagle Bar London', 'Cafe Roma Paris')
    expect(score).toBeLessThan(0.7)
  })
})

describe('compareEntities', () => {
  it('returns strong match for same name+city+domain', () => {
    const a: DedupeKey = { name: 'The Eagle Bar', city: 'London', website: 'https://eagle.com' }
    const b: DedupeKey = { name: 'The Eagle Bar', city: 'London', website: 'https://www.eagle.com' }
    const result = compareEntities(a, b)
    expect(result.method).toBe('strong')
    expect(result.confidence).toBeGreaterThanOrEqual(0.95)
  })

  it('returns fuzzy match for similar names', () => {
    const a: DedupeKey = { name: 'The Eagle', city: 'London' }
    const b: DedupeKey = { name: 'The Eagles', city: 'London' }
    const result = compareEntities(a, b)
    expect(result.method).toBe('fuzzy')
    expect(result.confidence).toBeGreaterThan(0.85)
  })

  it('returns none for clearly different entities', () => {
    const a: DedupeKey = { name: 'The Eagle Bar', city: 'London' }
    const b: DedupeKey = { name: 'Cafe Buena Vista', city: 'Barcelona' }
    const result = compareEntities(a, b)
    expect(result.method).toBe('none')
  })

  it('boosts score when cities match', () => {
    const base: DedupeKey = { name: 'Pink Elephant', city: null }
    const sameCity: DedupeKey = { name: 'Pink Elephant Bar', city: 'Berlin' }
    const cityMatch: DedupeKey = { name: 'Pink Elephant Bar', city: 'Berlin' }
    const resultSame = compareEntities({ ...sameCity }, { ...cityMatch })
    const resultNoCity = compareEntities({ ...base }, { ...sameCity })
    expect(resultSame.confidence).toBeGreaterThanOrEqual(resultNoCity.confidence)
  })
})
