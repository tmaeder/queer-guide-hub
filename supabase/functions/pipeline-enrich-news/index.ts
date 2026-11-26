import { serveEnrichment } from '../_shared/enrichment-driver.ts'
import { enrichNewsWithAI } from '../_shared/ai-enrichment.ts'
import { CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { cleanPodcastNotes } from '../_shared/podcast-text.ts'

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
      batchBreakerApi: 'llm.openai.enrich-news',
      // Central daily cap (llm_budget, seeded 600/day): the driver consumes the
      // batch size up front and skips the batch when exhausted; RPC missing →
      // warn + run as before.
      llmBudgetCaller: 'pipeline-enrich-news',
      async enrichItem(supabase, item, n, breaker) {
        const title = String(n.title ?? n.name ?? '').trim()
        if (!title) return 'skip'
        const meta = (n.metadata ?? {}) as Record<string, unknown>
        const isPodcast = (meta.media_type ?? n.media_type) === 'podcast'
        const podcastNotes = isPodcast ? cleanPodcastNotes(String(meta.content ?? n.content ?? n.body ?? n.description ?? '')) : ''

        let ai: Awaited<ReturnType<typeof enrichNewsWithAI>> = null
        let aiError: string | null = null
        try {
          ai = await breaker!.run(() =>
            enrichNewsWithAI(supabase, {
              title,
              content: isPodcast ? podcastNotes.slice(0, 2000) : String(n.content ?? n.body ?? '').slice(0, 800),
              excerpt: isPodcast ? '' : String(n.excerpt ?? n.description ?? '').slice(0, 400),
              isPodcast,
              url: String(n.url ?? n.source_url ?? ''),
              // Cleaned full-page markdown from pipeline-extract-fulltext (extract
              // worker), when available — preferred over the RSS stub for enrichment.
              pageMarkdown: !isPodcast && typeof n.markdown === 'string' ? n.markdown : undefined,
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
                // Read by the BEFORE INSERT trigger on news_articles, which
                // re-validates it against news_categories and falls back to the
                // keyword classifier when absent — which is what happens on
                // every circuit-breaker trip, since `ai` is null then.
                category_canonical: ai.category ?? null,
              }
            : null,
          enrichedData: {
            ai_summary: ai?.summary ?? null,
            ...(isPodcast ? { podcast_summary_basis: 'show_notes' } : {}),
            ai_tags: ai?.suggested_tags ?? [],
            ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
            ai_sentiment: ai?.sentiment ?? null,
            ai_topics: ai?.topics ?? [],
            ai_category: ai?.category ?? null,
            enriched_at: new Date().toISOString(),
          },
        }
      },
    })
  )
)
