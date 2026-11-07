import type { ReviewItem } from '@/hooks/useAdminReview';

export function reviewHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export interface ReviewCitation {
  url: string;
  quote?: string;
  label: string;
}
/** Only known evidence containers; arbitrary strings in metadata are not sources. */
export function reviewCitations(
  meta: Record<string, unknown>,
  record?: Record<string, unknown> | null,
): ReviewCitation[] {
  const found = new Map<string, ReviewCitation>();
  function collect(value: unknown, depth = 0) {
    if (depth > 5 || !value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    const url = reviewHttpUrl(obj.url ?? obj.source_url);
    if (url) {
      const quote = typeof obj.quote === 'string' ? obj.quote : undefined;
      found.set(`${url}:${quote ?? ''}`, {
        url,
        quote,
        label: typeof obj.title === 'string' ? obj.title : new URL(url).hostname,
      });
    }
    for (const key of ['citations', 'sources', 'evidence', 'details']) collect(obj[key], depth + 1);
  }
  collect(meta);
  for (const value of [
    meta.sample_url,
    meta.source_url,
    record?.website,
    record?.official_website,
    record?.source_url,
  ]) {
    const url = reviewHttpUrl(value);
    if (url && ![...found.values()].some((entry) => entry.url === url))
      found.set(url, { url, label: new URL(url).hostname });
  }
  return [...found.values()];
}
export function reviewQuestion(item: ReviewItem): string {
  switch (item.queue_type) {
    case 'liveness':
      return 'Does the source establish that this place or service has closed?';
    case 'org-link-review':
      return 'Do these records describe the same business?';
    case 'geography':
      return 'Which place does this record actually describe?';
    case 'event-quality':
      return 'Has this event issue been repaired, or is an exception justified?';
    case 'brand-ownership':
      return 'Do public sources substantiate these ownership claims?';
    case 'general-review':
      return 'What evidence resolves this record’s reported problem?';
    default:
      return 'Does the proposed change match the record and its sources?';
  }
}

export function capturedResearchSources(research: Record<string, unknown>) {
  return (Array.isArray(research.evidence) ? research.evidence : []).flatMap((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const evidence = value as Record<string, unknown>;
    const url = reviewHttpUrl(evidence.url);
    if (!url) return [];
    const timestamp = typeof evidence.retrieved_at === 'string' ? evidence.retrieved_at : null;
    const retrieved =
      timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp) : null;
    return [
      { url, retrieved, excerpt: typeof evidence.text === 'string' ? evidence.text.trim() : '' },
    ];
  });
}

export function cityResearchExplanation(research: Record<string, unknown>) {
  switch (research.reason) {
    case 'missing_source':
      return capturedResearchSources(research).length
        ? 'Research found sources and still needs evidence that identifies this exact settlement.'
        : 'Research could not find evidence that identifies this exact settlement.';
    case 'missing_source_url':
      return 'Research has no source link for this place. A gazetteer or municipal page can help verify its name and location.';
    case 'conflicting_identity':
      return 'The sources disagree about which place this record describes.';
    case 'source_unavailable':
      return 'Research could not open the source pages for this place.';
    default:
      return null;
  }
}
