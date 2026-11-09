import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HubIdentityBlock } from '@/components/hub/HubIdentityBlock';
import { Check, ChevronDown } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HUB_MODULES, HUB_SECTIONS, type HubModule } from '@/config/hubModules';
import { useInboxUnreadCount } from '@/hooks/useInboxFeed';
import { useIsMobile } from '@/hooks/use-mobile';
import { isRtlLocale, stripLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { trimTrailingSlashes } from '@/lib/trimTrailingSlashes';

function isCurrent(pathname: string, module: HubModule) {
  if (module.id === 'overview') return pathname === '/hub';
  return pathname === module.path || pathname.startsWith(`${module.path}/`);
}

/** Shared Hub destinations with the current module derived from the URL. */
export function HubNav({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const pathname = trimTrailingSlashes(stripLocale(location.pathname)) || '/';
  const unreadCount = useInboxUnreadCount();
  const isMobile = useIsMobile();
  const navLabel = t('hub.nav', 'Hub sections');
  const activeModule = HUB_MODULES.find((module) => isCurrent(pathname, module));
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

  if (isMobile) {
    const Icon = activeModule?.icon;
    const currentLabel = activeModule
      ? t(activeModule.labelKey, activeModule.defaultLabel)
      : navLabel;

    return (
      <nav aria-label={navLabel} className={className}>
        <DropdownMenu dir={isRtlLocale(i18n?.language) ? 'rtl' : 'ltr'}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="soft"
              className="w-full justify-start px-4"
              aria-label={activeModule ? `${navLabel}: ${currentLabel}` : navLabel}
            >
              {Icon && <Icon aria-hidden />}
              <span className="truncate">{currentLabel}</span>
              <ChevronDown className="ms-auto" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            tabIndex={0}
            className="max-h-[min(65dvh,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto overscroll-contain bg-surface-container-highest p-2 shadow-island"
          >
            {sections.map(({ id, label, modules }) => (
              <DropdownMenuGroup key={id} aria-label={label} className="mt-2 first:mt-0">
                {label && (
                  <DropdownMenuLabel className="text-2xs uppercase tracking-label text-muted-foreground">
                    {label}
                  </DropdownMenuLabel>
                )}
                {modules.map((module) => {
                  const active = module === activeModule;
                  return (
                    <DropdownMenuItem asChild key={module.id}>
                      <LocalizedLink
                        to={module.path}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'min-h-11 gap-2 no-underline',
                          active && 'bg-surface-container font-semibold',
                        )}
                      >
                        {moduleLabel(module)}
                        {active && <Check className="ms-auto h-4 w-4 shrink-0" aria-hidden />}
                      </LocalizedLink>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    );
  }

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
