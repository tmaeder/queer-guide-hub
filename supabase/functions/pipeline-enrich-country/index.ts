import { serveEnrichment } from '../_shared/enrichment-driver.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (Country) — ILGA legal data + Wikipedia description.
// Batch lifecycle lives in _shared/enrichment-driver.ts.

const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const ILGA_URL = 'https://database.ilga.org/graphql'

async function fetchWikipediaSummary(
  name: string
): Promise<{ extract: string; thumbnail?: string } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`
    const res = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return { extract: d.extract ?? '', thumbnail: d.thumbnail?.source ?? undefined }
  } catch {
    return null
  }
}

async function fetchIlgaData(alpha2: string): Promise<Record<string, unknown> | null> {
  try {
    const query = `{
      cspiSexualActss(where: { a2: { _eq: "${alpha2}" }, jurisdiction: { _in: ["", "National"] } }) {
        a2 penalty max_prison death_penalty year_decriminalized
      }
      samesexUnions(where: { a2: { _eq: "${alpha2}" } }) {
        a2 type year_enacted
      }
      constitutionalProtections(where: { a2: { _eq: "${alpha2}" } }) {
        a2 type
      }
    }`
    const res = await fetch(ILGA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json.errors) return null
    return json.data ?? null
  } catch {
    return null
  }
}

function ilgaToEqualityScore(data: Record<string, unknown>): number {
  let score = 50
  const criminalization = (data.cspiSexualActss as Array<Record<string, unknown>>)?.[0]
  if (criminalization) {
    if (criminalization.death_penalty) score -= 40
    else if (criminalization.max_prison) score -= 20
    else score += 10 // decriminalized
  } else {
    score += 10
  }
  const unions = (data.samesexUnions as Array<Record<string, unknown>>) ?? []
  for (const u of unions) {
    if (u.type === 'marriage') {
      score += 30
      break
    }
    if (u.type === 'civil_union') {
      score += 15
      break
    }
  }
  const protections = (data.constitutionalProtections as Array<Record<string, unknown>>) ?? []
  if (protections.length > 0) score += 10
  return Math.max(0, Math.min(100, score))
}

Deno.serve(
  withErrorReporting(
    'pipeline-enrich-country',
    serveEnrichment({
      fnName: 'pipeline-enrich-country',
      targetTables: ['countries'],
      defaultBatchSize: 30,
      maxBatchSize: 100,
      async enrichItem(supabase, item, n) {
        const name = String(n.name ?? '').trim()
        const alpha2 = String(n.code ?? n.alpha2 ?? n.iso_code ?? '')
          .trim()
          .toUpperCase()
        if (!name) return 'skip'

        let enrichError: string | null = null
        let wp: { extract: string; thumbnail?: string } | null = null
        let ilga: Record<string, unknown> | null = null
        try {
          ;[wp, ilga] = await Promise.all([
            withCircuitBreaker(supabase, 'wikipedia.api', () => fetchWikipediaSummary(name)),
            alpha2
              ? withCircuitBreaker(supabase, 'ilga_graphql', () => fetchIlgaData(alpha2))
              : Promise.resolve(null),
          ])
        } catch (e) {
          enrichError =
            e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
          console.warn(`enrich-country ${item.id}: ${enrichError}`)
        }

        const equalityScore = ilga ? ilgaToEqualityScore(ilga) : null
        const criminalization = (ilga?.cspiSexualActss as Array<Record<string, unknown>>)?.[0] ?? null
        const unions = (ilga?.samesexUnions as Array<Record<string, unknown>>) ?? []

        return {
          succeeded: !!(wp?.extract || ilga),
          error: enrichError,
          mergedNormalized:
            wp?.extract && !n.description ? { ...n, description: wp.extract } : null,
          enrichedData: {
            wikipedia_extract: wp?.extract ?? null,
            wikipedia_thumbnail: wp?.thumbnail ?? null,
            ilga_criminalization: criminalization
              ? {
                  penalty: criminalization.penalty,
                  max_prison: criminalization.max_prison,
                  death_penalty: criminalization.death_penalty,
                  year_decriminalized: criminalization.year_decriminalized,
                }
              : null,
            ilga_same_sex_unions: unions.map((u) => ({ type: u.type, year: u.year_enacted })),
            ilga_equality_score: equalityScore,
            ilga_raw: ilga,
            enriched_at: new Date().toISOString(),
          },
        }
      },
    })
  )
)
