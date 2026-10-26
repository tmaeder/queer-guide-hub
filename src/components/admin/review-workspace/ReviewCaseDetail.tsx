import { useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, SkipForward } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { StructuredValue } from '@/components/admin/triage/StructuredDataView';
import { useAdminShell } from '@/components/admin/shell/AdminShell';
import { useReviewCase, useRetryReviewResearch, reviewCaseInfo } from '@/hooks/useReviewCase';
import type { ReviewDecision, ReviewItem } from '@/hooks/useAdminReview';
import { reviewHttpUrl } from './reviewEvidence';
import { VenueMatchPanel, type VenueMatchSelection } from './VenueMatchPanel';
import { CityIdentityContext } from './CityIdentityContext';

type Props = {
  item: ReviewItem;
  busy: boolean;
  error?: string;
  onDecision: (decision: ReviewDecision) => void;
  onSkip: () => void;
  onBack: () => void;
};
const date = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : 'Not recorded';
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const asList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(asObject) : [];
function SourceLink({ value, label }: { value: unknown; label: string }) {
  const url = reviewHttpUrl(value);
  return url ? (
    <a
      className="no-underline inline-flex min-h-8 items-center gap-2 text-sm underline-offset-4 hover:underline"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
      <ExternalLink size={14} />
    </a>
  ) : null;
}
export function ReviewCaseDetail({ item, busy, error, onDecision, onSkip, onBack }: Props) {
  const info = reviewCaseInfo(item);
  const query = useReviewCase(info.id);
  const retry = useRetryReviewResearch();
  const { openEditor } = useAdminShell();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [venueSelection, setVenueSelection] = useState<
    (VenueMatchSelection & { fingerprint: string }) | null
  >(null);
  const [notes, setNotes] = useState('');
  const [confirmedFingerprint, setConfirmedFingerprint] = useState<string | null>(null);
  const data = query.data;
  const confirmed = !!data && confirmedFingerprint === data.fingerprint;
  const members = data?.members ?? [];
  const research = data?.research;
  const outcome = research?.outcome ?? {};
  const stage = outcome.decision_ready
    ? 'ready'
    : research?.status === 'blocked'
      ? 'blocked'
      : info.stage;
  const selected = members.filter((member) => !excluded.has(member.id));
  const events = new Set(members.map((member) => member.entity_id)).size;
  const candidates = asList(
    data?.candidates ?? outcome.candidates ?? asObject(members[0]?.meta?.details).candidates,
  );
  const artwork = [
    ...new Set(
      members.flatMap((member) => {
        const evidence = asObject(member.meta.evidence);
        return [evidence.url, ...asList(evidence.images).map((image) => image.url)]
          .map(reviewHttpUrl)
          .filter((url): url is string => !!url);
      }),
    ),
  ];
  const canSave =
    !!data && !busy && !query.isFetching && confirmed && !!notes.trim() && selected.length > 0;
  const actionItem = data
    ? { ...item, meta: { ...item.meta, review_case: { ...info, fingerprint: data.fingerprint } } }
    : item;
  const title =
    info.family === 'artwork'
      ? 'Review shared artwork'
      : info.family === 'venue'
        ? 'Match the event venue'
        : info.family === 'city_identity'
          ? 'Establish this place’s identity'
          : 'Research the business relationship';
  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={title}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onBack}
            aria-label="Back to queue"
          >
            <ArrowLeft size={16} />
          </Button>
          <h2 className="truncate font-sans text-base font-semibold">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          aria-label="Refresh case evidence"
        >
          <RefreshCw size={16} />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {query.isLoading ? (
          <p role="status">Loading current evidence and affected records…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button className="mt-4" onClick={() => void query.refetch()}>
              Retry loading evidence
            </Button>
          </div>
        ) : !data ? (
          <p>This case is no longer pending. Refresh the queue to continue.</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium">
                {info.family === 'artwork'
                  ? `${members.length} findings across ${events} events`
                  : item.title}
              </p>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {info.family === 'artwork'
                  ? 'Shared artwork can be valid for a series or organizer. Compare the actual image, event dates and source pages. Exclude any event that needs a different decision.'
                  : info.family === 'venue'
                    ? 'Compare the supplied venue name and address with canonical candidates. A link changes the event’s venue relationship; it does not create a new venue.'
                    : 'Identity and relationship changes require cited evidence. Missing evidence remains visible as research; it is never treated as verification.'}
              </p>
            </div>
            {info.family === 'city_identity' && <CityIdentityContext value={data.city_context} />}
            {info.family !== 'artwork' && (
              <section aria-label="Research status" className="bg-muted/40 p-4">
                <h3 className="text-sm font-semibold">
                  {stage === 'ready'
                    ? 'Evidence available for review'
                    : stage === 'blocked'
                      ? 'Research is blocked'
                      : data.research_enabled === false
                        ? 'Automatic research is paused'
                        : 'Automatic research is queued or running'}
                </h3>
                <p className="mt-2 text-sm leading-relaxed">
                  {typeof outcome.reason === 'string'
                    ? outcome.reason
                    : 'The worker will collect source evidence and search for corroborated candidates.'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Attempts: {research?.attempts ?? 0} · Last attempt:{' '}
                  {date(research?.last_attempt_at)}
                </p>
                {research?.status === 'retry' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Next retry: {date(research.next_attempt_at)}
                  </p>
                )}
                <SourceLink value={outcome.source_url} label="Open research source" />
                {['blocked', 'retry'].includes(research?.status ?? '') && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(info.id)}
                    >
                      Queue another research attempt
                    </Button>
                  </div>
                )}
                {retry.error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {retry.error.message}
                  </p>
                )}
              </section>
            )}
            {!!artwork.length && (
              <section aria-label="Artwork under review">
                <h3 className="mb-4 text-sm font-semibold">Artwork under review</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {artwork.map((url) => (
                    <a
                      className="no-underline block"
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        className="max-h-72 w-full object-contain bg-muted"
                        src={url}
                        alt="Shared event artwork from the finding’s cited source"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                  ))}
                </div>
              </section>
            )}
            <section aria-label="Affected source records">
              <h3 className="mb-4 text-sm font-semibold">
                {info.family === 'artwork'
                  ? 'Select findings covered by this decision'
                  : 'Related findings and current records'}
              </h3>
              <div className="divide-y divide-border border-y border-border">
                {members.map((member) => {
                  const current = member.current_record ?? {};
                  return (
                    <div key={member.id} className="flex gap-4 py-4">
                      {info.family === 'artwork' && (
                        <Checkbox
                          className="mt-1 size-6 shrink-0"
                          checked={!excluded.has(member.id)}
                          aria-label={`Include ${member.title}: ${member.subtitle}`}
                          onCheckedChange={(checked) =>
                            setExcluded((old) => {
                              const next = new Set(old);
                              if (checked) next.delete(member.id);
                              else next.add(member.id);
                              return next;
                            })
                          }
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">{member.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {member.subtitle} · {member.source_label ?? member.queue_type}
                        </p>
                        {Boolean(current.start_date) && (
                          <p className="mt-2 text-sm">{date(current.start_date)}</p>
                        )}
                        {Boolean(current.venue_name || current.city) && (
                          <p className="mt-1 text-sm">
                            {[current.venue_name, current.city]
                              .filter(Boolean)
                              .map(String)
                              .join(' · ')}
                          </p>
                        )}
                        {Boolean(current.address) && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {String(current.address)}
                          </p>
                        )}
                        {Boolean(current.organizer_name) && (
                          <p className="mt-1 text-sm">
                            Organizer: {String(current.organizer_name)}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-4">
                          <SourceLink value={current.website} label="Event source" />
                          <SourceLink value={current.ticket_url} label="Ticket source" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            {info.family === 'venue' && stage === 'ready' && data && (
              <VenueMatchPanel
                key={data.fingerprint}
                item={{ ...item, entity_id: members[0]?.entity_id ?? item.entity_id }}
                busy={busy}
                selection={venueSelection?.fingerprint === data.fingerprint ? venueSelection : null}
                onSelect={(selection) =>
                  setVenueSelection(
                    selection ? { ...selection, fingerprint: data.fingerprint } : null,
                  )
                }
              />
            )}
            {info.family === 'venue' && stage !== 'ready' && candidates.length > 0 && (
              <section aria-label="Research venue candidates">
                <h3 className="mb-2 text-sm font-semibold">Research venue candidates</h3>
                <StructuredValue value={candidates} />
              </section>
            )}
            {Boolean(outcome.source_evidence) && (
              <section aria-label="Publisher evidence">
                <h3 className="mb-2 text-sm font-semibold">Publisher evidence</h3>
                <StructuredValue value={outcome.source_evidence} />
              </section>
            )}
            {info.family === 'city_identity' && (
              <section aria-label="Identity checks">
                <h3 className="mb-2 text-sm font-semibold">Identity checks and sources</h3>
                <StructuredValue value={outcome} />
              </section>
            )}
            {item.entity_id && item.entity_table && (
              <Button
                variant="outline"
                onClick={() => openEditor(item.entity_table!, item.entity_id!)}
              >
                Open current record editor
              </Button>
            )}
            {stage === 'ready' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="case-evidence-note" className="text-sm font-medium">
                    Evidence and decision note
                  </label>
                  <Textarea
                    id="case-evidence-note"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Explain which source supports this decision and any exceptions."
                    className="mt-2"
                  />
                </div>
                <label className="flex items-start gap-4 text-sm leading-relaxed">
                  <Checkbox
                    className="mt-0.5 size-6 shrink-0"
                    checked={confirmed}
                    onCheckedChange={(value) =>
                      setConfirmedFingerprint(value === true && data ? data.fingerprint : null)
                    }
                  />
                  {info.family === 'artwork'
                    ? `I checked all ${selected.length} selected findings. Accepting shared artwork retains the images and records this note for each finding.`
                    : 'I checked the current record, sources and consequences of this change.'}
                </label>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Full detector evidence and research history
              </summary>
              <div className="mt-4">
                <StructuredValue value={data} />
              </div>
            </details>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-4 md:px-6">
        {data && stage === 'ready' && info.family === 'artwork' && (
          <Button
            data-review-action="reject"
            disabled={!canSave}
            onClick={() =>
              onDecision({
                item: actionItem,
                action: 'reject',
                notes,
                confirm: confirmed,
                payload: { member_ids: selected.map((member) => member.id) },
              })
            }
          >
            Accept shared artwork ({selected.length})
          </Button>
        )}
        {data && stage === 'ready' && info.family === 'venue' && (
          <Button
            data-review-action="approve"
            disabled={
              !canSave || !venueSelection || venueSelection.fingerprint !== data.fingerprint
            }
            onClick={() =>
              onDecision({
                item: actionItem,
                action: 'approve',
                notes,
                confirm: confirmed,
                payload: {
                  venue_id: venueSelection?.venue_id,
                  member_ids: members.map((member) => member.id),
                  expected_updated_at: venueSelection?.expected_updated_at,
                },
              })
            }
          >
            Link selected venue
          </Button>
        )}
        {data && stage === 'ready' && info.family === 'city_identity' && (
          <Button
            data-review-action="approve"
            disabled={!canSave}
            onClick={() =>
              onDecision({ item: actionItem, action: 'approve', notes, confirm: confirmed })
            }
          >
            Recheck corrected record
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          <SkipForward size={16} className="mr-2" />
          Skip
        </Button>
      </footer>
    </section>
  );
}
