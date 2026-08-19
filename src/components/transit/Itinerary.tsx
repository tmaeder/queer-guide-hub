import { cn } from '@/lib/utils';
import { RouteBullet } from './RouteBullet';

export interface ItineraryEntry {
  id: string;
  name: string;
  type?: string;
  time?: string | null;
}

export interface ItineraryDay {
  id: string;
  /** e.g. "Fri 14 Aug" — absolute, already formatted by the caller. */
  label: string;
  entries: ItineraryEntry[];
}

/**
 * Module 10 — "Day by day, with anything saved from the map landing on the
 * right day."
 *
 * A day with no entries still RENDERS, which is the one place this system
 * deliberately breaks its own "no empty shells" rule — and only here. An
 * itinerary is a plan the reader is building: an empty Thursday is meaningful
 * information (nothing planned yet, and a slot to fill), not a zero state
 * pretending to be content. Dropping it would silently renumber their trip.
 */
export function Itinerary({ days, className }: { days: ItineraryDay[]; className?: string }) {
  if (days.length === 0) return null;

  return (
    <div className={cn('border border-border-hairline', className)}>
      {days.map((d) => (
        <section key={d.id} className="border-b border-border-hairline last:border-b-0">
          <h3 className="bg-foreground px-4 py-2 text-title font-bold leading-none text-background">
            {d.label}
          </h3>
          {d.entries.length === 0 ? (
            <p className="px-4 py-4 text-13 text-muted-foreground">Nothing planned yet.</p>
          ) : (
            <ul className="list-none p-0">
              {d.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-4 border-b border-border-hairline px-4 py-2 last:border-b-0"
                >
                  {e.type && <RouteBullet type={e.type} size={30} />}
                  {e.time && <span className="text-13 font-bold tabular-nums">{e.time}</span>}
                  <span className="min-w-0 flex-1 truncate text-13">{e.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
