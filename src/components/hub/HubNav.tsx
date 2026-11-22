import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  getActiveHubModule,
  HUB_MODULES,
  HUB_SECTIONS,
  type HubModule,
  type HubSectionId,
} from '@/config/hubModules';
import { Compass, LayoutDashboard, User, Users, type LucideIcon } from '@/components/icons';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SECTION_ICONS: Record<HubSectionId, LucideIcon> = {
  home: LayoutDashboard,
  community: Users,
  connect: Compass,
  personal: User,
};

/**
 * Shared Hub navigation, two levels deep. The top row is the four sections;
 * each opens its first page. The second row lists only the pages of the
 * section the URL is in. Showing all thirteen destinations in one scrolling
 * bar was too much to scan. The current section and page come from the URL.
 */
export function HubNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const navLabel = t('hub.nav', 'Hub sections');
  const activeModule = getActiveHubModule(pathname);
  const activeSection: HubSectionId = activeModule?.section ?? 'home';
  const sections = HUB_SECTIONS.map((section) => {
    const modules = HUB_MODULES.filter((module) => module.section === section.id);
    return {
      id: section.id,
      // Home has one page, so its tab reads as that page ("Overview").
      label:
        section.id === 'home'
          ? t(modules[0].labelKey, modules[0].defaultLabel)
          : section.labelKey
            ? t(section.labelKey, section.defaultLabel ?? '')
            : (section.defaultLabel ?? ''),
      to: modules[0].path,
      modules,
    };
  });
  const sectionModules = sections.find((s) => s.id === activeSection)?.modules ?? [];
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
      </>
    );
  };

  if (isMobile) return null;

  const pill =
    'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-element px-2.5 text-13 font-bold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

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
        <ul data-hub-sections="" className="m-0 flex min-w-max list-none gap-1 p-0">
          {sections.map(({ id, label, to }) => {
            const Icon = SECTION_ICONS[id];
            const active = id === activeSection;
            return (
              <li key={id}>
                <LocalizedLink
                  to={to}
                  // Overview is a page in its own right; the other tabs name
                  // the section the current page belongs to.
                  aria-current={active ? (id === 'home' ? 'page' : 'true') : undefined}
                  className={cn(
                    pill,
                    'px-4 text-15',
                    active
                      ? 'bg-card text-foreground shadow-soft'
                      : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{label}</span>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
        {sectionModules.length > 1 && (
          <ul data-hub-modules="" className="m-0 mt-2 flex min-w-max list-none gap-1 p-0">
            {sectionModules.map((module) => {
              const active = module === activeModule;
              return (
                <li key={module.id}>
                  <LocalizedLink
                    to={module.path}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      pill,
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
        )}
      </nav>
    </div>
  );
}
