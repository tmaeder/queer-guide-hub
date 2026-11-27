import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { PageContainer } from '@/components/layout/PageContainer';
import { HeroSearch } from './HeroSearch';
import { HomeCityFeature } from './HomeCityFeature';

const discoveryLinks = [
  {
    to: '/venues',
    icon: 'near-you',
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
            className="mt-4"
          >
            <ul className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {discoveryLinks.map(({ to, icon, label, fallback }) => (
                <li key={to} className="min-w-0">
                  <LocalizedLink
                    to={to}
                    className="flex h-full min-h-11 flex-col items-center justify-center gap-2 rounded-element bg-card px-2 py-1.5 text-center text-13 font-bold no-underline shadow-soft transition-colors hover:bg-foreground hover:text-background sm:flex-row sm:justify-start sm:px-4 sm:text-left"
                  >
                    <TransitIcon name={icon} size={20} className="shrink-0" />
                    <span className="min-w-0 break-words leading-tight">{t(label, fallback)}</span>
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
