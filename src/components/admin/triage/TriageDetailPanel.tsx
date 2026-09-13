import { useState } from 'react';
import { Link } from 'react-router';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, ShieldAlert, User, Zap } from 'lucide-react';
import { EntityPreviewCard } from './EntityPreviewCard';
import { StagingPreview } from './StagingPreview';
import { FieldDiffView, computeFieldDiffs } from './FieldDiffView';
import { ActionBar } from './ActionBar';
import { DedupPairCompare } from './DedupPairCompare';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';
import { useEntityData, useStagingData } from '@/hooks/useTriageDetail';

interface TriageDetailPanelProps {
  item: TriageItem;
  onAction: (
    action: 'approve' | 'reject' | 'skip' | 'flag',
    notes?: string,
    cannedSlug?: string,
    /** Queue-specific extras — dedup-review uses `{ keep_id }` for the canonical flip. */
    payload?: Record<string, unknown>,
  ) => void;
  isActionLoading: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Queues the inbox lists but cannot decide: triage_action has no branch for
 * them because the decision needs inputs this generic panel does not model.
 * Mirrors triage_sources.capabilities.external_console. Deliberately excludes
 * dedup-review, which does have a working branch and keeps its action bar.
 */
const EXTERNAL_CONSOLE: Record<string, { route: string; label: string }> = {
  'org-link-review': { route: '/admin/quality', label: 'Review in Quality' },
};

/** Keys to hide from meta display — internal or already shown in header */
const META_HIDDEN_KEYS = new Set([
  'id',
  'entity_id',
  'entity_table',
  'queue_type',
  'content_type',
  'title',
  'subtitle',
  'status',
  'created_at',
  'updated_at',
  'normalized_data',
  'raw_data',
  'source_data',
]);

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (value >= 0 && value <= 1 && value !== 0 && value !== 1) {
      return `${Math.round(value * 100)}%`;
    }
    return String(value);
  }
  if (typeof value === 'string') {
    if (/^[A-Z][A-Z_-]+$/.test(value)) {
      return value
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return value;
  }
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}

function formatMetaKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanize(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TriageDetailPanel({ item, onAction, isActionLoading }: TriageDetailPanelProps) {
  const { data: entityData, isLoading: entityLoading } = useEntityData(item);
  const { data: stagingData } = useStagingData(item);
  const externalConsole = EXTERNAL_CONSOLE[item.queue_type];

  const isDedup = item.queue_type === 'dedup-review';
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  const originalKeepId = typeof meta?.keep_id === 'string' ? meta.keep_id : null;

  // Namesake: `triage_src_dedup_review` has emitted this for personalities since the
  // queue existed and no component ever read it. Two different people with one name
  // merged together is an outing risk, so it gets an explicit confirm.
  const namesake = Boolean((item.risk_flags as { namesake?: boolean } | null)?.namesake);

  // Per-pair state, reset when the queue advances. The panel is reused in place, so
  // without the reset the previous pair's canonical choice and namesake confirmation
  // would carry silently onto the next one — and on the namesake flag that means the
  // confirm gate is already satisfied for a pair nobody looked at.
  //
  // Adjusted DURING RENDER rather than in an effect (react-hooks/set-state-in-effect):
  // an effect here would render the new pair once with the old pair's answers before
  // correcting itself.
  const [perPair, setPerPair] = useState({
    id: item.id,
    keepId: originalKeepId,
    namesakeConfirmed: false,
  });
  if (perPair.id !== item.id) {
    setPerPair({ id: item.id, keepId: originalKeepId, namesakeConfirmed: false });
  }
  const keepId = perPair.id === item.id ? perPair.keepId : originalKeepId;
  const namesakeConfirmed = perPair.id === item.id ? perPair.namesakeConfirmed : false;
  const setKeepId = (v: string) => setPerPair((p) => ({ ...p, keepId: v }));
  const setNamesakeConfirmed = (v: boolean) => setPerPair((p) => ({ ...p, namesakeConfirmed: v }));

  // The canonical flip. `triage_action` has taken `p_payload.keep_id` since
  // 20260801050000 and `useUnifiedTriageQueue` has carried a payload slot all along,
  // but `TriageView.handleAction` never passed one — so choosing which row survives was
  // reachable from SQL and from the hook, and from nowhere a reviewer could click.
  const handleAction = (
    action: 'approve' | 'reject' | 'skip' | 'flag',
    notes?: string,
    cannedSlug?: string,
  ) => {
    if (isDedup && action === 'approve' && keepId && keepId !== originalKeepId) {
      onAction(action, notes, cannedSlug, { keep_id: keepId });
      return;
    }
    onAction(action, notes, cannedSlug);
  };

  const diffs =
    item.has_diff && entityData && stagingData
      ? computeFieldDiffs(
          entityData as Record<string, unknown>,
          ((stagingData as Record<string, unknown>)?.normalized_data as Record<string, unknown>) ??
            null,
        )
      : [];

  // `keep`/`drop` are objects, so the generic Context list rendered them through
  // JSON.stringify — the same blob EntityPreviewCard's fallback was already dumping
  // above it. The compare table shows them properly now; what stays here is the
  // sweep's own decision record (match_type, distance, auto_eligible), which the
  // table does not carry.
  const metaEntries = item.meta
    ? Object.entries(item.meta).filter(
        ([k, v]) =>
          !META_HIDDEN_KEYS.has(k) &&
          !(isDedup && ['keep', 'drop', 'keep_id', 'drop_id', 'reason'].includes(k)) &&
          v !== null &&
          v !== undefined &&
          v !== '',
      )
    : [];

  // Venue Truth Engine: per-field consensus confidence + contributing sources.
  const enriched = (stagingData as Record<string, unknown>)?.enriched_data as
    Record<string, unknown> | undefined;
  const consensus = enriched?.consensus as
    { sources?: string[]; gated?: boolean; closure?: string | null } | undefined;
  const fieldConfidence = (enriched?.field_confidence as Record<string, number> | undefined) ?? {};
  const confidenceRows = Object.entries(fieldConfidence).sort((a, b) => a[1] - b[1]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-2xs normal-case">
            {humanize(item.queue_type)}
          </Badge>
          <Badge variant="secondary" className="text-2xs normal-case">
            {humanize(item.content_type)}
          </Badge>
          {item.confidence_score !== null && (
            <span className="text-2xs text-muted-foreground tabular-nums ml-auto">
              Confidence: {(item.confidence_score * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <h2 className="text-base font-medium leading-tight">{item.title}</h2>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground">{humanize(item.subtitle)}</p>
        )}
        <div className="flex items-center gap-4 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(item.created_at)}
          </span>
          {item.source && (
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {humanize(item.source)}
            </span>
          )}
          {item.reporter_id && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              Reporter
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {entityLoading ? (
          <div className="flex items-center justify-center py-12">
            <TrackLoader size={20} />
          </div>
        ) : (
          <>
            {item.queue_type === 'staging' && stagingData ? (
              <StagingPreview item={item} staging={stagingData as Record<string, unknown>} />
            ) : isDedup ? (
              <div className="px-4 pt-4">
                <DedupPairCompare
                  entityType={item.content_type}
                  meta={meta}
                  keepId={keepId}
                  onFlip={setKeepId}
                  flipped={Boolean(keepId && keepId !== originalKeepId)}
                />
              </div>
            ) : (
              <EntityPreviewCard item={item} entityData={entityData ?? null} />
            )}

            {isDedup && namesake && (
              <div className="border-t px-4 py-4">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 space-y-2">
                    <p className="text-13">
                      <span className="font-bold">Namesake risk.</span> Two people can share a name.
                      Merging distinct people into one profile is an outing risk and the merge moves
                      their relationship graph, which no undo can fully rebuild. Check the Wikidata
                      id and the dates before approving.
                    </p>
                    <label className="flex items-center gap-2 text-13">
                      <input
                        type="checkbox"
                        checked={namesakeConfirmed}
                        onChange={(e) => setNamesakeConfirmed(e.target.checked)}
                      />
                      I have confirmed these are the same person
                    </label>
                  </div>
                </div>
              </div>
            )}

            {diffs.length > 0 && (
              <div className="border-t">
                <p className="px-4 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                  Changes
                </p>
                <FieldDiffView diffs={diffs} />
              </div>
            )}

            {/* Venue consensus: sources + per-field confidence */}
            {consensus && (
              <div className="border-t">
                <p className="px-4 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                  Consensus
                </p>
                <div className="px-4 py-2 space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(consensus.sources ?? []).map((s) => (
                      <Badge key={s} variant="outline" className="text-2xs normal-case">
                        {humanize(s)}
                      </Badge>
                    ))}
                    {consensus.gated && (
                      <Badge variant="secondary" className="text-2xs normal-case ml-auto">
                        Needs review
                      </Badge>
                    )}
                    {consensus.closure && (
                      <Badge variant="destructive" className="text-2xs normal-case">
                        {consensus.closure === 'auto_close' ? 'Closed' : 'Closure flag'}
                      </Badge>
                    )}
                  </div>
                  {confidenceRows.length > 0 && (
                    <div className="divide-y">
                      {confidenceRows.map(([field, conf]) => (
                        <div
                          key={field}
                          className="flex items-baseline justify-between gap-4 py-1 text-xs"
                        >
                          <span className="text-muted-foreground text-2xs uppercase tracking-wider">
                            {formatMetaKey(field)}
                          </span>
                          <span
                            className={`tabular-nums ${conf < 0.7 ? 'text-muted-foreground' : 'font-medium'}`}
                          >
                            {Math.round(conf * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Structured meta */}
            {metaEntries.length > 0 && (
              <div className="border-t">
                <p className="px-4 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                  Context
                </p>
                <div className="divide-y">
                  {metaEntries.map(([key, value]) => (
                    <div key={key} className="flex items-baseline gap-4 px-4 py-1.5 text-xs">
                      <span className="text-muted-foreground shrink-0 w-32 text-2xs uppercase tracking-wider">
                        {formatMetaKey(key)}
                      </span>
                      <span className="min-w-0 break-words">{formatMetaValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action bar — or a deep link out for queues decided elsewhere */}
      {externalConsole ? (
        <div className="flex items-center justify-between gap-4 border-t p-4">
          <p className="text-13 text-muted-foreground">
            Decided in its own console — approving picks a target business.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to={externalConsole.route}>{externalConsole.label} →</Link>
          </Button>
        </div>
      ) : isDedup && namesake && !namesakeConfirmed ? (
        // The gate is on APPROVE only — reject and skip must stay available, or the
        // reviewer cannot clear a pair they have decided is two different people,
        // which is the outcome this flag exists to make easy.
        <div className="border-t">
          <p className="px-4 pt-4 text-13 text-muted-foreground">
            Confirm the namesake check above to enable approving this merge.
          </p>
          <ActionBar
            onAction={handleAction}
            isLoading={isActionLoading}
            disabledActions={['approve']}
          />
        </div>
      ) : (
        <ActionBar onAction={handleAction} isLoading={isActionLoading} />
      )}
    </div>
  );
}
