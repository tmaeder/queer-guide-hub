/**
 * List-row facts for news staging items. The review-queue RPCs only carry the
 * generic triage shape (title, source_type, confidence), so publication,
 * verdict, blocked reasons and thumbnail are read here for the visible page —
 * one query of at most a page of ids, selecting json paths only so article
 * bodies are never transferred for a list.
 */
import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import {
  newsGateKey,
  newsGroupKey,
  newsReviewKey,
  newsVerdict,
  type NewsGroupBy,
  type NewsQualityDecision,
  type NewsVerdict,
} from '@/lib/newsStaging';
import { useExplanations } from '@/hooks/useExplanations';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

export interface NewsStagingSummary {
  id: string;
  publication?: string;
  verdict: NewsVerdict;
  blockedReasons: string[];
  reviewReason?: string;
  thumbnail?: string;
}

interface Row {
  id: string;
  publication: string | null;
  should_publish: boolean | null;
  blocked: unknown;
  review_reason: string | null;
  image_url: string | null;
  images: unknown;
}

export function toNewsSummary(row: Row): NewsStagingSummary {
  const images = Array.isArray(row.images) ? row.images : [];
  const thumb = [row.image_url, ...images].find(
    (v): v is string => typeof v === 'string' && /^https?:\/\//.test(v),
  );
  return {
    id: row.id,
    publication: row.publication ?? undefined,
    verdict: newsVerdict(
      row.should_publish == null
        ? null
        : ({ shouldPublish: row.should_publish } as NewsQualityDecision),
    ),
    blockedReasons: Array.isArray(row.blocked)
      ? row.blocked.filter((r): r is string => typeof r === 'string')
      : [],
    reviewReason: row.review_reason ?? undefined,
    thumbnail: thumb,
  };
}

// Typed as plain `string` on purpose: the literal would be parsed by supabase-js's
// select-string types, and json-path aliases push that past TS2589.
const SUMMARY_COLUMNS: string =
  'id, publication:normalized_data->>sourceName, should_publish:enriched_data->quality_decision->shouldPublish, blocked:enriched_data->auto_publish_blocked_reasons, review_reason:enriched_data->>review_reason, image_url:enriched_data->>image_url, images:normalized_data->images';

export function useNewsStagingSummaries(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['news-staging-summaries', sorted],
    queryFn: async () => {
      const { data, error } = await untypedFrom('ingestion_staging')
        .select(SUMMARY_COLUMNS)
        .in('id', sorted);
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, toNewsSummary(r)]));
    },
    enabled: sorted.length > 0,
    staleTime: 60_000,
  });
}

/** The ingestion_staging id behind a review-queue row, when that row is a news staging record. */
export function newsStagingId(item: TriageItem): string | null {
  if (item.content_type !== 'news_articles') return null;
  if (item.queue_type === 'staging') return item.id;
  const meta = item.meta ?? {};
  return meta.original_queue_type === 'staging' && typeof meta.original_item_id === 'string'
    ? meta.original_item_id
    : null;
}

const mainReasonKey = (n: NewsStagingSummary) =>
  n.blockedReasons[0]
    ? newsGateKey(n.blockedReasons[0])
    : n.reviewReason
      ? newsReviewKey(n.reviewReason)
      : null;

/**
 * Everything the review list needs for news rows: per-row summaries, the
 * registered title of each row's main gate reason, and page-local grouping.
 * Grouping covers the visible page only — the list RPC paginates server-side.
 */
export function useNewsReviewList<T extends TriageItem>(items: T[], groupBy?: NewsGroupBy) {
  const summaries = useNewsStagingSummaries(
    items.map(newsStagingId).filter((id): id is string => !!id),
  ).data;
  const reasonTitles = useExplanations(
    [...(summaries?.values() ?? [])].flatMap((n) => mainReasonKey(n) ?? []),
  ).data;
  const newsOf = (item: T) => {
    const id = newsStagingId(item);
    return id ? summaries?.get(id) : undefined;
  };
  const reasonTitleFor = (item: T) => {
    const n = newsOf(item);
    const key = n ? mainReasonKey(n) : null;
    return key ? reasonTitles?.get(key)?.title : undefined;
  };
  let groups: Array<[string, T[]]> | null = null;
  if (groupBy) {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = newsGroupKey(newsOf(item), groupBy);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    groups = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }
  return { newsOf, reasonTitleFor, reasonTitles, groups };
}
