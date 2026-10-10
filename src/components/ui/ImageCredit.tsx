/**
 * Image attribution, in one place.
 *
 * Until 2026-10-10 the only credit renderer in this repo was `CreditTag`, a
 * non-exported function inside `EditorialHero.tsx`, and every other surface
 * hand-rolled its own (`NewsDetail.tsx`'s figcaption, `InfographicSources`'
 * citation strip). A CC BY-SA photograph without a visible credit is a licence
 * breach rather than a styling preference, so the composition of that line is
 * worth exactly one implementation.
 *
 * Two variants, because the POSITIONING genuinely differs and only the text
 * composition is shared:
 *   - `overlay` sits bottom-right over the image, for a hero where the credit
 *     must not compete with an overlaid headline.
 *   - `block` sits inside a figure's frame beneath the image, which is what a
 *     glossary figure wants.
 */
import { cn } from '@/lib/utils';

export interface ImageCreditParts {
  /** Photographer or author, as the upstream gave it. */
  attribution?: string | null;
  /** Licence short name, e.g. "CC BY-SA 4.0". */
  license?: string | null;
  /** Where it came from, e.g. "wikimedia". */
  source?: string | null;
}

/**
 * Compose the credit line. Pure, so it can be asserted without a renderer.
 *
 * Returns null when there is nothing to say — NOT an empty string, so a caller
 * cannot accidentally render an empty credit bar and read it as "credited".
 *
 * `source` is included only when it adds something the other two do not: a
 * licence like "CC BY-SA 4.0" already implies Commons to anyone who would check,
 * but "Pexels License" plus "pexels" is a tautology, so the source is dropped
 * when the licence text already names it.
 */
export function formatImageCredit(parts: ImageCreditParts): string | null {
  const attribution = parts.attribution?.trim();
  const license = parts.license?.trim();
  const source = parts.source?.trim();

  const bits: string[] = [];
  if (attribution) bits.push(attribution);
  if (license) bits.push(license);
  if (source && !(license && license.toLowerCase().includes(source.toLowerCase()))) {
    bits.push(SOURCE_LABELS[source] ?? source);
  }
  return bits.length > 0 ? bits.join(' · ') : null;
}

/** Human labels for the stored `image_source` vocabulary. */
const SOURCE_LABELS: Record<string, string> = {
  'wikidata:p18': 'via Wikimedia Commons',
  wikimedia: 'via Wikimedia Commons',
  pexels: 'via Pexels',
  unsplash: 'via Unsplash',
};

export interface ImageCreditProps extends ImageCreditParts {
  /** A pre-composed line, for callers whose data already carries one. */
  credit?: string | null;
  variant?: 'overlay' | 'block';
  /** Overlay only: lighten the text for a dark image. */
  onDark?: boolean;
  className?: string;
}

export function ImageCredit({
  credit,
  attribution,
  license,
  source,
  variant = 'block',
  onDark = false,
  className,
}: ImageCreditProps) {
  const line = credit?.trim() || formatImageCredit({ attribution, license, source });
  if (!line) return null;

  if (variant === 'overlay') {
    return (
      <span
        className={cn(
          'absolute bottom-1.5 right-2 z-[2] max-w-[60%] truncate text-2xs leading-tight',
          onDark ? 'text-white/55' : 'text-muted-foreground/70',
          className,
        )}
        title={line}
      >
        {line}
      </span>
    );
  }

  return (
    <span className={cn('text-2xs leading-tight text-muted-foreground', className)} title={line}>
      {line}
    </span>
  );
}
