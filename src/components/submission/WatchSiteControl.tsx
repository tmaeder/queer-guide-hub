/**
 * WatchSiteControl — shown after a URL scan on /submit. Registers the scanned
 * page as a watched site so new content is auto-imported on change.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWatchedUrls } from '@/hooks/useWatchedUrls';

const FREQUENCIES: Array<{ value: string; label: string }> = [
  { value: '360', label: 'Every 6 hours' },
  { value: '1440', label: 'Daily' },
  { value: '10080', label: 'Weekly' },
];

export function WatchSiteControl({ url }: { url: string }) {
  const { toast } = useToast();
  const { watches, addWatch } = useWatchedUrls();
  const [frequency, setFrequency] = useState('1440');

  const already = watches.some((w) => w.url === url);

  if (already) {
    return (
      <div className="flex items-center gap-2 rounded-element border border-border p-4 text-sm text-muted-foreground">
        <Check size={16} className="shrink-0" />
        You’re watching this site — new content will be queued for review automatically.
      </div>
    );
  }

  const onWatch = async () => {
    try {
      await addWatch.mutateAsync({ url, frequency_minutes: Number(frequency) });
      toast({ title: 'Watching this site', description: 'We’ll check it and import new content for review.' });
    } catch (err) {
      toast({
        title: 'Could not start watching',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-element border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Eye size={16} className="shrink-0" />
        Watch this site for updates
      </div>
      <p className="text-xs text-muted-foreground">
        We’ll re-check it on a schedule and auto-queue new content for review.
      </p>
      <div className="flex items-center gap-2">
        <Select value={frequency} onValueChange={setFrequency}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={onWatch} disabled={addWatch.isPending}>
          {addWatch.isPending ? 'Saving…' : 'Watch'}
        </Button>
      </div>
    </div>
  );
}
