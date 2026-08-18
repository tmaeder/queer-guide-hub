import { RouteBullet } from './RouteBullet';

interface DetailMastheadProps {
  /** search_documents entity type — drives the bullet's letter + track. */
  type: string;
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
 * bordered status chip, then the Anton title and the lead.
 *
 * The status chip is an OUTLINE rather than a filled track colour: "Open now"
 * and "Sold out" are STATES, and the design system reserves colour for
 * wayfinding — a filled chip here would read as a line, not a status.
 *
 * It keeps a border through the soft re-skin, when card frames were deleted,
 * because the outline is the entire chip: with no fill and no edge there is no
 * chip left. It draws in `border-input` (the control-boundary token, 3.8:1 on
 * the page) rather than the 12%-ink divider hairline, which at chip scale is
 * invisible.
 */
export function DetailMasthead({
  type,
  eyebrow,
  title,
  status,
  lead,
  className,
}: DetailMastheadProps) {
  return (
    <header className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RouteBullet type={type} size={44} />
        {eyebrow && <span className="text-2xs font-bold uppercase tracking-label">{eyebrow}</span>}
        {status && (
          <span className="rounded-element border border-input px-2 py-2 text-2xs font-bold uppercase tracking-label">
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
