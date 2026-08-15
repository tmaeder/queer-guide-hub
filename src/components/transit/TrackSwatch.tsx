import { cn } from '@/lib/utils';
import { TRACK_BG, type Track } from './routeBulletMap';

interface TrackSwatchProps {
  track: Track;
  /** Which surface the swatch sits on. Governs whether it is border-gated. */
  tone?: 'paper' | 'ink';
  className?: string;
}

/**
 * The line swatch — a stubby pill naming a track, used in kickers, legends and
 * column headings ("Station ring" panel, Pattern Library).
 *
 * Two facts decide the markup:
 *
 *  - It is a FILLED SHAPE, so on paper it is border-gated. Blue, green and
 *    yellow all measure under 3:1 against #FAFAF5, and a bare pill in those
 *    three would be a graphical object failing WCAG 1.4.11. On the footer's
 *    ink plate the contrast runs the other way and the fill clears unaided,
 *    which is why `tone="ink"` drops the rim rather than reversing it — a
 *    paper rim on a 8px pill reads as a second, lighter pill.
 *  - `rounded-full` is deliberate on a system that squares everything else.
 *    The swatch is a segment of line, and the squared-corners rule carves out
 *    circles precisely because the transit vocabulary is round: rings,
 *    bullets, and the rounded cap every track stroke in the app already draws.
 *
 * Replaces three separate local `Record<string, string>` copies of TRACK_BG
 * (Header, Footer, and the search popover's chip dot), each of which could
 * drift from routeBulletMap on its own.
 */
export function TrackSwatch({ track, tone = 'paper', className }: TrackSwatchProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-2 w-5 shrink-0 rounded-full',
        TRACK_BG[track],
        tone === 'paper' && 'border border-foreground',
        className,
      )}
    />
  );
}
