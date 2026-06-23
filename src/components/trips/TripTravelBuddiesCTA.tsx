import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useStatus } from '@/hooks/useStatus';

/**
 * Trips → people wedge. From a trip with a known destination, set travel mode
 * and jump to the People hub filtered to who else is heading to that city on
 * overlapping dates (people_discovery travel mode reads the trip server-side).
 */
export function TripTravelBuddiesCTA({
  tripId,
  cityId,
  cityName,
  endDate,
}: {
  tripId: string;
  cityId?: string | null;
  cityName?: string | null;
  endDate?: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { setStatus } = useStatus();

  if (!cityId && !cityName) return null;

  const go = async () => {
    await setStatus({
      travel: {
        city_id: cityId ?? undefined,
        city_name: cityName ?? undefined,
        until: endDate ?? undefined,
      },
    });
    navigate(`/people/travel?tripId=${tripId}`);
  };

  return (
    <button
      type="button"
      onClick={go}
      className="mb-6 flex w-full items-center gap-2 rounded-element border border-border px-4 py-2.5 text-left text-sm transition-colors hover:border-foreground"
    >
      <Users size={16} className="text-muted-foreground" aria-hidden />
      <span>
        {cityName
          ? t('trips.planner.travelBuddies', {
              defaultValue: 'Find travel buddies heading to {{city}}',
              city: cityName,
            })
          : t('trips.planner.travelBuddiesNoCity', 'Find travel buddies for this trip')}
      </span>
    </button>
  );
}
