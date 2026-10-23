import { providerFetch, ProviderUnavailable } from './provider-outcomes.ts'

// The legacy v3 endpoint was retired in May 2026. Request only Pro fields;
// premium ratings/photos are unnecessary for contact research.
export async function searchFoursquare(venueName: string, apiKey: string) {
  const url = new URL('https://places-api.foursquare.com/places/search')
  url.search = new URLSearchParams({ query: venueName, limit: '1',
    fields: 'name,location,latitude,longitude,categories,website,tel,email,date_closed,unresolved_flags' }).toString()
  try {
    const response = await providerFetch(url.href, { headers: {
      Authorization: `Bearer ${apiKey}`, Accept: 'application/json',
      'X-Places-Api-Version': '2025-06-17',
    } })
    const data = await response.json()
    if (!Array.isArray(data.results)) throw new ProviderUnavailable()
    const venue = data.results[0]
    if (!venue) return null
    if (venue.date_closed || (Array.isArray(venue.unresolved_flags) && venue.unresolved_flags.length)) return null
    return {
      name: venue.name,
      address: venue.location?.address,
      city: venue.location?.locality,
      state: venue.location?.region,
      country: venue.location?.country,
      postal_code: venue.location?.postcode,
      latitude: venue.latitude,
      longitude: venue.longitude,
      category: venue.categories?.[0]?.name,
      website: venue.website,
      phone: venue.tel,
      email: venue.email,
    }
  } catch (error) {
    throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable()
  }
}
