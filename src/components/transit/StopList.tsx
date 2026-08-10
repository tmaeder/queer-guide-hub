import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from './RouteBullet';

export interface Stop {
  id: string;
  name: string;
  /** The other type's key, so the stop shows ITS bullet (rule 4). */
  type?: string;
  href?: string;
  /** Walking time FROM the previous stop, e.g. "6 min walk". */
  walkFromPrevious?: string | null;
  /** Access note for this stop specifically — stated, never implied. */
  accessNote?: string | null;
}

/**
 * Module 05 — "An ordered route with walking times between stops and access
 * notes per stop." Required on Queer Villages and Guides.
 *
 * The spec's traps for both owners point the same way: a village is not "a
 * boundary polygon" and a guide is not "a ranked listicle" — "the value is the
 * walk between stations". So the walking time renders BETWEEN stops as its own
 * connector row, not as metadata hanging off a card, and stops carry an index
 * rather than a rank.
 *
 * Ordinals are sequence, not merit. Nothing here sorts or scores.
 */
export function StopList({ stops, className }: { stops: Stop[]; className?: string }) {
  if (stops.length === 0) return null;

  return (
    <ol className={cn('list-none border-[3px] border-foreground p-0', className)}>
      {stops.map((s, i) => (
        <li key={s.id}>
          {i > 0 && s.walkFromPrevious && (
            <div className="flex items-center gap-2 border-b-2 border-t-2 border-foreground/15 bg-surface-container px-4 py-1.5">
              <span aria-hidden className="h-4 w-0.5 bg-track-green" />
              {/* NOT `uppercase`. The eyebrow convention is for LABELS; this
                  string is a measured VALUE, and SI units are case-sensitive —
                  uppercasing turned "~500 m" into "~500 M", which reads as the
                  mega prefix, and "km" into "KM". Caught on production; jsdom
                  applies no text-transform, so the unit tests could not see it. */}
              <span className="text-xs2 font-bold tracking-label text-muted-foreground">
                {s.walkFromPrevious}
              </span>
            </div>
          )}
          <div className="relative flex items-start gap-4 px-4 py-4">
            {s.type ? (
              <RouteBullet type={s.type} size={30} />
            ) : (
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-foreground text-xs2 font-bold"
              >
                {i + 1}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display text-title leading-tight">{s.name}</div>
              {s.accessNote && (
                <div className="mt-1 text-13 text-muted-foreground">{s.accessNote}</div>
              )}
            </div>
            {s.href && (
              <LocalizedLink to={s.href} aria-label={s.name} className="absolute inset-0 no-underline" />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
