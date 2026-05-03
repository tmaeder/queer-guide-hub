import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Search,
  Zap,
  Merge,
  Database,
  History,
  CheckCircle,
  AlertTriangle,
  MapPin,
  Calendar,
  Users,
  Newspaper,
  Building2,
  Tag,
  RefreshCw,
  Inbox,
  StopCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useDuplicateCounts,
  useBatchedAutoClean,
  type AutoCleanResult,
  type StagingCleanResult,
  type BatchProgress,
} from '@/hooks/useAutoCleanDuplicates';
import {
  useDuplicatePairs,
  useMergeHistory,
  type DuplicatePair,
} from '@/hooks/useImportHubQueries';
import { DuplicatePairCard } from './import-hub/DuplicatePairCard';
import { MergeDialog } from './import-hub/MergeDialog';
import { brandColors } from '@/theme/muiTheme';

// ==================== Entity Type Config ====================

const ENTITY_TYPES = [
  { key: 'venues', label: 'Venues', icon: MapPin, color: '#ef4444' },
  { key: 'events', label: 'Events', icon: Calendar, color: '#f59e0b' },
  { key: 'personalities', label: 'Personalities', icon: Users, color: brandColors.main },
  { key: 'news_articles', label: 'News', icon: Newspaper, color: '#3b82f6' },
  { key: 'cities', label: 'Cities', icon: Building2, color: '#10b981' },
  { key: 'tags', label: 'Tags', icon: Tag, color: '#ec4899' },
] as const;

// ==================== Main Component ====================

export function AutoCleanDuplicatesTab() {
  const [threshold, setThreshold] = useState(0.9);
  const [showHistory, setShowHistory] = useState(false);

  const { data: counts, refetch: _refetchCounts } = useDuplicateCounts();
  const { run, abort, progress, lastResult, isRunning } = useBatchedAutoClean();

  const handleScanAll = () => {
    run({
      dryRun: true,
      autoMergeThreshold: threshold,
      entityTypes: ['venues', 'events', 'personalities', 'news_articles', 'cities'],
    });
  };

  const handleAutoClean = () => {
    run({
      dryRun: false,
      autoMergeThreshold: threshold,
      entityTypes: ['venues', 'events', 'personalities', 'news_articles', 'cities'],
    });
  };

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {/* Summary Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6" style={{ gap: 12 }}>
        {ENTITY_TYPES.map(({ key, label, icon: Icon, color }) => {
          const count = (counts as unknown as Record<string, number>)?.[key] ?? 0;
          const bg = count === 0 ? '#10b98115' : count <= 5 ? '#f59e0b15' : '#ef444415';
          const border = count === 0 ? '#10b98130' : count <= 5 ? '#f59e0b30' : '#ef444430';
          return (
            <div
              key={key}
              className="text-center"
              style={{
                padding: 12,
                borderRadius: 4,
                backgroundColor: bg,
                border: `1px solid ${border}`,
              }}
            >
              <Icon style={{ width: 18, height: 18, color, margin: '0 auto 4px' }} />
              <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{count}</p>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scan & Clean */}
      <ScanAndCleanSection
        threshold={threshold}
        onThresholdChange={setThreshold}
        onScanAll={handleScanAll}
        onAutoClean={handleAutoClean}
        onAbort={abort}
        isRunning={isRunning}
        progress={progress}
        lastResult={lastResult}
      />

      {/* Pending Review */}
      <PendingReviewSection />

      {/* Merge History — collapsed by default */}
      <div>
        <Collapsible open={showHistory} onOpenChange={setShowHistory}>
          <button
            type="button"
            className="flex items-center cursor-pointer w-full"
            style={{ gap: 8, paddingTop: 8, paddingBottom: 8 }}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            <span className="font-semibold" style={{ fontSize: '0.875rem' }}>
              Merge History
            </span>
            <span className="ml-auto inline-flex items-center justify-center" style={{ width: 28, height: 28 }}>
              {showHistory ? (
                <ChevronUp style={{ width: 16, height: 16 }} />
              ) : (
                <ChevronDown style={{ width: 16, height: 16 }} />
              )}
            </span>
          </button>
          <CollapsibleContent>
            <MergeHistorySection />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

// ==================== Scan & Clean Section ====================

function ScanAndCleanSection({
  threshold,
  onThresholdChange,
  onScanAll,
  onAutoClean,
  onAbort,
  isRunning,
  progress,
  lastResult,
}: {
  threshold: number;
  onThresholdChange: (v: number) => void;
  onScanAll: () => void;
  onAutoClean: () => void;
  onAbort: () => void;
  isRunning: boolean;
  progress: BatchProgress;
  lastResult: AutoCleanResult | null;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap style={{ width: 18, height: 18 }} />
            Auto Clean Duplicates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            Scans all content types for duplicates in batches of 500. High-confidence matches (above
            threshold) are auto-merged keeping the richer record. Lower-confidence pairs are flagged
            for manual review. Also clears duplicate and high-score merge candidates from Import
            Staging.
          </p>

          <div className="flex flex-wrap items-center mb-4" style={{ gap: 16 }}>
            <div className="flex items-center" style={{ gap: 8, width: 220 }}>
              <span
                className="text-xs whitespace-nowrap"
                style={{ color: 'var(--muted-foreground)' }}
              >
                Auto-merge threshold: {(threshold * 100).toFixed(0)}%
              </span>
              <Slider
                value={[threshold]}
                onValueChange={([v]: number[]) => onThresholdChange(v)}
                min={0.85}
                max={0.95}
                step={0.01}
                disabled={isRunning}
                className="flex-1"
              />
            </div>

            {!isRunning ? (
              <>
                <Button onClick={onScanAll} variant="outline" style={{ display: 'flex', gap: 8 }}>
                  <Search style={{ width: 16, height: 16 }} />
                  Scan All (Dry Run)
                </Button>

                <Button
                  onClick={onAutoClean}
                  style={{ display: 'flex', gap: 8, backgroundColor: '#10b981', color: 'white' }}
                >
                  <Zap style={{ width: 16, height: 16 }} />
                  Auto Clean &ge;{(threshold * 100).toFixed(0)}%
                </Button>
              </>
            ) : (
              <Button onClick={onAbort} variant="destructive" style={{ display: 'flex', gap: 8 }}>
                <StopCircle style={{ width: 16, height: 16 }} />
                Stop
              </Button>
            )}
          </div>

          {/* Batch Progress */}
          {isRunning && <BatchProgressDisplay progress={progress} />}
        </CardContent>
      </Card>

      {/* Results */}
      {lastResult && <ResultsSummary result={lastResult} />}
    </div>
  );
}

// ==================== Batch Progress Display ====================

function BatchProgressDisplay({ progress }: { progress: BatchProgress }) {
  const { phase, typesCompleted, typesTotal, totalScanned, message, typeProgress } = progress;

  // Calculate overall percentage
  let pct = 0;
  if (phase === 'scanning' && typesTotal > 0) {
    const typeWeight = 90 / typesTotal; // 90% of bar for scanning
    pct = typesCompleted * typeWeight;
    // Add current type's sub-progress
    const currentTp = progress.currentType ? typeProgress[progress.currentType] : null;
    if (currentTp && currentTp.total > 0) {
      pct += (currentTp.scanned / currentTp.total) * typeWeight;
    }
  } else if (phase === 'processing') {
    pct = 92;
  }

  const indeterminate = phase === 'processing';

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Progress info row */}
      <div className="flex justify-between" style={{ marginBottom: 4 }}>
        <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
          {message}
        </span>
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {totalScanned.toLocaleString()} scanned
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="bg-muted overflow-hidden"
        style={{ borderRadius: 4, height: 6, marginBottom: 12, position: 'relative' }}
      >
        {indeterminate ? (
          <div
            className="absolute"
            style={{
              top: 0,
              bottom: 0,
              width: '40%',
              backgroundColor: 'hsl(var(--primary))',
              animation: 'indeterminate 1.5s ease-in-out infinite',
            }}
          />
        ) : (
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: 'hsl(var(--primary))',
              transition: 'width 0.3s',
            }}
          />
        )}
      </div>

      {/* Per-type status chips */}
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        {ENTITY_TYPES.filter((e) => e.key in typeProgress).map(({ key, label, icon: Icon }) => {
          const tp = typeProgress[key];
          if (!tp) return null;
          const isCurrent = progress.currentType === key;
          const isDone = tp.done;

          return (
            <div
              key={key}
              className="flex items-center"
              style={{
                gap: 4,
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 2,
                paddingBottom: 2,
                borderRadius: 2,
                fontSize: '0.75rem',
                backgroundColor: isDone ? '#10b98115' : isCurrent ? '#3b82f615' : 'var(--muted)',
                border: `1px solid ${isDone ? '#10b98130' : isCurrent ? '#3b82f630' : 'transparent'}`,
                transition: 'all 0.2s',
              }}
            >
              {isDone ? (
                <CheckCircle style={{ width: 12, height: 12, color: '#10b981' }} />
              ) : isCurrent ? (
                <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} aria-label="Loading" />
              ) : (
                <Icon style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
              )}
              <span>{label}</span>
              {tp.total > 0 && (
                <span style={{ color: 'var(--muted-foreground)', marginLeft: 2 }}>
                  {isDone
                    ? tp.total.toLocaleString()
                    : `${tp.scanned.toLocaleString()}/${tp.total.toLocaleString()}`}
                </span>
              )}
            </div>
          );
        })}

        {/* Processing phase indicator */}
        {phase === 'processing' && (
          <div
            className="flex items-center"
            style={{
              gap: 4,
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 2,
              fontSize: '0.75rem',
              backgroundColor: '#6366f115',
              border: '1px solid #6366f130',
            }}
          >
            <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} aria-label="Loading" />
            <span>Processing</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Results Summary ====================

function ResultsSummary({ result }: { result: AutoCleanResult }) {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Banner */}
      <div className="flex flex-wrap" style={{ gap: 16 }}>
        {result.total_auto_merged > 0 && (
          <div
            className="flex items-center"
            style={{
              gap: 8,
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 4,
              backgroundColor: result.dry_run ? '#3b82f615' : '#10b98115',
              border: `1px solid ${result.dry_run ? '#3b82f630' : '#10b98130'}`,
            }}
          >
            <CheckCircle
              style={{ width: 16, height: 16, color: result.dry_run ? '#3b82f6' : '#10b981' }}
            />
            <p className="text-sm font-semibold">
              {result.dry_run ? 'Would auto-merge' : 'Auto-merged'}: {result.total_auto_merged}
            </p>
          </div>
        )}
        {result.total_flagged > 0 && (
          <div
            className="flex items-center"
            style={{
              gap: 8,
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 4,
              backgroundColor: '#f59e0b15',
              border: '1px solid #f59e0b30',
            }}
          >
            <AlertTriangle style={{ width: 16, height: 16, color: '#f59e0b' }} />
            <p className="text-sm font-semibold">Flagged for review: {result.total_flagged}</p>
          </div>
        )}
        {result.total_auto_merged === 0 && result.total_flagged === 0 && (
          <div
            className="flex items-center"
            style={{
              gap: 8,
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 4,
              backgroundColor: '#10b98115',
              border: '1px solid #10b98130',
            }}
          >
            <CheckCircle style={{ width: 16, height: 16, color: '#10b981' }} />
            <p className="text-sm font-semibold">No duplicates found</p>
          </div>
        )}
        {/* Total scanned badge */}
        <div
          className="flex items-center bg-muted"
          style={{
            gap: 8,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 8,
            paddingBottom: 8,
            borderRadius: 4,
            border: '1px solid var(--border)',
          }}
        >
          <Database style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          <p className="text-sm font-semibold">
            Total scanned: {result.total_scanned.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Per-type breakdown */}
      <Card>
        <CardContent>
          <div
            className="grid bg-muted"
            style={{
              gridTemplateColumns: '140px 130px 100px 100px 1fr',
              gap: 0,
              borderBottom: '2px solid var(--border)',
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            {['Type', 'Scanned', 'Auto-merged', 'Flagged', 'Errors'].map((h) => (
              <span
                key={h}
                style={{
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {Object.entries(result.by_type).map(([type, data], idx, arr) => {
            const cfg = ENTITY_TYPES.find((e) => e.key === type);
            const Icon = cfg?.icon ?? Database;
            const hasTotal = data.total && data.total > 0;
            const allScanned = hasTotal && data.scanned >= data.total;
            const isLast = idx === arr.length - 1;
            return (
              <div
                key={type}
                className="grid"
                style={{
                  gridTemplateColumns: '140px 130px 100px 100px 1fr',
                  gap: 0,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}
              >
                <div className="flex items-center" style={{ gap: 8 }}>
                  <Icon style={{ width: 14, height: 14, color: cfg?.color }} />
                  <p className="text-sm font-medium">{cfg?.label ?? type}</p>
                </div>
                <div className="flex items-center" style={{ gap: 4 }}>
                  <p className="text-sm">
                    {data.scanned.toLocaleString()}
                    {hasTotal && (
                      <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        {' / '}
                        {data.total!.toLocaleString()}
                      </span>
                    )}
                  </p>
                  {allScanned && (
                    <CheckCircle
                      style={{ width: 12, height: 12, color: '#10b981', flexShrink: 0 }}
                    />
                  )}
                </div>
                <p
                  className="text-sm"
                  style={{
                    color: data.auto_merged > 0 ? '#10b981' : undefined,
                    fontWeight: data.auto_merged > 0 ? 600 : 400,
                  }}
                >
                  {data.auto_merged}
                </p>
                <p
                  className="text-sm"
                  style={{
                    color: data.flagged_for_review > 0 ? '#f59e0b' : undefined,
                    fontWeight: data.flagged_for_review > 0 ? 600 : 400,
                  }}
                >
                  {data.flagged_for_review}
                </p>
                <p
                  style={{
                    color: data.errors?.length > 0 ? '#ef4444' : 'var(--muted-foreground)',
                    fontSize: '0.8rem',
                  }}
                >
                  {data.errors?.length > 0 ? data.errors.join('; ') : '—'}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Import Staging Results */}
      {result.staging && !result.staging.error && (
        <StagingResultsCard staging={result.staging} dryRun={result.dry_run} />
      )}
    </div>
  );
}

// ==================== Staging Results Card ====================

function StagingResultsCard({ staging, dryRun }: { staging: StagingCleanResult; dryRun: boolean }) {
  const total = staging.total_cleared;
  const hasWork = total > 0 || staging.phase3_scanned_pending > 0;

  if (!hasWork) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
          <Inbox style={{ width: 16, height: 16, color: '#6366f1' }} />
          Import Staging Cleanup
          {total > 0 && (
            <Badge variant={dryRun ? 'secondary' : 'default'} style={{ marginLeft: 8 }}>
              {dryRun ? `Would clear ${total}` : `Cleared ${total}`}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {staging.phase1_skipped_duplicates > 0 && (
            <StagingStat
              label="Duplicates skipped"
              value={staging.phase1_skipped_duplicates}
              color="#ef4444"
              dryRun={dryRun}
            />
          )}
          {staging.phase2_skipped_merge_candidates > 0 && (
            <StagingStat
              label="Merge candidates skipped"
              value={staging.phase2_skipped_merge_candidates}
              color="#f59e0b"
              dryRun={dryRun}
            />
          )}
          {staging.phase3_scanned_pending > 0 && (
            <StagingStat
              label="Pending items scanned"
              value={staging.phase3_scanned_pending}
              color="#6366f1"
              dryRun={dryRun}
            />
          )}
          {staging.phase3_new_duplicates > 0 && (
            <StagingStat
              label="New duplicates found"
              value={staging.phase3_new_duplicates}
              color="#dc2626"
              dryRun={dryRun}
            />
          )}
          {staging.phase3_new_merge_candidates > 0 && (
            <StagingStat
              label="New merge candidates"
              value={staging.phase3_new_merge_candidates}
              color="#ca8a04"
              dryRun={dryRun}
            />
          )}
          {staging.phase3_new_unique > 0 && (
            <StagingStat
              label="Confirmed unique"
              value={staging.phase3_new_unique}
              color="#10b981"
              dryRun={dryRun}
            />
          )}
        </div>
        {staging.errors?.length > 0 && (
          <span
            className="text-xs block"
            style={{ color: '#ef4444', marginTop: 8 }}
          >
            Errors: {staging.errors.slice(0, 3).join('; ')}
            {staging.errors.length > 3 && ` (+${staging.errors.length - 3} more)`}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function StagingStat({
  label,
  value,
  color,
  dryRun,
}: {
  label: string;
  value: number;
  color: string;
  dryRun: boolean;
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 4,
        backgroundColor: `${color}10`,
        border: `1px solid ${color}25`,
      }}
    >
      <p style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</p>
      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
        {dryRun ? `Would: ${label}` : label}
      </span>
    </div>
  );
}

// ==================== Pending Review Section ====================

function PendingReviewSection() {
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const { data: pairs = [], isLoading, refetch } = useDuplicatePairs(entityFilter);

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePair, setMergePair] = useState<DuplicatePair | null>(null);

  const handleMerge = (pair: DuplicatePair) => {
    setMergePair(pair);
    setMergeDialogOpen(true);
  };

  const highConfidence = pairs.filter((p) => p.confidence >= 0.9);
  const medConfidence = pairs.filter((p) => p.confidence >= 0.7 && p.confidence < 0.9);
  const lowConfidence = pairs.filter((p) => p.confidence < 0.7);

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Filter bar */}
      <div className="flex items-center" style={{ gap: 16 }}>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger style={{ width: 180 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="venues">Venues</SelectItem>
            <SelectItem value="events">Events</SelectItem>
            <SelectItem value="personalities">Personalities</SelectItem>
            <SelectItem value="news_articles">News Articles</SelectItem>
            <SelectItem value="cities">Cities</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          style={{ display: 'flex', gap: 6 }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} />
        </Button>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {pairs.length} pending pair{pairs.length !== 1 ? 's' : ''}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center" style={{ paddingTop: 32, paddingBottom: 32 }}>
          <Loader2 className="animate-spin" style={{ width: 28, height: 28 }} aria-label="Loading" />
        </div>
      ) : pairs.length === 0 ? (
        <Card>
          <CardContent>
            <div
              className="flex items-center justify-center bg-muted mx-auto"
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                marginBottom: 16,
              }}
            >
              <CheckCircle style={{ width: 40, height: 40, color: '#10b981' }} />
            </div>
            <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>
              No Pending Duplicates
            </h3>
            <p style={{ color: 'var(--muted-foreground)' }}>
              Run a scan from the "Scan & Clean" tab to detect duplicates.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {highConfidence.length > 0 && (
            <DuplicateGroup
              label="High Confidence"
              color="#dc2626"
              pairs={highConfidence}
              onMerge={handleMerge}
            />
          )}
          {medConfidence.length > 0 && (
            <DuplicateGroup
              label="Medium Confidence"
              color="#ca8a04"
              pairs={medConfidence}
              onMerge={handleMerge}
            />
          )}
          {lowConfidence.length > 0 && (
            <DuplicateGroup
              label="Low Confidence"
              color="#6b7280"
              pairs={lowConfidence}
              onMerge={handleMerge}
            />
          )}
        </>
      )}

      {mergePair && (
        <MergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          entityType={mergePair.entity_type}
          entityAId={mergePair.entity_a_id}
          entityBId={mergePair.entity_b_id}
          onMergeComplete={() => {
            setMergePair(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function DuplicateGroup({
  label,
  color,
  pairs,
  onMerge,
}: {
  label: string;
  color: string;
  pairs: DuplicatePair[];
  onMerge: (p: DuplicatePair) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div>
      <button
        type="button"
        className="flex items-center cursor-pointer mb-2 w-full"
        style={{ gap: 8 }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
        <span className="font-semibold" style={{ fontSize: '0.875rem' }}>
          {label}
        </span>
        <Badge variant="secondary">{pairs.length}</Badge>
      </button>
      {expanded && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {pairs.map((pair) => (
            <DuplicatePairCard key={pair.id} pair={pair} onMerge={onMerge} />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Merge History Section ====================

function MergeHistorySection() {
  const { data: history = [], isLoading } = useMergeHistory(100);

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History style={{ width: 18, height: 18 }} />
          Merge History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center" style={{ paddingTop: 32, paddingBottom: 32 }}>
            <Loader2 className="animate-spin" style={{ width: 28, height: 28 }} aria-label="Loading" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-center" style={{ color: 'var(--muted-foreground)', paddingTop: 32, paddingBottom: 32 }}>
            No merges have been performed yet.
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {history.map((entry: Record<string, unknown>) => {
              const details = (entry.details as Record<string, unknown>) || {};
              return (
                <div
                  key={entry.id as string}
                  className="flex items-center bg-muted"
                  style={{
                    gap: 16,
                    padding: 12,
                    borderRadius: 4,
                    fontSize: '0.85rem',
                  }}
                >
                  <Merge style={{ width: 14, height: 14, color: '#3b82f6', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-sm font-medium">
                      {(details.entity_type as string) || 'unknown'}: Kept "
                      {(details.keep_name as string) || '?'}", removed "
                      {(details.remove_name as string) || '?'}"
                    </p>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {(details.fk_updates as number) || 0} references updated
                    </span>
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}
                  >
                    {new Date(entry.created_at as string).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
