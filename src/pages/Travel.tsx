import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { ResumeTripStrip } from '@/components/travel/ResumeTripStrip';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { InspirationGrid } from '@/components/travel/InspirationGrid';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useRecommendations } from '@/hooks/useRecommendations';

export default function Travel() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const intentBook = searchParams.get('intent') === 'book';

  const { track } = useTrackEvent();
  const { data: recs } = useRecommendations({ recType: 'destination', limit: 20 });

  // Wire the A/B experiment surface: emit exposure once per session so we can
  // actually measure the personalization branch in analytics.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flagKey = 'qg_exp_travel_perso_v1_logged';
    if (sessionStorage.getItem(flagKey)) return;
    const sessionId = sessionStorage.getItem('qg_session_id') ?? '';
    const group =
      parseInt(sessionId.slice(-2) || '0', 16) % 2 === 0 ? 'personalized' : 'control';
    track({
      eventType: 'page_view',
      metadata: {
        page: 'travel',
        experiment: 'travel_personalization_v1',
        group,
        recs_available: (recs?.length ?? 0) > 0,
      },
    });
    sessionStorage.setItem(flagKey, '1');
  }, [track, recs]);

  return (
    <div className="container mx-auto px-4 py-12 md:py-20 max-w-screen-xl">
      <ResumeTripStrip />

      {!intentBook && <StartTripHero />}

      <PrideScroller />

      <InspirationGrid />

      <BookNowAccordion defaultOpen={intentBook} />

      <div className="border border-border bg-background text-center py-6 px-6 rounded">
        <p className="font-semibold mb-2">
          {t('pages.travel.exploreCta', 'Explore LGBTQ+ friendly destinations')}
        </p>
        <p className="text-muted-foreground text-sm mb-4">
          {t(
            'pages.travel.exploreDescription',
            'Browse cities and countries with detailed safety information and travel guides.',
          )}
        </p>
        <LocalizedLink to="/places">
          <Button variant="outline">{t('pages.travel.browseDestinations', 'Browse destinations')}</Button>
        </LocalizedLink>
      </div>
    </div>
  );
}
