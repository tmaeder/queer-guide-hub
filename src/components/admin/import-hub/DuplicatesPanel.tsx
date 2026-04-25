import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Slider from '@mui/material/Slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Merge, Database,
  Inbox, RefreshCw, History,
} from 'lucide-react';
import {
  useBatchFindDuplicates,
  useScanTableDuplicates,
  useDuplicatePairs,
  useMergeHistory,
  type DuplicatePair,
} from '@/hooks/useImportHubQueries';
import { DuplicatePairCard } from './DuplicatePairCard';
import { MergeDialog } from './MergeDialog';

export function DuplicatesPanel() {
  const [subTab, setSubTab] = useState('staging');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="staging" style={{ display: 'flex', gap: 6 }}>
            <Inbox style={{ width: 14, height: 14 }} />
            Staging Dedup
          </TabsTrigger>
          <TabsTrigger value="existing" style={{ display: 'flex', gap: 6 }}>
            <Database style={{ width: 14, height: 14 }} />
            Existing Data
          </TabsTrigger>
          <TabsTrigger value="history" style={{ display: 'flex', gap: 6 }}>
            <History style={{ width: 14, height: 14 }} />
            Merge History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staging">
          <StagingDedupSection />
        </TabsContent>

        <TabsContent value="existing">
          <ExistingDedupSection />
        </TabsContent>

        <TabsContent value="history">
          <MergeHistorySection />
        </TabsContent>
      </Tabs>
    </Box>
  );
}

// ==================== Staging Dedup ====================

function StagingDedupSection() {
  const [targetTable, setTargetTable] = useState<string>('');
  const batchScan = useBatchFindDuplicates();

  const handleScan = () => {
    batchScan.mutate({ targetTable: targetTable || undefined, batchLimit: 200 });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search style={{ width: 18, height: 18 }} />
            Scan Staging Items for Duplicates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
            Scans pending staging items against existing database records using fuzzy name matching,
            geo proximity, and date comparison. Items are flagged as "duplicate" (high confidence)
            or "merge candidate" (medium confidence).
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={targetTable || 'all'} onValueChange={v => setTargetTable(v === 'all' ? '' : v)}>
              <SelectTrigger style={{ width: 160 }}>
                <SelectValue placeholder="Target table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                <SelectItem value="venues">Venues</SelectItem>
                <SelectItem value="events">Events</SelectItem>
                <SelectItem value="personalities">Personalities</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleScan}
              disabled={batchScan.isPending}
              style={{ display: 'flex', gap: 8 }}
            >
              {batchScan.isPending ? (
                <CircularProgress size={16} sx={{ color: 'white' }} aria-label="Loading" />
              ) : (
                <Search style={{ width: 16, height: 16 }} />
              )}
              {batchScan.isPending ? 'Scanning...' : 'Scan Staging'}
            </Button>
          </Box>

          {/* Results */}
          {batchScan.data && (
            <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
              <ResultCard label="Processed" value={batchScan.data.processed} color="#3b82f6" />
              <ResultCard label="Duplicates Found" value={batchScan.data.duplicates_found} color="#dc2626" />
              <ResultCard label="Merge Candidates" value={batchScan.data.merge_candidates_found} color="#ca8a04" />
              <ResultCard label="Skipped" value={batchScan.data.skipped} color="#6b7280" />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

// ==================== Existing Data Dedup ====================

function ExistingDedupSection() {
  const [entityType, setEntityType] = useState<string>('venues');
  const [threshold, setThreshold] = useState(0.7);
  const scanMutation = useScanTableDuplicates();
  const { data: pairs = [], isLoading, refetch } = useDuplicatePairs(entityType);

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePair, setMergePair] = useState<DuplicatePair | null>(null);

  const handleScan = () => {
    scanMutation.mutate({ entityType, threshold, limit: 200 });
  };

  const handleMerge = (pair: DuplicatePair) => {
    setMergePair(pair);
    setMergeDialogOpen(true);
  };

  const highConfidence = pairs.filter(p => p.confidence >= 0.9);
  const medConfidence = pairs.filter(p => p.confidence >= 0.7 && p.confidence < 0.9);
  const lowConfidence = pairs.filter(p => p.confidence < 0.7);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Scanner */}
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database style={{ width: 18, height: 18 }} />
            Scan Existing Records for Duplicates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
            Scans records within a table to find duplicate pairs. Uses trigram similarity for names,
            geo proximity for venues, and date matching for events.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger style={{ width: 160 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="venues">Venues</SelectItem>
                <SelectItem value="events">Events</SelectItem>
                <SelectItem value="personalities">Personalities</SelectItem>
              </SelectContent>
            </Select>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 200 }}>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                Threshold: {(threshold * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={threshold}
                onChange={(_, v) => setThreshold(v as number)}
                min={0.5}
                max={0.95}
                step={0.05}
                size="small"
              />
            </Box>

            <Button
              onClick={handleScan}
              disabled={scanMutation.isPending}
              style={{ display: 'flex', gap: 8 }}
            >
              {scanMutation.isPending ? (
                <CircularProgress size={16} sx={{ color: 'white' }} aria-label="Loading" />
              ) : (
                <Search style={{ width: 16, height: 16 }} />
              )}
              {scanMutation.isPending ? 'Scanning...' : 'Scan'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => refetch()} style={{ display: 'flex', gap: 6 }}>
              <RefreshCw style={{ width: 14, height: 14 }} />
            </Button>
          </Box>

          {scanMutation.data && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'var(--muted)', borderRadius: 1 }}>
              <Typography variant="body2">
                Scanned {scanMutation.data.scanned} {scanMutation.data.entity_type} records,
                found {scanMutation.data.duplicates_found} duplicate pairs
                (threshold: {(scanMutation.data.threshold * 100).toFixed(0)}%)
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Results grouped by confidence */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} aria-label="Loading" />
        </Box>
      ) : pairs.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ mx: 'auto', width: 80, height: 80, bgcolor: 'var(--muted)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
              <Search style={{ width: 40, height: 40, color: 'var(--muted-foreground)' }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No Duplicate Pairs</Typography>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>
              Run a scan to detect duplicate {entityType} in the database.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {highConfidence.length > 0 && (
            <DuplicateGroup label="High Confidence" color="#dc2626" pairs={highConfidence} onMerge={handleMerge} />
          )}
          {medConfidence.length > 0 && (
            <DuplicateGroup label="Medium Confidence" color="#ca8a04" pairs={medConfidence} onMerge={handleMerge} />
          )}
          {lowConfidence.length > 0 && (
            <DuplicateGroup label="Low Confidence" color="#6b7280" pairs={lowConfidence} onMerge={handleMerge} />
          )}
        </>
      )}

      {/* Merge Dialog */}
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

function DuplicateGroup({ label, color, pairs, onMerge }: { label: string; color: string; pairs: DuplicatePair[]; onMerge: (p: DuplicatePair) => void }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Badge variant="secondary">{pairs.length}</Badge>
      </Box>
      {expanded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {pairs.map(pair => (
            <DuplicatePairCard key={pair.id} pair={pair} onMerge={onMerge} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ==================== Merge History ====================

function MergeHistorySection() {
  const { data: history = [], isLoading } = useMergeHistory(100);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              <CircularProgress size={28} aria-label="Loading" />
            </Box>
          ) : history.length === 0 ? (
            <Typography sx={{ color: 'var(--muted-foreground)', textAlign: 'center', py: 4 }}>
              No merges have been performed yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {history.map((entry: Record<string, unknown>) => {
                const details = entry.details || {};
                return (
                  <Box
                    key={entry.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      p: 1.5, borderRadius: 1, bgcolor: 'var(--muted)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <Merge style={{ width: 14, height: 14, color: '#3b82f6', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {details.entity_type || 'unknown'}: Kept "{details.keep_name || '?'}", removed "{details.remove_name || '?'}"
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                        {details.fk_updates || 0} references updated
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

// ==================== Shared Components ====================

function ResultCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: `${color}08`, border: `1px solid ${color}20`, textAlign: 'center' }}>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>{label}</Typography>
    </Box>
  );
}
