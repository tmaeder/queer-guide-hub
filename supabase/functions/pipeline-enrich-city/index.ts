import { serveEnrichment } from '../_shared/enrichment-driver.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (City) — Wikipedia description + coordinates + image fetch.
// Batch lifecycle lives in _shared/enrichment-driver.ts.

const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

async function fetchWikipediaSummary(
  query: string
): Promise<{ extract: string; thumbnail?: string; coordinates?: { lat: number; lon: number } } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return {
      extract: d.extract ?? '',
      thumbnail: d.thumbnail?.source ?? undefined,
      coordinates: d.coordinates ? { lat: d.coordinates.lat, lon: d.coordinates.lon } : undefined,
    }
  } catch {
    return null
  }
}

Deno.serve(
  withErrorReporting(
    'pipeline-enrich-city',
    serveEnrichment({
      fnName: 'pipeline-enrich-city',
      targetTables: ['cities'],
      defaultBatchSize: 30,
      maxBatchSize: 100,
      async enrichItem(supabase, item, n) {
        const name = String(n.name ?? '').trim()
        const country = String(n.country_name ?? n.country ?? '').trim()
        if (!name) return 'skip'

        let wp: Awaited<ReturnType<typeof fetchWikipediaSummary>> = null
        let enrichError: string | null = null
        try {
          const query = country ? `${name}, ${country}` : name
          wp = await withCircuitBreaker(supabase, 'wikipedia.api', () =>
            fetchWikipediaSummary(query)
          )
          // fallback: try just the city name
          if (!wp?.extract) {
            wp = await fetchWikipediaSummary(name)
          }
        } catch (e) {
          enrichError =
            e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
          console.warn(`enrich-city Wikipedia ${item.id}: ${enrichError}`)
        }

        return {
          succeeded: !!wp?.extract,
          error: enrichError,
          mergedNormalized:
            wp?.extract && !n.description ? { ...n, description: wp.extract } : null,
          enrichedData: {
            wikipedia_extract: wp?.extract ?? null,
            wikipedia_thumbnail: wp?.thumbnail ?? null,
            wikipedia_lat: wp?.coordinates?.lat ?? null,
            wikipedia_lon: wp?.coordinates?.lon ?? null,
            enriched_at: new Date().toISOString(),
          },
        }
      },
    })
  )
)
