import { ExternalLink, RefreshCw } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { StructuredValue } from '@/components/admin/triage/StructuredDataView';
import { useReviewContext } from '@/hooks/useReviewContext';
import type { ReviewItem } from '@/hooks/useAdminReview';
import { reviewCitations, reviewHttpUrl, reviewQuestion } from './reviewEvidence';

const FACTS = [
  'status',
  'address',
  'postal_code',
  'latitude',
  'longitude',
  'start_date',
  'end_date',
  'venue_name',
  'category',
  'website',
  'official_website',
  'phone',
  'email',
  'description',
];
const label = (key: string) => key.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
const date = (value: string) =>
  Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unknown';
export function ReviewEvidencePanel({
  item,
  candidateOrganizationId,
}: {
  item: ReviewItem;
  candidateOrganizationId?: string | null;
}) {
  const context = useReviewContext(item, candidateOrganizationId);
  const record = context.data?.record;
  const meta = item.meta ?? {};
  const sources = reviewCitations(meta, record);
  const field = typeof meta.field === 'string' ? meta.field : null;
  const image =
    [
      record?.curated_image_url,
      record?.cover_image_url,
      record?.image_url,
      record?.logo_url,
      Array.isArray(record?.images) ? record.images[0] : null,
    ]
      .map(reviewHttpUrl)
      .find((url): url is string => !!url) ?? null;
  return (
    <div className="mt-6 space-y-6">
      <section aria-label="Review question" className="bg-muted/40 p-4">
        <h3 className="text-base font-semibold leading-snug">{reviewQuestion(item)}</h3>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div>
            <dt className="inline">Queued </dt>
            <dd className="inline">{date(item.created_at)}</dd>
          </div>
          <div>
            <dt className="inline">Model confidence </dt>
            <dd className="inline tabular-nums">
              {item.confidence_score == null
                ? 'Not provided'
                : `${Math.round(item.confidence_score * 100)}%`}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Confidence is an estimate, not verification of the source.
        </p>
        {item.queue_type === 'liveness' && (
          <p className="mt-4 text-sm leading-relaxed">
            A broken website or a past event date does not establish closure. Check the latest
            signals and the business’s current source before archiving.
          </p>
        )}
      </section>
      {typeof meta.severity === 'string' && (
        <p className="text-sm font-medium">Issue severity: {label(meta.severity)}</p>
      )}
      {meta.checks && typeof meta.checks === 'object' ? (
        <section aria-label="Verification checks">
          <h3 className="mb-2 text-sm font-semibold">Verification checks</h3>
          <StructuredValue value={meta.checks} />
        </section>
      ) : null}
      {meta.evidence &&
      typeof meta.evidence === 'object' &&
      Object.keys(meta.evidence).length > 0 ? (
        <section aria-label="Reported evidence">
          <h3 className="mb-2 text-sm font-semibold">Reported evidence</h3>
          <StructuredValue value={meta.evidence} />
        </section>
      ) : null}
      {item.queue_type === 'org-link-review' && candidateOrganizationId !== null ? (
        <section aria-label="Proposed business">
          <h3 className="mb-2 text-sm font-semibold">Selected business</h3>
          {context.data?.candidate ? (
            <StructuredValue value={context.data.candidate} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {context.isFetching
                ? 'Loading the selected business…'
                : 'Current business details are unavailable. Choose a business or reload before linking.'}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            A matching name alone does not establish the same business. Compare its location and
            official website before linking.
          </p>
        </section>
      ) : null}
      <section aria-label="Source evidence">
        <h3 className="text-sm font-semibold">Source evidence</h3>
        {sources.length ? (
          <ul className="mt-4 space-y-4">
            {sources.map((source) => (
              <li key={`${source.url}:${source.quote ?? ''}`} className="min-w-0 text-sm">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline inline-flex max-w-full items-center gap-2 break-all underline-offset-4 hover:underline"
                >
                  {source.label}
                  <ExternalLink size={14} className="shrink-0" />
                </a>
                {source.quote && (
                  <blockquote className="mt-2 whitespace-pre-wrap leading-relaxed">
                    “{source.quote}”
                  </blockquote>
                )}
                <p className="mt-1 break-all text-xs text-muted-foreground">{source.url}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No source link or supporting quotation was supplied. Verify the claim before applying
            it.
          </p>
        )}
      </section>
      <section aria-label="Current record">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">Current record</h3>
          <Button
            size="sm"
            variant="ghost"
            disabled={context.isFetching}
            onClick={() => void context.refetch()}
            aria-label="Reload current record"
          >
            <RefreshCw size={14} className="mr-2" />
            Reload
          </Button>
        </div>
        {context.isLoading ? (
          <div role="status" className="mt-4 animate-pulse space-y-2">
            <span className="sr-only">Loading current record…</span>
            <div className="h-4 w-2/3 bg-muted" />
            <div className="h-16 bg-muted" />
          </div>
        ) : context.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Current record could not be loaded. Reload to check the live values before deciding.
          </p>
        ) : !record ? (
          <p className="mt-4 text-sm text-muted-foreground">
            The live record is unavailable for comparison. The proposal below may contain historical
            values.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium">
              {String(record.name ?? record.title ?? item.title)}
              {context.data?.location ? ` · ${context.data.location}` : ''}
            </p>
            {image && (
              <a
                href={image}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open current image"
              >
                <img
                  src={image}
                  alt={`Current cover for ${item.title}`}
                  className="mt-4 max-h-48 max-w-full rounded-element object-contain"
                  loading="lazy"
                />
              </a>
            )}
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {FACTS.filter((key) => record[key] != null && record[key] !== '').map((key) => (
                <div
                  key={key}
                  className={`min-w-0 ${key === 'description' ? 'sm:col-span-2' : ''}`}
                >
                  <dt className="text-xs text-muted-foreground">{label(key)}</dt>
                  <dd className="mt-1 text-sm leading-relaxed">
                    <StructuredValue value={record[key]} />
                  </dd>
                </div>
              ))}
            </dl>
            {field && (
              <div className="mt-4 grid gap-4 border-y border-border py-4 sm:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Current {label(field).toLowerCase()}
                  </h4>
                  <StructuredValue value={record[field] ?? null} />
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Proposed {label(field).toLowerCase()}
                  </h4>
                  <StructuredValue value={meta.proposed_value ?? null} />
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {!!context.data?.signals.length && (
        <section aria-label="Recent existence signals">
          <h3 className="mb-4 text-sm font-semibold">Recent existence signals</h3>
          <div className="divide-y divide-border">
            {context.data.signals.map((signal, index) => (
              <div key={index} className="py-4">
                <StructuredValue value={signal} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
