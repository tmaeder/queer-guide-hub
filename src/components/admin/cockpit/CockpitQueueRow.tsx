/**
 * CockpitQueueRow — one review queue in the feed.
 *
 * A Link, not a button-with-navigate: this is the console's primary navigation
 * surface on mobile (the sidebar is behind a hamburger), so cmd- and
 * middle-click have to work. `no-underline` is required — the unlayered
 * `li a:not(.no-underline)` rule in index.css would otherwise underline it and
 * force `position: relative`.
 *
 * min-h-11 is the 44px tap-target floor. The old StatRow was `py-1`, about 26px.
 */

import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { queueImpact, queueRisk, type QueueRow } from '@/config/adminQueues';

export function CockpitQueueRow({ row }: { row: QueueRow }) {
  const { def, count, overdue, slaHours } = row;
  const Icon = def.icon;

  return (
    <Link
      to={def.route}
      className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-element px-4 py-2 no-underline transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-15 leading-snug">{def.label}</span>
      </span>
      <span className="text-15 font-semibold tabular-nums">{count.toLocaleString()}</span>
      {(queueRisk(def) === 'safety' || overdue > 0 || queueImpact(def) === 'public') && (
        <span className="col-span-2 flex flex-wrap items-center gap-1.5 pl-6">
          {queueRisk(def) === 'safety' && (
            <Badge variant="outline" className="rounded-badge text-2xs font-medium">
              Safety
            </Badge>
          )}
          {overdue > 0 && (
            <Badge
              variant="destructive"
              className="rounded-badge text-2xs font-medium tabular-nums"
              title={slaHours ? `SLA ${slaHours}h` : undefined}
            >
              {overdue.toLocaleString()} overdue
            </Badge>
          )}
          {queueImpact(def) === 'public' && (
            <Badge variant="secondary" className="rounded-badge text-2xs font-medium">
              Public
            </Badge>
          )}
        </span>
      )}
    </Link>
  );
}
