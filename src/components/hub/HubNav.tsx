import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { getActiveHubModule, HUB_MODULES } from '@/config/hubModules';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Shared Hub navigation: one tab row of the member's own pages (Today, Plans,
 * Saved, Friends, Feed, Progress). Public discovery lives in Meet, so there is
 * no second row. The current tab comes from the URL.
 */
export function HubNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const navLabel = t('hub.nav', 'Hub sections');
  const activeModule = getActiveHubModule(pathname);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = navRef.current;
    const link = rail?.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    if (!rail || !link) return;
    const railBounds = rail.getBoundingClientRect();
    const linkBounds = link.getBoundingClientRect();
    // Reveal the active destination without moving the document or header.
    if (linkBounds.right > railBounds.right) {
      rail.scrollLeft += linkBounds.right - railBounds.right;
    } else if (linkBounds.left < railBounds.left) {
      rail.scrollLeft += linkBounds.left - railBounds.left;
    }
  }, [pathname, isMobile]);

  if (isMobile) return null;

  const pill =
    'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-element px-4 text-15 font-bold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

  return (
    <div className={cn('flex min-w-0 items-center gap-4', className)}>
      {/* `data-hub-nav` is the stable hook for e2e: the aria-label comes from
          i18n, and no single link appears on every route any more. */}
      <nav
        ref={navRef}
        aria-label={navLabel}
        data-hub-nav=""
        className="min-w-0 flex-1 overflow-x-auto rounded-container bg-surface-container p-2 [scrollbar-width:thin]"
      >
        <ul data-hub-modules="" className="m-0 flex min-w-max list-none gap-1 p-0">
          {HUB_MODULES.map((module) => {
            const Icon = module.icon;
            const active = module === activeModule;
            return (
              <li key={module.id}>
                <LocalizedLink
                  to={module.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    pill,
                    active
                      ? 'bg-card text-foreground shadow-soft'
                      : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{t(module.labelKey, module.defaultLabel)}</span>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
