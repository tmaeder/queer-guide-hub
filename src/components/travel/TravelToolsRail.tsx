import { useTranslation } from 'react-i18next';
import { Scale, CalendarHeart, Sparkles, ArrowRight, type LucideIcon } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface Tile {
  kicker: string;
  title: string;
  body: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Editorial tool tiles for /travel v2 hub — three named entry points to
 * surfaces that already exist (Cities directory, Events filtered to Pride,
 * Countries sorted by equality score). No data fetches, no images,
 * no curation pipeline — pure monochrome opinionated navigation.
 * Lives between BecauseYouRail and the seasonal PrideScroller.
 */
export function TravelToolsRail() {
  const { t } = useTranslation();
  const tiles: Tile[] = [
    {
      kicker: t('travel.tools.compare.kicker', 'Tool'),
      title: t('travel.tools.compare.title', 'Compare cities'),
      body: t(
        'travel.tools.compare.body',
        'Stack two destinations side by side — equality score, climate, scene, getting around.',
      ),
      href: '/cities?compare=1',
      icon: Scale,
    },
    {
      kicker: t('travel.tools.pride.kicker', 'In season'),
      title: t('travel.tools.pride.title', 'Pride this quarter'),
      body: t(
        'travel.tools.pride.body',
        'Every Pride event within the next 90 days, mapped to destinations and dated.',
      ),
      href: '/events?type=pride',
      icon: CalendarHeart,
    },
    {
      kicker: t('travel.tools.equality.kicker', 'Curated'),
      title: t('travel.tools.equality.title', 'Most equality-forward'),
      body: t(
        'travel.tools.equality.body',
        'Countries with the strongest legal and social protections, ranked.',
      ),
      href: '/users?sort=equality',
      icon: Sparkles,
    },
  ];

  return (
    <section aria-labelledby="travel-tools-rail-heading" className="mb-12">
      <header className="mb-4">
        <p className="mb-1 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
          {t('travel.tools.kicker', 'Built for you')}
        </p>
        <h2 id="travel-tools-rail-heading" className="text-headline font-bold tracking-tight">
          {t('travel.tools.heading', 'Travel tools')}
        </h2>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <LocalizedLink
              key={tile.href}
              to={tile.href}
              className="group flex h-full flex-col gap-4 rounded-container border bg-background p-6 no-underline transition-colors hover:border-foreground/40"
            >
              <Icon size={24} className="shrink-0 text-foreground" aria-hidden />
              <div className="flex flex-1 flex-col gap-2">
                <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                  {tile.kicker}
                </p>
                <h3 className="text-title font-bold leading-tight text-foreground">{tile.title}</h3>
                <p className="text-13 leading-relaxed text-muted-foreground">{tile.body}</p>
              </div>
              <span className="inline-flex items-center gap-2 text-13 font-medium text-foreground">
                {t('travel.tools.open', 'Open')}
                <ArrowRight
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
