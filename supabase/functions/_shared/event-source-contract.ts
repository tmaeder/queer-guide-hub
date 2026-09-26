import type { NormalizedItem } from './source-adapter.ts'
import { assertPublicHttpUrl } from './ssrf-guard.ts'

export interface EventSourceContractResult {
  errors: string[]
  warnings: string[]
}

const isHttpUrl = (value: string) => {
  try {
    assertPublicHttpUrl(value)
    return true
  } catch {
    return false
  }
}

/**
 * Write-time contract shared by every event source adapter.
 *
 * Errors are deterministic defects that must never enter staging. Warnings are
 * honest incompleteness: they are retained on the normalized payload so the
 * downstream quality programme can measure them without inventing data.
 */
export function validateEventSourceContract(item: NormalizedItem): EventSourceContractResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!item.sourceId?.trim()) errors.push('E_SOURCE_ID_MISSING')
  if (!item.sourceName?.trim()) errors.push('E_SOURCE_NAME_MISSING')
  if (!item.name?.trim() || item.name.trim().length < 3) errors.push('E_TITLE_INVALID')

  const start = item.dates?.start?.trim()
  const end = item.dates?.end?.trim()
  const startMs = start ? Date.parse(start) : Number.NaN
  const endMs = end ? Date.parse(end) : Number.NaN
  if (!start) errors.push('E_START_DATE_MISSING')
  else if (!Number.isFinite(startMs)) errors.push('E_START_DATE_INVALID')
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(start) && !/(z|[+-]\d{2}:?\d{2})$/i.test(start)) {
    errors.push('E_START_TIMEZONE_MISSING')
  }
  if (end && !Number.isFinite(endMs)) errors.push('E_END_DATE_INVALID')
  else if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end) && !/(z|[+-]\d{2}:?\d{2})$/i.test(end)) {
    errors.push('E_END_TIMEZONE_MISSING')
  }
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
    errors.push('E_DATE_ORDER_INVALID')
  }

  const lat = item.location?.lat
  const lng = item.location?.lng
  if ((lat == null) !== (lng == null)) errors.push('E_GEO_PARTIAL')
  if (lat === 0 && lng === 0) errors.push('E_GEO_NULL_ISLAND')
  if (lat != null && (lat < -90 || lat > 90)) errors.push('E_LATITUDE_RANGE')
  if (lng != null && (lng < -180 || lng > 180)) errors.push('E_LONGITUDE_RANGE')

  for (const value of item.urls ?? []) {
    if (!isHttpUrl(value)) errors.push('E_URL_INVALID')
  }
  if (!item.urls?.length) errors.push('E_SOURCE_URL_MISSING')
  for (const value of item.images ?? []) {
    if (!isHttpUrl(value)) errors.push('E_IMAGE_URL_INVALID')
    if (/(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)/i.test(value)) {
      errors.push('E_IMAGE_PLACEHOLDER')
    }
  }

  if (!item.description?.trim() || item.description.trim().length < 20) {
    warnings.push('W_DESCRIPTION_MISSING_OR_THIN')
  }
  if (!item.location?.city && !item.location?.country && lat == null) {
    warnings.push('W_LOCATION_MISSING')
  }
  if (!item.images?.length) warnings.push('W_IMAGE_MISSING')

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

export function assertEventSourceContract(item: NormalizedItem): EventSourceContractResult {
  const result = validateEventSourceContract(item)
  if (result.errors.length) {
    throw new Error(`Event source contract failed: ${result.errors.join(', ')}`)
  }
  return result
}

