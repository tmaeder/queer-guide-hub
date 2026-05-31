import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PRIMARY_NAV } from '@/config/navigation';

/**
 * Primary desktop nav (header row 2). A calm row of the high-traffic
 * destinations only — the full set, grouped by cluster, lives in the search
 * hub, and every route is pre-rendered for SEO (see scripts/prerender.mjs).
 * Real crawlable <Link>s.
 */
export function QuickLaunchNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const path = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
  const isActive = (to: string) => (to === '/' ? path === '/' : path.startsWith(to));

  return (
    <nav
      className="flex items-center gap-8"
      style={{ height: 40 }}
      aria-label={t('header.primaryNav', 'Primary')}
    >
      {PRIMARY_NAV.map((item) => {
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap text-sm transition-colors ${
              active
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
