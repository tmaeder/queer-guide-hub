/**
 * Reads a news `ingestion_staging` row the way a reviewer needs it.
 *
 * News staging does not follow the generic staging shape: the headline lives in
 * `normalized_data.name` (not `.title`), the body in `.description`, the
 * publication in `.sourceName`, the article URL in `.urls[0]` and the date in
 * `.dates.start`. The LLM verdict is `enriched_data.quality_decision`, and the
 * gate's reasons are `enriched_data.auto_publish_blocked_reasons` — keys that
 * map 1:1 to `pipeline_explanations` rows `news-gate:<reason>`
 * (`_shared/news-quality/decision.ts` is the producer).
 */

export interface NewsImageAssessment {
  isUsable?: boolean;
  reason?: string;
  qualityScore?: number;
}

export interface NewsQualityDecision {
  shouldPublish?: boolean;
  confidence?: number;
  relevanceScore?: number;
  isRelevant?: boolean;
  isSatire?: boolean;
  isAdvertorial?: boolean;
  warnings?: string[];
  cleanedBody?: string;
  excerpt?: string;
  title?: string;
  imageAssessment?: NewsImageAssessment;
  linkedCities?: string[];
  linkedCountries?: string[];
  linkedPersonalities?: string[];
  linkedOrganisations?: string[];
  rationale?: string;
}

export type NewsVerdict = 'publish' | 'reject' | 'none';

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function firstHttp(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const v = typeof c === 'object' && c ? (c as { url?: unknown }).url : c;
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  }
  return undefined;
}

export function newsVerdict(decision: NewsQualityDecision | null): NewsVerdict {
  if (!decision || typeof decision.shouldPublish !== 'boolean') return 'none';
  return decision.shouldPublish ? 'publish' : 'reject';
}

export const NEWS_VERDICT_LABEL: Record<NewsVerdict, string> = {
  publish: 'Publish',
  reject: 'Reject',
  none: 'No verdict',
};

export function readNewsStaging(
  normalized: Record<string, unknown>,
  enriched: Record<string, unknown>,
) {
  const rawDecision = enriched.quality_decision;
  const decision =
    rawDecision && typeof rawDecision === 'object' ? (rawDecision as NewsQualityDecision) : null;
  const dates = (normalized.dates ?? {}) as Record<string, unknown>;
  const urls = Array.isArray(normalized.urls) ? normalized.urls : [];
  const images = Array.isArray(normalized.images) ? normalized.images : [];
  const recovery = enriched.review_source_text_recovery as Record<string, unknown> | undefined;
  const extraction = normalized.extraction_meta as Record<string, unknown> | undefined;
  return {
    headline: str(normalized.name) ?? str(normalized.title) ?? str(decision?.title),
    publication: str(normalized.sourceName),
    publishedAt: str(dates.start) ?? str(normalized.published_at),
    url: firstHttp(...urls, normalized.url),
    excerpt: str(decision?.excerpt) ?? str(enriched.ai_summary),
    body:
      str(decision?.cleanedBody) ??
      str(normalized.content) ??
      str(normalized.body) ??
      str(normalized.markdown) ??
      str(normalized.description),
    image: firstHttp(enriched.image_url, ...images, normalized.image_url),
    decision,
    verdict: newsVerdict(decision),
    blockedReasons: strList(enriched.auto_publish_blocked_reasons),
    reviewReason: str(enriched.review_reason),
    lgbtqRelevance: num(enriched.ai_lgbtq_relevance_score),
    sourceRecovery:
      recovery?.contract === 'news_source_text_recovery.v1'
        ? {
            status: str(recovery.status),
            attempts: num(recovery.attempts) ?? 0,
            expiresAt: str(recovery.lease_expires_at),
            checkedAt: str(recovery.finished_at) ?? str(recovery.attempted_at),
            url: firstHttp(recovery.source_url, extraction?.url),
            pageTitle: str(extraction?.page_title),
            reason: str(extraction?.reason),
            originalLength: num(extraction?.original_length),
            extractedLength: num(extraction?.extracted_length),
          }
        : undefined,
  };
}

export type NewsStagingView = ReturnType<typeof readNewsStaging>;

/** Explanation-registry keys. Blocked reasons and review reasons are separate producers. */
export const newsGateKey = (reason: string) => `news-gate:${reason}`;
export const newsReviewKey = (reason: string) => `news-review:${reason}`;

export type NewsGroupBy = 'reason' | 'publication';

/**
 * Group key for one news list row. Items without news facts (other queues, or a
 * summary not yet loaded) fall into one "Other" bucket so nothing disappears.
 */
export function newsGroupKey(
  summary: { blockedReasons: string[]; reviewReason?: string; publication?: string } | undefined,
  by: NewsGroupBy,
): string {
  if (!summary) return 'Other';
  if (by === 'publication') return summary.publication ?? 'Unknown publication';
  return summary.blockedReasons[0] ?? summary.reviewReason ?? 'No reason recorded';
}
