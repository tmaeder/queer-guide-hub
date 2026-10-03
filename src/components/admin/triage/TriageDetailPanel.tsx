import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, ShieldAlert, User, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { EntityPreviewCard } from './EntityPreviewCard';
import { StagingPreview } from './StagingPreview';
import { FieldDiffView, computeFieldDiffs } from './FieldDiffView';
import { ActionBar } from './ActionBar';
import { DedupPairCompare } from './DedupPairCompare';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';
import {
  useEntityData,
  useStagingData,
  useUpdateStagingReviewFields,
} from '@/hooks/useTriageDetail';
import { StructuredValue } from './StructuredDataView';
import { getTriageDecisionGuidance } from './triageDecisionGuidance';
import {
  needsNamesakeConfirm,
  needsSafetyConfirm,
  queuedKeepId,
  type TriageAction,
  type TriageAnswers,
} from './resolveDecision';
import { useTriageSourceCapabilities } from '@/hooks/useTriageSourceCapabilities';

interface TriageDetailPanelProps {
  item: TriageItem;
  answers: TriageAnswers;
  onAnswersChange: (patch: Partial<TriageAnswers>) => void;
  onAction: (action: TriageAction) => void;
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

export function TriageDetailPanel({
  item,
  answers,
  onAnswersChange,
  onAction,
  isActionLoading,
}: TriageDetailPanelProps) {
  const { data: entityData, isLoading: entityLoading } = useEntityData(item);
  const { data: stagingData } = useStagingData(item);
  const updateStagingFields = useUpdateStagingReviewFields(item);
  const { externalConsoleFor, loading: capabilitiesLoading } = useTriageSourceCapabilities();
  const registryExternalConsole = externalConsoleFor(item.queue_type);
  const externalConsole = registryExternalConsole
    ? { route: registryExternalConsole, label: 'Open decision console' }
    : EXTERNAL_CONSOLE[item.queue_type];

  const isDedup = item.queue_type === 'dedup-review';
  const meta = (item.meta ?? null) as Record<string, unknown> | null;
  const originalKeepId = queuedKeepId(item);

  // Namesake: `triage_src_dedup_review` has emitted this for personalities since the
  // queue existed and no component ever read it. Two different people with one name
  // merged together is an outing risk, so it gets an explicit confirm.
  const namesake = needsNamesakeConfirm(item);

  // Outing-safety confirm. `approve_entity_review` raises 42501 —
  // "high-risk destination: <field> approval requires explicit confirmation" —
  // whenever `_review_risk_blocked` holds and the caller did not pass
  // p_confirm. `triage_action` has forwarded that flag since it was written
  // and `useTriageAction` has always had the parameter, but NO component ever
  // set it, so every risk-gated quality row was un-approvable from the inbox
  // by anyone: 347 rows on prod, 346 of them criminalizing-destination safety
  // notes, i.e. precisely the highest-stakes content in the queue.
  const requiresConfirm = needsSafetyConfirm(item);

  // Per-pair state, reset when the queue advances. The panel is reused in place, so
  // without the reset the previous pair's canonical choice and namesake confirmation
  // would carry silently onto the next one — and on the namesake flag that means the
  // confirm gate is already satisfied for a pair nobody looked at.
  //
  // Adjusted DURING RENDER rather than in an effect (react-hooks/set-state-in-effect):
  // an effect here would render the new pair once with the old pair's answers before
  // correcting itself.
  const keepId = answers.keepId ?? originalKeepId;
  const namesakeConfirmed = Boolean(answers.namesakeConfirmed);
  const safetyConfirmed = Boolean(answers.safetyConfirmed);

  const [reviewEdits, setReviewEdits] = useState({
    id: item.id,
    unsavedCount: 0,
    savedFields: [] as string[],
  });
  if (reviewEdits.id !== item.id) {
    setReviewEdits({ id: item.id, unsavedCount: 0, savedFields: [] });
  }
  const unsavedCount = reviewEdits.id === item.id ? reviewEdits.unsavedCount : 0;
  const savedFields = reviewEdits.id === item.id ? reviewEdits.savedFields : [];
  const handleDirtyChange = useCallback(
    (count: number) => {
      setReviewEdits((current) =>
        current.id === item.id && current.unsavedCount === count
          ? current
          : { ...current, id: item.id, unsavedCount: count },
      );
    },
    [item.id],
  );

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
  const decisionGuidance = getTriageDecisionGuidance(item, {
    changedFields: savedFields,
    proposedFieldCount: diffs.length,
    unsavedCount,
  });
  const approvalBlocked =
    unsavedCount > 0 ||
    (isDedup && namesake && !namesakeConfirmed) ||
    (requiresConfirm && !safetyConfirmed);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-1.5 border-b border-border bg-background px-4 py-2">
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
        <h2 className="text-title font-semibold leading-tight tracking-tight">{item.title}</h2>
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
      <div className="flex-1 overflow-y-auto overscroll-contain bg-background">
        {entityLoading ? (
          <div className="flex items-center justify-center py-12">
            <TrackLoader size={20} />
          </div>
        ) : (
          <>
            {item.queue_type === 'staging' && stagingData ? (
              <StagingPreview
                item={item}
                staging={stagingData as Record<string, unknown>}
                isSavingFields={updateStagingFields.isPending}
                onDirtyChange={handleDirtyChange}
                onSaveFields={async (changes) => {
                  try {
                    await updateStagingFields.mutateAsync(changes);
                    setReviewEdits((current) => ({
                      id: item.id,
                      unsavedCount: 0,
                      savedFields: Array.from(
                        new Set([...current.savedFields, ...Object.keys(changes)]),
                      ),
                    }));
                    toast.success('Corrections saved');
                  } catch (error) {
                    toast.error(`Could not save corrections: ${(error as Error).message}`);
                    throw error;
                  }
                }}
              />
            ) : isDedup ? (
              <div className="px-4 pt-4">
                <DedupPairCompare
                  entityType={item.content_type}
                  meta={meta}
                  keepId={keepId}
                  onFlip={(value) => onAnswersChange({ keepId: value })}
                  flipped={Boolean(keepId && keepId !== originalKeepId)}
                />
              </div>
            ) : (
              <EntityPreviewCard item={item} entityData={entityData ?? null} />
            )}

            {isDedup && namesake && (
              <div className="border-t border-destructive/30 bg-destructive/[0.03] px-6 py-4">
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
                        onChange={(e) => onAnswersChange({ namesakeConfirmed: e.target.checked })}
                      />
                      I have confirmed these are the same person
                    </label>
                  </div>
                </div>
              </div>
            )}

            {requiresConfirm && (
              <div className="border-t border-destructive/30 bg-destructive/[0.03] px-6 py-4">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 space-y-2">
                    <p className="text-13">
                      <span className="font-bold">Outing-safety gate.</span> This destination may
                      criminalise LGBTQ+ people. A note that understates the law reaches a traveller
                      as reassurance, so it can never publish on a machine&rsquo;s confidence alone
                      — read the proposed text against the country&rsquo;s actual legal status
                      before approving.
                    </p>
                    <label className="flex items-start gap-2 text-13">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={safetyConfirmed}
                        onChange={(e) => onAnswersChange({ safetyConfirmed: e.target.checked })}
                      />
                      <span>I have read this note and confirm it should publish</span>
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
                      <span className="min-w-0 break-words">
                        <StructuredValue value={value} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action bar — or a deep link out for queues decided elsewhere */}
      {!capabilitiesLoading && externalConsole ? (
        <div className="flex items-center justify-between gap-4 border-t border-border bg-background p-4">
          <p className="text-13 text-muted-foreground">
            Decided in its own console — approving picks a target business.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to={externalConsole.route}>{externalConsole.label} →</Link>
          </Button>
        </div>
      ) : approvalBlocked ? (
        // The gate is on APPROVE only — reject and skip must stay available, or the
        // reviewer cannot clear a pair they have decided is two different people,
        // which is the outcome this flag exists to make easy. The same holds for a
        // safety note: "this claim should not publish" must be the easy answer.
        <div className="border-t">
          <p className="px-4 pt-4 text-13 text-muted-foreground">
            {unsavedCount > 0
              ? 'Save or undo the inline corrections above before approving this item.'
              : isDedup
                ? 'Confirm the namesake check above to enable approving this merge.'
                : 'Confirm the safety check above to enable publishing this note.'}
          </p>
          <ActionBar
            notes={answers.notes ?? ''}
            cannedSlug={answers.cannedSlug ?? ''}
            onAnswersChange={onAnswersChange}
            onAction={onAction}
            isLoading={isActionLoading}
            disabledActions={['approve']}
            guidance={decisionGuidance}
          />
        </div>
      ) : (
        <ActionBar
          notes={answers.notes ?? ''}
          cannedSlug={answers.cannedSlug ?? ''}
          onAnswersChange={onAnswersChange}
          onAction={onAction}
          isLoading={isActionLoading}
          guidance={decisionGuidance}
        />
      )}
    </div>
  );
}
