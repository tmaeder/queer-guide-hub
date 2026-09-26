import { deepStrictEqual, throws } from 'node:assert/strict'
import { assertEventSourceContract, validateEventSourceContract } from './event-source-contract.ts'
import type { NormalizedItem } from './source-adapter.ts'

const valid = (overrides: Partial<NormalizedItem> = {}): NormalizedItem => ({
  entityType: 'event',
  sourceId: 'event-1',
  sourceName: 'fixture',
  name: 'Evidence-backed event',
  description: 'A sufficiently detailed source description for this event.',
  dates: { start: '2026-10-01T18:00:00+02:00', end: '2026-10-01T20:00:00+02:00' },
  location: { city: 'Zürich', countryCode: 'CH', lat: 47.3769, lng: 8.5417 },
  urls: ['https://example.test/events/1'],
  images: ['https://example.test/events/1.jpg'],
  metadata: {},
  ...overrides,
})

Deno.test('event source contract accepts a complete normalized event', () => {
  deepStrictEqual(validateEventSourceContract(valid()), { errors: [], warnings: [] })
})

Deno.test('event source contract blocks deterministic date, geo, URL and placeholder defects', () => {
  const result = validateEventSourceContract(
    valid({
      dates: { start: '2026-10-02T18:00:00Z', end: '2026-10-01T18:00:00Z' },
      location: { lat: 0, lng: 0 },
      urls: ['javascript:alert(1)'],
      images: ['https://example.test/default_event.png'],
    }),
  )
  deepStrictEqual(result.errors, ['E_DATE_ORDER_INVALID', 'E_GEO_NULL_ISLAND', 'E_URL_INVALID', 'E_IMAGE_PLACEHOLDER'])
  throws(() => assertEventSourceContract(valid({ location: { lat: 1 } })), /E_GEO_PARTIAL/)
})

Deno.test('event source contract records optional gaps as warnings', () => {
  const result = validateEventSourceContract(
    valid({
      description: '',
      location: {},
      urls: [],
      images: [],
    }),
  )
  deepStrictEqual(result.errors, ['E_SOURCE_URL_MISSING'])
  deepStrictEqual(result.warnings, ['W_DESCRIPTION_MISSING_OR_THIN', 'W_LOCATION_MISSING', 'W_IMAGE_MISSING'])
})

Deno.test('event source contract requires timezone evidence for timed events', () => {
  const result = validateEventSourceContract(
    valid({ dates: { start: '2026-10-01T18:00:00', end: '2026-10-01T20:00:00' } }),
  )
  deepStrictEqual(result.errors, ['E_START_TIMEZONE_MISSING', 'E_END_TIMEZONE_MISSING'])
})

Deno.test('event source contract rejects private-network fetch targets', () => {
  const result = validateEventSourceContract(valid({ urls: ['http://127.0.0.1/event'] }))
  deepStrictEqual(result.errors, ['E_URL_INVALID'])
})

Deno.test('event source contract rejects disguised private and unqualified URLs', () => {
  const credentialed = validateEventSourceContract(
    valid({ urls: ['https://public.example@127.0.0.1/event'] }),
  )
  const unqualified = validateEventSourceContract(valid({ urls: ['http://metadata/event'] }))
  deepStrictEqual(credentialed.errors, ['E_URL_INVALID'])
  deepStrictEqual(unqualified.errors, ['E_URL_INVALID'])
})

