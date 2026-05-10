import { describe, it, expect } from 'vitest'
import {
  isValidIsoCode,
  normalizeIsoCode,
  isValidCoord,
  validateCityNormalized,
  validateCountryNormalized,
} from '../../web/supabase/functions/_shared/venue-pipeline-utils.ts'

describe('isValidIsoCode', () => {
  it('accepts alpha-2 and alpha-3 uppercase', () => {
    expect(isValidIsoCode('US')).toBe(true)
    expect(isValidIsoCode('de')).toBe(true)      // upper-cased before match
    expect(isValidIsoCode('DEU')).toBe(true)
    expect(isValidIsoCode(' fr ')).toBe(true)    // trimmed
  })
  it('rejects garbage', () => {
    expect(isValidIsoCode('U')).toBe(false)
    expect(isValidIsoCode('USAA')).toBe(false)
    expect(isValidIsoCode('12')).toBe(false)
    expect(isValidIsoCode('')).toBe(false)
    expect(isValidIsoCode(null)).toBe(false)
    expect(isValidIsoCode(undefined)).toBe(false)
  })
})

describe('normalizeIsoCode', () => {
  it('returns uppercase for valid codes', () => {
    expect(normalizeIsoCode('us')).toBe('US')
    expect(normalizeIsoCode(' de ')).toBe('DE')
  })
  it('returns null for invalid', () => {
    expect(normalizeIsoCode('')).toBe(null)
    expect(normalizeIsoCode('X')).toBe(null)
    expect(normalizeIsoCode('XXXX')).toBe(null)
  })
})

describe('isValidCoord', () => {
  it('accepts valid lat/lng', () => {
    expect(isValidCoord(0, 10)).toBe(true)
    expect(isValidCoord(-89.9, 179.9)).toBe(true)
    expect(isValidCoord(52.5, 13.4)).toBe(true)  // Berlin
  })
  it('rejects out-of-range', () => {
    expect(isValidCoord(91, 0)).toBe(false)
    expect(isValidCoord(0, 181)).toBe(false)
    expect(isValidCoord(-90.1, 0)).toBe(false)
  })
  it('rejects null-island', () => {
    expect(isValidCoord(0, 0)).toBe(false)
  })
  it('rejects non-numbers', () => {
    expect(isValidCoord('abc', 0)).toBe(false)
    expect(isValidCoord(null, null)).toBe(false)
    expect(isValidCoord(undefined, undefined)).toBe(false)
  })
})

describe('validateCountryNormalized', () => {
  const good = {
    name: 'Germany',
    code: 'DE',
    population: 83_240_000,
    capital: 'Berlin',
    currency: 'EUR',
    location: { lat: 51.1, lng: 10.4 },
    metadata: {},
  }

  it('approves a complete country', () => {
    const r = validateCountryNormalized(good)
    expect(r.errors).toEqual([])
    expect(r.quality).toBe(100)
  })

  it('rejects missing name', () => {
    const r = validateCountryNormalized({ ...good, name: '' })
    expect(r.errors).toContain('E_MISSING_NAME')
  })

  it('rejects bad ISO code', () => {
    const r = validateCountryNormalized({ ...good, code: 'XX99' })
    expect(r.errors).toContain('E_BAD_ISO_CODE')
  })

  it('warns when ISO code missing', () => {
    const r = validateCountryNormalized({ ...good, code: undefined, metadata: {} })
    expect(r.warnings).toContain('W_NO_ISO_CODE')
    expect(r.errors).toEqual([])
  })

  it('rejects negative population', () => {
    const r = validateCountryNormalized({ ...good, population: -1 })
    expect(r.errors).toContain('E_BAD_POPULATION')
  })

  it('rejects out-of-range coords', () => {
    const r = validateCountryNormalized({ ...good, location: { lat: 100, lng: 0 } })
    expect(r.errors).toContain('E_BAD_COORDS')
  })

  it('warns on missing optional fields', () => {
    const r = validateCountryNormalized({ name: 'X', code: 'XX', metadata: {} })
    expect(r.warnings).toEqual(expect.arrayContaining(['W_NO_COORDS','W_NO_POPULATION','W_NO_CAPITAL','W_NO_CURRENCY']))
    expect(r.quality).toBeLessThan(100)
  })
})

describe('validateCityNormalized', () => {
  const good = {
    name: 'Berlin',
    location: { lat: 52.52, lng: 13.4, country: 'Germany', country_code: 'DE' },
    population: 3_669_000,
    metadata: {},
  }

  it('approves a complete city', () => {
    const r = validateCityNormalized(good)
    expect(r.errors).toEqual([])
    expect(r.quality).toBe(100)
  })

  it('rejects missing name', () => {
    const r = validateCityNormalized({ ...good, name: ' ' })
    expect(r.errors).toContain('E_MISSING_NAME')
  })

  it('rejects name too long', () => {
    const r = validateCityNormalized({ ...good, name: 'x'.repeat(200) })
    expect(r.errors).toContain('E_NAME_TOO_LONG')
  })

  it('rejects when no country info', () => {
    const r = validateCityNormalized({ name: 'Orphan', location: { lat: 1, lng: 1 }, metadata: {} })
    expect(r.errors).toContain('E_MISSING_COUNTRY')
  })

  it('warns on bad country code (accepts name as fallback)', () => {
    const r = validateCityNormalized({ ...good, location: { ...good.location, country_code: '99' } })
    expect(r.warnings).toContain('W_BAD_COUNTRY_CODE')
  })

  it('rejects null-island coords', () => {
    const r = validateCityNormalized({ ...good, location: { ...good.location, lat: 0, lng: 0 } })
    expect(r.errors).toContain('E_BAD_COORDS')
  })

  it('rejects absurd population', () => {
    const r = validateCityNormalized({ ...good, population: -50 })
    expect(r.errors).toContain('E_BAD_POPULATION')
  })

  it('warns on implausible population', () => {
    const r = validateCityNormalized({ ...good, population: 100_000_000 })
    expect(r.warnings).toContain('W_IMPLAUSIBLE_POPULATION')
    expect(r.errors).toEqual([])
  })

  it('warns on missing coords but still approves', () => {
    const r = validateCityNormalized({ name: 'Foo', location: { country_code: 'DE' }, metadata: {} })
    expect(r.errors).toEqual([])
    expect(r.warnings).toContain('W_NO_COORDS')
  })
})
