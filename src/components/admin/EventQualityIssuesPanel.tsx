import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  SearchX,
} from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { cmsEditPath } from '@/lib/cmsLinks';

interface EventQualityIssueRow {
  id: string;
  event_id: string;
  dimension: string;
  issue_code: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: Record<string, unknown>;
  detected_at: string;
  last_seen_at: string;
  title: string;
  slug: string;
  data_source: string | null;
}

interface EventQualityIssuePage {
  rows: EventQualityIssueRow[];
  filtered_total: number;
  canonical_total: number;
  offset: number;
  limit: number;
}

interface DecisionState {
  kind: 'resolved' | 'accepted';
  rows: EventQualityIssueRow[];
}

interface EventQualityIssuesPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
}

const PAGE_SIZE = 50;

const severityVariant = (severity: EventQualityIssueRow['severity']) =>
  severity === 'critical' ? 'destructive' : severity === 'high' ? 'default' : 'outline';

const displayEvidenceValue = (value: unknown) => {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
};

export function EventQualityIssuesPanel({ query, onQueryChange }: EventQualityIssuesPanelProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [note, setNote] = useState('');
  const [renderedAt] = useState(() => Date.now());
  const debouncedQuery = useDebounce(query.trim(), 300);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['event-quality-issues', 'open', severityFilter, debouncedQuery, page],
    queryFn: async () => {
      const { data: payload, error: queryError } = await untypedRpc<EventQualityIssuePage>(
        'event_quality_issue_page',
        {
          p_severity: severityFilter === 'all' ? null : severityFilter,
          p_query: debouncedQuery || null,
          p_offset: page * PAGE_SIZE,
          p_limit: PAGE_SIZE,
        },
      );
      if (queryError) throw new Error(queryError.message);
      if (!payload) throw new Error('The event quality queue is unavailable for this account.');
      return payload;
    },
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const bulkAcceptSafe =
    selectedRows.length > 0 &&
    selectedRows.every((row) => row.severity !== 'critical') &&
    new Set(selectedRows.map((row) => row.issue_code)).size === 1;

  const decide = useMutation({
    mutationFn: async ({
      rows: decisionRows,
      kind,
      auditNote,
    }: DecisionState & { auditNote: string }) => {
      for (const row of decisionRows) {
        const { error: mutationError } = await untypedRpc('decide_event_quality_issue', {
          p_issue_id: row.id,
          p_decision: kind,
          p_note: auditNote,
        });
        if (mutationError) throw new Error(mutationError.message);
      }
    },
    onSuccess: async (_, variables) => {
      setSelected(new Set());
      setDecision(null);
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event-quality-issues'] }),
        queryClient.invalidateQueries({ queryKey: ['event-quality-summary'] }),
      ]);
      toast.success(
        `${variables.rows.length} event quality ${variables.rows.length === 1 ? 'decision' : 'decisions'} saved`,
      );
    },
    onError: (mutationError) =>
      toast.error(mutationError instanceof Error ? mutationError.message : 'Decision failed'),
  });

  const resetPageAndSelection = () => {
    setPage(0);
    setSelected(new Set());
  };
  const changeQuery = (value: string) => {
    onQueryChange(value);
    resetPageAndSelection();
  };
  const changeSeverity = (value: string) => {
    setSeverityFilter(value);
    resetPageAndSelection();
  };
  const openDecision = (kind: DecisionState['kind'], decisionRows: EventQualityIssueRow[]) => {
    setNote('');
    setDecision({ kind, rows: decisionRows });
  };

  const filteredTotal = data?.filtered_total ?? 0;
  const canonicalTotal = data?.canonical_total ?? 0;
  const firstShown = filteredTotal === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastShown = Math.min((page + 1) * PAGE_SIZE, filteredTotal);
  const pageCount = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  return (
    <Card id="event-quality-issues" aria-busy={isFetching || undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-title">
          <AlertTriangle size={16} aria-hidden />
          Open event quality issues
          <Badge variant="secondary" className="ml-auto tabular-nums" aria-live="polite">
            {firstShown}–{lastShown} of {filteredTotal.toLocaleString()}
          </Badge>
        </CardTitle>
        <p className="mb-0 mt-1 text-12 text-muted-foreground">
          Canonical events only · {canonicalTotal.toLocaleString()} open issues across the full
          queue. Filters search issue codes, sources, and event titles on the server.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          className="flex flex-wrap gap-2"
          role="search"
          aria-label="Filter event quality issues"
        >
          <select
            aria-label="Filter by severity"
            className="h-9 rounded-element border border-input bg-background px-4 text-13"
            value={severityFilter}
            onChange={(event) => changeSeverity(event.target.value)}
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            aria-label="Filter by issue code, source, or event title"
            className="h-9 min-w-72 flex-1 rounded-element border border-input bg-background px-4 text-13"
            placeholder="Issue code, source, or event title"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
          />
          {(query || severityFilter !== 'all') && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onQueryChange('');
                setSeverityFilter('all');
                resetPageAndSelection();
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-container border border-border p-2">
            <span className="text-13 text-muted-foreground">
              {selectedRows.length} selected on this page
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => openDecision('accepted', selectedRows)}
              disabled={decide.isPending || !bulkAcceptSafe}
              aria-describedby={!bulkAcceptSafe ? 'bulk-accept-help' : undefined}
            >
              <CheckCheck size={14} /> Accept with disposition
            </Button>
            {!bulkAcceptSafe && (
              <span
                id="bulk-accept-help"
                className="w-full text-right text-12 text-muted-foreground"
              >
                Bulk acceptance requires one non-critical issue code.
              </span>
            )}
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="m-0 rounded-element border border-destructive/30 bg-destructive/5 p-4 text-13 text-destructive"
          >
            {error instanceof Error ? error.message : 'Could not load event quality issues.'}
          </p>
        ) : isLoading ? (
          <p className="m-0 text-13 text-muted-foreground">Loading the canonical issue queue…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-container border border-border p-8 text-center">
            <SearchX aria-hidden />
            <p className="m-0 font-medium">No matching open issues</p>
            <p className="m-0 text-13 text-muted-foreground">
              The full canonical queue was searched. Try clearing or broadening the filters.
            </p>
          </div>
        ) : (
          <ul
            className="m-0 divide-y divide-border rounded-container border border-border p-0"
            aria-label="Event quality issues"
          >
            {rows.map((issue) => {
              const editPath = cmsEditPath('events', issue.event_id);
              const eventName = issue.title || issue.event_id;
              return (
                <li key={issue.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
                  <Checkbox
                    aria-label={`Select ${issue.issue_code} for ${eventName}`}
                    checked={selected.has(issue.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(issue.id);
                        else next.delete(issue.id);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/events/${issue.slug}`}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {eventName}
                      </Link>
                      <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
                      <Badge variant="outline">{issue.issue_code}</Badge>
                    </div>
                    <p className="mb-0 mt-1 text-13 text-muted-foreground">
                      {issue.dimension} · {issue.data_source ?? 'unknown source'} · detected{' '}
                      {new Date(issue.detected_at).toLocaleDateString()} ·{' '}
                      {Math.max(
                        0,
                        Math.floor(
                          (renderedAt - new Date(issue.detected_at).getTime()) / 86_400_000,
                        ),
                      )}{' '}
                      days old
                    </p>
                    <Evidence issue={issue} />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1 lg:justify-end">
                    {editPath && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to={editPath} aria-label={`Edit ${eventName} in the admin console`}>
                          <Pencil aria-hidden /> Edit event
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        to={`/events/${issue.slug}`}
                        aria-label={`View ${eventName} on the public site`}
                      >
                        <ExternalLink aria-hidden /> View
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openDecision('resolved', [issue])}
                      disabled={decide.isPending}
                      aria-label={`Resolve ${issue.issue_code} for ${eventName}`}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openDecision('accepted', [issue])}
                      disabled={decide.isPending || issue.severity === 'critical'}
                      aria-label={`Accept ${issue.issue_code} for ${eventName}`}
                    >
                      Accept
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {filteredTotal > 0 && (
          <nav
            className="flex items-center justify-between gap-4"
            aria-label="Event quality issue pages"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 0 || isFetching}
              onClick={() => {
                setSelected(new Set());
                setPage((current) => Math.max(0, current - 1));
              }}
            >
              <ChevronLeft aria-hidden /> Previous
            </Button>
            <span className="text-13 text-muted-foreground tabular-nums">
              Page {page + 1} of {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page + 1 >= pageCount || isFetching}
              onClick={() => {
                setSelected(new Set());
                setPage((current) => current + 1);
              }}
            >
              Next <ChevronRight aria-hidden />
            </Button>
          </nav>
        )}
      </CardContent>

      <DecisionDialog
        decision={decision}
        note={note}
        onNoteChange={setNote}
        pending={decide.isPending}
        onClose={() => {
          setDecision(null);
          setNote('');
        }}
        onSubmit={() => {
          if (!decision || !note.trim()) return;
          decide.mutate({ ...decision, auditNote: note.trim() });
        }}
      />
    </Card>
  );
}

function Evidence({ issue }: { issue: EventQualityIssueRow }) {
  const entries = Object.entries(issue.evidence ?? {});
  return (
    <details className="mt-2 text-12 text-muted-foreground">
      <summary
        className="cursor-pointer"
        aria-label={`Evidence for ${issue.issue_code} on ${issue.title}`}
      >
        Evidence · {entries.length} {entries.length === 1 ? 'field' : 'fields'}
      </summary>
      <dl className="mt-2 grid gap-1 rounded-element bg-muted p-4 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-medium text-foreground">{key.replaceAll('_', ' ')}</dt>
            <dd className="m-0 break-words">{displayEvidenceValue(value)}</dd>
          </div>
        ))}
        {entries.length === 0 && <div>No structured evidence was recorded.</div>}
      </dl>
      <details className="mt-2">
        <summary className="cursor-pointer">Raw JSON</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-element bg-muted p-2">
          {JSON.stringify(issue.evidence, null, 2)}
        </pre>
      </details>
    </details>
  );
}

function DecisionDialog({
  decision,
  note,
  onNoteChange,
  pending,
  onClose,
  onSubmit,
}: {
  decision: DecisionState | null;
  note: string;
  onNoteChange: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const accepting = decision?.kind === 'accepted';
  const count = decision?.rows.length ?? 0;
  const issueCode = decision?.rows[0]?.issue_code;
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{accepting ? 'Accept quality gap' : 'Resolve quality issue'}</DialogTitle>
          <DialogDescription>
            {accepting
              ? `Record why ${count === 1 ? 'this gap is' : `these ${count} gaps are`} acceptable. The finding will leave the open queue but remain in the audit history.`
              : `Record the evidence that shows ${count === 1 ? 'this issue is' : `these ${count} issues are`} resolved.`}
          </DialogDescription>
        </DialogHeader>
        {decision && (
          <div className="rounded-element bg-muted p-4 text-13">
            <div className="font-medium">
              {count === 1 ? decision.rows[0].title : `${count} selected events`}
            </div>
            <div className="mt-1 text-muted-foreground">{issueCode}</div>
          </div>
        )}
        <label className="text-13 font-medium" htmlFor="event-quality-audit-note">
          Audit note
        </label>
        <Textarea
          id="event-quality-audit-note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder={
            accepting
              ? 'Explain why this gap is acceptable…'
              : 'Describe the repair or verification evidence…'
          }
          disabled={pending}
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!note.trim()} loading={pending}>
            {accepting ? 'Accept with audit note' : 'Mark resolved'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
