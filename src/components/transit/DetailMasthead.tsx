import { cn } from '@/lib/utils';
import { RouteBullet } from './RouteBullet';
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
  title: string;
  /** Bordered status chip, e.g. "Open now" / "Runs monthly". */
  status?: string;
  /** Lead paragraph under the title. */
  lead?: React.ReactNode;
  className?: string;
  compact?: boolean;
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
  title,
  status,
  lead,
  className,
  compact = false,
}: DetailMastheadProps) {
  return (
    <header className={className}>
      <div className={cn('flex flex-wrap items-center gap-2', compact ? 'mb-2' : 'mb-4')}>
        <RouteBullet
          type={type}
          size={compact ? 32 : 44}
          letter={letter}
          track={track}
          label={bulletLabel}
        />
        {eyebrow && <span className="text-2xs font-bold uppercase tracking-label">{eyebrow}</span>}
        {status && (
          <span className="rounded-element border border-input bg-surface-container-high px-4 py-2 text-2xs font-bold uppercase tracking-label shadow-soft">
            {status}
          </span>
        )}
      </div>
      <h1
        className={cn(
          'm-0 break-words font-display leading-none tracking-tight',
          compact ? 'text-headline md:text-display' : 'text-display md:text-hero',
        )}
      >
        {title}
      </h1>
      {lead && <p className="mt-4 max-w-2xl text-body-lg leading-relaxed md:text-xl">{lead}</p>}
    </header>
  );
}
