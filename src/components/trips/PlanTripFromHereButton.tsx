import { useState } from 'react';
import { Plane } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import type { GeoSelection } from '@/components/trips/create/CityCountryAutocomplete';
import { useAuth } from '@/hooks/useAuth';
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
 * Unauthenticated users are bounced to /signin?next=/travel so they finish auth
 * and pick this destination back up.
 */
export function PlanTripFromHereButton({
  initialGeo,
  className,
  label,
}: PlanTripFromHereButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (!user) {
      navigate(`/signin?next=${encodeURIComponent('/travel')}`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button onClick={handleClick} className={className} variant="default" size="sm">
        <Plane size={14} className="mr-1.5" aria-hidden="true" />
        {label ?? t('trips.planFromHere.cta', 'Plan a trip from here')}
      </Button>
      {open ? (
        <CreateTripDialog
          open={open}
          onClose={() => setOpen(false)}
          initialGeo={initialGeo ?? null}
        />
      ) : null}
    </>
  );
}
