/**
 * NeedsYouList — the ranked review queues.
 *
 * Only queues with pending work render, so the list length is the workload.
 * On a bad day all twenty registry queues qualify, which is a 900px wall on a
 * phone — the top six are always visible and the rest fold into a disclosure.
 *
 * Empty state is one muted line: the status line above already says "All clear."
 * and a 200px centred empty block would be the loudest thing on the page.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CockpitList } from '@/components/admin/cockpit/CockpitSection';
import { CockpitQueueRow } from '@/components/admin/cockpit/CockpitQueueRow';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { cn } from '@/lib/utils';
import type { QueueRow } from '@/config/adminQueues';

const VISIBLE_LIMIT = 6;

export function NeedsYouList({ rows, loading }: { rows: QueueRow[]; loading: boolean }) {
  const [open, setOpen] = useState(false);

  if (loading) return <AdminTextSkeleton lines={4} />;
  // One muted line, not an AdminEmpty block: the status line above already says
  // "All clear.", and a 200px centred empty state would be the loudest thing on
  // a page whose whole point is that there is nothing to do.
  if (rows.length === 0) return <p className="text-13 text-muted-foreground">Nothing pending.</p>;

  const head = rows.slice(0, VISIBLE_LIMIT);
  const tail = rows.slice(VISIBLE_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <CockpitList>
        {head.map((row) => (
          <CockpitQueueRow key={row.def.countKey} row={row} />
        ))}
      </CockpitList>

      {tail.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-center gap-1 text-13 font-medium text-muted-foreground hover:text-foreground">
            {open ? 'Show fewer' : `${tail.length} more ${tail.length === 1 ? 'queue' : 'queues'}`}
            <ChevronDown
              size={14}
              className={cn('transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CockpitList>
              {tail.map((row) => (
                <CockpitQueueRow key={row.def.countKey} row={row} />
              ))}
            </CockpitList>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
