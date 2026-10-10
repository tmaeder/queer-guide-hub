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
import { formatImageCredit, type ImageCreditParts } from '@/lib/imageCredit';

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
