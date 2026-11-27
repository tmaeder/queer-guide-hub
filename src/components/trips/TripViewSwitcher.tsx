/* eslint-disable react-refresh/only-export-components -- route parsing and navigation share the view contract */

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CalendarCheck, ClipboardCheck, Route, Users, type LucideIcon } from '@/components/icons';
import { AMBIENT_TRIP_WORKSPACE_ENABLED } from '@/lib/trips/ambientTripFlags';
import type { TripWorkspaceSection } from './tripWorkspaceSection';

export type TripView = 'plan' | 'today' | 'booklet';

interface Props {
  current: TripView | TripWorkspaceSection;
  showToday: boolean;
}

export function TripViewSwitcher({ current, showToday }: Props) {
  const { t } = useTranslation();
  const destinations: { id: string; label: string; icon: LucideIcon; query: string }[] = [
    {
      id: 'plan',
      label: t('trips.workspace.itinerary', 'Itinerary'),
      icon: Route,
      query: 'view=plan&section=plan',
    },
    ...(AMBIENT_TRIP_WORKSPACE_ENABLED
      ? [
          {
            id: 'prepare',
            label: t('trips.workspace.prepare', 'Prepare'),
            icon: ClipboardCheck,
            query: 'view=plan&section=prepare',
          },
          {
            id: 'together',
            label: t('trips.workspace.people', 'People & sharing'),
            icon: Users,
            query: 'view=plan&section=together',
          },
        ]
      : []),
    ...(showToday
      ? [
          {
            id: 'today',
            label: t('trips.view.today', 'Today'),
            icon: CalendarCheck,
            query: 'view=today',
          },
        ]
      : []),
  ];

  // A segmented control, one level below the page nav's ink pills: the active
  // tab is a raised card on a muted track.
  return (
    <nav
      aria-label={t('trips.workspace.sections', 'Trip workspace')}
      className="-mx-1 flex max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1"
    >
      {destinations.map(({ id, label, icon: Icon, query }) => {
        const active = current === id;
        return (
          <Link
            key={id}
            to={{ search: `?${query}` }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-card font-semibold text-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function getTripViewFromSearch(
  search: URLSearchParams,
  fallback: TripView = 'plan',
): TripView {
  const view = search.get('view');
  if (view === 'plan' || view === 'today' || view === 'booklet') return view;
  return fallback;
}
