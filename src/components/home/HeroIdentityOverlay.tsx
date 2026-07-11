import * as React from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useCountUp } from '@/hooks/useCountUp';
import { useMotionTokens } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface HeroIdentityOverlayProps {
  /** 'overlay' floats over the map (desktop); 'band' renders in normal flow above it (mobile). */
  variant: 'overlay' | 'band';
  /** Overlay only: fade out after the first map interaction (stays in the DOM for SEO). */
  dimmed?: boolean;
}

function StatChip({
  value,
  labelKey,
  fallback,
}: {
  value: number;
  labelKey: string;
  fallback: string;
}) {
  const { t, i18n } = useTranslation();
  const shown = useCountUp(value);
  const formatted = new Intl.NumberFormat(i18n.language).format(shown);
  return (
    <Badge variant="outline" className="pointer-events-none tabular-nums whitespace-nowrap">
      {t(labelKey, { defaultValue: fallback, n: formatted })}
    </Badge>
  );
}

/**
 * The homepage masthead: the site's identity statement + live proof numbers,
 * layered over (desktop) or above (mobile) the hero map. Headline lines sit on
 * translucent plates so they stay readable over any basemap in both themes.
 * The h1 is always in the DOM (SEO); the overlay variant only fades on
 * interaction, never unmounts.
 */
export function HeroIdentityOverlay({ variant, dimmed = false }: HeroIdentityOverlayProps) {
  const { t } = useTranslation();
  const { stats } = useConsolidatedStats();
  const { tweens, reduced } = useMotionTokens();

  const chips: React.ReactNode[] = [];
  if (stats.venues) {
    chips.push(
      <StatChip key="places" value={stats.venues} labelKey="home.hero.stats.places" fallback="{{n}} places" />,
    );
  }
  if (stats.events) {
    chips.push(
      <StatChip key="events" value={stats.events} labelKey="home.hero.stats.events" fallback="{{n}} events" />,
    );
  }
  if (stats.cities) {
    chips.push(
      <StatChip key="cities" value={stats.cities} labelKey="home.hero.stats.cities" fallback="{{n}} cities" />,
    );
  }

  const isOverlay = variant === 'overlay';
  const plate = isOverlay
    ? 'w-fit bg-background/85 backdrop-blur-sm rounded-container px-4 py-2'
    : undefined;

  const heading = (
    <h1
      className={cn(
        'font-bold tracking-tight',
        isOverlay ? 'text-display xl:text-hero flex flex-col items-start gap-1' : 'text-display',
      )}
      style={{ letterSpacing: '-0.035em' }}
    >
      {isOverlay ? (
        <>
          <span className={plate}>{t('home.heroLine1', 'Queer venues,')}</span>
          <span className={plate}>{t('home.heroLine2', 'events, and people.')}</span>
          <span className={plate}>{t('home.heroLine3', 'Worldwide.')}</span>
        </>
      ) : (
        <>
          {t('home.heroLine1', 'Queer venues,')} {t('home.heroLine2', 'events, and people.')}{' '}
          {t('home.heroLine3', 'Worldwide.')}
        </>
      )}
    </h1>
  );

  const subtitle = (
    <p className={cn('text-15 text-muted-foreground', isOverlay && plate, isOverlay && 'mt-2')}>
      {t('home.subtitleShort', 'Verified safe places, real events, and the people behind them.')}
    </p>
  );

  const chipRow = (chips.length > 0 || isOverlay) && (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {chips}
      {isOverlay && (
        <LocalizedLink
          to="/map"
          className="pointer-events-auto inline-flex min-h-[44px] items-center gap-1 rounded-element bg-foreground px-4 py-2 text-13 font-semibold text-background no-underline transition-opacity hover:opacity-90"
        >
          {t('home.hero.invite', 'Open the map')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        </LocalizedLink>
      )}
    </div>
  );

  if (!isOverlay) {
    return (
      <div className="px-4 py-6 sm:px-6">
        {heading}
        {subtitle}
        {chipRow}
      </div>
    );
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: dimmed ? 0 : 1, y: dimmed ? 8 : 0 }}
      transition={
        reduced ? { duration: 0 } : dimmed ? tweens.normal : { ...tweens.reveal, delay: 0.2 }
      }
      className="pointer-events-none absolute z-10 max-w-xl start-4 md:start-8 top-24"
      aria-hidden={dimmed || undefined}
    >
      {heading}
      {subtitle}
      {chipRow}
    </motion.div>
  );
}
