/**
 * Normalization entry point.
 *
 * Routes SourceRawEntity objects to the correct normaliser based on entityType.
 */
import { normalizeVenue } from './venue.js'
import { normalizeEvent } from './event.js'
import { normalizePlace } from './place.js'
import { normalizeStay } from './stay.js'
import type { SourceRawEntity, NormalizedEntity } from './schema.js'

export function normalize(
  raw: SourceRawEntity,
  existingSlugSuffix = ''
): NormalizedEntity | null {
  switch (raw.entityType) {
    case 'venue':
      return normalizeVenue(raw, existingSlugSuffix)
    case 'event':
      return normalizeEvent(raw, existingSlugSuffix)
    case 'place':
      return normalizePlace(raw, existingSlugSuffix)
    case 'stay':
      return normalizeStay(raw, existingSlugSuffix)
    default: {
      const _exhaustive: never = raw.entityType
      return null
    }
  }
}

export { normalizeVenue, normalizeEvent, normalizePlace, normalizeStay }
export * from './schema.js'
