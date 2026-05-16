/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { useSearchParams } from 'react-router';
import { Map, Clock, BookOpen, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type TripView = 'plan' | 'today' | 'booklet' | 'share';

const VIEWS: { key: TripView; icon: typeof Map; labelKey: string; fallback: string }[] = [
  { key: 'plan', icon: Map, labelKey: 'trips.view.plan', fallback: 'Plan' },
  { key: 'today', icon: Clock, labelKey: 'trips.view.today', fallback: 'Today' },
  { key: 'booklet', icon: BookOpen, labelKey: 'trips.view.booklet', fallback: 'Booklet' },
  { key: 'share', icon: Share2, labelKey: 'trips.view.share', fallback: 'Share' },
];

interface Props {
  current: TripView;
  className?: string;
}

export function TripViewSwitcher({ current, className }: Props) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();

  return (
    <div
      role="tablist"
      aria-label={t('trips.view.switcher', 'Trip view')}
      className={cn(
        'inline-flex items-center gap-1 border border-border bg-background p-1',
        className,
      )}
    >
      {VIEWS.map(({ key, icon: Icon, labelKey, fallback }) => {
        const active = current === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => {
              setSearchParams(
                (prev) => {
                  if (key === 'plan') prev.delete('view');
                  else prev.set('view', key);
                  return prev;
                },
                { replace: true },
              );
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
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
    </div>
  );
}

export function getTripViewFromSearch(search: URLSearchParams): TripView {
  const v = search.get('view');
  if (v === 'today' || v === 'booklet' || v === 'share') return v;
  return 'plan';
}
