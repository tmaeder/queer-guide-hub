import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { cn } from '@/lib/utils';

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
export function StationBadge({ glyph, className }: { glyph: TransitIconName; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-station-badge={glyph}
      className={cn(
        'relative z-10 flex size-20 group-has-[[data-fallback=station]]/card:hidden shrink-0 items-center justify-center rounded-full border-[3px] border-foreground bg-background',
        className,
      )}
    >
      <TransitIcon name={glyph} size={64} ticks={false} />
    </span>
  );
}
