/**
 * BatchAutoTagDialog — Admin dialog for batch auto-tagging content items.
 *
 * Provides a UI to select a content type, set limits and thresholds,
 * run batch auto-tagging, and view results.
 */

import { useState } from 'react';
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
import { Sparkles, Loader2, CheckCircle, Tag, AlertCircle } from 'lucide-react';
import { useAutoTag, type AutoTagResponse } from '@/hooks/useAutoTag';

const CONTENT_TYPES = [
  { value: 'venues', label: 'Venues', count: '1,436' },
  { value: 'events', label: 'Events', count: '214' },
  { value: 'personalities', label: 'Personalities', count: '3,665' },
  { value: 'news_articles', label: 'News Articles', count: '846' },
  { value: 'cities', label: 'Cities', count: '344' },
  { value: 'countries', label: 'Countries', count: '199' },
  { value: 'marketplace_listings', label: 'Marketplace', count: '—' },
  { value: 'community_groups', label: 'Community Groups', count: '—' },
];

interface BatchAutoTagDialogProps {
  onComplete?: () => void;
}

export default function BatchAutoTagDialog({ onComplete }: BatchAutoTagDialogProps) {
  const { loading, batchProgress: _batchProgress, batchAutoTag } = useAutoTag();
  const [open, setOpen] = useState(false);
  const [contentType, setContentType] = useState('venues');
  const [batchLimit, setBatchLimit] = useState(20);
  const [threshold, setThreshold] = useState(0.85);
  const [result, setResult] = useState<AutoTagResponse | null>(null);

  const handleRun = async () => {
    setResult(null);
    const response = await batchAutoTag(contentType, batchLimit, threshold);
    if (response) {
      setResult(response);
      onComplete?.();
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!loading) {
      setOpen(isOpen);
      if (!isOpen) {
        setResult(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles style={{ height: 16, width: 16, marginRight: 8 }} />
          Batch Auto-Tag
        </Button>
      </DialogTrigger>
      <DialogContent sx={{ maxWidth: 540 }}>
        <DialogHeader>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Sparkles style={{ height: 20, width: 20 }} />
              Batch Auto-Tag Content
            </Box>
          </DialogTitle>
          <DialogDescription>
            Use AI to automatically suggest and assign tags to untagged content items.
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {ct.label}
                      <Typography variant="caption" color="text.secondary">
                        ({ct.count})
                      </Typography>
                    </Box>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          {/* Settings row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Label>Batch Limit</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={batchLimit}
                onChange={e => setBatchLimit(Number(e.target.value))}
                disabled={loading}
              />
              <Typography variant="caption" color="text.secondary">
                Max items to process
              </Typography>
            </Box>
            <Box>
              <Label>Auto-approve ≥</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                disabled={loading}
              />
              <Typography variant="caption" color="text.secondary">
                Confidence threshold
              </Typography>
            </Box>
          </Box>

          {/* Cost estimate */}
          <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Estimated cost:</strong> ~${(batchLimit * 0.0003).toFixed(4)} USD
              ({batchLimit} items × $0.0003/item with GPT-4o-mini)
            </Typography>
          </Box>

          {/* Progress */}
          {loading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
                <Typography variant="body2">Processing…</Typography>
              </Box>
              <LinearProgress sx={{ borderRadius: 1 }} />
              <Typography variant="caption" color="text.secondary">
                This may take a few minutes depending on batch size.
              </Typography>
            </Box>
          )}

          {/* Results */}
          {result && !loading && (
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
                  Batch Complete
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Tag style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">
                    <strong>{result.items_processed}</strong> items processed
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Sparkles style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">
                    <strong>{result.total_suggestions}</strong> tags suggested
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CheckCircle style={{ height: 14, width: 14, color: '#16a34a' }} />
                  <Typography variant="body2">
                    <strong>{result.total_auto_approved}</strong> auto-approved
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AlertCircle style={{ height: 14, width: 14, color: '#ca8a04' }} />
                  <Typography variant="body2">
                    <strong>{result.new_tags_created}</strong> new tags created
                  </Typography>
                </Box>
              </Box>

              {result.items_processed === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {result.message || `All ${contentType.replace('_', ' ')} already have tags assigned.`}
                </Typography>
              )}
            </Box>
          )}

          {/* Run button */}
          {!loading && (
            <Button onClick={handleRun} sx={{ width: '100%' }}>
              <Sparkles style={{ height: 16, width: 16, marginRight: 8 }} />
              {result ? 'Run Again' : 'Start Batch Auto-Tag'}
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
