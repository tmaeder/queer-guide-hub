import { cn } from '@/lib/utils';

/**
 * Affiliate disclosure, in three sizes.
 *
 * `strip` exists because the full statement's only placement on /marketplace
 * was at the very bottom of the page, BELOW an infinite virtualised grid — so
 * in practice it sat after several hundred monetised links, which is the one
 * position a disclosure cannot work from. The strip runs in the masthead,
 * before the first product.
 */
export function AffiliateDisclosure({
  compact = false,
  variant,
  className,
}: {
  compact?: boolean;
  /** `strip` — a one-line bordered band for the top of a page. */
  variant?: 'strip';
  className?: string;
}) {
  if (variant === 'strip') {
    return (
      <p
        role="note"
        aria-label="Affiliate disclosure"
        className={cn(
          'bg-muted rounded-element px-4 py-2 text-13 leading-relaxed text-muted-foreground',
          className,
        )}
      >
        Some product links here are affiliate links — we may earn a commission at no extra cost to
        you, and it keeps Queer Guide free.
      </p>
    );
  }
  if (compact) {
    return (
      <p className={cn('text-xs2 text-muted-foreground/80 leading-relaxed', className)}>
        Some links are affiliate links. We may earn a commission at no extra cost to you.
      </p>
    );
  }
  return (
    <aside
      role="note"
      aria-label="Affiliate disclosure"
      className={cn('text-xs text-muted-foreground leading-relaxed', className)}
    >
      <p className="font-bold uppercase tracking-label text-muted-foreground mb-1">
        Affiliate disclosure
      </p>
      <p>
        Some product links on this page are affiliate links. When you buy through them we may earn a
        commission at no extra cost to you. We only list products that pass our LGBTQ+ relevance
        review. Commissions help keep Queer Guide free and independent.
      </p>
    </aside>
  );
}
