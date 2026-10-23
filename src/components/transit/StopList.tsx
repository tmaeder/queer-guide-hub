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
export function StopList({
  stops,
  className,
  variant = 'compact',
}: {
  stops: Stop[];
  className?: string;
  variant?: 'compact' | 'route';
}) {
  if (stops.length === 0) return null;

  if (variant === 'route') {
    return (
      <ol className={cn('max-w-reading list-none p-0', className)}>
        {stops.map((stop) => (
          <li
            key={stop.id}
            className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-4"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 56 120"
              preserveAspectRatio="none"
              className="absolute inset-y-0 left-0 h-full w-11 text-track-green sm:w-14"
            >
              <path
                d="M28 0 C8 30 48 90 28 120"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
              />
            </svg>
            <div aria-hidden="true" className="relative z-10 flex justify-center pt-6">
              <span className="mt-1 h-5 w-5 rounded-full border-[4px] border-foreground bg-background" />
            </div>
            <div className="min-w-0 pb-6 pt-4">
              {stop.walkFromPrevious && (
                <p className="mb-2 text-13 text-muted-foreground">{stop.walkFromPrevious}</p>
              )}
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1 font-display text-headline leading-tight">
                  {stop.href ? (
                    <LocalizedLink
                      to={stop.href}
                      className="rounded-element no-underline underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {stop.name}
                    </LocalizedLink>
                  ) : (
                    stop.name
                  )}
                </div>
                {stop.type && <RouteBullet type={stop.type} size={30} />}
              </div>
              {stop.accessNote && (
                <p className="mt-2 text-13 text-muted-foreground">{stop.accessNote}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className={cn('list-none bg-muted rounded-element p-0', className)}>
      {stops.map((s, i) => (
        <li key={s.id}>
          {i > 0 && s.walkFromPrevious && (
            <div className="flex items-center gap-2 border-b border-t border-border-hairline bg-surface-container px-4 py-1.5">
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
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-hairline text-xs2 font-bold"
              >
                {i + 1}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-title font-bold leading-tight">{s.name}</div>
              {s.accessNote && (
                <div className="mt-1 text-13 text-muted-foreground">{s.accessNote}</div>
              )}
            </div>
            {s.href && (
              <LocalizedLink
                to={s.href}
                aria-label={s.name}
                className="absolute inset-0 no-underline"
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
