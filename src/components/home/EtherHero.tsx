import { useTranslation } from 'react-i18next';
import { MapTrifold, CalendarDots, Buildings, UsersThree } from '@phosphor-icons/react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EtherSection, GlassCard, MagneticCTA } from '@/components/ui/glass';
import { useAuth } from '@/hooks/useAuth';

const ENTRY_POINTS = [
  { to: '/venues', Icon: MapTrifold, key: 'home.ether.venues', fallback: 'Venues' },
  { to: '/events', Icon: CalendarDots, key: 'home.ether.events', fallback: 'Events' },
  { to: '/places', Icon: Buildings, key: 'home.ether.places', fallback: 'Cities' },
  { to: '/community', Icon: UsersThree, key: 'home.ether.community', fallback: 'Community' },
] as const;

/**
 * Ethereal Glass landing hero — the reskin's north star. OLED mesh canvas,
 * mega Clash Display headline, glass-bento entry points, magnetic CTAs.
 */
export function EtherHero() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <EtherSection className="flex min-h-[100dvh] flex-col justify-center px-4 py-28 sm:px-6 md:px-8 md:py-40">
      <div className="mx-auto w-full max-w-6xl">
        <span className="ether-eyebrow">
          {t('home.ether.eyebrow', 'Queer Guide — Worldwide')}
        </span>

        <h1 className="mt-8 max-w-4xl font-display text-display font-semibold leading-[0.98] tracking-[-0.04em] text-white sm:text-hero lg:text-hero-xl">
          {t('home.ether.headline', 'Queer venues, events, and the people behind them.')}
        </h1>

        <p className="mt-8 max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
          {t(
            'home.ether.subtitle',
            'Verified safe places and real events, mapped across the world — built by the community, for the community.',
          )}
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <MagneticCTA to="/map" solid>
            {t('home.ether.exploreMap', 'Explore the map')}
          </MagneticCTA>
          <MagneticCTA to={user ? '/submit' : '/auth?mode=signup'}>
            {user
              ? t('home.ether.addVenue', 'Add a place')
              : t('home.ether.join', 'Join the community')}
          </MagneticCTA>
        </div>

        {/* Glass-bento entry points */}
        <div className="mt-20 grid grid-cols-2 gap-4 md:grid-cols-4">
          {ENTRY_POINTS.map(({ to, Icon, key, fallback }) => (
            <LocalizedLink key={to} to={to} className="group no-underline">
              <GlassCard
                coreClassName="flex flex-col gap-6 p-6 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-1"
                className="transition-colors duration-500 hover:border-white/16"
              >
                <Icon weight="light" className="h-7 w-7 text-white/80" />
                <span className="text-15 font-medium text-white/90">{t(key, fallback)}</span>
              </GlassCard>
            </LocalizedLink>
          ))}
        </div>
      </div>
    </EtherSection>
  );
}
