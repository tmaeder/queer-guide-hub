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
    <header className="subway-hero relative border-b border-border-hairline">
      <PageContainer
        flush
        className="grid items-end gap-6 py-8 md:gap-8 md:py-12 lg:grid-cols-[3fr_2fr] lg:gap-16"
      >
        <div className="min-w-0">
          <h1 className="max-w-[19ch] break-words text-balance font-display text-headline sm:text-display lg:text-hero xl:text-hero-xl rtl:font-sans rtl:font-bold">
            {t('home.discovery.title', 'Find queer places and events')}
          </h1>
          <p className="mt-4 max-w-[48ch] text-pretty text-body-lg">
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
          className="min-w-0"
        >
          <ul className="relative m-0 list-none border-t border-border-hairline p-0 before:pointer-events-none before:absolute before:inset-y-6 md:before:inset-y-8 before:start-[11px] before:w-px before:bg-border md:before:start-[19px]">
            {discoveryLinks.map(({ to, icon, label, fallback, track }) => (
              <li key={to} className="border-b border-border-hairline">
                <LocalizedLink
                  to={to}
                  className="flex min-h-12 items-center md:min-h-14 gap-4 px-2 py-2 font-bold no-underline hover:bg-surface-container focus-visible:-outline-offset-2 md:px-4"
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
