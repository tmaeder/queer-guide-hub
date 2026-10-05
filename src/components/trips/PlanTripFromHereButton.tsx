import { Plane } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { GeoSelection } from '@/components/trips/create/CityCountryAutocomplete';
import { TripAction } from '@/components/trips/TripAction';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

export interface PlanTripFromHereButtonProps {
  /**
   * Pre-seed for CreateTripDialog. Optional — country pages without a city
   * fallback open the dialog with no seed so the user picks a city first.
   */
  initialGeo?: GeoSelection | null;
  className?: string;
  /** Override label (e.g. "Plan a trip to Berlin"). */
  label?: string;
}

/**
 * Editorial "Plan a trip from here" CTA. Opens CreateTripDialog pre-seeded with
 * the destination's city/country so the user lands on /trips/:id in one step.
 *
 * Unauthenticated users are bounced to /auth?redirect=/travel so they finish
 * auth and pick this destination back up.
 *
 * This used to target /signin?next=, which did neither thing: unprefixed
 * /signin was a 404 (the route existed only under the locale parent) and
 * ?next= was never read.
 */
export function PlanTripFromHereButton({
  initialGeo,
  className,
  label,
}: PlanTripFromHereButtonProps) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  if (!initialGeo) {
    return (
      <Button type="button" size="sm" className={className} onClick={() => navigate('/travel')}>
        <Plane className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        {label ?? t('trips.planFromHere.cta', 'Plan a trip from here')}
      </Button>
    );
  }

  return (
    <TripAction
      intent={{ kind: 'start_destination', destination: initialGeo }}
      source="destination-detail"
      label={label ?? t('trips.planFromHere.cta', 'Plan a trip from here')}
      className={className}
    />
  );
}
