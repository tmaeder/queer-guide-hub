import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
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
    <div className="flex flex-col gap-6">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="staging" className="flex gap-1.5">
            <Inbox style={{ width: 14, height: 14 }} />
            Staging Dedup
          </TabsTrigger>
          <TabsTrigger value="existing" className="flex gap-1.5">
            <Database style={{ width: 14, height: 14 }} />
            Existing Data
          </TabsTrigger>
          <TabsTrigger value="history" className="flex gap-1.5">
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
    </div>
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search style={{ width: 18, height: 18 }} />
            Scan Staging Items for Duplicates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Scans pending staging items against existing database records using fuzzy name matching,
            geo proximity, and date comparison. Items are flagged as "duplicate" (high confidence)
            or "merge candidate" (medium confidence).
          </p>

          <div className="flex flex-wrap items-center gap-4">
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
              className="flex gap-2"
            >
              {batchScan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading" />
              ) : (
                <Search style={{ width: 16, height: 16 }} />
              )}
              {batchScan.isPending ? 'Scanning...' : 'Scan Staging'}
            </Button>
          </div>

          {/* Results */}
          {batchScan.data && (
            <div className="mt-4 grid grid-cols-4 gap-4">
              <ResultCard label="Processed" value={batchScan.data.processed} color="#3b82f6" />
              <ResultCard label="Duplicates Found" value={batchScan.data.duplicates_found} color="#dc2626" />
              <ResultCard label="Merge Candidates" value={batchScan.data.merge_candidates_found} color="#ca8a04" />
              <ResultCard label="Skipped" value={batchScan.data.skipped} color="#6b7280" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
    <div className="flex flex-col gap-6">
      {/* Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database style={{ width: 18, height: 18 }} />
            Scan Existing Records for Duplicates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Scans records within a table to find duplicate pairs. Uses trigram similarity for names,
            geo proximity for venues, and date matching for events.
          </p>

          <div className="flex flex-wrap items-center gap-4">
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

            <div className="flex items-center gap-2" style={{ width: 200 }}>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Threshold: {(threshold * 100).toFixed(0)}%
              </span>
              <Slider
                value={[threshold]}
                onValueChange={([v]) => setThreshold(v)}
                min={0.5}
                max={0.95}
                step={0.05}
              />
            </div>

            <Button
              onClick={handleScan}
              disabled={scanMutation.isPending}
              className="flex gap-2"
            >
              {scanMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading" />
              ) : (
                <Search style={{ width: 16, height: 16 }} />
              )}
              {scanMutation.isPending ? 'Scanning...' : 'Scan'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => refetch()} className="flex gap-1.5">
              <RefreshCw style={{ width: 14, height: 14 }} />
            </Button>
          </div>

          {scanMutation.data && (
            <div className="mt-4 p-3 bg-muted rounded">
              <p className="text-sm">
                Scanned {scanMutation.data.scanned} {scanMutation.data.entity_type} records,
                found {scanMutation.data.duplicates_found} duplicate pairs
                (threshold: {(scanMutation.data.threshold * 100).toFixed(0)}%)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results grouped by confidence */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-7 w-7 animate-spin" aria-label="Loading" />
        </div>
      ) : pairs.length === 0 ? (
        <Card>
          <CardContent>
            <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search style={{ width: 40, height: 40, color: 'var(--muted-foreground)' }} />
            </div>
            <h6 className="text-base font-semibold mb-2">No Duplicate Pairs</h6>
            <p className="text-muted-foreground">
              Run a scan to detect duplicate {entityType} in the database.
            </p>
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
    </div>
  );
}

function DuplicateGroup({ label, color, pairs, onMerge }: { label: string; color: string; pairs: DuplicatePair[]; onMerge: (p: DuplicatePair) => void }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className="flex items-center gap-2 mb-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="rounded-full" style={{ width: 10, height: 10, backgroundColor: color }} />
        <h6 className="text-sm font-semibold">{label}</h6>
        <Badge variant="secondary">{pairs.length}</Badge>
      </div>
      {expanded && (
        <div className="flex flex-col gap-3">
          {pairs.map(pair => (
            <DuplicatePairCard key={pair.id} pair={pair} onMerge={onMerge} />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Merge History ====================

function MergeHistorySection() {
  const { data: history = [], isLoading } = useMergeHistory(100);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History style={{ width: 18, height: 18 }} />
            Merge History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-7 w-7 animate-spin" aria-label="Loading" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No merges have been performed yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((entry: Record<string, unknown>) => {
                const details = entry.details || {};
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 p-3 rounded bg-muted"
                    style={{ fontSize: '0.85rem' }}
                  >
                    <Merge style={{ width: 14, height: 14, color: '#3b82f6', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {details.entity_type || 'unknown'}: Kept "{details.keep_name || '?'}", removed "{details.remove_name || '?'}"
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {details.fk_updates || 0} references updated
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== Shared Components ====================

function ResultCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="p-3 rounded text-center"
      style={{ backgroundColor: `${color}08`, border: `1px solid ${color}20` }}
    >
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
