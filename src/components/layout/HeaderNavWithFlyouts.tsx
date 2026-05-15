import { useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface NavLink {
  to: string;
  labelKey: string;
  flyout?: { to: string; labelKey: string; description?: string }[];
}

const NAV: NavLink[] = [
  {
    to: '/venues',
    labelKey: 'header.nav.venues',
    flyout: [
      { to: '/venues?category=bar', labelKey: 'header.flyout.venues.bars' },
      { to: '/venues?category=club', labelKey: 'header.flyout.venues.clubs' },
      { to: '/venues?category=sauna', labelKey: 'header.flyout.venues.saunas' },
      { to: '/venues?category=restaurant', labelKey: 'header.flyout.venues.restaurants' },
      { to: '/venues?category=community', labelKey: 'header.flyout.venues.community' },
      { to: '/map', labelKey: 'header.flyout.venues.map' },
    ],
  },
  {
    to: '/events',
    labelKey: 'header.nav.events',
    flyout: [
      { to: '/events?date=this-week', labelKey: 'header.flyout.events.thisWeek' },
      { to: '/events?date=this-month', labelKey: 'header.flyout.events.thisMonth' },
      { to: '/events?type=festival', labelKey: 'header.flyout.events.festivals' },
      { to: '/events?type=party', labelKey: 'header.flyout.events.parties' },
    ],
  },
  { to: '/news', labelKey: 'header.nav.news' },
  {
    to: '/marketplace',
    labelKey: 'header.nav.marketplace',
    flyout: [
      { to: '/marketplace?tab=products', labelKey: 'header.flyout.marketplace.products' },
      { to: '/marketplace?tab=services', labelKey: 'header.flyout.marketplace.services' },
      { to: '/marketplace/share', labelKey: 'header.flyout.marketplace.share' },
    ],
  },
  { to: '/hotels', labelKey: 'header.nav.hotels' },
  {
    to: '/travel',
    labelKey: 'header.nav.travel',
    flyout: [
      { to: '/trips', labelKey: 'header.flyout.travel.trips' },
      { to: '/help', labelKey: 'header.flyout.travel.help' },
      { to: '/places', labelKey: 'header.flyout.travel.places' },
    ],
  },
  { to: '/groups', labelKey: 'header.nav.groups' },
  { to: '/resources', labelKey: 'header.nav.resources' },
];

interface HeaderNavWithFlyoutsProps {
  pathname: string;
}

/**
 * Aceternity-style hover-dropdown nav row. Hovering a top-level link with
 * a `flyout` reveals an animated panel below with sub-routes. Plain links
 * keep their behaviour; underline animates in via shared layoutId.
 */
export function HeaderNavWithFlyouts({ pathname }: HeaderNavWithFlyoutsProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav
      aria-label={t('header.primaryNav', 'Primary navigation')}
      className="hidden md:flex items-center gap-1 relative"
      onMouseLeave={() => setHovered(null)}
    >
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const isHovered = hovered === item.to;
        return (
          <div
            key={item.to}
            className="relative"
            onMouseEnter={() => setHovered(item.to)}
          >
            <Link
              to={item.to}
              className={cn(
                'relative inline-flex items-center px-3 py-2 text-sm transition-colors',
                active ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="relative">
                {t(item.labelKey)}
                {(active || isHovered) && (
                  <motion.span
                    layoutId="header-nav-underline"
                    className="absolute -bottom-1 inset-x-0 h-0.5 bg-foreground rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </span>
            </Link>

            <AnimatePresence>
              {isHovered && item.flyout && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+0.5rem)] z-50 min-w-[14rem] rounded-container border border-border/60 bg-background/95 backdrop-blur-md shadow-[var(--shadow-aceternity)] p-2"
                >
                  {item.flyout.map((sub) => (
                    <Link
                      key={sub.to}
                      to={sub.to}
                      className="block rounded-element px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                    >
                      {t(sub.labelKey, sub.labelKey.split('.').pop())}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}
