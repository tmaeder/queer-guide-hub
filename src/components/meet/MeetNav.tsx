import { peopleContextHref, readPeopleContext } from '@/lib/peopleContext';
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
  const { pathname, search } = useLocation();
  const context = readPeopleContext(new URLSearchParams(search));
  const { user } = useAuth();
  const active = getActiveMeetModule(pathname);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current
      ?.querySelectorAll('[aria-current="page"]')
      .forEach((item) => item.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }, [active]);
  const modules = MEET_MODULES.filter(
    (m) => !['travel', 'nearby'].includes(m.id) && (!m.signedInOnly || user),
  );
  const peopleActive = ['members', 'travel', 'nearby'].includes(active?.id ?? '');
  const modes = peopleActive
    ? MEET_MODULES.filter((m) => ['members', 'travel', 'nearby'].includes(m.id))
    : [];

  return (
    <nav
      ref={nav}
      aria-label={t('header.intents.meet.label', 'Meet')}
      data-meet-nav=""
      className={cn('min-w-0 space-y-2 rounded-container bg-surface-container p-2', className)}
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:thin]">
        {modules.map((m) => {
          const Icon = m.icon;
          const current = m.id === 'members' ? peopleActive : m === active;
          return (
            <li key={m.id} className="shrink-0">
              <LocalizedLink
                to={peopleContextHref(m.path, context)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-element px-1.5 sm:px-2.5 text-13 font-bold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  current
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
                )}
              >
                <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
                <span>{t(m.labelKey, m.defaultLabel)}</span>
              </LocalizedLink>
            </li>
          );
        })}
        {user ? (
          <li className="shrink-0">
            <LocalizedLink
              to="/hub/friends"
              className="flex min-h-11 items-center whitespace-nowrap rounded-element px-1.5 text-13 font-bold text-muted-foreground no-underline hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-2.5"
            >
              {t('meetConsolidation.nav.connections', 'Connections')}
            </LocalizedLink>
          </li>
        ) : null}
      </ul>
      {modes.length ? (
        <ul
          aria-label={t('meetConsolidation.nav.modes', 'People modes')}
          className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:thin]"
        >
          {modes.map((m) => (
            <li key={m.id} className="shrink-0">
              <LocalizedLink
                to={peopleContextHref(m.path, context)}
                aria-current={m === active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-element px-2.5 text-13 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  m === active
                    ? 'bg-foreground font-bold text-background'
                    : 'text-muted-foreground hover:bg-surface-container-high',
                )}
              >
                {t(
                  m.id === 'members' ? 'meetConsolidation.nav.members' : m.labelKey,
                  m.id === 'members' ? 'Members' : m.defaultLabel,
                )}
              </LocalizedLink>
            </li>
          ))}
        </ul>
      ) : null}
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
