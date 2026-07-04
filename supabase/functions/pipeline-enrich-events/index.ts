import { serveEnrichment } from '../_shared/enrichment-driver.ts'
import { enrichEventWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (Events) — AI description + type + tags + LGBTQ relevance.
// Batch lifecycle lives in _shared/enrichment-driver.ts.

Deno.serve(
  withErrorReporting(
    'pipeline-enrich-events',
    serveEnrichment({
      fnName: 'pipeline-enrich-events',
      targetTables: ['events'],
      defaultBatchSize: 20,
      maxBatchSize: 200,
      wallClockMs: 90_000,
      async enrichItem(supabase, item, n) {
        const loc = (n.location ?? {}) as Record<string, unknown>
        const title = String(n.title ?? n.name ?? '').trim()
        if (!title) return 'skip'

        let ai: Awaited<ReturnType<typeof enrichEventWithAI>> = null
        let aiError: string | null = null
        try {
          ai = await withCircuitBreaker(supabase, 'llm.openai.enrich-events', () =>
            enrichEventWithAI(supabase, {
              title,
              description: String(n.description ?? '').slice(0, 500),
              city: String(loc.city ?? ''),
              country: String(loc.country ?? ''),
              event_type: String(n.event_type ?? n.category ?? ''),
              venue_name: String(n.venue_name ?? ''),
              // Cleaned event-page markdown from pipeline-extract-fulltext, when present.
              pageMarkdown: typeof n.markdown === 'string' ? n.markdown : undefined,
            })
          )
        } catch (e) {
          aiError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
          console.warn(`enrich-events LLM ${item.id}: ${aiError}`)
        }

        return {
          succeeded: !!ai,
          error: aiError,
          mergedNormalized: ai
            ? {
                ...n,
                description: n.description || ai.description || '',
                event_type: n.event_type || ai.event_type || n.event_type,
                tags: Array.from(
                  new Set([...((n.tags as string[]) ?? []), ...(ai.suggested_tags ?? [])])
                ).slice(0, 20),
              }
            : null,
          enrichedData: {
            ai_description: ai?.description ?? null,
            ai_event_type: ai?.event_type ?? null,
            ai_tags: ai?.suggested_tags ?? [],
            ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
            ai_target_audience: ai?.target_audience ?? null,
            enriched_at: new Date().toISOString(),
          },
        }
      },
    })
  )
)
