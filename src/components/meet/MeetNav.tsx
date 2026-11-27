import { peopleContextHref, readPeopleContext } from '@/lib/peopleContext';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { getActiveMeetModule, MEET_MODULES } from '@/config/meetModules';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/** One task-level row. Travel is meetup context; Nearby is a People view. */
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
  const activeId =
    active?.id === 'travel' ? 'people' : active?.id === 'nearby' ? 'members' : active?.id;

  return (
    <nav
      ref={nav}
      aria-label={t('header.intents.meet.label', 'Meet')}
      data-meet-nav=""
      className={cn('min-w-0 border-b border-border-hairline', className)}
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:thin]">
        {modules.map((m) => {
          const Icon = m.icon;
          const current = m.id === activeId;
          return (
            <li key={m.id} className="shrink-0">
              <LocalizedLink
                to={peopleContextHref(m.path, context)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 text-sm font-semibold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  current
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
                <span className={current ? 'underline decoration-2 underline-offset-8' : undefined}>
                  {t(m.labelKey, m.defaultLabel)}
                </span>
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
    <PageContainer flush className="pt-4 md:pt-6">
      <MeetNav />
    </PageContainer>
  );
}
