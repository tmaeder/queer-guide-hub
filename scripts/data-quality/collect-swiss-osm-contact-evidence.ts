// Read-only evidence collector. It never writes to the application database.
import { pickMatchingElement, type OverpassElement } from '../../supabase/functions/_shared/overpass.ts'
import { distanceKm } from '../../supabase/functions/_shared/geo-link-guards.ts'
import { osmWebsite, osmPhone } from '../../supabase/functions/_shared/osm-venue-fields.ts'

export const endpoint = 'https://overpass.osm.ch/api/interpreter'
type Venue = { venue_id: string; organization_id: string; name: string; latitude: number; longitude: number; country_code: string; city_id: string; country_id: string }

export function contactEvidence(venue: Venue, elements: OverpassElement[]) {
  if (venue.country_code !== 'CH' || !Number.isFinite(Number(venue.latitude)) || !Number.isFinite(Number(venue.longitude))
    || Number(venue.latitude) < 45.8 || Number(venue.latitude) > 47.9 || Number(venue.longitude) < 5.9 || Number(venue.longitude) > 10.5
    || /^[†‡]/.test(venue.name.trim())) return null
  const near = elements.filter(element => {
    const position = element.center ?? element
    const distance = distanceKm(venue, { latitude: position.lat, longitude: position.lon })
    return distance !== null && distance <= 0.06
  })
  const match = pickMatchingElement(near, venue.name)
  const element = match.element
  if (!element || !['node', 'way', 'relation'].includes(element.type ?? '') || !Number.isSafeInteger(element.id) || Number(element.id) <= 0) return null
  const tags = element.tags ?? {}
  if (!['amenity', 'tourism', 'leisure', 'shop', 'office'].some(key => !!tags[key])) return null
  if ((tags['addr:country'] && tags['addr:country'].toUpperCase() !== 'CH')
    || Object.keys(tags).some(key => /^(disused|abandoned):/.test(key)) || tags.opening_hours === 'closed') return null
  let website = osmWebsite(tags)
  const siteClaims = [tags.website, tags['contact:website']].filter(Boolean).map(value => osmWebsite({ website: value }))
  const hosts = new Set(siteClaims.filter((value): value is string => !!value).map(value => new URL(value).hostname.replace(/^www\./, '')))
  if (hosts.size > 1) website = null
  const phone = osmPhone(tags)
  if (!website && !phone) return null
  return { ...venue, endpoint, source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    observed_at: new Date().toISOString(), website, phone, element }
}

if (import.meta.main) {
  const [inputPath, outputPath] = Deno.args
  if (!inputPath || !outputPath) throw new Error('Usage: collect-swiss-osm-contact-evidence.ts input.json output.json')
  const venues = JSON.parse(await Deno.readTextFile(inputPath)) as Venue[]
  if (!Array.isArray(venues) || venues.length > 1000 || venues.some(venue => venue.country_code !== 'CH'
    || !Number.isFinite(Number(venue.latitude)) || !Number.isFinite(Number(venue.longitude))
    || Number(venue.latitude) < 45.8 || Number(venue.latitude) > 47.9 || Number(venue.longitude) < 5.9 || Number(venue.longitude) > 10.5)) {
    throw new Error('Only a bounded native export of Swiss venues is supported')
  }
  const batches: Array<Record<string, unknown>> = []
  const evidence: NonNullable<ReturnType<typeof contactEvidence>>[] = []
  venues.sort((a, b) => a.city_id.localeCompare(b.city_id) || Number(a.latitude) - Number(b.latitude) || Number(a.longitude) - Number(b.longitude))
  let consecutiveFailures = 0
  for (let offset = 0; offset < venues.length; offset += 10) {
    let stopAfterBatch = false
    const batch = venues.slice(offset, offset + 10)
    // One spatial query per venue; physical-place tags are checked in the
    // selector. Five separate spatial scans per venue timed out upstream.
    const query = '[out:json][timeout:20];(' + batch.map(venue =>
      `nwr(around:60,${Number(venue.latitude)},${Number(venue.longitude)})["name"];`).join('') + ');out tags center;'
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: {
        'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'QueerGuide-ContactEvidence/1.0',
      }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(25_000) })
      const body = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(body?.elements) || body.remark) {
        batches.push({ offset, count: batch.length, status: 'source_unknown', http_status: response.status, remark: body?.remark })
        if (response.status === 429 || response.status === 406) stopAfterBatch = true
      } else {
        for (const venue of batch) {
          const match = contactEvidence(venue, body.elements)
          if (match) evidence.push(match)
        }
        batches.push({ offset, count: batch.length, status: 'complete', source_version: body.osm3s?.timestamp_osm_base, elements: body.elements.length })
      }
    } catch (error) {
      batches.push({ offset, count: batch.length, status: 'source_unknown', error: String(error) })
    }
    consecutiveFailures = batches.at(-1)?.status === 'source_unknown' ? consecutiveFailures + 1 : 0
    await Deno.writeTextFile(outputPath, JSON.stringify({ endpoint, collected_at: new Date().toISOString(), batches, evidence }, null, 2))
    console.log(JSON.stringify({ processed: Math.min(offset + 10, venues.length), matched_with_contacts: evidence.length, last_batch: batches.at(-1)?.status }))
    if (stopAfterBatch || consecutiveFailures >= 2) break
    // One script, sequential requests; no parallelism or source-outage absence stamps.
    await new Promise(resolve => setTimeout(resolve, 1100))
  }
}
