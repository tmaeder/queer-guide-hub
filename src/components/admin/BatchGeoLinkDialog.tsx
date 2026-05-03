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

  // Load unlinked counts when dialog opens
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

  // Compute totals from batchAllResult or single result
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
          <Globe className="h-4 w-4 mr-2" />
          Batch Geo-Link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Batch Geo-Link Content
            </div>
          </DialogTitle>
          <DialogDescription>
            Link content items to cities and countries using deterministic matching.
            No AI cost — pure database matching with alias normalization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          {/* Unlinked counts */}
          {unlinkedCounts && (
            <div className="border border-border rounded-lg p-3 flex flex-col gap-1">
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
                      <AlertCircle className="h-3 w-3 text-yellow-600" />
                    ) : (
                      <CheckCircle className="h-3 w-3 text-green-600" />
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
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm">Processing...</p>
              </div>
              <div className="h-1 w-full bg-muted overflow-hidden rounded">
                <div className="h-full bg-primary animate-pulse" style={{ width: '50%' }} />
              </div>
            </div>
          )}

          {/* Results */}
          {totals && !loading && (
            <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm font-semibold">Geo-Link Complete</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm"><strong>{totals.processed}</strong> processed</p>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  <p className="text-sm"><strong>{totals.linked}</strong> fully linked</p>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
                  <p className="text-sm"><strong>{totals.partial}</strong> partial</p>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm"><strong>{totals.skipped}</strong> skipped</p>
                </div>
              </div>

              {totals.processed === 0 && (
                <p className="text-sm text-muted-foreground">
                  All items already have geo-links assigned.
                </p>
              )}
            </div>
          )}

          {/* Run button */}
          {!loading && (
            <Button onClick={handleRun}>
              <Globe className="h-4 w-4 mr-2" />
              {showResult ? 'Run Again' : 'Start Batch Geo-Link'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
