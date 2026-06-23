/**
 * WatchedSitesList — owner-only manager for watched sites (/me → Contributions).
 * Lists the user's watches with last-checked / import counts; toggle active or
 * remove. Adding new watches happens from /submit after a URL scan.
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Trash2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWatchedUrls } from '@/hooks/useWatchedUrls';

function freqLabel(min: number): string {
  if (min % 10080 === 0) return `every ${min / 10080}w`;
  if (min % 1440 === 0) return `every ${min / 1440}d`;
  if (min % 60 === 0) return `every ${min / 60}h`;
  return `every ${min}m`;
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function WatchedSitesList() {
  const { toast } = useToast();
  const { watches, isLoading, toggleWatch, removeWatch } = useWatchedUrls();

  if (isLoading) return <p className="text-13 text-muted-foreground">Loading…</p>;
  if (watches.length === 0) {
    return (
      <p className="text-13 text-muted-foreground">
        No watched sites yet. Scan a link on the Submit page, then choose “Watch this site” to auto-import new content.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {watches.map((w) => (
        <li key={w.id} className="flex items-center gap-2 rounded-element border border-border p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium"
                title={w.url}
              >
                {host(w.url)}
              </a>
              <ExternalLink size={12} className="shrink-0 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              {freqLabel(w.frequency_minutes)}
              {w.last_checked_at ? ` · checked ${new Date(w.last_checked_at).toLocaleDateString()}` : ' · not checked yet'}
              {w.imported_count > 0 && (
                <> · <Badge variant="secondary" className="ml-2">{w.imported_count} imported</Badge></>
              )}
            </p>
          </div>
          <Switch
            checked={w.is_active}
            onCheckedChange={(v) => toggleWatch.mutate({ id: w.id, is_active: v })}
            aria-label={w.is_active ? 'Pause watching' : 'Resume watching'}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove watch"
            onClick={async () => {
              try {
                await removeWatch.mutateAsync(w.id);
              } catch {
                toast({ title: 'Could not remove watch', variant: 'destructive' });
              }
            }}
          >
            <Trash2 size={16} />
          </Button>
        </li>
      ))}
    </ul>
  );
}
