/**
 * BatchGeoLinkDialog — Admin dialog for batch geo-linking content items.
 *
 * Shows unlinked counts per content type, allows batch linking by type
 * or all at once, with dry-run support and results summary.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Loader2, CheckCircle, AlertCircle, Globe } from 'lucide-react';
import { useGeoLink } from '@/hooks/useGeoLink';

const CONTENT_TYPES = [
  { value: 'all', label: 'All Content Types' },
  { value: 'venues', label: 'Venues' },
  { value: 'events', label: 'Events' },
  { value: 'personalities', label: 'Personalities' },
  { value: 'news_articles', label: 'News Articles' },
];

interface BatchGeoLinkDialogProps {
  onComplete?: () => void;
}

export default function BatchGeoLinkDialog({ onComplete }: BatchGeoLinkDialogProps) {
  const {
    loading,
    result,
    batchAllResult,
    unlinkedCounts,
    batchLink,
    batchLinkAll,
    getUnlinkedCounts,
  } = useGeoLink();

  const [open, setOpen] = useState(false);
  const [contentType, setContentType] = useState('all');
  const [batchLimit, setBatchLimit] = useState(200);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (open) {
      getUnlinkedCounts();
    }
  }, [open, getUnlinkedCounts]);

  const handleRun = async () => {
    setShowResult(false);
    if (contentType === 'all') {
      await batchLinkAll(batchLimit);
    } else {
      await batchLink(contentType, batchLimit);
    }
    setShowResult(true);
    onComplete?.();
  };

  const handleClose = (isOpen: boolean) => {
    if (!loading) {
      setOpen(isOpen);
      if (!isOpen) {
        setShowResult(false);
      }
    }
  };

  const totals = showResult
    ? contentType === 'all' && batchAllResult
      ? Object.values(batchAllResult.results).reduce(
          (acc, r) => ({
            processed: acc.processed + r.total_processed,
            linked: acc.linked + r.total_linked,
            partial: acc.partial + r.total_partial,
            skipped: acc.skipped + r.total_skipped,
            alreadyLinked: acc.alreadyLinked + r.total_already_linked,
          }),
          { processed: 0, linked: 0, partial: 0, skipped: 0, alreadyLinked: 0 }
        )
      : result
        ? {
            processed: result.total_processed,
            linked: result.total_linked,
            partial: result.total_partial,
            skipped: result.total_skipped,
            alreadyLinked: result.total_already_linked,
          }
        : null
    : null;

  const totalUnlinked = unlinkedCounts
    ? unlinkedCounts.venues + unlinkedCounts.events +
      unlinkedCounts.personalities + unlinkedCounts.news_articles
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Globe style={{ height: 16, width: 16, marginRight: 8 }} />
          Batch Geo-Link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Globe style={{ height: 20, width: 20 }} />
              Batch Geo-Link Content
            </span>
          </DialogTitle>
          <DialogDescription>
            Link content items to cities and countries using deterministic matching.
            No AI cost — pure database matching with alias normalization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          {/* Unlinked counts */}
          {unlinkedCounts && (
            <div className="border border-border rounded-element p-3 flex flex-col gap-1">
              <span className="text-xs font-semibold mb-1">Unlinked Items</span>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'Venues', count: unlinkedCounts.venues },
                  { label: 'Events', count: unlinkedCounts.events },
                  { label: 'Personalities', count: unlinkedCounts.personalities },
                  { label: 'News Articles', count: unlinkedCounts.news_articles },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1">
                    {item.count > 0 ? (
                      <AlertCircle style={{ height: 12, width: 12, color: 'hsl(var(--foreground) / 0.55)' }} />
                    ) : (
                      <CheckCircle style={{ height: 12, width: 12, color: 'hsl(var(--foreground))' }} />
                    )}
                    <span className="text-xs">
                      <strong>{item.count}</strong> {item.label}
                    </span>
                  </div>
                ))}
              </div>
              {totalUnlinked !== null && (
                <span className="text-xs text-muted-foreground mt-1">
                  Total: {totalUnlinked} items need geo-linking
                </span>
              )}
            </div>
          )}

          {/* Content Type Selection */}
          <div>
            <Label>Content Type</Label>
            <Select value={contentType} onValueChange={setContentType} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map(ct => (
                  <SelectItem key={ct.value} value={ct.value}>
                    {ct.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Batch limit */}
          <div>
            <Label>Batch Limit</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={batchLimit}
              onChange={e => setBatchLimit(Number(e.target.value))}
              disabled={loading}
            />
            <span className="text-xs text-muted-foreground">
              Max items to process per content type
            </span>
          </div>

          {/* Info box */}
          <div className="bg-muted rounded p-3">
            <span className="text-xs text-muted-foreground">
              <strong>No AI cost</strong> — Uses deterministic alias normalization and
              exact matching against 351 cities and 199 countries in the database.
            </span>
          </div>

          {/* Progress */}
          {loading && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Loader2 style={{ height: 16, width: 16 }} className="animate-spin" />
                <span className="text-sm">Processing...</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded bg-secondary">
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
            </div>
          )}

          {/* Results */}
          {totals && !loading && (
            <div className="border border-border rounded-element p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle style={{ height: 18, width: 18, color: 'hsl(var(--foreground))' }} />
                <span className="text-sm font-semibold">Geo-Link Complete</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <MapPin style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <span className="text-sm">
                    <strong>{totals.processed}</strong> processed
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle style={{ height: 14, width: 14, color: 'hsl(var(--foreground))' }} />
                  <span className="text-sm">
                    <strong>{totals.linked}</strong> fully linked
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle style={{ height: 14, width: 14, color: 'hsl(var(--foreground) / 0.55)' }} />
                  <span className="text-sm">
                    <strong>{totals.partial}</strong> partial
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <span className="text-sm">
                    <strong>{totals.skipped}</strong> skipped
                  </span>
                </div>
              </div>

              {totals.processed === 0 && (
                <span className="text-sm text-muted-foreground">
                  All items already have geo-links assigned.
                </span>
              )}
            </div>
          )}

          {/* Run button */}
          {!loading && (
            <Button onClick={handleRun}>
              <Globe style={{ height: 16, width: 16, marginRight: 8 }} />
              {showResult ? 'Run Again' : 'Start Batch Geo-Link'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
