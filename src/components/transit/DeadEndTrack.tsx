import { cn } from '@/lib/utils';
import { ROUTE_BULLET_MAP, type Track } from './routeBulletMap';

/** `text-*` (not `bg-*`) because the artwork strokes with `currentColor`, so
 *  one class colours the whole live segment. Full literals — Tailwind scans
 *  source, and only `{bg,text,border,decoration}-track-*` is safelisted. */
const TRACK_STROKE: Record<Track, string> = {
  pink: 'text-track-pink',
  blue: 'text-track-blue',
  green: 'text-track-green',
  yellow: 'text-track-yellow',
};

interface DeadEndTrackProps {
  /** The failed slug — the ghost station's name. */
  label: string;
  /** Entity type (search_documents vocab). Picks the line colour, ink if unmapped. */
  type?: string;
  /** Eyebrow above the label, e.g. "No stop". */
  caption?: string;
  className?: string;
}

/**
 * The 404's storytelling device: a line that runs, bends, and then stops
 * short of where you asked to go.
 *
 * Two rules from the design system decide the geometry. Illustrative transit
 * lines are never straight, so the live segment takes a 45° subway bend with
 * radiused corners rather than a rule across the panel. And track colour is
 * wayfinding, not decoration — the live segment carries the line colour of the
 * entity type you were looking for (a missing venue closes the pink line), so
 * the artwork says WHICH line, while everything past the break is ink: the
 * dashes and the ghost station are not a line, they are the absence of one.
 *
 * The SVG is decorative. The slug renders as real HTML text underneath, so
 * the one piece of information here never lives only inside a graphic.
 */
export function DeadEndTrack({ label, type, caption, className }: DeadEndTrackProps) {
  const track = type ? ROUTE_BULLET_MAP[type]?.track : undefined;
  const live = track ? TRACK_STROKE[track] : 'text-foreground';

  // The PANEL carries the cap, not the SVG inside it: the viewBox scales the
  // stroke with the width, so at the full 1600px page frame an uncapped track
  // renders as a grotesquely fat line — but capping only the artwork leaves a
  // band of dead paper to its right.
  return (
    <div
      className={cn(
        'max-w-[56rem] border-[3px] border-foreground bg-background p-4 sm:p-6',
        className,
      )}
    >
      <svg
        viewBox="0 0 300 100"
        role="presentation"
        aria-hidden="true"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Live segment: runs in low and left, climbs on the diagonal, levels
            out — the last stretch of a working line. */}
        <g className={live} stroke="currentColor" strokeWidth={5}>
          {/* Ends AT the terminus station (158), not past it — a line that
              overshoots its last stop reads as track still in service. */}
          <path d="M 10 80 H 44 Q 60 80 71 69 L 101 39 Q 112 28 128 28 H 158" />
        </g>

        {/* Everything ink from here: two real stops on the live segment, then
            the break, the dead dashes, and the station that isn't there. */}
        <g className="text-foreground" stroke="currentColor">
          <circle cx="34" cy="80" r="7" strokeWidth={4} className="fill-background" />
          <circle cx="158" cy="28" r="7" strokeWidth={4} className="fill-background" />

          <g opacity="0.4">
            <path d="M 186 28 H 244" strokeWidth={4} strokeDasharray="2 12" />
          </g>

          <g opacity="0.55">
            <circle cx="266" cy="28" r="12" strokeWidth={4} className="fill-background" />
            <path d="M 259 21 L 273 35 M 273 21 L 259 35" strokeWidth={4} />
          </g>
        </g>
      </svg>

      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {caption && (
          <span className="text-13 font-bold uppercase tracking-label text-muted-foreground">
            {caption}
          </span>
        )}
        <span className="min-w-0 break-all font-display text-headline leading-tight">{label}</span>
      </p>
    </div>
  );
}
