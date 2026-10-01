/**
 * PipelineInspector — what the machine did to this record, in plain language.
 *
 * THE RULE THIS COMPONENT ENFORCES. An explanation key with no registered text
 * renders as the RAW KEY in monospace with an "unexplained" chip. There is
 * deliberately no `title ?? humanize(key)` fallback: a prettified key looks
 * like content, which is what made a missing explanation invisible in the
 * first place (`TriageDetailPanel.humanize()` turns W_NO_COORDS into
 * "W No Coords" and has been doing so since the triage panel shipped). A
 * missing explanation must LOOK broken, because it is.
 *
 * GAPS RENDER FIRST AND ARE NOT COLLAPSIBLE BY DEFAULT. A source the timeline
 * cannot read and a source with nothing in it must never look the same. The
 * RPC pins those rows in sort_bucket 0 and this renders them as a banner above
 * the events rather than as entries within them.
 *
 * SAME-SECOND CLUSTERS ARE NOT AN ORDERING. `occurred_at_is_tx` marks rows
 * timestamped with transaction time, where several sources legitimately share
 * one instant. Those get a shared timestamp header rather than an implied
 * sequence, because the order within them is a presentation tiebreak the RPC
 * documents as "not evidence".
 */

import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  GitMerge,
  History,
  Info,
  Layers,
  ScanSearch,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { cn } from '@/lib/utils';
import {
  useEntityAuditTimeline,
  type AuditEvent,
  type AuditEventKind,
} from '@/hooks/useEntityAuditTimeline';

interface PipelineInspectorProps {
  /** audit_entity_registry.entity_key — the plural table name, e.g. 'venues'. */
  entityType: string | null | undefined;
  entityId: string | null | undefined;
  limit?: number;
  className?: string;
}

const KIND_META: Record<AuditEventKind, { label: string; icon: LucideIcon }> = {
  revision: { label: 'Edit', icon: History },
  review_proposal: { label: 'Proposed', icon: Sparkles },
  review_decision: { label: 'Decided', icon: UserCheck },
  provenance: { label: 'Source', icon: Layers },
  enrichment_step: { label: 'Enrichment', icon: Sparkles },
  quality_signal: { label: 'Signal', icon: ScanSearch },
  merge: { label: 'Merge', icon: GitMerge },
  staging_stage: { label: 'Ingest', icon: Layers },
  consensus: { label: 'Cross-check', icon: ScanSearch },
  gap: { label: 'Not recorded', icon: CircleHelp },
};

/**
 * Severity is carried by a glyph AND a word, never by colour alone (WCAG
 * 1.4.1). `destructive` is the only chromatic token in the product and its
 * sanctioned use is hard-error semantics, which is what `blocking` is.
 */
function SeverityChip({ severity }: { severity: string | null }) {
  if (!severity) return null;
  if (severity === 'blocking') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertOctagon size={11} aria-hidden="true" />
        Blocking
      </Badge>
    );
  }
  if (severity === 'warning') {
    return (
      <Badge variant="outline" className="gap-1">
        <AlertTriangle size={11} aria-hidden="true" />
        Warning
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Info size={11} aria-hidden="true" />
      Info
    </Badge>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Date not recorded';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > 140 ? `${json.slice(0, 140)}…` : json;
}

function EventRow({ event }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false);
  const meta = KIND_META[event.kind] ?? KIND_META.gap;
  const Icon = meta.icon;
  const before = shortValue(event.before_value);
  const after = shortValue(event.after_value);

  return (
    <li className="border-b border-border-hairline last:border-b-0 py-2">
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-13 font-semibold">{meta.label}</span>
            {event.field && (
              <code className="text-2xs bg-muted px-1 rounded-badge">{event.field}</code>
            )}
            <SeverityChip severity={event.explanation_severity} />
            {event.actor_kind === 'human' && (
              <Badge variant="secondary" className="gap-1">
                <UserCheck size={11} aria-hidden="true" />
                By a person
              </Badge>
            )}
          </div>

          {/* Registered prose, or the raw key. Never a derivation of the key. */}
          {event.explanation_status === 'registered' ? (
            <>
              <p className="text-13 mt-1">{event.explanation_title}</p>
              <p className="text-13 text-muted-foreground mt-0.5">{event.explanation_body}</p>
              {event.explanation_what_now && (
                <p className="text-13 mt-1">
                  <span className="font-semibold">What you can do: </span>
                  {event.explanation_what_now}
                </p>
              )}
            </>
          ) : event.explanation_status === 'unregistered' ? (
            <p className="text-13 mt-1 flex flex-wrap items-center gap-1.5">
              <code className="bg-muted px-1 rounded-badge">{event.explanation_key}</code>
              <Badge variant="outline">unexplained</Badge>
              <span className="text-muted-foreground">
                Nobody has written an explanation for this code yet.
              </span>
            </p>
          ) : null}

          {(before !== null || after !== null) && (
            <div className="mt-1 text-13 flex flex-col gap-0.5">
              {before !== null && (
                <div className="text-muted-foreground">
                  <span className="text-2xs uppercase tracking-wide">was</span>{' '}
                  <span className="line-through">{before}</span>
                </div>
              )}
              {after !== null && (
                <div>
                  <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                    now
                  </span>{' '}
                  {after}
                </div>
              )}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <span>{formatWhen(event.occurred_at)}</span>
            {event.actor_label && <span>· {event.actor_label}</span>}
            {event.source && <span>· source: {event.source}</span>}
            {event.confidence !== null && (
              <span>· confidence {Math.round(Number(event.confidence) * 100)}%</span>
            )}
          </div>

          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="mt-1 text-2xs text-muted-foreground underline min-h-11 sm:min-h-0"
              >
                {open ? 'Hide' : 'Show'} recorded data
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-1 text-2xs bg-muted p-2 rounded-element overflow-x-auto">
                {JSON.stringify({ source_ref: event.source_ref, raw: event.raw }, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </li>
  );
}

export function PipelineInspector({
  entityType,
  entityId,
  limit = 200,
  className,
}: PipelineInspectorProps) {
  const { loading, error, gaps, dated, current, unexplained } = useEntityAuditTimeline(
    entityType,
    entityId,
    limit,
  );
  const [showGaps, setShowGaps] = useState(false);

  if (!entityType || !entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Save this record first — there is no history until it exists.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <TrackLoader />
        Reading the record&rsquo;s history…
      </div>
    );
  }

  // Shown, never swallowed. An unregistered entity type raises 22023 here, and
  // that is a different fact from "this record has no history".
  if (error) {
    return (
      <div className="rounded-element border border-destructive p-4">
        <p className="text-13 font-semibold">The history could not be read.</p>
        <p className="text-13 text-muted-foreground mt-1">{error}</p>
        <p className="text-13 text-muted-foreground mt-1">
          This is not the same as the record having no history — nothing was read at all.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {unexplained.length > 0 && (
        <div className="rounded-element bg-muted p-4">
          <p className="text-13 font-semibold">
            {unexplained.length} step{unexplained.length === 1 ? '' : 's'} below have no written
            explanation
          </p>
          <p className="text-13 text-muted-foreground mt-1">
            They show as raw codes on purpose. Tell an engineer which ones you see.
          </p>
        </div>
      )}

      {gaps.length > 0 && (
        <Collapsible open={showGaps} onOpenChange={setShowGaps}>
          <div className="rounded-element bg-muted overflow-hidden">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full min-h-11 flex items-center justify-between px-4 py-2 text-left"
              >
                <span className="text-13 font-semibold">
                  {gaps.length} thing{gaps.length === 1 ? '' : 's'} this history cannot show
                </span>
                <ChevronDown
                  size={16}
                  className={cn('transition-transform', showGaps && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="px-4 pb-4 flex flex-col gap-2">
                {gaps.map((g) => (
                  <li key={g.row_no}>
                    <p className="text-13 font-semibold">
                      {g.explanation_title ?? g.explanation_key}
                    </p>
                    {g.explanation_body && (
                      <p className="text-13 text-muted-foreground">{g.explanation_body}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {dated.length === 0 && current.length === 0 ? (
        // Note this is genuinely "nothing recorded", not "we could not look" —
        // the gap banner above carries that half, and an error returns earlier.
        <AdminEmpty
          noun="recorded steps"
          variant="inline"
          description="Nothing has touched this record since history recording was switched on."
        />
      ) : (
        <>
          {dated.length > 0 && (
            <ul className="flex flex-col">
              {dated.map((e) => (
                <EventRow key={e.row_no} event={e} />
              ))}
            </ul>
          )}
          {current.length > 0 && (
            <div>
              <h4 className="text-2xs uppercase tracking-wide text-muted-foreground mb-1">
                Where the current values came from
              </h4>
              {/* Undated on purpose: field provenance mostly records a source and
                  no time. These are current state, not history, and dating them
                  from the record's last-modified time would invent a sequence. */}
              <ul className="flex flex-col">
                {current.map((e) => (
                  <EventRow key={e.row_no} event={e} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
