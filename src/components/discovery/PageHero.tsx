import * as React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SpotlightV2 } from '@/components/effects/SpotlightV2';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';

interface CTA {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

interface PageHeroProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  primaryCta?: CTA;
  secondaryCta?: CTA;
  effect?: 'none' | 'spotlight';
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg';
  /** Skip the page gutter + cap because a parent PageContainer already applies
   *  them (IntentPageLayout renders the hero inside EditorialDetailLayout).
   *  Nesting two containers doubles the gutter. */
  bare?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const PRIMARY_CLASSES =
  'inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-sm font-bold tracking-tight text-background transition-opacity duration-normal hover:opacity-90 no-underline';

const SECONDARY_CLASSES =
  'inline-flex items-center gap-2 rounded-full border border-border-hairline px-8 py-4 text-sm font-bold tracking-tight text-foreground hover:bg-foreground hover:text-background transition-colors no-underline';

function CtaButton({ cta, primary }: { cta: CTA; primary: boolean }) {
  const cls = primary ? PRIMARY_CLASSES : SECONDARY_CLASSES;
  // Inline color is a defensive override: in some build/cascade orderings the
  // anchor color from the global :where(a) reset wins over the Tailwind
  // `text-background` utility, leaving the primary CTA's label invisible
  // against the dark pill. Inline style has the highest non-!important
  // specificity and guarantees the contrast that screen-readers already see.
  const style = primary ? { color: 'hsl(var(--background))' } : undefined;
  if (cta.href) {
    return (
      <LocalizedLink to={cta.href} className={cls} style={style}>
        {cta.icon}
        {cta.label}
      </LocalizedLink>
    );
  }
  return (
    <button type="button" onClick={cta.onClick} className={cls} style={style}>
      {cta.icon}
      {cta.label}
    </button>
  );
}

/** Stand-in for PageContainer when the hero is nested inside one already. */
const PlainFrame = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => <div className={className}>{children}</div>;

const SIZE_PADDING: Record<NonNullable<PageHeroProps['size']>, string> = {
  sm: 'py-12 md:py-16',
  md: 'py-16 md:py-24',
  lg: 'py-20 md:py-28 lg:py-36',
};

const SIZE_TITLE: Record<NonNullable<PageHeroProps['size']>, string> = {
  sm: 'text-headline md:text-display',
  md: 'text-display md:text-hero',
  lg: 'text-hero md:text-hero-xl',
};

export function PageHero({
  eyebrow,
  title,
  lede,
  primaryCta,
  secondaryCta,
  effect = 'spotlight',
  align = 'left',
  size = 'lg',
  bare = false,
  className,
  children,
}: PageHeroProps) {
  const Frame = bare ? PlainFrame : PageContainer;

  return (
    <section className={cn('relative isolate overflow-hidden bg-background', className)}>
      {effect === 'spotlight' && <SpotlightV2 anchor="top-center" intensity={0.14} />}

      {/* `flush` — the hero keeps its own size-keyed vertical scale (SIZE_PADDING);
          only the gutter and the content cap come from the page standard.
          `bare` swaps the container for a plain div: overriding it with
          `px-0` would not work, because tailwind-merge drops the base `px-4`
          but leaves `sm:px-6 md:px-8` standing (different modifiers, different
          merge keys), so the gutter would silently come back at ≥640px. */}
      <Frame
        {...(bare ? {} : { flush: true })}
        className={cn('relative', SIZE_PADDING[size], align === 'center' && 'text-center')}
      >
        {eyebrow && <Eyebrow as="div">{eyebrow}</Eyebrow>}
        <h1
          className={cn(
            'mt-4 font-bold tracking-tight leading-[0.95] text-foreground',
            SIZE_TITLE[size],
          )}
        >
          {title}
        </h1>
        {lede && (
          <p
            className={cn(
              'mt-6 text-base md:text-lg text-muted-foreground',
              align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-2xl',
            )}
          >
            {lede}
          </p>
        )}

        {(primaryCta || secondaryCta) && (
          <div className={cn('mt-8 flex flex-wrap gap-4', align === 'center' && 'justify-center')}>
            {primaryCta && <CtaButton cta={primaryCta} primary />}
            {secondaryCta && <CtaButton cta={secondaryCta} primary={false} />}
          </div>
        )}

        {children && <div className="mt-10">{children}</div>}
      </Frame>
    </section>
  );
}
