import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HubIdentityBlock } from '@/components/hub/HubIdentityBlock';
import { getActiveHubModule, HUB_MODULES, HUB_SECTIONS, type HubModule } from '@/config/hubModules';
import { useInboxUnreadCount } from '@/hooks/useInboxFeed';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/** Shared Hub destinations with the current module derived from the URL. */
export function HubNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const unreadCount = useInboxUnreadCount();
  const isMobile = useIsMobile();
  const navLabel = t('hub.nav', 'Hub sections');
  const activeModule = getActiveHubModule(pathname);
  const sections = HUB_SECTIONS.map((section) => ({
    id: section.id,
    label: section.labelKey
      ? t(section.labelKey, section.defaultLabel ?? '')
      : section.defaultLabel,
    modules: HUB_MODULES.filter((module) => module.section === section.id),
  }));
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

  const moduleLabel = (module: HubModule) => {
    const Icon = module.icon;
    return (
      <>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{t(module.labelKey, module.defaultLabel)}</span>
        {module.badge === 'unread' && unreadCount > 0 && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-2xs font-semibold text-foreground"
            aria-label={t('header.mobileNav.unreadCount', '{{count}} unread', {
              count: unreadCount,
            })}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </>
    );
  };

  if (isMobile) return null;

  return (
    <div className={cn('flex min-w-0 items-center gap-4', className)}>
      <nav
        ref={navRef}
        aria-label={navLabel}
        className="min-w-0 flex-1 overflow-x-auto rounded-container bg-surface-container [scrollbar-width:thin]"
      >
        <div className="flex min-w-max items-end p-2">
          {sections.map(({ id, label, modules }) => (
            <div
              key={id}
              className="shrink-0 border-s border-border-hairline px-2 first:border-s-0 first:ps-0 last:pe-0"
            >
              {label && (
                <p className="mb-1 px-2.5 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {label}
                </p>
              )}
              <ul className="m-0 flex list-none p-0">
                {modules.map((module) => {
                  const active = module === activeModule;
                  return (
                    <li key={module.id}>
                      <LocalizedLink
                        to={module.path}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-element px-2.5 text-13 font-bold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                          active
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                        )}
                      >
                        {moduleLabel(module)}
                      </LocalizedLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="hidden max-w-48 shrink-0 md:block md:empty:hidden">
        <HubIdentityBlock />
      </div>
    </div>
  );
}
