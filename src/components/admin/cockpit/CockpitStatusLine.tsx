/**
 * CockpitStatusLine — the page's one-sentence answer to "is anything wrong".
 *
 * The dot is decoration: severity is carried by the sentence, because colour
 * alone is a WCAG 1.4.1 failure. No aria-live — this re-renders on every 60s
 * poll and would announce the same sentence to a screen reader forever.
 */

import { cn } from '@/lib/utils';
import { FreshnessIndicator } from '@/components/admin/cockpit/FreshnessIndicator';
import type { QueueRow } from '@/config/adminQueues';
import { summarizeQueues } from '@/config/adminQueues';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function statusSentence(rows: QueueRow[], opsBroken: number): string {
  const { queues, items, overdueQueues } = summarizeQueues(rows);
  const parts: string[] = [];

  if (overdueQueues > 0) {
    parts.push(`${overdueQueues} ${plural(overdueQueues, 'queue', 'queues')} overdue`);
  } else if (queues > 0) {
    parts.push(`${queues} ${plural(queues, 'queue needs', 'queues need')} attention`);
  }
  if (items > 0) parts.push(`${items} ${plural(items, 'item', 'items')}`);
  if (opsBroken > 0) {
    parts.push(`${opsBroken} ${plural(opsBroken, 'system issue', 'system issues')}`);
  }

  if (parts.length === 0) return 'All clear.';
  return `${parts.join(' · ')}.`;
}

export function CockpitStatusLine({
  rows,
  opsBroken,
  dataUpdatedAt,
  isFetching,
}: {
  rows: QueueRow[];
  opsBroken: number;
  dataUpdatedAt: number;
  isFetching: boolean;
}) {
  const { queues, overdueQueues } = summarizeQueues(rows);
  const severity = overdueQueues > 0 || opsBroken > 0 ? 'alert' : queues > 0 ? 'pending' : 'clear';

  return (
    <span className="flex flex-wrap items-center gap-2 text-13">
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          severity === 'alert' && 'bg-destructive',
          severity === 'pending' && 'bg-foreground',
          severity === 'clear' && 'bg-muted-foreground',
        )}
      />
      <span>{statusSentence(rows, opsBroken)}</span>
      <FreshnessIndicator
        dataUpdatedAt={dataUpdatedAt}
        isFetching={isFetching}
        intervalMs={60_000}
      />
    </span>
  );
}
