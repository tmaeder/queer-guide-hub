import { RouteBullet } from './RouteBullet';
import { TransitIcon } from './TransitIcon';
import { cn } from '@/lib/utils';
import type { TransitIconName } from './transitIconPaths';
import type { Track } from './routeBulletMap';

interface DetailMastheadProps {
  /** search_documents entity type — drives the bullet's letter + track. */
  type: string;
  /**
   * Bullet overrides, forwarded straight to `RouteBullet`, for a masthead whose
   * subject is not an entity type in `ROUTE_BULLET_MAP` — the six competition
   * categories are the first. Adding them to that map instead would pollute the
   * `search_documents` entity vocab AND collide with the map layer colours it
   * also feeds (`mapPalette.test.ts`), which is exactly the reasoning
   * `RouteBullet` already documents for the policy pages. Omitted = the map
   * decides, so every existing masthead is untouched.
   */
  letter?: string;
  track?: Track | 'ink';
  bulletLabel?: string;
  /** Uppercase line above the title, e.g. "Venue · Nightlife track". */
  eyebrow?: string;
  /**
   * A subject glyph shown at the head of the eyebrow. Added for the glossary,
   * whose single showed no per-term mark at all — only the generic pink `#`.
   * It rides the eyebrow rather than replacing the bullet, because the bullet
   * is the station mark the whole site promises for the type and the eyebrow is
   * already the line that says WHICH corner of the taxonomy this is
   * ("Identity › Gender"). Omitted = every other single renders byte-identical,
   * the same contract the `letter`/`track` overrides above already document.
   */
  glyph?: TransitIconName;
  title: string;
  /** Bordered status chip, e.g. "Open now" / "Runs monthly". */
  status?: string;
  /** Lead paragraph under the title. */
  lead?: React.ReactNode;
  className?: string;
  compact?: boolean;
  size?: 'default' | 'compact';
}

/**
 * The opening block of every entity single
 * ("Singles Venue Event Tag.dc.html"): route bullet, uppercase eyebrow, a
 * bordered status chip, then the Anton title and the lead.
 *
 * Status remains neutral so it cannot be mistaken for a route colour.
 *
 * THE CHIP KEEPS ITS OUTLINE, and a stronger surface tone is not a substitute
 * for it. `--surface-container-high` measures 1.31:1 against the page in light
 * and 1.35:1 in dark, against the 3:1 WCAG 1.4.11 floor — and a tonal fill
 * cannot be made to clear that bar on near-white paper: the lightest neutral
 * that would is about #919191, i.e. a mid-grey chip. So the edge is the entire
 * chip: with no fill contrast and no border there is nothing to see. It draws
 * in `border-input`, the control-boundary token, which measures 4.26:1 against
 * the page and still 3.26:1 against this chip's own fill (3.87:1 in dark), so
 * the boundary holds on both sides in both modes.
 */
export function DetailMasthead({
  type,
  letter,
  track,
  bulletLabel,
  eyebrow,
  glyph,
  title,
  status,
  lead,
  className,
  compact = false,
  size = 'default',
}: DetailMastheadProps) {
  return (
    <header className={className}>
      <div className={cn('flex flex-wrap items-center gap-2', compact ? 'mb-2' : 'mb-4')}>
        <RouteBullet
          type={type}
          size={size === 'compact' ? 32 : 44}
          letter={letter}
          track={track}
          label={bulletLabel}
        />
        {/* The glyph is a SIBLING of the bullet, at the bullet's own size — not
            a 22px mark inside the eyebrow's 10px uppercase text, which is where
            it used to sit. Two things were wrong with that. It was smaller than
            the bullet it stood beside, so it read as decoration on a label
            rather than as this entity's mark; and it was baseline-aligned with
            micro-type, which squashed a drawing that had just been given fills
            and a colour. Bullet says WHICH LINE, glyph says WHAT THIS IS, and
            at matched diameters the pair reads as one unit.

            No plate under it: a v2 mark is a filled shape with an ink outline
            and carries its own weight. The muted plates and chips around these
            glyphs were compensating for v1's single thin stroke. */}
        {glyph && (
          <TransitIcon
            name={glyph}
            size={size === 'compact' ? 32 : 44}
            // Ticks need the icon's own margin, and here it is flush against a
            // bullet and a text run.
            ticks={false}
          />
        )}
        {eyebrow && (
          <span className="inline-flex items-center text-2xs font-bold uppercase tracking-label">
            {eyebrow}
          </span>
        )}
        {status && (
          <span className="rounded-element border border-input bg-surface-container-high px-4 py-2 text-2xs font-bold uppercase tracking-label shadow-soft">
            {status}
          </span>
        )}
      </div>
      <h1
        className={cn(
          'm-0 break-words font-display leading-none tracking-tight',
          size === 'compact' ? 'text-headline md:text-display' : 'text-display md:text-hero',
        )}
      >
        {title}
      </h1>
      {lead && (
        <p
          className={cn(
            'max-w-2xl leading-relaxed',
            compact
              ? 'mt-2 text-body md:text-body-lg'
              : 'mt-4 text-body-lg leading-relaxed md:text-xl',
          )}
        >
          {lead}
        </p>
      )}
    </header>
  );
}
