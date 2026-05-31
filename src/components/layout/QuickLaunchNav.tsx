import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NAV_CLUSTERS, DESTINATIONS } from '@/config/navigation';

/**
 * Thin grouped quick-launch row (desktop row 2). Replaces the 5-tab primary
 * nav + "More" dropdown with the 14 destinations organized into labeled
 * clusters. Every destination is a real crawlable <Link> for SEO; the cluster
 * labels are non-interactive scanning aids.
 */
export function QuickLaunchNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const path = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
  const isActive = (to: string) => (to === '/' ? path === '/' : path.startsWith(to));

  return (
    <nav
      className="flex items-center gap-6 overflow-x-auto"
      style={{ height: 40 }}
      aria-label={t('header.primaryNav', 'Primary')}
    >
      {NAV_CLUSTERS.map((cluster) => {
        const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
        if (items.length === 0) return null;
        return (
          <div key={cluster.id} className="flex shrink-0 items-center gap-3">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(cluster.labelKey)}
            </span>
            {items.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`whitespace-nowrap py-2 text-sm transition-colors ${
                    active
                      ? 'font-semibold text-foreground underline underline-offset-8 decoration-2'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={{ textDecoration: active ? 'underline' : 'none' }}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
