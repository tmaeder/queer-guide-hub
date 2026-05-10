import { describe, it, expect } from 'vitest'
import { normalizeEvent } from '../../src/normalize/event.js'
import type { SourceRawEntity } from '../../src/normalize/schema.js'

const baseRaw: SourceRawEntity = {
  source: 'iglta',
  sourceId: 'iglta-event-london-pride-2025-06-28',
  entityType: 'event',
  url: 'https://www.iglta.org/events/pride-calendar/',
  name: 'London Pride 2025',
  description: 'Annual Pride parade in London.',
  tags: ['pride', 'lgbtq+'],
  city: 'London',
  country: 'United Kingdom',
  startDatetime: '2025-06-28T12:00:00Z',
  endDatetime: '2025-06-28T21:00:00Z',
  images: [],
  amenities: [],
  fetchedAt: new Date().toISOString(),
}

describe('normalizeEvent', () => {
  it('produces a valid NormalizedEvent', () => {
    const event = normalizeEvent(baseRaw)
    expect(event).not.toBeNull()
    expect(event!.entityType).toBe('event')
    expect(event!.name).toBe('London Pride 2025')
    expect(event!.startDatetime).toBeInstanceOf(Date)
  })

  it('parses start and end datetimes', () => {
    const event = normalizeEvent(baseRaw)
    expect(event!.startDatetime.getUTCFullYear()).toBe(2025)
    expect(event!.endDatetime).not.toBeNull()
  })

  it('returns null when startDatetime is missing', () => {
    const raw: SourceRawEntity = { ...baseRaw, startDatetime: null }
    expect(normalizeEvent(raw)).toBeNull()
  })

  it('infers timezone from country', () => {
    const event = normalizeEvent(baseRaw)
    expect(event!.timezone).toBe('Europe/London')
  })

  it('uses provided timezone over inferred', () => {
    const raw: SourceRawEntity = { ...baseRaw, timezone: 'America/New_York' }
    const event = normalizeEvent(raw)
    expect(event!.timezone).toBe('America/New_York')
  })

  it('includes slug with date tag', () => {
    const event = normalizeEvent(baseRaw)
    expect(event!.slug).toContain('2025-06-28')
  })

  it('normalises ticket URL', () => {
    const raw: SourceRawEntity = {
      ...baseRaw,
      ticketUrl: 'https://tickets.com/london-pride',
    }
    const event = normalizeEvent(raw)
    expect(event!.ticketUrl).toBe('https://tickets.com/london-pride')
  })

  it('handles missing optional fields', () => {
    const raw: SourceRawEntity = {
      ...baseRaw,
      endDatetime: null,
      description: null,
      ticketUrl: null,
    }
    const event = normalizeEvent(raw)
    expect(event!.endDatetime).toBeNull()
    expect(event!.description).toBeNull()
    expect(event!.ticketUrl).toBeNull()
  })
})
