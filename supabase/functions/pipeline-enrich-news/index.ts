import { serveEnrichment } from '../_shared/enrichment-driver.ts'
import { enrichNewsWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (News) — AI summary + tags + LGBTQ relevance + sentiment.
// Batch lifecycle lives in _shared/enrichment-driver.ts.

Deno.serve(
  withErrorReporting(
    'pipeline-enrich-news',
    serveEnrichment({
      fnName: 'pipeline-enrich-news',
      targetTables: ['news_articles'],
      defaultBatchSize: 50,
      maxBatchSize: 200,
      defaultConcurrency: 6,
      async enrichItem(supabase, item, n) {
        const title = String(n.title ?? n.name ?? '').trim()
        if (!title) return 'skip'

        let ai: Awaited<ReturnType<typeof enrichNewsWithAI>> = null
        let aiError: string | null = null
        try {
          ai = await withCircuitBreaker(supabase, 'llm.openai.enrich-news', () =>
            enrichNewsWithAI(supabase, {
              title,
              content: String(n.content ?? n.body ?? '').slice(0, 800),
              excerpt: String(n.excerpt ?? n.description ?? '').slice(0, 400),
              url: String(n.url ?? n.source_url ?? ''),
              // Cleaned full-page markdown from pipeline-extract-fulltext (extract
              // worker), when available — preferred over the RSS stub for enrichment.
              pageMarkdown: typeof n.markdown === 'string' ? n.markdown : undefined,
            })
          )
        } catch (e) {
          aiError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
          console.warn(`enrich-news LLM ${item.id}: ${aiError}`)
        }

        return {
          succeeded: !!ai,
          error: aiError,
          mergedNormalized: ai
            ? {
                ...n,
                description: n.description || ai.summary || '',
                tags: Array.from(
                  new Set([...((n.tags as string[]) ?? []), ...(ai.suggested_tags ?? [])])
                ).slice(0, 20),
              }
            : null,
          enrichedData: {
            ai_summary: ai?.summary ?? null,
            ai_tags: ai?.suggested_tags ?? [],
            ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
            ai_sentiment: ai?.sentiment ?? null,
            ai_topics: ai?.topics ?? [],
            enriched_at: new Date().toISOString(),
          },
        }
      },
    })
  )
)
