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
}

/**
 * The opening block of every entity single
 * ("Singles Venue Event Tag.dc.html"): route bullet, uppercase eyebrow, a
 * tonal status chip, then the Anton title and the lead.
 *
 * Status remains neutral so it cannot be mistaken for a route colour; the
 * stronger surface tone supplies its silhouette without a hairline outline.
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
}: DetailMastheadProps) {
  return (
    <header className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RouteBullet type={type} size={44} letter={letter} track={track} label={bulletLabel} />
        {eyebrow && <span className="text-2xs font-bold uppercase tracking-label">{eyebrow}</span>}
        {status && (
          <span className="rounded-element bg-surface-container-high px-3 py-2 text-2xs font-bold uppercase tracking-label shadow-soft">
            {status}
          </span>
        )}
      </div>
      <h1 className="m-0 font-display text-display leading-none tracking-tight md:text-hero">
        {title}
      </h1>
      {lead && <p className="mt-4 max-w-2xl text-body-lg leading-relaxed md:text-xl">{lead}</p>}
    </header>
  );
}
