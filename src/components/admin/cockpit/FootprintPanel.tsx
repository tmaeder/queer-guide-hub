/**
 * FootprintPanel — how much of everything exists.
 *
 * Reference material, not work, so it is collapsed by default and reads from
 * the same cached get_admin_counts payload as the rest of the feed (the old
 * Content Overview widget fired thirteen separate head-counts for this).
 *
 * The counts are Postgres `reltuples` estimates, which is why the header says
 * "approximate" rather than pretending to an exact number.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { AdminCounts } from '@/hooks/useAdminCounts';

/** Keys the RPC reports reltuples for, with display labels. `profiles` is
 *  deliberately absent — the RPC does not report it, and user counts belong on
 *  /admin/users where they can be exact. */
const FOOTPRINT: Array<[key: string, label: string]> = [
  ['venues', 'Venues'],
  ['events', 'Events'],
  ['personalities', 'People'],
  ['news_articles', 'News'],
  ['cities', 'Cities'],
  ['countries', 'Countries'],
  ['hotels', 'Hotels'],
  ['queer_villages', 'Villages'],
  ['marketplace_listings', 'Marketplace'],
  ['community_groups', 'Groups'],
  ['unified_tags', 'Tags'],
  ['cms_pages', 'Pages'],
  ['content_links', 'Links'],
  ['redirects', 'Redirects'],
];

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function FootprintPanel({ counts }: { counts: AdminCounts | undefined }) {
  const [open, setOpen] = useState(false);
  const rows = FOOTPRINT.filter(([key]) => typeof counts?.[key] === 'number');

  if (rows.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-2 rounded-container border border-border px-4 py-2 text-13 text-muted-foreground hover:bg-muted/40">
        <span>{open ? 'Hide row counts' : 'Show row counts'}</span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-container border border-border p-4 sm:grid-cols-3 lg:grid-cols-2">
          {rows.map(([key, label]) => (
            <div key={key} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-13 text-muted-foreground">{label}</dt>
              <dd className="text-13 font-semibold tabular-nums">
                {compact(counts?.[key] as number)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-2xs text-muted-foreground">Approximate — Postgres row estimates.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
