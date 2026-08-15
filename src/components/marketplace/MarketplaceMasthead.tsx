import type { ReactNode } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { MarketplaceLineArt } from './MarketplaceLineArt';

interface MarketplaceMastheadProps {
  /** Uppercase kicker, e.g. `Marketplace · Yellow line`. */
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  /**
   * The count row. ALWAYS rendered when the surface HAS a count, even while
   * loading or at zero — pass "Counting…" rather than omitting it.
   *
   * Required-but-nullable on purpose: `null` is a decision ("this surface has
   * no count"), where an optional prop would let one be forgotten. See the
   * anti-flip note below for why that distinction earns its keep.
   */
  count: ReactNode | null;
  actions?: ReactNode;
  /**
   * `hub` is the rank-1 flat `text-hero` used by /marketplace and /brands.
   * `page` steps down for the secondary surfaces hanging off them, so a
   * category never shouts as loudly as the index that lists it.
   */
  size?: 'hub' | 'page';
  /** Optional "back up one level" link rendered above the bullet. */
  backTo?: { label: string; to: string };
  /** Extra content below the actions (affiliate disclosure, filters…). */
  children?: ReactNode;
}

/**
 * The masthead every marketplace list surface opens with.
 *
 * Extracted from /marketplace when the makers directory arrived, because the
 * hub and the directory are two views of one line and had started to drift —
 * different bullet sizes, different eyebrow casing, one with the line device
 * and one without. One component means the family cannot drift again.
 *
 * THE COUNT ROW IS UNCONDITIONAL, and that is a contract rather than a
 * preference. It was once `{total > 0 && …}`, so filtering down to zero
 * unmounted a masthead row and shifted the sticky control band up under the
 * reader's finger — the precise failure the rest of this page is built to
 * prevent. The prop is `ReactNode` and not `number` so a caller physically
 * cannot express "no row"; a loading caller passes "Counting…".
 *
 * The yellow swatch is the one place these pages name their track. Border-gated
 * (yellow measures under 3:1 against paper), fill-only, never on text.
 */
export function MarketplaceMasthead({
  eyebrow,
  title,
  lede,
  count,
  actions,
  size = 'hub',
  backTo,
  children,
}: MarketplaceMastheadProps) {
  return (
    <header className="border-b-4 border-foreground">
      <PageContainer flush className="pb-8 pt-8 md:pb-12 md:pt-16">
        {backTo && (
          <LocalizedLink
            to={backTo.to}
            className="mb-6 inline-block text-13 font-bold no-underline hover:underline"
          >
            ← {backTo.label}
          </LocalizedLink>
        )}
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <RouteBullet type="marketplace" size={44} />
              <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                {eyebrow}
              </p>
            </div>
            {/* `text-hero` flat, no md:text-hero-xl — that rank is for
                marketing covers, not a listing index. */}
            <h1
              className={cn(
                'mt-4 font-display leading-[0.95]',
                size === 'hub' ? 'text-hero' : 'text-display md:text-hero',
              )}
            >
              {title}
            </h1>
            {lede && <p className="mt-4 max-w-reading text-body-lg">{lede}</p>}
            {count !== null && (
              <p className="mt-6 flex items-center gap-4 text-13 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-10 shrink-0 border border-foreground bg-track-yellow"
                />
                <span className="tabular-nums">{count}</span>
              </p>
            )}
          </div>
          {/* Decorative, and last in the DOM so a screen reader reaches the
              lede and the count before anything ornamental. */}
          <MarketplaceLineArt className="hidden md:block" />
        </div>
        {actions && <div className="mt-8 flex flex-wrap items-center gap-4">{actions}</div>}
        {children}
      </PageContainer>
    </header>
  );
}
