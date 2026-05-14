import { useLocation, Link as RouterLink } from 'react-router';
import { Luggage, X, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { Button } from '@/components/ui/button';
import { getTripPhase, phaseLabel, phaseStatusText } from './tripPhase';
import { resolveTripTitle } from './tripTitle';

const HIDDEN_PREFIXES = [
  '/trips',
  '/admin',
  '/auth',
  '/onboarding',
  '/settings',
  '/account',
  '/checkout',
  '/legal',
];

export function TripContextBar() {
  const { pathname } = useLocation();
  const { activeTrip, isDismissed, dismiss } = useActiveTrip();
  const { t } = useTranslation();

  if (import.meta.env.VITE_TRIP_CONTEXT_BAR === 'off') return null;
  if (!activeTrip || isDismissed) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (typeof activeTrip.title === 'string' && activeTrip.title.trim().startsWith('<')) return null;

  const displayTitle = resolveTripTitle(activeTrip, t);
  const phase = getTripPhase(activeTrip);
  const status = phaseStatusText(activeTrip, undefined, t);

  return (
    <div
      role="region"
      aria-label={t('trips.contextBar.ariaLabel', 'Active trip context')}
      className="sticky top-0 z-[1099] border-b border-border px-4 sm:px-6 py-1.5"
      style={{ backgroundColor: 'hsl(var(--foreground) / 0.06)' }}
    >
      <div className="flex items-center gap-3 mx-auto" style={{ maxWidth: 1400, minHeight: 28 }}>
        <Luggage style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.7 }} aria-hidden />
        <p className="text-sm font-semibold min-w-0 truncate">
          {displayTitle}
        </p>
        <span className="text-xs hidden sm:inline flex-shrink-0" style={{ opacity: 0.7 }}>
          · {phaseLabel(phase, t)} · {status}
        </span>
        <div className="flex-1" />
        <RouterLink
          to={`/trips/${activeTrip.id}`}
          className="text-sm text-primary inline-flex items-center gap-0.5 transition-opacity hover:opacity-85 active:opacity-70 flex-shrink-0"
          style={{ textDecoration: 'none' }}
        >
          {t('trips.contextBar.openTrip', 'Open trip')}
          <ChevronRight style={{ width: 14, height: 14 }} aria-hidden />
        </RouterLink>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('trips.contextBar.dismissAria', 'Dismiss trip context bar')}
          onClick={dismiss}
          className="h-6 w-6 p-0 ml-1"
        >
          <X style={{ width: 14, height: 14 }} />
        </Button>
      </div>
    </div>
  );
}
