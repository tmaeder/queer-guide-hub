import { cn } from '@/lib/utils';

/**
 * `yes` / `no` / `partial` — an access fact is a three-state answer, and the
 * third state is what makes the module honest: "hearing loop at the bar only"
 * is neither a promise nor a denial.
 */
export type AccessState = 'yes' | 'no' | 'partial';

export interface AccessItem {
  label: string;
  /** Free-text detail, e.g. "Yes, left door" / "At the bar only". */
  value?: string;
  state: AccessState;
}

/**
 * The access grid from the venue single
 * ("Singles Venue Event Tag.dc.html" → Access).
 *
 * The status dot is a filled circle inside a 3px ink ring — the station-marker
 * shape, reused because an access fact IS a point of interest on the record.
 *
 * Colour here is NOT decoration and is deliberately not a track colour: these
 * are the one place in the product where a wrong claim is real-world harm, so
 * the dot uses the same green/amber/pink triad as the safety scale and is
 * ALWAYS paired with the written value. Never ship the dot alone — colour is
 * not the answer, it is the index to the answer.
 */
const STATE_DOT: Record<AccessState, string> = {
  yes: 'bg-track-green',
  partial: 'bg-track-yellow',
  no: 'bg-track-pink',
};

export function AccessGrid({ items, className }: { items: AccessItem[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <ul className={cn('grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2', className)}>
      {items.map((a) => (
        <li
          key={a.label}
          className="flex items-center gap-2 border-2 border-foreground px-4 py-2"
        >
          <span
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0 rounded-full border-[3px] border-foreground',
              STATE_DOT[a.state],
            )}
          />
          <span className="flex-1 text-13 font-bold">{a.label}</span>
          {a.value && <span className="text-13 opacity-75">{a.value}</span>}
        </li>
      ))}
    </ul>
  );
}
