/* eslint-disable react-refresh/only-export-components -- route parsing and navigation share the view contract */

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AMBIENT_TRIP_WORKSPACE_ENABLED } from '@/lib/trips/ambientTripFlags';
import type { TripWorkspaceSection } from './tripWorkspaceSection';

export type TripView = 'plan' | 'today' | 'booklet';

interface Props {
  current: TripView | TripWorkspaceSection;
  showToday: boolean;
}

export function TripViewSwitcher({ current, showToday }: Props) {
  const { t } = useTranslation();
  const destinations = [
    {
      id: 'plan',
      label: t('trips.workspace.itinerary', 'Itinerary'),
      query: 'view=plan&section=plan',
    },
    ...(AMBIENT_TRIP_WORKSPACE_ENABLED
      ? [
          {
            id: 'prepare',
            label: t('trips.workspace.prepare', 'Prepare'),
            query: 'view=plan&section=prepare',
          },
          {
            id: 'together',
            label: t('trips.workspace.people', 'People & sharing'),
            query: 'view=plan&section=together',
          },
        ]
      : []),
    ...(showToday
      ? [{ id: 'today', label: t('trips.view.today', 'Today'), query: 'view=today' }]
      : []),
  ];

  return (
    <nav
      aria-label={t('trips.workspace.sections', 'Trip workspace')}
      className="flex flex-wrap gap-x-1"
    >
      {destinations.map(({ id, label, query }) => (
        <Link
          key={id}
          to={{ search: `?${query}` }}
          aria-current={current === id ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center border-b-2 px-2 text-sm sm:px-4',
            current === id
              ? 'border-foreground font-semibold text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </Link>
      ))}
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
