import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { PageContainer } from '@/components/layout/PageContainer';
import { HeroSearch } from './HeroSearch';

const discoveryLinks = [
  {
    to: '/venues',
    icon: 'after-dark',
    label: 'home.discovery.places',
    fallback: 'Browse places',
    track: 'bg-track-pink',
  },
  {
    to: '/events',
    icon: 'events',
    label: 'home.discovery.events',
    fallback: 'Find events',
    track: 'bg-track-yellow',
  },
  {
    to: '/map',
    icon: 'map',
    label: 'home.discovery.openMap',
    fallback: 'Open the map',
    track: 'bg-track-blue',
  },
] as const;

export function SubwayHero() {
  const { t } = useTranslation();

  return (
    <header className="subway-hero">
      <PageContainer
        flush
        className="grid items-center gap-6 py-8 md:gap-8 md:py-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12"
      >
        <div className="min-w-0">
          <h1 className="max-w-[19ch] break-words text-balance font-display [font-size:clamp(2rem,10.4vw,3.25rem)] leading-tight sm:text-display lg:text-hero rtl:font-sans rtl:font-bold">
            {t('home.discovery.title', 'Find queer places and events')}
          </h1>
          <p className="mt-4 max-w-[48ch] text-pretty text-body-lg text-muted-foreground">
            {t(
              'home.discovery.subtitle',
              'Bars, cafés, community spaces and upcoming events near home or at your destination.',
            )}
          </p>
          <div className="mt-6">
            <HeroSearch />
          </div>
        </div>
        <nav
          aria-label={t('home.discovery.navigation', 'Find places and events')}
          className="min-w-0 rounded-panel bg-surface-container p-2"
        >
          <ul className="relative m-0 list-none p-0 before:pointer-events-none before:absolute before:inset-y-6 before:start-[19px] before:w-px before:bg-muted-foreground/50 md:before:inset-y-[28px] md:before:start-[27px]">
            {discoveryLinks.map(({ to, icon, label, fallback, track }) => (
              <li key={to}>
                <LocalizedLink
                  to={to}
                  className="flex min-h-12 items-center gap-4 rounded-element px-4 py-2 font-bold no-underline hover:bg-background focus-visible:-outline-offset-2 md:min-h-14 md:px-6"
                >
                  <span
                    className={`relative h-2 w-2 shrink-0 rounded-full ${track}`}
                    aria-hidden="true"
                  />
                  <TransitIcon name={icon} size={24} className="shrink-0" />
                  <span className="min-w-0 flex-1 break-words">{t(label, fallback)}</span>
                  <TransitIcon name="arrow-right" size={20} className="shrink-0 rtl:rotate-180" />
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </nav>
      </PageContainer>
    </header>
  );
}
