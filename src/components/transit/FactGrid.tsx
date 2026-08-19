import { cn } from '@/lib/utils';

export interface Fact {
  /** Uppercase eyebrow label, e.g. "Nearest station". */
  label: string;
  /** Rendered value. Falsy entries are dropped by FactGrid, not by the caller. */
  value: React.ReactNode;
}

/**
 * The bordered key/value block every detail page opens with
 * ("Singles Venue Event Tag.dc.html": Address / Nearest station / Door /
 * Capacity / Kitchen / Languages, and the same module on the event and tag
 * singles).
 *
 * 3px outer rule, 2px inner rules — the grid IS the structure, so cells carry
 * no fill. Empty facts are filtered here rather than at each call site: a
 * detail page that leaves half its columns null should collapse to a shorter
 * grid, not render blank cells.
 */
export function FactGrid({ facts, className }: { facts: Fact[]; className?: string }) {
  const shown = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '');
  if (shown.length === 0) return null;

  return (
    <dl
      className={cn(
        'grid grid-cols-1 border border-border-hairline sm:grid-cols-2 lg:grid-cols-3',
        // Dividers are drawn on the TOP of each cell, with the first row
        // suppressed — not on the bottom. A bottom border leaves a stub on a
        // partly-filled last row (4 facts in 3 columns ends the line mid-width),
        // and "which cells are in the last row" is not expressible in CSS
        // because it depends on both the count and the breakpoint. Which cells
        // are in the FIRST row is just the first 1 / 2 / 3 children, which is.
        '[&>*:nth-child(1)]:border-t-0',
        'sm:[&>*:nth-child(-n+2)]:border-t-0',
        'lg:[&>*:nth-child(-n+3)]:border-t-0',
        className,
      )}
    >
      {shown.map((f) => (
        <div
          key={f.label}
          className="border-t border-r border-border-hairline px-4 py-4 last:border-r-0"
        >
          <dt className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {f.label}
          </dt>
          <dd className="mt-1 text-15 font-bold leading-snug">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
