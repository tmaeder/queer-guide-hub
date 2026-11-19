import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHero } from '@/components/discovery/PageHero';
import { TravelJourneyNav } from '@/components/travel/TravelJourneyNav';
import { TripCockpit } from '@/components/travel/TripCockpit';
import { StartTripHero } from '@/components/travel/StartTripHero';

/** Plan a trip: the create form (or the signed-in cockpit), moved off /travel. */
export default function Plan() {
  const { t } = useTranslation();
  const { user } = useAuth();

  useMeta({
    title: 'Plan a Queer Trip',
    description:
      'Pick a city and dates, then pull in Pride events, bars, stays and the safety picture for every stop.',
    canonicalPath: '/travel/plan',
  });

  return (
    <PageContainer flush className="pb-12">
      <PageHero
        bare
        size="xs"
        eyebrow={t('travel.plan.eyebrow', 'Your trip, your way')}
        title={t('travel.plan.title', 'Plan a trip')}
      />
      <TravelJourneyNav />
      <div className="pt-8 md:pt-10">{user ? <TripCockpit /> : <StartTripHero />}</div>
    </PageContainer>
  );
}
