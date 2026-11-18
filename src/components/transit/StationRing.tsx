import { cn } from '@/lib/utils';
import { TRACK_BG, type Track } from './routeBulletMap';

interface StationRingProps {
  /** open = place · typed = typed entity (needs track) · done = done/past */
  state: 'open' | 'typed' | 'done';
  track?: Track;
  /** Which surface the ring sits on. `ink` reverses the rim and the
   *  achromatic fills so the marker survives the footer's ink flood. */
  tone?: 'paper' | 'ink';
  className?: string;
  /** Station number drawn inside the ring; grows the marker to 24px. */
  number?: number;
}

/** Map station marker: 18px circle, 3px ink ring.
 *
 *  `tone="ink"` exists because the rim is the ONLY thing separating a station
 *  from the surface behind it. On the footer's ink plate an ink rim is
 *  invisible and a `done` marker — ink fill inside an ink rim — disappears
 *  entirely, so both flip to paper. The track fill does not flip: a line
 *  colour means the same thing on either plate, which is the point of it. */
export function StationRing({
  state,
  track = 'pink',
  tone = 'paper',
  className,
  number,
}: StationRingProps) {
  const onInk = tone === 'ink';
  return (
    <span
      aria-hidden
      className={cn(
        // The ring WEIGHT belongs to the base; the tone branch may only set its
        // COLOUR. The de-caging sweep briefly put a bare `border` in the ink
        // branch — same tailwind-merge group as `border-[3px]` — so a ring on
        // an ink band silently thinned to 1px while the paper one stayed at 3.
        'transit-marker inline-block rounded-full border-[3px]',
        number == null
          ? 'h-4 w-4'
          : 'inline-flex h-6 w-6 items-center justify-center text-2xs font-bold leading-none tabular-nums',
        onInk ? 'border-background' : 'border-track-ring',
        state === 'open' &&
          (onInk ? 'bg-foreground text-background' : 'bg-background text-foreground'),
        // Type on a track fill is ink in both modes, like the ring.
        state === 'typed' && cn(TRACK_BG[track], 'text-track-ring'),
        state === 'done' &&
          (onInk ? 'bg-background text-foreground' : 'bg-foreground text-background'),
        className,
      )}
    >
      {number}
    </span>
  );
}
