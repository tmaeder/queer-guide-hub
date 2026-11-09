import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { PageContainer } from '@/components/layout/PageContainer';
import { HeroSearch } from './HeroSearch';
import { HomeCityFeature } from './HomeCityFeature';

const discoveryLinks = [
  {
    to: '/venues',
    icon: 'after-dark',
    label: 'home.discovery.places',
    fallback: 'Browse places',
  },
  {
    to: '/events',
    icon: 'events',
    label: 'home.discovery.events',
    fallback: 'Find events',
  },
  {
    to: '/map',
    icon: 'map',
    label: 'home.discovery.openMap',
    fallback: 'Open the map',
  },
] as const;

export function SubwayHero() {
  const { t } = useTranslation();

  return (
    <header className="subway-hero">
      <PageContainer
        flush
        className="grid items-center gap-6 py-6 sm:py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:py-12"
      >
        <div className="min-w-0">
          <h1 className="max-w-[17ch] break-words font-display [font-size:clamp(2rem,9vw,3.25rem)] leading-[1.03] sm:text-display lg:text-hero rtl:font-sans rtl:font-bold">
            {t('home.discovery.title', 'Find queer places and events')}
          </h1>
          <p className="mt-4 max-w-[48ch] text-pretty text-15 text-muted-foreground sm:text-body-lg">
            {t(
              'home.discovery.subtitle',
              'Bars, cafés, community spaces and upcoming events near home or at your destination.',
            )}
          </p>
          <div className="mt-4 sm:mt-6">
            <HeroSearch />
          </div>
          <nav
            aria-label={t('home.discovery.navigation', 'Find places and events')}
            className="mt-2"
          >
            <ul className="grid grid-cols-3 gap-x-2 sm:flex sm:flex-wrap sm:gap-x-6">
              {discoveryLinks.map(({ to, icon, label, fallback }) => (
                <li key={to}>
                  <LocalizedLink
                    to={to}
                    className="inline-flex min-h-11 items-center gap-1 text-13 font-bold no-underline underline-offset-4 hover:underline sm:gap-1.5"
                  >
                    <TransitIcon name={icon} size={16} className="shrink-0" />
                    <span className="min-w-0 break-words">{t(label, fallback)}</span>
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <HomeCityFeature />
      </PageContainer>
    </header>
  );
}
