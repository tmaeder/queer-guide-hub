import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Slider from '@mui/material/Slider';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
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

  const { data: counts, refetch: refetchCounts } = useDuplicateCounts();
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Summary Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
          gap: 1.5,
        }}
      >
        {ENTITY_TYPES.map(({ key, label, icon: Icon, color }) => {
          const count = (counts as any)?.[key] ?? 0;
          const bg = count === 0 ? '#10b98115' : count <= 5 ? '#f59e0b15' : '#ef444415';
          const border = count === 0 ? '#10b98130' : count <= 5 ? '#f59e0b30' : '#ef444430';
          return (
            <Box
              key={key}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: bg,
                border: `1px solid ${border}`,
                textAlign: 'center',
              }}
            >
              <Icon style={{ width: 18, height: 18, color, margin: '0 auto 4px' }} />
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>{count}</Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                {label}
              </Typography>
            </Box>
          );
        })}
      </Box>

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
      <Box>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', py: 1 }}
          onClick={() => setShowHistory(!showHistory)}
        >
          <History style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Merge History
          </Typography>
          <IconButton size="small" sx={{ ml: 'auto' }}>
            {showHistory ? (
              <ChevronUp style={{ width: 16, height: 16 }} />
            ) : (
              <ChevronDown style={{ width: 16, height: 16 }} />
            )}
          </IconButton>
        </Box>
        <Collapse in={showHistory}>
          <MergeHistorySection />
        </Collapse>
      </Box>
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap style={{ width: 18, height: 18 }} />
            Auto Clean Duplicates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
            Scans all content types for duplicates in batches of 500. High-confidence matches (above
            threshold) are auto-merged keeping the richer record. Lower-confidence pairs are flagged
            for manual review. Also clears duplicate and high-score merge candidates from Import
            Staging.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 220 }}>
              <Typography
                variant="caption"
                sx={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}
              >
                Auto-merge threshold: {(threshold * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={threshold}
                onChange={(_, v) => onThresholdChange(v as number)}
                min={0.85}
                max={0.95}
                step={0.01}
                size="small"
                disabled={isRunning}
              />
            </Box>

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
          </Box>

          {/* Batch Progress */}
          {isRunning && <BatchProgressDisplay progress={progress} />}
        </CardContent>
      </Card>

      {/* Results */}
      {lastResult && <ResultsSummary result={lastResult} />}
    </Box>
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

  return (
    <Box sx={{ mb: 1 }}>
      {/* Progress info row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>
          {message}
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
          {totalScanned.toLocaleString()} scanned
        </Typography>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant={phase === 'processing' ? 'indeterminate' : 'determinate'}
        value={pct}
        sx={{ borderRadius: 1, height: 6, mb: 1.5 }}
      />

      {/* Per-type status chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {ENTITY_TYPES.filter((e) => e.key in typeProgress).map(({ key, label, icon: Icon }) => {
          const tp = typeProgress[key];
          if (!tp) return null;
          const isCurrent = progress.currentType === key;
          const isDone = tp.done;

          return (
            <Box
              key={key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 0.5,
                fontSize: '0.75rem',
                bgcolor: isDone ? '#10b98115' : isCurrent ? '#3b82f615' : 'var(--muted)',
                border: `1px solid ${isDone ? '#10b98130' : isCurrent ? '#3b82f630' : 'transparent'}`,
                transition: 'all 0.2s',
              }}
            >
              {isDone ? (
                <CheckCircle style={{ width: 12, height: 12, color: '#10b981' }} />
              ) : isCurrent ? (
                <CircularProgress size={12} />
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
            </Box>
          );
        })}

        {/* Processing phase indicator */}
        {phase === 'processing' && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              fontSize: '0.75rem',
              bgcolor: '#6366f115',
              border: '1px solid #6366f130',
            }}
          >
            <CircularProgress size={12} />
            <span>Processing</span>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ==================== Results Summary ====================

function ResultsSummary({ result }: { result: AutoCleanResult }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Banner */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {result.total_auto_merged > 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: 1,
              bgcolor: result.dry_run ? '#3b82f615' : '#10b98115',
              border: `1px solid ${result.dry_run ? '#3b82f630' : '#10b98130'}`,
            }}
          >
            <CheckCircle
              style={{ width: 16, height: 16, color: result.dry_run ? '#3b82f6' : '#10b981' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {result.dry_run ? 'Would auto-merge' : 'Auto-merged'}: {result.total_auto_merged}
            </Typography>
          </Box>
        )}
        {result.total_flagged > 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: 1,
              bgcolor: '#f59e0b15',
              border: '1px solid #f59e0b30',
            }}
          >
            <AlertTriangle style={{ width: 16, height: 16, color: '#f59e0b' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Flagged for review: {result.total_flagged}
            </Typography>
          </Box>
        )}
        {result.total_auto_merged === 0 && result.total_flagged === 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: 1,
              bgcolor: '#10b98115',
              border: '1px solid #10b98130',
            }}
          >
            <CheckCircle style={{ width: 16, height: 16, color: '#10b981' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              No duplicates found
            </Typography>
          </Box>
        )}
        {/* Total scanned badge */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            borderRadius: 1,
            bgcolor: 'var(--muted)',
            border: '1px solid var(--border)',
          }}
        >
          <Database style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Total scanned: {result.total_scanned.toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* Per-type breakdown */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '140px 130px 100px 100px 1fr',
              gap: 0,
              borderBottom: '2px solid var(--border)',
              bgcolor: 'var(--muted)',
              px: 2,
              py: 1,
            }}
          >
            {['Type', 'Scanned', 'Auto-merged', 'Flagged', 'Errors'].map((h) => (
              <Typography
                key={h}
                variant="caption"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>
          {Object.entries(result.by_type).map(([type, data]) => {
            const cfg = ENTITY_TYPES.find((e) => e.key === type);
            const Icon = cfg?.icon ?? Database;
            const hasTotal = data.total && data.total > 0;
            const allScanned = hasTotal && data.scanned >= data.total;
            return (
              <Box
                key={type}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '140px 130px 100px 100px 1fr',
                  gap: 0,
                  px: 2,
                  py: 1,
                  borderBottom: '1px solid var(--border)',
                  '&:last-child': { borderBottom: 'none' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icon style={{ width: 14, height: 14, color: cfg?.color }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {cfg?.label ?? type}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2">
                    {data.scanned.toLocaleString()}
                    {hasTotal && (
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ color: 'var(--muted-foreground)' }}
                      >
                        {' / '}
                        {data.total!.toLocaleString()}
                      </Typography>
                    )}
                  </Typography>
                  {allScanned && (
                    <CheckCircle
                      style={{ width: 12, height: 12, color: '#10b981', flexShrink: 0 }}
                    />
                  )}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: data.auto_merged > 0 ? '#10b981' : undefined,
                    fontWeight: data.auto_merged > 0 ? 600 : 400,
                  }}
                >
                  {data.auto_merged}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: data.flagged_for_review > 0 ? '#f59e0b' : undefined,
                    fontWeight: data.flagged_for_review > 0 ? 600 : 400,
                  }}
                >
                  {data.flagged_for_review}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: data.errors?.length > 0 ? '#ef4444' : 'var(--muted-foreground)',
                    fontSize: '0.8rem',
                  }}
                >
                  {data.errors?.length > 0 ? data.errors.join('; ') : '—'}
                </Typography>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* Import Staging Results */}
      {result.staging && !result.staging.error && (
        <StagingResultsCard staging={result.staging} dryRun={result.dry_run} />
      )}
    </Box>
  );
}

// ==================== Staging Results Card ====================

function StagingResultsCard({ staging, dryRun }: { staging: StagingCleanResult; dryRun: boolean }) {
  const total = staging.total_cleared;
  const hasWork = total > 0 || staging.phase3_scanned_pending > 0;

  if (!hasWork) return null;

  return (
    <Card>
      <CardHeader sx={{ pb: 1 }}>
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
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 1.5,
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
        </Box>
        {staging.errors?.length > 0 && (
          <Typography variant="caption" sx={{ color: '#ef4444', mt: 1, display: 'block' }}>
            Errors: {staging.errors.slice(0, 3).join('; ')}
            {staging.errors.length > 3 && ` (+${staging.errors.length - 3} more)`}
          </Typography>
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
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: `${color}10`, border: `1px solid ${color}25` }}>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
        {dryRun ? `Would: ${label}` : label}
      </Typography>
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
          {pairs.length} pending pair{pairs.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : pairs.length === 0 ? (
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <Box
              sx={{
                mx: 'auto',
                width: 80,
                height: 80,
                bgcolor: 'var(--muted)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <CheckCircle style={{ width: 40, height: 40, color: '#10b981' }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              No Pending Duplicates
            </Typography>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>
              Run a scan from the "Scan & Clean" tab to detect duplicates.
            </Typography>
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
    </Box>
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
    <Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Badge variant="secondary">{pairs.length}</Badge>
      </Box>
      {expanded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {pairs.map((pair) => (
            <DuplicatePairCard key={pair.id} pair={pair} onMerge={onMerge} />
          ))}
        </Box>
      )}
    </Box>
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
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : history.length === 0 ? (
          <Typography sx={{ color: 'var(--muted-foreground)', textAlign: 'center', py: 4 }}>
            No merges have been performed yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {history.map((entry: any) => {
              const details = entry.details || {};
              return (
                <Box
                  key={entry.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'var(--muted)',
                    fontSize: '0.85rem',
                  }}
                >
                  <Merge style={{ width: 14, height: 14, color: '#3b82f6', flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {details.entity_type || 'unknown'}: Kept "{details.keep_name || '?'}", removed
                      "{details.remove_name || '?'}"
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                      {details.fk_updates || 0} references updated
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ color: 'var(--muted-foreground)', flexShrink: 0 }}
                  >
                    {new Date(entry.created_at).toLocaleString()}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
