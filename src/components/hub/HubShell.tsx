import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HubIdentityBlock } from '@/components/hub/HubIdentityBlock';
import { HUB_MODULES, type HubModuleId } from '@/config/hubModules';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/**
 * Office shell for /hub: persistent module nav (left sidebar on desktop,
 * horizontal scroller on mobile) + the active module's workspace. Modules are
 * registry-driven (src/config/hubModules.ts) — the shell never knows module
 * internals.
 */
export function HubShell({ active, children }: { active: HubModuleId; children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unreadCount } = useInboxFeed('all');

  const badge = (m: (typeof HUB_MODULES)[number]) =>
    m.badge === 'unread' && !!user && unreadCount > 0 ? (
      <span
        className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-2xs font-semibold text-background"
        aria-label={t('header.mobileNav.unreadCount', '{{count}} unread', { count: unreadCount })}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    ) : null;

  return (
    <div className="flex flex-col md:flex-row md:gap-6">
      {/* Desktop side nav */}
      <aside className="hidden w-56 shrink-0 md:flex md:flex-col md:gap-2">
        <HubIdentityBlock />
        <nav aria-label={t('hub.nav', 'Hub modules')} className="flex flex-col gap-0.5">
          {HUB_MODULES.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === active;
            return (
              <LocalizedLink
                key={m.id}
                to={m.path}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-element px-2.5 py-2 text-sm no-underline transition-colors',
                  isActive
                    ? 'bg-foreground font-medium text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{t(m.labelKey, m.defaultLabel)}</span>
                {badge(m)}
              </LocalizedLink>
            );
          })}
        </nav>
      </aside>

      {/* Mobile module scroller */}
      <div
        role="navigation"
        aria-label={t('hub.nav', 'Hub modules')}
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:hidden"
      >
        {HUB_MODULES.map((m) => {
          const Icon = m.icon;
          const isActive = m.id === active;
          return (
            <LocalizedLink
              key={m.id}
              to={m.path}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 text-sm no-underline transition-colors',
                isActive
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(m.labelKey, m.defaultLabel)}
              {badge(m)}
            </LocalizedLink>
          );
        })}
      </div>

      {/* Workspace */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
