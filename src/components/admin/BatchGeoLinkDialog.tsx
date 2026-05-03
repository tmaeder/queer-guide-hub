/**
 * BatchGeoLinkDialog — Admin dialog for batch geo-linking content items.
 *
 * Shows unlinked counts per content type, allows batch linking by type
 * or all at once, with dry-run support and results summary.
 */

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
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
          <Globe style={{ height: 16, width: 16, marginRight: 8 }} />
          Batch Geo-Link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Globe style={{ height: 20, width: 20 }} />
              Batch Geo-Link Content
            </Box>
          </DialogTitle>
          <DialogDescription>
            Link content items to cities and countries using deterministic matching.
            No AI cost — pure database matching with alias normalization.
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          {/* Unlinked counts */}
          {unlinkedCounts && (
            <Box sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}>
              <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5 }}>
                Unlinked Items
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                {[
                  { label: 'Venues', count: unlinkedCounts.venues },
                  { label: 'Events', count: unlinkedCounts.events },
                  { label: 'Personalities', count: unlinkedCounts.personalities },
                  { label: 'News Articles', count: unlinkedCounts.news_articles },
                ].map(item => (
                  <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {item.count > 0 ? (
                      <AlertCircle style={{ height: 12, width: 12, color: '#ca8a04' }} />
                    ) : (
                      <CheckCircle style={{ height: 12, width: 12, color: '#16a34a' }} />
                    )}
                    <Typography variant="caption">
                      <strong>{item.count}</strong> {item.label}
                    </Typography>
                  </Box>
                ))}
              </Box>
              {totalUnlinked !== null && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Total: {totalUnlinked} items need geo-linking
                </Typography>
              )}
            </Box>
          )}

          {/* Content Type Selection */}
          <Box>
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
          </Box>

          {/* Batch limit */}
          <Box>
            <Label>Batch Limit</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={batchLimit}
              onChange={e => setBatchLimit(Number(e.target.value))}
              disabled={loading}
            />
            <Typography variant="caption" color="text.secondary">
              Max items to process per content type
            </Typography>
          </Box>

          {/* Info box */}
          <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>No AI cost</strong> — Uses deterministic alias normalization and
              exact matching against 351 cities and 199 countries in the database.
            </Typography>
          </Box>

          {/* Progress */}
          {loading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
                <Typography variant="body2">Processing...</Typography>
              </Box>
              <LinearProgress sx={{ borderRadius: 1 }} />
            </Box>
          )}

          {/* Results */}
          {totals && !loading && (
            <Box sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle style={{ height: 18, width: 18, color: '#16a34a' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Geo-Link Complete
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MapPin style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">
                    <strong>{totals.processed}</strong> processed
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CheckCircle style={{ height: 14, width: 14, color: '#16a34a' }} />
                  <Typography variant="body2">
                    <strong>{totals.linked}</strong> fully linked
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AlertCircle style={{ height: 14, width: 14, color: '#ca8a04' }} />
                  <Typography variant="body2">
                    <strong>{totals.partial}</strong> partial
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">
                    <strong>{totals.skipped}</strong> skipped
                  </Typography>
                </Box>
              </Box>

              {totals.processed === 0 && (
                <Typography variant="body2" color="text.secondary">
                  All items already have geo-links assigned.
                </Typography>
              )}
            </Box>
          )}

          {/* Run button */}
          {!loading && (
            <Button onClick={handleRun}>
              <Globe style={{ height: 16, width: 16, marginRight: 8 }} />
              {showResult ? 'Run Again' : 'Start Batch Geo-Link'}
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
