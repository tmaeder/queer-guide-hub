/**
 * A glossary term as it appears inside a figure.
 *
 * Three states, and the difference between them is the whole reason this
 * component exists rather than a bare `<LocalizedLink>`:
 *
 * - **Live term** → a link to its entry.
 * - **The term whose page we are on** → a plain span. Linking a page to
 *   itself is noise, and it is what `TagInterchange` already does by drawing
 *   the current tag as a filled bullet instead of a link.
 * - **Missing, or merged, or deprecated** → text, or a link to the canonical
 *   term. Several figures deliberately teach terms the glossary does not have
 *   yet (`safeword`, `hard-limit`, `sex-assigned-at-birth`). A figure must not
 *   be able to emit a dead link, and a term being absent must be visible as
 *   absence rather than as a 404.
 *
 * Chips are always HTML siblings of the drawing, never inside the `<svg>`.
 */

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { cn } from '@/lib/utils';
import type { ResolvedTerm } from './types';

const SHELL =
  'inline-flex items-center gap-1.5 border-2 border-foreground px-1.5 py-0.5 text-2xs font-bold';

export function InfographicTermChip({
  slug,
  terms,
  currentSlug,
  label,
  className,
}: {
  slug: string;
  terms: Readonly<Record<string, ResolvedTerm | undefined>>;
  currentSlug?: string;
  /** Accessible name for the link — the chip's own text is a bare term. */
  label: string;
  className?: string;
}) {
  const term = terms[slug];

  // Not in the glossary (yet). Print the name we authored, unlinked, and read
  // it back from the slug so the figure never renders an empty chip.
  if (!term) {
    const readable = slug.replace(/-/g, ' ');
    return (
      <span className={cn(SHELL, 'border-dashed text-muted-foreground', className)}>
        {readable}
      </span>
    );
  }

  const target = term.canonicalSlug ?? term.slug;

  if (target === currentSlug) {
    return (
      <span className={cn(SHELL, 'bg-foreground text-background', className)}>
        <RouteBullet type="tag" size={14} className="border" />
        {term.name}
      </span>
    );
  }

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(target)}`}
      aria-label={`${term.name} — ${label}`}
      className={cn(
        SHELL,
        'no-underline transition-colors hover:bg-foreground hover:text-background',
        className,
      )}
    >
      <RouteBullet type="tag" size={14} className="border" />
      {term.name}
    </LocalizedLink>
  );
}
