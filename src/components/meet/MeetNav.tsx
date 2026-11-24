import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { getActiveMeetModule, MEET_MODULES } from '@/config/meetModules';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/**
 * The one Meet tab row: People · Members · Groups · Travel buddies · Nearby ·
 * Dating. Dating is never shown to signed-out visitors. The current tab comes
 * from the URL.
 */
export function MeetNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const active = getActiveMeetModule(pathname);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  const modules = MEET_MODULES.filter((m) => !m.signedInOnly || user);

  return (
    <nav
      ref={nav}
      aria-label={t('header.intents.meet.label', 'Meet')}
      data-meet-nav=""
      className={cn(
        'min-w-0 overflow-x-auto rounded-container bg-surface-container p-2 [scrollbar-width:thin]',
        className,
      )}
    >
      <ul className="m-0 flex min-w-max list-none gap-1 p-0">
        {modules.map((m) => {
          const Icon = m.icon;
          const current = m === active;
          return (
            <li key={m.id}>
              <LocalizedLink
                to={m.path}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-element px-2.5 text-13 font-bold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  current
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t(m.labelKey, m.defaultLabel)}</span>
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Standalone placement above a page's own content container (pb-0, like HubNavBar). */
export function MeetNavBar() {
  return (
    <PageContainer className="pb-0 pt-4 md:pt-8">
      <MeetNav />
    </PageContainer>
  );
}
