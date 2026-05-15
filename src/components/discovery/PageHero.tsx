import * as React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SpotlightV2 } from '@/components/effects/SpotlightV2';
import { cn } from '@/lib/utils';

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
  className?: string;
  children?: React.ReactNode;
}

const PRIMARY_CLASSES =
  'inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-4 text-sm font-extrabold tracking-tight text-background transition-transform duration-300 hover:-translate-y-0.5 no-underline';

const SECONDARY_CLASSES =
  'inline-flex items-center gap-2 rounded-full border border-foreground px-7 py-4 text-sm font-extrabold tracking-tight text-foreground hover:bg-foreground hover:text-background transition-colors no-underline';

function CtaButton({ cta, primary }: { cta: CTA; primary: boolean }) {
  const cls = primary ? PRIMARY_CLASSES : SECONDARY_CLASSES;
  if (cta.href) {
    return (
      <LocalizedLink to={cta.href} className={cls}>
        {cta.icon}
        {cta.label}
      </LocalizedLink>
    );
  }
  return (
    <button type="button" onClick={cta.onClick} className={cls}>
      {cta.icon}
      {cta.label}
    </button>
  );
}

const SIZE_PADDING: Record<NonNullable<PageHeroProps['size']>, string> = {
  sm: 'py-12 md:py-16',
  md: 'py-16 md:py-24',
  lg: 'py-20 md:py-28 lg:py-36',
};

const SIZE_TITLE: Record<NonNullable<PageHeroProps['size']>, string> = {
  sm: 'text-4xl md:text-5xl lg:text-6xl',
  md: 'text-5xl md:text-6xl lg:text-7xl',
  lg: 'text-5xl md:text-7xl lg:text-8xl',
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
  className,
  children,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden border-b border-border bg-background',
        className,
      )}
    >
      {effect === 'spotlight' && <SpotlightV2 anchor="top-center" intensity={0.14} />}

      <div
        className={cn(
          'relative mx-auto max-w-7xl px-6',
          SIZE_PADDING[size],
          align === 'center' && 'text-center',
        )}
      >
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1
          className={cn(
            'mt-4 font-extrabold tracking-tight leading-[0.95] text-foreground',
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
          <div
            className={cn(
              'mt-8 flex flex-wrap gap-3',
              align === 'center' && 'justify-center',
            )}
          >
            {primaryCta && <CtaButton cta={primaryCta} primary />}
            {secondaryCta && <CtaButton cta={secondaryCta} primary={false} />}
          </div>
        )}

        {children && <div className="mt-10">{children}</div>}
      </div>
    </section>
  );
}
