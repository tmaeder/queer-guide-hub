import { cn } from '@/lib/utils';

export interface Occurrence {
  id: string;
  /** Uppercase date, e.g. "FRI 14 AUG". */
  date: string;
  detail?: string;
  /** Uppercase status, e.g. "61 TICKETS" / "NOT ON SALE". */
  status?: string;
  /** Rendered at the row's end — a link or button supplied by the caller. */
  action?: React.ReactNode;
}

/**
 * "Next occurrences" from the event single
 * ("Singles Venue Event Tag.dc.html").
 *
 * The FIRST row is ink-flooded because a repeating event has exactly one next
 * instance and everything below it is planning, not deciding — the same
 * device the hours table uses for today. Later rows stay on paper.
 */
export function OccurrenceList({
  occurrences,
  className,
}: {
  occurrences: Occurrence[];
  className?: string;
}) {
  if (occurrences.length === 0) return null;

  return (
    <div className={cn('border-[3px] border-foreground', className)}>
      {occurrences.map((o, i) => (
        <div
          key={o.id}
          className={cn(
            'flex flex-wrap items-center gap-4 border-b-2 border-foreground/15 px-4 py-4 last:border-b-0',
            i === 0 && 'bg-foreground text-background',
          )}
        >
          <span className="text-13 font-bold uppercase tracking-label">{o.date}</span>
          {o.detail && <span className="min-w-0 flex-1 text-13">{o.detail}</span>}
          {o.status && (
            <span className="text-2xs font-bold uppercase tracking-label">{o.status}</span>
          )}
          {o.action}
        </div>
      ))}
    </div>
  );
}
