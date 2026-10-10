import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HubIdentityBlock } from '@/components/hub/HubIdentityBlock';
import { HUB_MODULES, HUB_SECTIONS, type HubModule } from '@/config/hubModules';
import { useInboxUnreadCount } from '@/hooks/useInboxFeed';
import { stripLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

function isCurrent(pathname: string, module: HubModule) {
  if (module.id === 'overview') return pathname === '/hub';
  return pathname === module.path || pathname.startsWith(`${module.path}/`);
}

/**
 * One navigation system for community, connection, and personal Hub surfaces.
 *
 * Takes no props but `className`, deliberately. It used to take `activeModule`,
 * `showIdentity`, `showUnread` and `unreadCount`, and only HubShell (5 of the 17
 * hub routes) passed them — so the identity block and the Messages unread badge
 * appeared on Overview/Feed/Messages/Plans/Saved and silently vanished on
 * Groups, Dating, Travel buddies and the rest, and the whole bar jumped
 * horizontally as you moved between them. Active state is derived from the
 * pathname, which every route already agrees with; the badge and the identity
 * block are now the component's own business. Place it with `HubNavBar`.
 */
export function HubNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = stripLocale(location.pathname).replace(/\/+$/, '') || '/';
  const unreadCount = useInboxUnreadCount();

  return (
    <div className={cn('flex min-w-0 items-end gap-4', className)}>
      {/* HubIdentityBlock renders null when signed out, so no auth check here. */}
      <div className="hidden shrink-0 md:block">
        <HubIdentityBlock />
      </div>
      <nav
        aria-label={t('hub.nav', 'Hub sections')}
        className="min-w-0 flex-1 overflow-x-auto pb-2 md:overflow-visible"
      >
        <div className="flex min-w-max items-end gap-6 md:min-w-0 md:flex-wrap">
          {HUB_SECTIONS.map((section) => {
            const modules = HUB_MODULES.filter((module) => module.section === section.id);
            return (
              <div key={section.id} className="shrink-0">
                {section.defaultLabel ? (
                  <p className="mb-1 px-1 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                    {section.labelKey
                      ? t(section.labelKey, section.defaultLabel)
                      : section.defaultLabel}
                  </p>
                ) : null}
                <ul className="m-0 flex list-none gap-1 p-0">
                  {modules.map((module) => {
                    const Icon = module.icon;
                    const active = isCurrent(pathname, module);
                    const showModuleUnread = module.badge === 'unread' && unreadCount > 0;
                    return (
                      <li key={module.id}>
                        <LocalizedLink
                          to={module.path}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-10 items-center gap-2 whitespace-nowrap rounded-element px-4 text-sm font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'bg-foreground text-background'
                              : 'bg-surface-container text-foreground hover:bg-muted',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span>{t(module.labelKey, module.defaultLabel)}</span>
                          {showModuleUnread ? (
                            <span
                              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-2xs font-semibold text-foreground"
                              aria-label={t('header.mobileNav.unreadCount', '{{count}} unread', {
                                count: unreadCount,
                              })}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          ) : null}
                        </LocalizedLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
