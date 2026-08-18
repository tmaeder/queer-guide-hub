import { cn } from '@/lib/utils';

export interface TicketTier {
  /** Display price, already formatted with its currency. */
  price: string;
  name: string;
  note?: string;
}

/**
 * Sliding-scale ticket tiers from the event single
 * ("Singles Venue Event Tag.dc.html" → Door and tickets).
 *
 * Every tier is styled identically — no "recommended" highlight, no ordering
 * cue. The spec's own copy is the reason: "Sliding scale is set by you at the
 * door with no questions and no proof. Nobody is turned away for money."
 * Emphasising a tier would put a thumb on that scale, so the module renders
 * the choice flat and lets the notes speak.
 */
export function TicketTiers({ tiers, className }: { tiers: TicketTier[]; className?: string }) {
  if (tiers.length === 0) return null;

  return (
    <ul
      className={cn(
        'grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {tiers.map((t) => (
        <li key={t.name} className="flex flex-col gap-2 bg-muted rounded-element p-4">
          <span className="font-display text-headline leading-none">{t.price}</span>
          <span className="text-13 font-bold">{t.name}</span>
          {t.note && <span className="text-13 leading-snug">{t.note}</span>}
        </li>
      ))}
    </ul>
  );
}
