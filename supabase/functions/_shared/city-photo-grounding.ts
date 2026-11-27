import { distanceKm, type LatLng } from './geo-link-guards.ts'

const CITY_PHOTO_MAX_KM = 10

export interface CommonsPhotoLocation {
  latitude: number
  longitude: number
  datum: 'WGS-84'
  source: 'commons_extended_metadata'
}

function coordinate(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function validCityPhotoPoint(point: LatLng | null | undefined): boolean {
  if (!point) return false
  const lat = coordinate(point.latitude)
  const lng = coordinate(point.longitude)
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
}

export function commonsPhotoLocation(meta: Record<string, { value?: unknown }>): CommonsPhotoLocation | undefined {
  const datum = meta.GPSMapDatum?.value
  if (typeof datum !== 'string' || !/^WGS[- ]?84$/i.test(datum.trim())) return undefined
  const latitude = coordinate(meta.GPSLatitude?.value)
  const longitude = coordinate(meta.GPSLongitude?.value)
  if (latitude === null || longitude === null || !validCityPhotoPoint({ latitude, longitude })) return undefined
  return { latitude, longitude, datum: 'WGS-84', source: 'commons_extended_metadata' }
}

export function cityPhotoIsGrounded(
  photo: { source: string; license?: string; photographer?: string; location?: CommonsPhotoLocation },
  city: LatLng | null | undefined,
): boolean {
  if (photo.source !== 'wikimedia' || photo.location?.source !== 'commons_extended_metadata' || photo.location.datum !== 'WGS-84') return false
  if (!photo.license?.trim() || !/^(?:CC0(?: 1\.0)?|CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)(?: [a-z]{2})?|Public domain)$/i.test(photo.license.trim())) return false
  if (/^CC BY/i.test(photo.license.trim()) && (!photo.photographer?.trim() || /^(?:unknown|unknown author)$/i.test(photo.photographer.trim()) || /No machine-readable author provided/i.test(photo.photographer))) return false
  if (!city || !validCityPhotoPoint(photo.location) || !validCityPhotoPoint(city)) return false
  const km = distanceKm(photo.location, city)
  return km !== null && km <= CITY_PHOTO_MAX_KM
}

