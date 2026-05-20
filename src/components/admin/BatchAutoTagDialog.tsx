/**
 * BatchAutoTagDialog — Admin dialog for batch auto-tagging content items.
 *
 * Provides a UI to select a content type, set limits and thresholds,
 * run batch auto-tagging, and view results.
 */

import { useState } from 'react';
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
          <Sparkles className="h-4 w-4 mr-2" />
          Batch Auto-Tag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Batch Auto-Tag Content
            </span>
          </DialogTitle>
          <DialogDescription>
            Use AI to automatically suggest and assign tags to untagged content items.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          <div>
            <Label>Content Type</Label>
            <Select value={contentType} onValueChange={setContentType} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map(ct => (
                  <SelectItem key={ct.value} value={ct.value}>
                    <span className="flex items-center gap-2">
                      {ct.label}
                      <span className="text-xs text-muted-foreground">({ct.count})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Batch Limit</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={batchLimit}
                onChange={e => setBatchLimit(Number(e.target.value))}
                disabled={loading}
              />
              <span className="text-xs text-muted-foreground">Max items to process</span>
            </div>
            <div>
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
              <span className="text-xs text-muted-foreground">Confidence threshold</span>
            </div>
          </div>

          <div className="bg-muted rounded-badge p-3">
            <span className="text-xs text-muted-foreground">
              <strong>Estimated cost:</strong> ~${(batchLimit * 0.0003).toFixed(4)} USD
              ({batchLimit} items × $0.0003/item with GPT-4o-mini)
            </span>
          </div>

          {loading && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm">Processing…</p>
              </div>
              <div className="h-1 w-full bg-muted rounded-badge overflow-hidden">
                <div className="h-full bg-primary animate-pulse" style={{ width: '30%' }} />
              </div>
              <span className="text-xs text-muted-foreground">
                This may take a few minutes depending on batch size.
              </span>
            </div>
          )}

          {result && !loading && (
            <div className="border border-border rounded-element p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--foreground))' }} />
                <p className="text-sm font-semibold">Batch Complete</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm">
                    <strong>{result.items_processed}</strong> items processed
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm">
                    <strong>{result.total_suggestions}</strong> tags suggested
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground))' }} />
                  <p className="text-sm">
                    <strong>{result.total_auto_approved}</strong> auto-approved
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground) / 0.55)' }} />
                  <p className="text-sm">
                    <strong>{result.new_tags_created}</strong> new tags created
                  </p>
                </div>
              </div>

              {result.items_processed === 0 && (
                <p className="text-sm text-muted-foreground">
                  {result.message || `All ${contentType.replace('_', ' ')} already have tags assigned.`}
                </p>
              )}
            </div>
          )}

          {!loading && (
            <Button onClick={handleRun}>
              <Sparkles className="h-4 w-4 mr-2" />
              {result ? 'Run Again' : 'Start Batch Auto-Tag'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
