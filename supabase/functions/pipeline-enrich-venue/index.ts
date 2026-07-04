import { serveEnrichment } from '../_shared/enrichment-driver.ts'
import { enrichVenueWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (Venue/Hotel) — AI description + tags + LGBTQ context.
// Batch lifecycle lives in _shared/enrichment-driver.ts.

Deno.serve(
  withErrorReporting(
    'pipeline-enrich-venue',
    serveEnrichment({
      fnName: 'pipeline-enrich-venue',
      targetTables: ['venues'],
      defaultBatchSize: 50,
      maxBatchSize: 200,
      async enrichItem(supabase, item, n) {
        const loc = (n.location ?? {}) as Record<string, unknown>
        const name = String(n.name ?? '').trim()
        if (!name) return 'skip'

        let ai: Awaited<ReturnType<typeof enrichVenueWithAI>> = null
        let aiError: string | null = null
        try {
          ai = await withCircuitBreaker(supabase, 'llm.openai.enrich-venue', () =>
            enrichVenueWithAI(supabase, {
              name,
              description: String(n.description ?? '').slice(0, 400),
              address: String(loc.address ?? ''),
              city: String(loc.city ?? ''),
              country: String(loc.country ?? ''),
              category: String(n.category ?? n.venue_type ?? ''),
              tags: (n.tags ?? []) as string[],
              // Cleaned website markdown from pipeline-extract-fulltext, when present.
              pageMarkdown: typeof n.markdown === 'string' ? n.markdown : undefined,
            })
          )
        } catch (e) {
          aiError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
          console.warn(`enrich-venue LLM ${item.id}: ${aiError}`)
        }

        return {
          succeeded: !!ai,
          error: aiError,
          mergedNormalized: ai
            ? {
                ...n,
                description: n.description || ai.description || '',
                tags: Array.from(
                  new Set([...((n.tags as string[]) ?? []), ...(ai.suggested_tags ?? [])])
                ).slice(0, 20),
              }
            : null,
          enrichedData: {
            ai_description: ai?.description ?? null,
            ai_lgbtq_context: ai?.lgbtq_context ?? null,
            ai_tags: ai?.suggested_tags ?? [],
            ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
            ai_category: ai?.category_suggestion ?? null,
            ai_amenities: ai?.amenity_suggestions ?? [],
            enriched_at: new Date().toISOString(),
          },
        }
      },
    })
  )
)
