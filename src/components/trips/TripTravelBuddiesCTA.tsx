import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useStatus } from '@/hooks/useStatus';

/**
 * Trips → people wedge. From a trip with a known destination, set travel mode
 * and jump to the People hub filtered to who else is heading to that city on
 * overlapping dates (people_discovery travel mode reads the trip server-side).
 *
 * The copy describes the opt-in, not a result. It used to read "Find travel
 * buddies heading to {city}" — but `people_discovery`'s travel branch requires
 * `presence_visibility.in_discovery`, and there are 0 presence rows, so the
 * button reliably promised a populated page and delivered an empty one. What it
 * genuinely does, every time, is publish your travel intent so other travellers
 * can match you. Say that instead; the destination is unchanged.
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
              defaultValue: 'Let travellers heading to {{city}} find you',
              city: cityName,
            })
          : t('trips.planner.travelBuddiesNoCity', 'Let other travellers on this trip find you')}
      </span>
    </button>
  );
}
