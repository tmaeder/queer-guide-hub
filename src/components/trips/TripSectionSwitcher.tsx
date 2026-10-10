import { CalendarRange, MessageCircle, ShieldCheck } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTrip } from '@/hooks/useTrips';
import { getTripPhase } from './tripPhase';
import { getTripWorkspaceSection, type TripWorkspaceSection } from './tripWorkspaceSection';

const SECTIONS: Array<{
  key: TripWorkspaceSection;
  icon: typeof CalendarRange;
  labelKey: string;
  fallback: string;
}> = [
  { key: 'plan', icon: CalendarRange, labelKey: 'trips.workspace.plan', fallback: 'Plan' },
  { key: 'prepare', icon: ShieldCheck, labelKey: 'trips.workspace.prepare', fallback: 'Prepare' },
  {
    key: 'together',
    icon: MessageCircle,
    labelKey: 'trips.workspace.together',
    fallback: 'Together',
  },
];

export function TripSectionSwitcher() {
  const { t } = useTranslation();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip } = useTrip(tripId);
  const [search, setSearch] = useSearchParams();
  const current = getTripWorkspaceSection(search, trip ? getTripPhase(trip) : 'plan');

  return (
    <nav aria-label={t('trips.workspace.sections', 'Trip workspace')} className="min-w-0 flex-1">
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map(({ key, icon: Icon, labelKey, fallback }) => {
          const active = current === key;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                setSearch(
                  (previous) => {
                    previous.set('view', 'plan');
                    previous.set('section', key);
                    return previous;
                  },
                  { replace: false },
                );
              }}
              className={cn(
                'inline-flex h-10 min-h-11 shrink-0 items-center gap-1.5 px-4 text-sm transition-colors',
                active
                  ? 'bg-foreground font-medium text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(labelKey, fallback)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
