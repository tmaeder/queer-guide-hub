import { createCitySearchResolver, type CitySearchInput } from '../_shared/city-wikidata-match.ts'
import { currentStatements } from '../_shared/wikidata-city.ts'
import type { Context, Evidence } from './policy.ts'

const QID = /^Q[1-9]\d{0,15}$/
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const CITY_QUEUES = new Set(['geography', 'general-review', 'quality-city'])

/** Only the public settlement name leaves the app as a discovery query. */
export function cityDiscoveryInput(context: Context) {
  const city = context.record
  if (!CITY_QUEUES.has(context.item.queue_type) || context.blocker || context.item.risk === 'safety' || !city ||
    !context.candidates.length || context.candidates.some(c => c.action !== 'recheck') ||
    !['real', 'placeholder'].includes(String(city.shell_status)) ||
    city.duplicate_of_id || typeof city.country_id !== 'string' || !UUID.test(city.country_id)) return null
  const name = typeof city.name === 'string' ? city.name.trim() : ''
  const lat = city.latitude, lng = city.longitude
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'’()\-–]{1,99}$/u.test(name) || !/\p{L}/u.test(name) ||
    typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180 || lat === 0 && lng === 0) return null
  return { name, latitude: lat, longitude: lng, countryId: city.country_id }
}

export async function discoverCityEvidence(input: NonNullable<ReturnType<typeof cityDiscoveryInput>>, countryCode: string, fetcher: typeof fetch = fetch): Promise<Evidence | null> {
  if (!/^[A-Z]{2}$/.test(countryCode)) return null
  const signal = AbortSignal.timeout(9000)
  let requests = 0, totalBytes = 0
  const resolve = createCitySearchResolver(async (raw) => {
    const url = new URL(raw)
    if (++requests > 7 || url.origin !== 'https://www.wikidata.org' || url.pathname !== '/w/api.php') throw new Error('City discovery request refused')
    const response = await fetcher(url, { redirect: 'error', signal,
      headers: { Accept: 'application/json', 'User-Agent': 'QueerGuide-ReviewResearch/1.0 (https://queer.guide)' } })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error('Wikidata city discovery unavailable')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0, json = ''
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.length
        totalBytes += part.value.length
        if (bytes > 4_194_304 || totalBytes > 8_388_608) throw new Error('Wikidata city discovery response exceeds limit')
        json += decoder.decode(part.value, { stream: true })
      }
      json += decoder.decode()
    } finally {
      await reader.cancel().catch(() => {})
    }
    return { ok: true, data: JSON.parse(json) }
  }, [])
  const query: CitySearchInput = { queries: [input.name], base: input.name,
    countryCode, latitude: input.latitude, longitude: input.longitude }
  const match = await resolve(query)
  if (match.kind !== 'selected' || !match.qid || !QID.test(match.qid) || !match.entity ||
    currentStatements(match.entity.claims.P17).length !== 1 || currentStatements(match.entity.claims.P625).length !== 1) return null
  const identity = match.probes.find(p => p.qid === match.qid)
  if (!identity?.exactLabel || identity.class !== 'settlement' || identity.country !== 'agree' ||
    identity.coordinates !== 'agree' || identity.distanceKm === null || identity.distanceKm > 10 || identity.countryCorrections?.length) return null
  return {
    url: `https://www.wikidata.org/wiki/${match.qid}`,
    retrieved_at: new Date().toISOString(),
    text: JSON.stringify({ scope: 'Live Wikidata settlement identity only. Does not establish that the original defect was fixed, certify lifecycle or publication, or authorize a record change.',
      item: match.qid, exact_label: input.name, country_code: countryCode, classification: identity.class,
      name_match: 'exact search label', country_match: identity.country, coordinate_match: identity.coordinates,
      distance_km: identity.distanceKm }),
  }
}
