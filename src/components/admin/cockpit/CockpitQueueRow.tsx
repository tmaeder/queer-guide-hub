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
import type { QueueRow } from '@/config/adminQueues';

export function CockpitQueueRow({ row }: { row: QueueRow }) {
  const { def, count, overdue, slaHours } = row;
  const Icon = def.icon;

  return (
    <Link
      to={def.route}
      className="flex min-h-11 items-center justify-between gap-2 px-4 py-2 no-underline transition-colors hover:bg-muted/50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-15">{def.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {overdue > 0 && (
          <Badge
            variant="destructive"
            className="rounded-badge text-2xs font-medium tabular-nums"
            title={slaHours ? `SLA ${slaHours}h` : undefined}
          >
            {overdue} overdue
          </Badge>
        )}
        <span className="text-15 font-semibold tabular-nums">{count}</span>
      </span>
    </Link>
  );
}
