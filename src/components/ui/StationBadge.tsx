import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { cn } from '@/lib/utils';
import type { Track } from '@/components/transit/routeBulletMap';

// Fill on card hover. Static strings for Tailwind; ink glyph on every fill.
const HOVER_FILL: Record<Track, string> = {
  pink: 'transition-colors group-hover/card:bg-track-pink group-hover/card:text-track-ring',
  blue: 'transition-colors group-hover/card:bg-track-blue group-hover/card:text-track-ring',
  green: 'transition-colors group-hover/card:bg-track-green group-hover/card:text-track-ring',
  yellow: 'transition-colors group-hover/card:bg-track-yellow group-hover/card:text-track-ring',
};

/**
 * The station disc from the image-less plate, lifted out so a card WITH a photo
 * still carries its mark at plate size. It sits on the seam between photo and
 * text, half over each, like a stop on the line the card belongs to.
 *
 * When the photo fails to load the image falls back to the station plate, which
 * already draws this disc — so the badge hides itself whenever its card
 * (`group/card`, set by `Card` and by every card root that is not a `Card`)
 * contains a plate, instead of showing the mark twice. A named group, because
 * an unnamed `group` matches ANY ancestor: a section that is itself a group
 * let one card's plate hide every card's badge.
 *
 * `bg-background` / `border-foreground` are the pair `DepartmentArt` measured as
 * the only one that separates from both a photo and the card in both themes.
 */
export function StationBadge({
  glyph,
  hoverTrack,
  className,
}: {
  glyph: TransitIconName;
  /** Track the disc fills with while its card is hovered. */
  hoverTrack?: Track;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-station-badge={glyph}
      className={cn(
        'relative z-10 flex size-14 group-has-[[data-fallback=station]]/card:hidden shrink-0 items-center justify-center rounded-full border-[3px] border-foreground bg-background',
        hoverTrack && HOVER_FILL[hoverTrack],
        className,
      )}
    >
      <TransitIcon name={glyph} size={32} />
    </span>
  );
}
