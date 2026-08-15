import { RouteBullet } from '@/components/transit/RouteBullet';
import { cn } from '@/lib/utils';

/**
 * The line-identity strip under a single's lede: the type's bullet, then the
 * page's census in transit units ("47 stops · 3 districts · 6 departures").
 *
 * Two rules from the rebuilt pages, both learned the hard way:
 *
 * 1. It renders UNCONDITIONALLY. `/marketplace` gated its count on `total > 0`
 *    and every empty filter unmounted a masthead row, shifting the whole page
 *    under the reader's cursor. A zero is a fact; a missing row is a jump.
 * 2. Counts are `tabular-nums`, so they do not reflow as they settle.
 *
 * Items are pre-formatted by the caller because pluralisation is i18n's job,
 * not this component's.
 *
 * It carries no top margin: `DetailMasthead` already wraps its lead in a `<p>`,
 * so this cannot be nested inside it (a block element inside a paragraph
 * auto-closes the paragraph). Callers place it in the masthead's own slot
 * below and own the spacing there.
 */
export function GeoCensus({
  type,
  items,
  className,
}: {
  type: string;
  items: string[];
  className?: string;
}) {
  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 text-13 text-muted-foreground',
        className,
      )}
    >
      <RouteBullet type={type} size={30} />
      <span className="tabular-nums">{items.join(' · ')}</span>
    </p>
  );
}
