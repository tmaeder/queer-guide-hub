/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { useSearchParams } from 'react-router';
import { Map, Clock, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type TripView = 'plan' | 'today' | 'booklet';

const VIEWS: { key: TripView; icon: typeof Map; labelKey: string; fallback: string }[] = [
  { key: 'plan', icon: Map, labelKey: 'trips.view.plan', fallback: 'Plan' },
  { key: 'today', icon: Clock, labelKey: 'trips.view.today', fallback: 'Today' },
  { key: 'booklet', icon: BookOpen, labelKey: 'trips.view.booklet', fallback: 'Booklet' },
];

interface Props {
  current: TripView;
  className?: string;
}

export function TripViewSwitcher({ current, className }: Props) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();

  return (
    <nav
      aria-label={t('trips.view.switcher', 'Trip view')}
      className={cn(
        'inline-flex items-center gap-1 rounded-container bg-surface-container p-1 shadow-soft',
        className,
      )}
    >
      {VIEWS.map(({ key, icon: Icon, labelKey, fallback }) => {
        const active = current === key;
        return (
          <button
            key={key}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              setSearchParams(
                (prev) => {
                  prev.set('view', key);
                  return prev;
                },
                { replace: true },
              );
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-element px-4 py-1.5 text-sm transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{t(labelKey, fallback)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function getTripViewFromSearch(
  search: URLSearchParams,
  fallback: TripView = 'plan',
): TripView {
  const v = search.get('view');
  if (v === 'plan' || v === 'today' || v === 'booklet') return v;
  return fallback;
}
