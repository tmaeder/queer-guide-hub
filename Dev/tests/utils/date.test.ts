import { describe, it, expect } from 'vitest'
import { parseDate, inferTimezone, parseDuration } from '../../src/utils/date.js'

describe('parseDate', () => {
  it('parses ISO 8601', () => {
    const d = parseDate('2024-06-01T10:00:00Z')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2024)
    expect(d?.getUTCMonth()).toBe(5) // June = 5
  })

  it('parses DD/MM/YYYY', () => {
    const d = parseDate('15/06/2024')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2024)
  })

  it('parses human date', () => {
    const d = parseDate('15 June 2024')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2024)
  })

  it('returns null for invalid strings', () => {
    expect(parseDate('not-a-date')).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })
})

describe('inferTimezone', () => {
  it('maps UK to Europe/London', () => {
    expect(inferTimezone('United Kingdom')).toBe('Europe/London')
  })

  it('maps USA to America/New_York', () => {
    expect(inferTimezone('United States')).toBe('America/New_York')
  })

  it('defaults to UTC for unknown countries', () => {
    expect(inferTimezone('Narnia')).toBe('UTC')
    expect(inferTimezone(null)).toBe('UTC')
    expect(inferTimezone(undefined)).toBe('UTC')
  })
})

describe('parseDuration', () => {
  it('parses hours', () => {
    expect(parseDuration('24h')).toBe(86_400_000)
  })

  it('parses days', () => {
    expect(parseDuration('7d')).toBe(604_800_000)
  })

  it('parses minutes', () => {
    expect(parseDuration('30m')).toBe(1_800_000)
  })

  it('parses weeks', () => {
    expect(parseDuration('1w')).toBe(604_800_000)
  })

  it('returns null for invalid formats', () => {
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('24')).toBeNull()
    expect(parseDuration('')).toBeNull()
  })
})
