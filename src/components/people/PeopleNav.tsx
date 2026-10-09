import { Heart, MapPinned, Plane, UserCheck, Users, UsersRound } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { stripLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

const SECTIONS = [
  {
    labelKey: 'header.clusters.community',
    label: 'Community',
    links: [
      { to: '/people/members', labelKey: 'header.nav.members', label: 'Members', icon: UserCheck },
      { to: '/people/friends', labelKey: 'header.userMenu.friends', label: 'Friends', icon: Users },
      { to: '/people/groups', labelKey: 'header.nav.groups', label: 'Groups', icon: UsersRound },
    ],
  },
  {
    labelKey: 'people.nav.connect',
    label: 'Connect',
    links: [
      { to: '/people/dating', labelKey: 'people.tabs.dating', label: 'Dating', icon: Heart },
      {
        to: '/people/travel',
        labelKey: 'people.tabs.travel',
        label: 'Travel buddies',
        icon: Plane,
      },
      { to: '/people/nearby', labelKey: 'people.tabs.nearby', label: 'Nearby', icon: MapPinned },
    ],
  },
] as const;

function isCurrent(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`);
}

/** Shared wayfinding for every community and connection surface under /people. */
export function PeopleNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = stripLocale(location.pathname).replace(/\/+$/, '') || '/';
  const overviewActive = pathname === '/people';

  return (
    <nav
      aria-label={t('people.nav.label', 'People sections')}
      className={cn('pb-2', className)}
    >
      <div className="flex items-end gap-6 overflow-x-auto pb-2">
        <LocalizedLink
          to="/people"
          aria-current={overviewActive ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 shrink-0 items-center border-b-2 px-4 text-sm font-semibold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            overviewActive
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t('header.intents.meet.label', 'Meet people')}
        </LocalizedLink>

        {SECTIONS.map((section) => (
          <div key={section.label} className="shrink-0">
            <p className="mb-1 px-1 text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t(section.labelKey, section.label)}
            </p>
            <ul className="m-0 flex list-none gap-1 p-0">
              {section.links.map(({ to, labelKey, label, icon: Icon }) => {
                const active = isCurrent(pathname, to);
                return (
                  <li key={to}>
                    <LocalizedLink
                      to={to}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center gap-2 whitespace-nowrap px-4 text-sm font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-foreground text-background'
                          : 'bg-surface-container text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{t(labelKey, label)}</span>
                    </LocalizedLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
