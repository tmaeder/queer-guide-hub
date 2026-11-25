import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import TravelMeet from './TravelMeet';
import { readPeopleContext } from '@/lib/peopleContext';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { MeetPageLayout } from '@/components/meet/MeetPageLayout';
import { PeopleLocationError } from '@/components/people/PeopleDiscoveryState';
import { Skeleton } from '@/components/ui/skeleton';

/** Meet has one invitation experience, including links from cities, events and trips. */
export default function People() {
  const [params] = useSearchParams();
  const context = readPeopleContext(params);
  return context.city ? <CityMeet city={context.city} /> : <TravelMeet />;
}

function CityMeet({ city }: { city: string }) {
  const { t } = useTranslation();
  const place = useIntentLocation(city);
  if (place.loading || place.error || !place.cityId)
    return (
      <MeetPageLayout title={t('meetCompany.heading', 'Find queer company.')}>
        {place.loading ? (
          <Skeleton className="h-40" />
        ) : (
          <PeopleLocationError retry={place.retry} />
        )}
      </MeetPageLayout>
    );
  return <TravelMeet resolvedCityId={place.cityId} />;
}
